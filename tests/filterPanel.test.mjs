import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { DEFAULT_FILTER_STATE } from '../src/domain/filters.ts';
import { calculateAllApostlesProgress } from '../src/domain/boardProgress.ts';
import { mockHeroInfo, mockMasterBoard, mockText, mockUserApostles } from './fixtures/sanitizedData.mjs';

const bundled = await build({ entryPoints: ['src/ui/board/filterPanel.ts'], bundle: true,
  write: false, format: 'iife', globalName: 'panel' });

/** 버튼 클릭과 클래스 갱신에 필요한 DOM 동작만 재현한다. */
function setup() {
  let root;
  const walk = node => node ? [node, ...node.children.flatMap(walk)] : [];
  function makeElement() {
    const attrs = new Map();
    const listeners = new Map();
    let html = '';
    const node = {
      children: [], className: '', textContent: '',
      get innerHTML() { return html; },
      set innerHTML(value) { html = value; node.children = []; },
      setAttribute(key, value) { attrs.set(key, String(value)); },
      getAttribute(key) { return attrs.get(key) ?? null; },
      appendChild(child) { node.children.push(child); return child; },
      addEventListener(type, callback) { listeners.set(type, callback); },
      click() { listeners.get('click')?.({ stopPropagation() {} }); },
      trigger(type, ev = {}) { listeners.get(type)?.({ stopPropagation() {}, ...ev }); },
      style: {
        left: '', right: '',
        setProperty(k, v) { this[k] = v; },
      },
      offsetWidth: 260,
      getBoundingClientRect: () => ({ left: 260, width: 90 }),
      querySelectorAll(selector) {
        const match = selector.match(/^\.([\w-]+)\[([\w-]+)\]$/);
        assert.ok(match, `지원되지 않는 테스트 셀렉터: ${selector}`);
        return walk(node).slice(1).filter(child => child.classList.contains(match[1]) && child.getAttribute(match[2]) !== null);
      },
    };
    node.classList = {
      contains: name => node.className.split(/\s+/).includes(name),
      add(name) { if (!this.contains(name)) node.className += ` ${name}`; },
      remove(name) { node.className = node.className.split(/\s+/).filter(value => value !== name).join(' '); },
      toggle(name, force) { if (force) this.add(name); else this.remove(name); },
    };
    return node;
  }
  const storage = new Map();
  const context = vm.createContext({
    document: { createElement: makeElement, body: { contains: () => true },
      documentElement: { clientWidth: 360 },
      getElementById: id => walk(root).find(node => node.id === id) ?? null,
      querySelector: () => { throw new Error('스탯 선택이 전역 패널을 탐색함'); },
    },
    window: { innerWidth: 360 },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem(k, v) { storage.set(k, String(v)); } },
  });
  vm.runInContext(bundled.outputFiles[0].text, context);
  const changes = [];
  const controller = new context.panel.FilterPanelController(state => changes.push({ ...state }));
  root = controller.render();
  const button = (attr, value) => walk(root).find(node => node.getAttribute(attr) === String(value));
  return { controller, root, button, changes, walk, storage };
}

for (const [field, attr, value] of [
  ['personality', 'data-personality-id', 1], ['tribe', 'data-tribe-id', 2],
  ['grade', 'data-grade-key', 3], ['special', 'data-special-key', 'favorite'],
  ['status', 'data-status-key', 'incomplete'], ['boardLevel', 'data-level-key', '2'],
  ['unlockedTier', 'data-tier-key', 2],
]) {
  test(`${field}: 선택·재클릭·전체 복귀와 다른 필터 보존`, () => {
    const { controller, button, changes } = setup();
    const all = button(attr, 'all');
    const selected = button(attr, value);
    assert.equal(all.classList.contains('tcbe-active'), true);
    selected.click();
    assert.deepEqual({ ...controller.getState() }, { ...DEFAULT_FILTER_STATE, [field]: value });
    assert.equal(selected.classList.contains('tcbe-active'), true);
    assert.equal(all.classList.contains('tcbe-active'), false);
    selected.click();
    assert.equal(controller.getState()[field], 'all');
    assert.equal(all.classList.contains('tcbe-active'), true);
    selected.click();
    all.click();
    assert.deepEqual({ ...controller.getState() }, DEFAULT_FILTER_STATE);
    assert.equal(changes.length, 4);
  });
}

test('통계는 카드 수 인자 없이 전체 사도 수와 필터별 미완료 수를 표시한다', () => {
  const { controller, root, walk } = setup();
  const counter = walk(root).find(node => node.id === 'tcbe-stats-counter');
  controller.updateStats(12, 100, 7, '체력', '순수');
  assert.equal(counter.textContent, '표시: 12명 / 전체 100명 ([순수 체력] 미완료 7명)');
  controller.updateStats(23, 100, 4);
  assert.equal(counter.textContent, '표시: 23명 / 전체 100명 (미완료 4명)');
});

test('정렬 버튼은 기본 방향·양방향 전환·활성 표시·다른 기준 복귀를 유지한다', () => {
  const { controller, button, changes } = setup();
  assert.equal(button('data-special-key', 'favorite').innerHTML, '즐겨찾기');
  assert.equal(button('data-special-key', 'eldain').innerHTML, '엘다인');
  for (const [key, initial, alternate] of [
    ['name', 'name_asc', 'name_desc'], ['unlocked', 'unlocked_desc', 'unlocked_asc'],
    ['grade', 'grade_desc', 'grade_asc'], ['personality', 'personality_asc', 'personality_desc'],
    ['tribe', 'tribe_asc', 'tribe_desc'], ['favorite', 'favorite_desc', 'favorite_asc'],
  ]) {
    const current = button('data-sort-key', key);
    if (controller.getState().sortBy !== initial) current.click();
    assert.equal(controller.getState().sortBy, initial);
    assert.equal(current.classList.contains('tcbe-active'), true);
    assert.ok(current.innerHTML.endsWith(initial.endsWith('_asc') ? '▴' : '▾'));
    current.click();
    assert.equal(controller.getState().sortBy, alternate);
    assert.ok(current.innerHTML.endsWith(alternate.endsWith('_asc') ? '▴' : '▾'));
    current.click();
    assert.equal(controller.getState().sortBy, initial);
    for (const other of ['name', 'unlocked', 'grade', 'personality', 'tribe', 'favorite'].filter(other => other !== key)) {
      assert.equal(button('data-sort-key', other).classList.contains('tcbe-active'), false);
    }
  }
  assert.equal(changes.length, 17);
});

test('스탯 버튼과 요약 카드의 선택이 동기화되고 다른 필터와 컨트롤러 상태를 보존한다', () => {
  const { controller, button, root, changes, walk } = setup();
  const map = calculateAllApostlesProgress({ apostles: mockUserApostles, board: mockMasterBoard,
    heroInfo: mockHeroInfo, text: mockText });
  button('data-grade-key', 3).click();
  map.get('10001').bokr.byStat.hp = { picked: 1, total: 2, remaining: 1 };
  button('data-stat-key', 'hp').click();
  assert.equal(controller.getState().statCategory, 'hp');
  assert.equal(button('data-stat-key', 'hp').classList.contains('tcbe-active'), true);
  controller.updateStatSummaryGrid(map, controller.getState());
  const summary = walk(root).find(node => node.classList.contains('tcbe-summary-active'));
  assert.ok(summary);
  summary.click();
  assert.equal(controller.getState().statCategory, 'all');
  assert.equal(button('data-stat-key', 'all').classList.contains('tcbe-active'), true);
  summary.click();
  assert.equal(controller.getState().statCategory, 'hp');
  button('data-stat-key', 'all').click();
  assert.equal(controller.getState().statCategory, 'all');
  assert.equal(controller.getState().grade, 3);
  assert.equal(changes.length, 5);
  assert.deepEqual({ ...setup().controller.getState() }, DEFAULT_FILTER_STATE);

  // 좁은 화면(360px)에서 우측 요약 카드 호버 시 툴팁이 화면 경계 안쪽으로 위치 보정됨을 확인
  summary.trigger('mouseenter');
  const tooltip = summary.children[0];
  assert.equal(tooltip.style.right, 'auto');
  assert.equal(tooltip.style.left, '-176px');
  assert.equal(tooltip.style['--sum-chevron-right'], '24px');
});

test('상단 고정 체크박스 토글 시 스티키 클래스와 로컬 스토리지 상태를 갱신하며 스크롤 시 상단 고정 헤더로 전환된다', () => {
  const { controller, root, walk, storage } = setup();
  const header = walk(root).find(node => node.classList.contains('tcbe-accordion-header'));
  const checkbox = walk(root).find(node => node.id === 'tcbe-sticky-checkbox');
  const resetBtn = walk(root).find(node => node.id === 'tcbe-filter-reset-btn');
  assert.ok(header);
  assert.ok(checkbox);
  assert.equal(resetBtn.textContent, '필터 초기화');
  assert.equal(root.classList.contains('tcbe-panel-sticky'), false);
  assert.equal(root.getAttribute('data-sticky'), 'false');
  assert.equal(header.getAttribute('data-state'), 'open');

  // 체크박스 활성화 시 상단 고정 클래스 적용 및 스토리지 저장
  checkbox.checked = true;
  checkbox.trigger('change');
  assert.equal(root.classList.contains('tcbe-panel-sticky'), true);
  assert.equal(root.getAttribute('data-sticky'), 'true');
  assert.equal(storage.get('tcbe_panel_sticky'), 'true');
  assert.equal(header.getAttribute('data-state'), 'open');

  // 스크롤을 내려 패널 상단이 뷰포트 상단(top <= 0)에 도달하면 tcbe-panel-pinned 고정 헤더로 전환
  root.getBoundingClientRect = () => ({ top: -20, left: 48, width: 960, height: 220 });
  controller.syncStickyPosition();
  assert.equal(root.classList.contains('tcbe-panel-pinned'), true);
  assert.equal(root.style['--tcbe-pinned-left'], '48px');
  assert.equal(root.style['--tcbe-pinned-width'], '960px');

  // 체크박스 해제 시 고정 헤더 해제 및 원래 상태로 복원
  checkbox.checked = false;
  checkbox.trigger('change');
  assert.equal(root.classList.contains('tcbe-panel-sticky'), false);
  assert.equal(root.classList.contains('tcbe-panel-pinned'), false);
  assert.equal(root.getAttribute('data-sticky'), 'false');
  assert.equal(storage.get('tcbe_panel_sticky'), 'false');
});

test('필터 초기화 버튼은 변경된 모든 필터·정렬 상태와 활성 표시를 기본 상태로 일괄 되돌린다', () => {
  const { controller, root, button, changes, walk } = setup();
  const resetBtn = walk(root).find(node => node.id === 'tcbe-filter-reset-btn');
  assert.ok(resetBtn);
  assert.equal(resetBtn.classList.contains('tcbe-btn-reset-active'), false);

  // 여러 조건과 정렬을 동시에 변경
  button('data-personality-id', 1).click();
  button('data-tribe-id', 2).click();
  button('data-grade-key', 3).click();
  button('data-special-key', 'eldain').click();
  button('data-status-key', 'incomplete').click();
  button('data-level-key', '3').click();
  button('data-tier-key', 2).click();
  button('data-stat-key', 'hp').click();
  button('data-sort-key', 'favorite').click();

  assert.equal(resetBtn.classList.contains('tcbe-btn-reset-active'), true);
  assert.equal(controller.getState().personality, 1);
  assert.equal(controller.getState().tribe, 2);
  assert.equal(controller.getState().special, 'eldain');
  assert.equal(controller.getState().statCategory, 'hp');
  assert.equal(controller.getState().sortBy, 'favorite_desc');

  // 필터 초기화 버튼 클릭 시 모든 조건과 활성 클래스가 기본값으로 복원됨
  const countBefore = changes.length;
  resetBtn.click();
  assert.equal(changes.length, countBefore + 1);
  assert.deepEqual({ ...controller.getState() }, DEFAULT_FILTER_STATE);
  assert.equal(resetBtn.classList.contains('tcbe-btn-reset-active'), false);
  assert.equal(button('data-personality-id', 'all').classList.contains('tcbe-active'), true);
  assert.equal(button('data-tribe-id', 'all').classList.contains('tcbe-active'), true);
  assert.equal(button('data-grade-key', 'all').classList.contains('tcbe-active'), true);
  assert.equal(button('data-special-key', 'all').classList.contains('tcbe-active'), true);
  assert.equal(button('data-status-key', 'all').classList.contains('tcbe-active'), true);
  assert.equal(button('data-level-key', 'all').classList.contains('tcbe-active'), true);
  assert.equal(button('data-tier-key', 'all').classList.contains('tcbe-active'), true);
  assert.equal(button('data-stat-key', 'all').classList.contains('tcbe-active'), true);
  assert.equal(button('data-sort-key', 'name').classList.contains('tcbe-active'), true);
  assert.equal(button('data-sort-key', 'favorite').classList.contains('tcbe-active'), false);
});
