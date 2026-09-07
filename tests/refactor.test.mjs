import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { parseTrickcalApiPayload } from '../src/domain/dataParser.ts';
import { calculateAllApostlesProgress } from '../src/domain/boardProgress.ts';
import { matchesApostleFilter } from '../src/domain/filters.ts';
import { isSiteMutation } from '../src/ui/mutations.ts';
import { mockHeroInfo, mockMasterBoard, mockText, mockUserApostles } from './fixtures/sanitizedData.mjs';

const payload = () => structuredClone({ apostles: mockUserApostles, board: mockMasterBoard, heroInfo: mockHeroInfo, text: mockText });
const filter = { status: 'all', boardLevel: 'all', statCategory: 'all', personality: 'all', grade: 'all', unlockedTier: 'all', sortBy: 'name_asc' };

test('파서는 잘못된 중첩 데이터와 숫자 대신 들어온 문자열을 거부한다', () => {
  for (const corrupt of [
    p => p.apostles.push(null),
    p => p.apostles[0].boardSteps = [null],
    p => p.board['10001']['0'] = {},
    p => p.board['10001']['0'][0].requireItems = [{ item: 610003, value: '3' }],
    p => p.heroInfo['10001'] = null,
    p => p.text.KEY_A_NAME = {},
    p => p.board = [],
  ]) {
    const p = payload(); corrupt(p);
    assert.equal(parseTrickcalApiPayload(p), null);
  }
});

test('파서는 보드 진행도에 필요한 유저 필드만 추출하며 래퍼와 빈 보유 목록을 지원한다', () => {
  const p = payload(); p.apostles[0].accountToken = '테스트용가짜값';
  const parsed = parseTrickcalApiPayload({ payload: p });
  assert.deepEqual(Object.keys(parsed.apostles[0]).sort(), ['apostleId', 'boardSteps']);
  p.apostles = [];
  assert.equal(parseTrickcalApiPayload(p).apostles.length, 0);
});

test('카드와 집계의 공통 판정은 해금 관문, 성격, 성급, 보드 범위를 함께 적용한다', () => {
  const map = calculateAllApostlesProgress(payload());
  const a = map.get('10001');
  assert.equal(matchesApostleFilter(a, { ...filter, status: 'incomplete', unlockedTier: 2 }), false);
  assert.equal(matchesApostleFilter(a, { ...filter, status: 'incomplete', unlockedTier: 3 }), true);
  assert.equal(matchesApostleFilter(a, { ...filter, personality: 1 }), false);
  assert.equal(matchesApostleFilter(a, { ...filter, grade: 1 }), false);
  assert.equal(matchesApostleFilter({ ...a, boards: [] }, { ...filter, boardLevel: '3' }), false);
  const complete = { ...a, bokr: { ...a.bokr, isCompleted: true, remainingAll: 0 } };
  assert.equal(matchesApostleFilter(complete, { ...filter, status: 'complete' }), true);
  assert.equal(matchesApostleFilter(complete, { ...filter, status: 'incomplete' }), false);
});

test('DOM 감시는 자체 배지 변경을 제외하고 기존 카드의 원본 타일 교체를 감지한다', () => {
  const node = owned => ({ nodeType: 1, closest: () => owned ? {} : null });
  const target = node(false);
  assert.equal(isSiteMutation({ type: 'childList', target, addedNodes: [node(true)], removedNodes: [] }), false);
  assert.equal(isSiteMutation({ type: 'childList', target, addedNodes: [node(false)], removedNodes: [] }), true);
  target.getAttribute = () => 'site-tile tcbe-tile-highlight-done';
  assert.equal(isSiteMutation({ type: 'attributes', attributeName: 'class', oldValue: 'site-tile', target }), false);
  assert.equal(isSiteMutation({ type: 'attributes', attributeName: 'class', oldValue: 'inactive-tile', target }), true);
});

test('인터셉터는 초기 응답을 재전달하고 XHR 재사용 시 중복 발행하지 않는다', async () => {
  const bundled = await build({ entryPoints: ['src/bridge/interceptor.ts'], bundle: true, write: false, format: 'iife' });
  const messages = [];
  const listeners = [];
  class FakeXHR extends EventTarget {
    responseType = 'json';
    response = payload();
    send() { this.dispatchEvent(new Event('load')); }
  }
  const win = {
    location: { origin: 'https://note.trickcal.com' },
    addEventListener: (type, fn) => listeners.push(fn),
    postMessage: (message, origin) => messages.push({ message, origin }),
    fetch: async () => ({ clone: () => ({ json: async () => payload() }) }),
  };
  vm.runInNewContext(bundled.outputFiles[0].text, { window: win, XMLHttpRequest: FakeXHR, console });
  const xhr = new FakeXHR(); xhr.send(); xhr.send();
  assert.equal(messages.length, 2);
  assert.equal(messages[0].origin, win.location.origin);
  assert.deepEqual(Object.keys(messages[0].message.payload).sort(), ['apostles', 'board', 'heroInfo', 'text']);
  const request = { source: win, origin: win.location.origin, data: { type: 'TCBE_BOARD_DATA_REQUEST', source: 'tcbe-content-bridge' } };
  listeners[0](request);
  assert.equal(messages.length, 3);
  listeners[0]({ ...request, origin: 'https://example.invalid' });
  assert.equal(messages.length, 3);
  const response = await win.fetch();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(response.clone);
  assert.equal(messages.length, 4);
});

test('배열로 전달되는 보드 차수도 객체 차수와 동일하게 계산한다', () => {
  const p = payload();
  p.board = Object.fromEntries(Object.entries(p.board).map(([key, levels]) => [key, Object.values(levels)]));
  const parsed = parseTrickcalApiPayload(p);
  assert.ok(parsed);
  assert.equal(calculateAllApostlesProgress(parsed).get('10001').bokr.picked, 3);
});

test('같은 필터의 새 진행도는 배지를 갱신하고 동일 데이터는 행을 재사용한다', async () => {
  const bundled = await build({
    entryPoints: ['src/ui/boardEnhancer.ts'], bundle: true, write: false, format: 'iife', globalName: 'enhancer',
    plugins: [{ name: '배지 렌더러 대역', setup(builder) {
      builder.onLoad({ filter: /badge\.ts$/ }, () => ({ contents: 'export function createBadgeElement(progress) { return { picked: progress.bokr.picked }; }' }));
      builder.onLoad({ filter: /normalStat\.ts$/ }, () => ({ contents: 'export function createNormalStatElement() { return {}; }' }));
    } }],
  });
  let row;
  const makeRow = () => ({
    attrs: {}, children: [],
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key] ?? null; },
    appendChild(child) { this.children.push(child); },
    replaceWith(next) { row = next; },
  });
  row = makeRow();
  const card = {
    attrs: { 'data-tcbe-apostle-name': '테스트사도A', 'data-tcbe-visible-level': 'all', 'data-tcbe-highlight-stat': 'all' },
    getAttribute(key) { return this.attrs[key] ?? null; },
    setAttribute(key, value) { this.attrs[key] = value; },
    closest() { return null; },
    querySelector(selector) { return selector === '.tcbe-badge-row' ? row : null; },
  };
  const context = vm.createContext({ document: { querySelectorAll: () => [card], createElement: makeRow } });
  vm.runInContext(bundled.outputFiles[0].text, context);
  const a = calculateAllApostlesProgress(payload()).get('10001');
  const map = progress => new Map([[progress.name, progress], [String(progress.apostleId), progress]]);
  context.enhancer.enhanceApostleCards(map(a), filter);
  const first = row;
  assert.equal(row.children[0].picked, 3);
  context.enhancer.enhanceApostleCards(map(a), filter);
  assert.equal(row, first);
  context.enhancer.enhanceApostleCards(map({ ...a, bokr: { ...a.bokr, picked: 4 } }), filter);
  assert.notEqual(row, first);
  assert.equal(row.children[0].picked, 4);
});

test('API 표시 이름의 태그와 따옴표를 HTML로 실행하지 않는다', async () => {
  const { escapeHtml } = await import('../src/ui/html.ts');
  assert.equal(escapeHtml('<img title="가짜">&'), '&lt;img title=&quot;가짜&quot;&gt;&amp;');
});
