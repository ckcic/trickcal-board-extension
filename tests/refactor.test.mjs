import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { parseTrickcalApiPayload } from '../src/domain/dataParser.ts';
import { calculateAllApostlesProgress } from '../src/domain/boardProgress.ts';
import { matchesApostleFilter } from '../src/domain/filters.ts';
import { isSiteMutation, invalidateChangedCards, collectChangedCards } from '../src/ui/mutations.ts';
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
    appendChild(child) {
      this.children.push(child);
      const parent = this;
      child.replaceWith = function (next) {
        parent.children[parent.children.indexOf(this)] = next;
        next.replaceWith = this.replaceWith;
      };
    },
    querySelector(selector) { return this.children[selector === '.tcbe-badge-container' ? 0 : 1] ?? null; },
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
  const normalButton = row.children[1];
  normalButton.popup = { pinned: true };
  const initialBadge = row.children[0];
  context.enhancer.enhanceApostleCards(map(a), { ...filter, status: 'complete', grade: 3, sortBy: 'name_desc' });
  assert.equal(row.children[0], initialBadge);
  assert.equal(row.children[1], normalButton);
  card.attrs['data-tcbe-highlight-stat'] = 'hp';
  context.enhancer.enhanceApostleCards(map(a), { ...filter, statCategory: 'hp' });
  assert.equal(row, first);
  assert.notEqual(row.children[0], initialBadge);
  assert.equal(row.children[1], normalButton);
  assert.equal(normalButton.popup.pinned, true);
  const statBadge = row.children[0];
  card.attrs['data-tcbe-visible-level'] = '2';
  context.enhancer.enhanceApostleCards(map(a), { ...filter, statCategory: 'hp', boardLevel: '2' });
  assert.notEqual(row.children[0], statBadge);
  assert.equal(row.children[1], normalButton);
  assert.equal(normalButton.popup.pinned, true);
  card.attrs['data-tcbe-visible-level'] = 'all';
  card.attrs['data-tcbe-highlight-stat'] = 'all';
  context.enhancer.enhanceApostleCards(map({ ...a, bokr: { ...a.bokr, picked: 4 } }), filter);
  assert.notEqual(row, first);
  assert.notEqual(row.children[1], normalButton);
  assert.equal(row.children[0].picked, 4);
  // 전체 데이터 중 검색 결과 한 장만 있어도 페이지 전체 텍스트를 재탐색하지 않는다.
  const allProgress = calculateAllApostlesProgress(payload());
  let fallbackScans = 0;
  const fallbackSelector = 'span, p, div, h2, h3, h4, strong, b';
  context.document.querySelectorAll = selector => {
    if (selector === fallbackSelector) {
      fallbackScans++;
      return [];
    }
    return [card];
  };
  assert.equal(context.enhancer.enhanceApostleCards(allProgress, filter), 1);
  assert.equal(fallbackScans, 0);
  // 원본 카드 선택자가 바뀌면 이름 기반 보조 탐색으로 기존 카드를 복구한다.
  const nameElement = {
    textContent: a.name,
    closest: selector => selector === '[data-slot="card"]' ? card : null,
  };
  context.document.querySelectorAll = selector => {
    if (selector === fallbackSelector) {
      fallbackScans++;
      return [nameElement];
    }
    return [];
  };
  assert.equal(context.enhancer.enhanceApostleCards(allProgress, filter), 1);
  assert.equal(fallbackScans, 1);
  // 부분 갱신은 전역 카드 탐색과 보조 텍스트 탐색을 수행하지 않는다.
  context.document.querySelectorAll = () => { throw new Error('전체 탐색이 실행됨'); };
  context.enhancer.enhanceApostleCards(map(a), filter, [card]);
  assert.equal(row.children[0].picked, 3);
  const scopedRow = row;
  context.enhancer.enhanceApostleCards(map(a), filter, []);
  assert.equal(row, scopedRow);
});

test('변경 범위는 카드 내부에 한정하고 목록 교체와 탭 변경은 전체 갱신으로 분류한다', () => {
  const card = {};
  const inside = { nodeType: 1, closest: selector => selector === '[data-tcbe-apostle-name]' ? card : null };
  const outside = { nodeType: 1, closest: () => null };
  const internal = { type: 'childList', target: inside, addedNodes: [outside], removedNodes: [] };
  const changes = collectChangedCards([internal, internal]);
  assert.equal(changes.fullRefresh, false);
  assert.equal(changes.cards.size, 1);
  assert.ok(changes.cards.has(card));
  for (const mutation of [
    { type: 'childList', target: outside, addedNodes: [inside], removedNodes: [] },
    { type: 'childList', target: outside, addedNodes: [], removedNodes: [inside] },
    { type: 'characterData', target: { nodeType: 3, parentElement: outside } },
  ]) {
    const batch = collectChangedCards([internal, mutation]);
    assert.equal(batch.fullRefresh, true);
    assert.equal(batch.cards.size, 1);
  }
  assert.equal(collectChangedCards([]).changed, false);
});

test('API 표시 이름의 태그와 따옴표를 HTML로 실행하지 않는다', async () => {
  const { escapeHtml } = await import('../src/ui/html.ts');
  assert.equal(escapeHtml('<img title="가짜">&'), '&lt;img title=&quot;가짜&quot;&gt;&amp;');
});

test('카드 내부 교체와 텍스트 변경은 캐시를 한 번 해제하고 자체 배지는 무시한다', () => {
  const removed = [];
  const card = { removeAttribute: name => removed.push(name) };
  const target = { nodeType: 1, closest: selector => selector === '[data-tcbe-apostle-name]' ? card : null };
  const tile = { nodeType: 1, closest: () => null };
  assert.equal(invalidateChangedCards([
    { type: 'childList', target, addedNodes: [tile], removedNodes: [tile] },
    { type: 'characterData', target: { nodeType: 3, parentElement: target } },
  ]), true);
  assert.deepEqual(removed, ['data-tcbe-visible-level', 'data-tcbe-highlight-stat', 'data-tcbe-apostle-name', 'data-tcbe-apostle-id']);
  assert.equal(invalidateChangedCards([
    { type: 'childList', target, addedNodes: [{ nodeType: 1, closest: () => ({}) }], removedNodes: [] },
  ]), false);
  assert.equal(removed.length, 4);
});

test('요약 DOM은 동일 조건에서 재사용하고 데이터·필터·컨테이너 변경 시 갱신한다', async () => {
  const bundled = await build({ entryPoints: ['src/ui/filterPanel.ts'], bundle: true, write: false, format: 'iife', globalName: 'panel' });
  let created = 0;
  const makeElement = () => {
    created++;
    return {
      children: [], className: '', textContent: '', html: '',
      set innerHTML(value) { this.html = value; this.children = []; },
      get innerHTML() { return this.html; },
      appendChild(child) { this.children.push(child); },
      addEventListener() {},
    };
  };
  let summary = makeElement();
  const context = vm.createContext({ document: { getElementById: () => summary, createElement: makeElement } });
  vm.runInContext(bundled.outputFiles[0].text, context);
  const controller = new context.panel.FilterPanelController(() => {});
  const map = calculateAllApostlesProgress(payload());
  map.get('10001').bokr.byStat.hp = { picked: 1, total: 2, remaining: 1 };
  controller.updateStatSummaryGrid(map, filter);
  const firstItems = summary.children[1];
  const firstCount = created;
  controller.updateStatSummaryGrid(map, { ...filter, sortBy: 'name_desc', status: 'complete' });
  assert.equal(summary.children[1], firstItems);
  assert.equal(created, firstCount);
  controller.updateStatSummaryGrid(map, { ...filter, statCategory: 'hp' });
  assert.ok(summary.children[1].children.some(item => item.className.includes('tcbe-summary-active')));
  const changed = payload();
  changed.apostles = [];
  const nextMap = calculateAllApostlesProgress(changed);
  nextMap.get('10001').bokr.byStat.hp = { picked: 0, total: 2, remaining: 2 };
  controller.updateStatSummaryGrid(nextMap, filter);
  assert.notEqual(summary.children[1], firstItems);
  assert.ok(summary.children[1].children.length > 0);
  assert.ok(summary.children[1].children.every(item => item.innerHTML.includes('>0/')));
  summary = makeElement();
  controller.updateStatSummaryGrid(map, filter);
  assert.equal(summary.children.length, 2);
  const beforeClear = summary.children[1];
  controller.clearCache();
  controller.updateStatSummaryGrid(map, filter);
  assert.notEqual(summary.children[1], beforeClear);
});
