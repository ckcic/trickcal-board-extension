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
  const context = vm.createContext({
    document: { createElement: makeElement, body: { contains: () => true },
      getElementById: id => walk(root).find(node => node.id === id) ?? null,
      querySelector: () => { throw new Error('스탯 선택이 전역 패널을 탐색함'); },
    },
    localStorage: { getItem: () => null, setItem() {} },
  });
  vm.runInContext(bundled.outputFiles[0].text, context);
  const changes = [];
  const controller = new context.panel.FilterPanelController(state => changes.push({ ...state }));
  root = controller.render();
  const button = (attr, value) => walk(root).find(node => node.getAttribute(attr) === String(value));
  return { controller, root, button, changes, walk };
}

for (const [field, attr, value] of [
  ['personality', 'data-personality-id', 1], ['grade', 'data-grade-key', 3],
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
  for (const [key, initial, alternate] of [
    ['name', 'name_asc', 'name_desc'], ['unlocked', 'unlocked_desc', 'unlocked_asc'],
    ['grade', 'grade_desc', 'grade_asc'], ['personality', 'personality_asc', 'personality_desc'],
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
    for (const other of ['name', 'unlocked', 'grade', 'personality'].filter(other => other !== key)) {
      assert.equal(button('data-sort-key', other).classList.contains('tcbe-active'), false);
    }
  }
  assert.equal(changes.length, 11);
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
});
