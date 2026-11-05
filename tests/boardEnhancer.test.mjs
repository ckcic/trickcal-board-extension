import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { applyBoardLevelVisibility, applyFilterToCards } from '../src/ui/board/boardEnhancer.ts';
import { findCardContainer } from '../src/ui/board/cardDetector.ts';
import { updateBoardTileHighlights } from '../src/ui/board/tileHighlight.ts';
import { DEFAULT_FILTER_STATE } from '../src/domain/filters.ts';
import { calculateAllApostlesProgress } from '../src/domain/boardProgress.ts';
import { parseTrickcalApiPayload } from '../src/domain/dataParser.ts';
import { mockHeroInfo, mockMasterBoard, mockText, mockUserApostles } from './fixtures/sanitizedData.mjs';

function boardCard(missing = []) {
  const row12 = { style: { display: '' } }, row3 = { style: { display: '' } };
  const columns = [0, 1, 2].map(index => ({ style: { display: '' },
    parentElement: index === 2 ? row3 : row12, classList: { contains: () => true } }));
  const attrs = new Map();
  const card = {
    closest: () => null,
    getAttribute: key => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
    querySelectorAll: () => columns.flatMap((col, index) => missing.includes(index) ? []
      : [{ textContent: `${index + 1}차 보드`, parentElement: col }]),
  };
  return { card, columns, rows: [row12, row3] };
}

test('보드 표시 전환은 선택 차수와 1·2차 공유 행을 함께 갱신하고 같은 조건은 재탐색하지 않는다', () => {
  const { card, columns, rows } = boardCard();
  for (const [level, expected] of [
    ['1', ['', 'none', 'none', '', 'none']], ['2', ['none', '', 'none', '', 'none']],
    ['3', ['none', 'none', '', 'none', '']], ['all', ['', '', '', '', '']],
  ]) {
    applyBoardLevelVisibility(card, level);
    assert.deepEqual([...columns, ...rows].map(element => element.style.display), expected);
  }
  card.querySelectorAll = () => { throw new Error('같은 차수의 보드를 다시 탐색함'); };
  applyBoardLevelVisibility(card, 'all');
});

test('일부 보드 열이나 모든 열이 없어도 표시 전환이 안전하다', () => {
  const { card, columns, rows } = boardCard([0]);
  applyBoardLevelVisibility(card, '3');
  assert.equal(columns[1].style.display, 'none');
  assert.equal(rows[0].style.display, 'none');
  assert.equal(rows[1].style.display, '');
  applyBoardLevelVisibility(boardCard([0, 1, 2]).card, '1');
});

const bundled = await build({ entryPoints: ['src/ui/board/boardEnhancer.ts'], bundle: true,
  write: false, format: 'iife', globalName: 'enhancer', plugins: [{ name: '배지 렌더러 대역', setup(builder) {
    builder.onLoad({ filter: /badge\.ts$/ }, () => ({ contents: 'export function createBadgeElement(progress) { return { picked: progress.bokr.picked }; }' }));
    builder.onLoad({ filter: /normalStat\.ts$/ }, () => ({ contents: 'export function createNormalStatElement() { return {}; }' }));
  } }] });

for (const mode of ['텍스트', '이미지', '보조']) {
  for (const hasNextSibling of [false, true]) {
    test(`${mode} 탐색: 이름 뒤에 배지를 ${hasNextSibling ? '삽입' : '추가'}하고 같은 카드는 재사용한다`, () => {
      const progressMap = calculateAllApostlesProgress({ apostles: mockUserApostles, board: mockMasterBoard,
        heroInfo: mockHeroInfo, text: mockText });
      const apostle = progressMap.get('10001');
      let row;
      const parent = {
        appendChild(next) { row = next; },
        insertBefore(next, sibling) { assert.equal(sibling, name.nextSibling); row = next; },
      };
      const name = { children: [], textContent: apostle.name, parentNode: parent,
        nextSibling: hasNextSibling ? {} : null,
        closest: selector => selector === '[data-slot="card"]' ? card : null };
      const other = { children: [], textContent: progressMap.get('10002').name };
      const attrs = { 'data-tcbe-visible-level': 'all', 'data-tcbe-highlight-stat': 'all' };
      let textScans = 0;
      const card = {
        getAttribute: key => attrs[key] ?? null,
        setAttribute: (key, value) => { attrs[key] = value; },
        closest: () => null,
        querySelector: selector => selector === '.tcbe-badge-row' ? row ?? null
          : selector === 'img[alt]' && mode === '이미지' ? { getAttribute: () => apostle.name } : null,
        querySelectorAll() { textScans++; return mode === '이미지' ? [other, name] : [name]; },
      };
      let created = 0;
      const context = vm.createContext({ document: {
        querySelectorAll: selector => mode === '보조' ? selector === 'span, p, div, h2, h3, h4, strong, b' ? [name, name] : [] : [card],
        createElement: () => {
          created++;
          return { children: [], attrs: {},
            setAttribute(key, value) { this.attrs[key] = value; },
            getAttribute(key) { return this.attrs[key] ?? null; },
            appendChild(child) { this.children.push(child); },
            querySelector(selector) { return this.children[selector === '.tcbe-badge-container' ? 0 : 1]; },
          };
        },
      } });
      vm.runInContext(bundled.outputFiles[0].text, context);
      assert.equal(context.enhancer.enhanceApostleCards(progressMap, DEFAULT_FILTER_STATE), 1);
      assert.equal(row.children.length, 2);
      assert.equal(row.children[0].picked, apostle.bokr.picked);
      assert.equal(attrs['data-tcbe-apostle-name'], apostle.name);
      assert.equal(attrs['data-tcbe-apostle-id'], String(apostle.apostleId));
      assert.equal(attrs['data-tcbe-enhanced'], 'true');
      const first = row, scans = textScans;
      assert.equal(context.enhancer.enhanceApostleCards(progressMap, DEFAULT_FILTER_STATE), 1);
      assert.equal(row, first);
      assert.equal(created, 1);
      assert.equal(textScans, scans);
    });
  }
}

test('가상 목록은 브리지 입력을 따르며 렌더된 카드에 높이 0 숨김이나 CSS 정렬을 적용하지 않는다', () => {
  const progress = calculateAllApostlesProgress(parseTrickcalApiPayload({
    apostles: [{ apostleId: 1, boardSteps: [] }], board: { 1: { 0: [] } },
    heroInfo: { 1: { name: 'A', personality: 0, gradeDefault: 3 } }, text: { A: '가명사도' },
  }));
  const classes = new Set(['tcbe-card-hidden']);
  const card = {
    style: { order: '10000' },
    closest: selector => selector === '.virtuoso-grid-item' ? {} : null,
    getAttribute: key => key === 'data-tcbe-apostle-name' ? '가명사도' : 'all',
    classList: { remove: name => classes.delete(name) },
    querySelectorAll: () => { throw new Error('가상 카드의 보드 레이아웃을 지연 변경함'); },
    setAttribute: () => { throw new Error('가상 카드의 표시 캐시를 변경함'); },
  };
  const filter = { status: 'all', boardLevel: 'all', statCategory: 'all', personality: 1,
    grade: 'all', unlockedTier: 'all', sortBy: 'name_desc' };
  applyBoardLevelVisibility(card, '2');
  assert.deepEqual(applyFilterToCards(filter, progress, [card]), { total: 1, visible: 1 });
  assert.equal(classes.has('tcbe-card-hidden'), false);
  assert.equal(card.style.order, '');
});

test('카드 컨테이너 탐색은 모달 내부를 제외하고 data-slot, 배경 클래스, 상위 DIV 폴백을 순서대로 판별한다', () => {
  const slotCard = { tagName: 'DIV' };
  const dialogCard = { tagName: 'DIV', closest: () => null };
  assert.equal(findCardContainer({ closest: selector => selector.includes('dialog') ? {} : slotCard }), null);
  assert.equal(findCardContainer({ closest: selector => selector === '[data-slot="card"]' ? slotCard : null }), slotCard);
  assert.equal(findCardContainer({
    closest: selector => selector === '.bg-dialog-background, .text-card-foreground' ? dialogCard : null,
  }), dialogCard);

  const fallbackCard = {
    tagName: 'DIV',
    className: 'apostle-card-wrapper',
    classList: { contains: () => false },
    getAttribute: () => null,
    closest: () => null,
  };
  const inner = { tagName: 'SPAN', parentElement: { tagName: 'DIV', className: 'inner', classList: { contains: () => false }, getAttribute: () => null, closest: () => null, parentElement: fallbackCard } };
  assert.equal(findCardContainer({ closest: () => null, parentElement: inner }), fallbackCard);
});

test('타일 스탯 하이라이트는 보크 타일만 활성·비활성 구분해 강조하고 황크·일반·관문 타일은 제외하며 동일 스탯 캐시를 재사용한다', () => {
  const makeRect = (rectCls, imgCls) => {
    const classes = new Set();
    const attrs = new Map();
    const rect = {
      className: rectCls,
      classList: {
        add: c => classes.add(c),
        remove: (...cs) => cs.forEach(c => classes.delete(c)),
        contains: c => classes.has(c),
      },
      setAttribute: (k, v) => attrs.set(k, v),
      removeAttribute: k => attrs.delete(k),
      getAttribute: k => attrs.get(k) ?? null,
    };
    const img = { className: imgCls, closest: () => rect, parentElement: rect };
    return { rect, img };
  };

  const bokrActiveHp = makeRect('bg-(image:--img-board-rect) bg-position-[50%_0]', 'bg-(image:--img-board-tile) bg-position-[9.0909%_0]');
  const bokrInactiveHp = makeRect('bg-(image:--img-board-rect) bg-position-[83.3333%_0]', 'bg-(image:--img-board-tile) bg-position-[4.5455%_0]');
  const hwangHp = makeRect('bg-(image:--img-board-rect) bg-position-[33.3333%_0]', 'bg-(image:--img-board-tile) bg-position-[9.0909%_0]');
  const normalHp = makeRect('bg-(image:--img-board-rect) bg-position-[0%_0]', 'bg-(image:--img-board-tile) bg-position-[9.0909%_0]');
  const gateTile = makeRect('bg-(image:--img-board-rect) bg-position-[50%_0]', 'bg-(image:--img-board-tile) bg-position-[86.3636%_0]');
  const allTiles = [bokrActiveHp, bokrInactiveHp, hwangHp, normalHp, gateTile];

  const cardAttrs = new Map();
  let queryCount = 0;
  const card = {
    getAttribute: k => cardAttrs.get(k) ?? null,
    setAttribute: (k, v) => cardAttrs.set(k, v),
    querySelectorAll: selector => {
      queryCount++;
      if (selector.includes('--img-board-tile')) return allTiles.map(t => t.img);
      return allTiles.map(t => t.rect).filter(r => r.getAttribute('data-tcbe-tile-highlight') !== null);
    },
  };

  updateBoardTileHighlights(card, {}, { ...DEFAULT_FILTER_STATE, statCategory: 'hp' });
  assert.equal(bokrActiveHp.rect.classList.contains('tcbe-tile-highlight-done'), true);
  assert.equal(bokrInactiveHp.rect.classList.contains('tcbe-tile-highlight-rem'), true);
  assert.equal(hwangHp.rect.getAttribute('data-tcbe-tile-highlight'), null);
  assert.equal(normalHp.rect.getAttribute('data-tcbe-tile-highlight'), null);
  assert.equal(gateTile.rect.getAttribute('data-tcbe-tile-highlight'), null);

  const prevQueries = queryCount;
  updateBoardTileHighlights(card, {}, { ...DEFAULT_FILTER_STATE, statCategory: 'hp' });
  assert.equal(queryCount, prevQueries);

  updateBoardTileHighlights(card, {}, { ...DEFAULT_FILTER_STATE, statCategory: 'all' });
  assert.equal(bokrActiveHp.rect.classList.contains('tcbe-tile-highlight-done'), false);
  assert.equal(bokrInactiveHp.rect.classList.contains('tcbe-tile-highlight-rem'), false);
  assert.equal(bokrActiveHp.rect.getAttribute('data-tcbe-tile-highlight'), null);
});

test('상급칸 뱃지는 차수·스탯 필터를 반영하고 모바일 터치/클릭 시 포털 툴팁을 고정·전환·해제한다', async () => {
  const badgeBundle = await build({ entryPoints: ['src/ui/board/badge.ts'], bundle: true, write: false, format: 'iife', globalName: 'badgeMod' });
  const docListeners = new Map();
  const winListeners = new Map();
  const makeEl = () => {
    const classes = new Set();
    const listeners = new Map();
    const styleVars = new Map();
    const el = {
      className: '', textContent: '', innerHTML: '', children: [], offsetWidth: 320, offsetHeight: 240,
      style: {
        display: '', left: '', right: '', top: '', bottom: '', fontFamily: '',
        setProperty: (k, v) => styleVars.set(k, v),
        getPropertyValue: k => styleVars.get(k) ?? '',
      },
      classList: {
        add: c => classes.add(c),
        remove: c => classes.delete(c),
        contains: c => classes.has(c),
      },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener(type, fn) { listeners.set(type, fn); },
      trigger(type, ev = {}) { listeners.get(type)?.({ stopPropagation() {}, preventDefault() {}, ...ev }); },
      contains(target) { return target === el || this.children.includes(target); },
      getBoundingClientRect: () => ({ left: 20, top: 40, width: 100, height: 28, bottom: 68 }),
    };
    return el;
  };

  const rootMount = makeEl();
  let connected = true;
  const context = vm.createContext({
    document: {
      documentElement: { clientWidth: 360 },
      body: { contains: () => connected, appendChild: child => rootMount.appendChild(child) },
      getElementById: id => id === 'root' ? rootMount : null,
      createElement: makeEl,
      addEventListener: (type, fn) => docListeners.set(type, fn),
    },
    window: {
      innerWidth: 360, innerHeight: 740,
      addEventListener: (type, fn) => winListeners.set(type, fn),
    },
    setTimeout: fn => { fn(); return 1; },
    clearTimeout() {},
  });
  vm.runInContext(badgeBundle.outputFiles[0].text, context);

  const progressMap = calculateAllApostlesProgress({ apostles: mockUserApostles, board: mockMasterBoard, heroInfo: mockHeroInfo, text: mockText });
  const apostle = progressMap.get('10001');
  apostle.boards[0].bokr.byStat.hp = { picked: 1, total: 1, remaining: 0 };

  const badge1 = context.badgeMod.createBadgeElement(apostle, { ...DEFAULT_FILTER_STATE, boardLevel: '1', statCategory: 'hp' });
  const badge2 = context.badgeMod.createBadgeElement(apostle, DEFAULT_FILTER_STATE);
  assert.equal(badge1.children[0].innerHTML.includes('1차 상급칸'), true);
  assert.equal(badge1.children.some(c => c.innerHTML?.includes('체력 1/1 ✓')), true);

  // 1번째 클릭: badge1 고정 및 포털 툴팁 표시 (상단 여백 40 < 높이 240 이므로 하단 팝업 클래스 적용)
  badge1.trigger('click');
  const portal = rootMount.children[0];
  assert.equal(badge1.classList.contains('tcbe-pinned'), true);
  assert.equal(portal.style.display, 'block');
  assert.equal(portal.classList.contains('tcbe-popup-bottom'), true);

  // 다른 배지(badge2) 클릭 시 고정 대상 전환
  badge2.trigger('click');
  assert.equal(badge1.classList.contains('tcbe-pinned'), false);
  assert.equal(badge2.classList.contains('tcbe-pinned'), true);

  // 바깥 영역(document) 클릭 시 고정 해제 및 툴팁 숨김
  docListeners.get('click')?.({ target: {} });
  assert.equal(badge2.classList.contains('tcbe-pinned'), false);
  assert.equal(portal.style.display, 'none');

  // 다시 고정 후 스크롤 시 컨테이너가 DOM에서 제거된 경우 자동 정리
  badge1.trigger('click');
  connected = false;
  winListeners.get('scroll')?.();
  assert.equal(badge1.classList.contains('tcbe-pinned'), false);
  assert.equal(portal.style.display, 'none');
});
