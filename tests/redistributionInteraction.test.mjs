import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

/** 브라우저 요소의 이벤트와 드래그에 필요한 상태를 재현한다. */
class Element {
  listeners = new Map();
  dataset = {};
  style = {};
  classes = new Set();
  scrollTop = 0;
  hidden = false;
  classList = { add: (...names) => names.forEach(name => this.classes.add(name)),
    remove: (...names) => names.forEach(name => this.classes.delete(name)) };
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type, callback) { if (this.listeners.get(type) === callback) this.listeners.delete(type); }
  emit(type, event = {}) { return this.listeners.get(type)?.({ target: this, preventDefault() {}, ...event }); }
  closest(selector) { return selector === '[data-stage]' || selector === '[data-toc-target]' ? this : null; }
  contains(node) { return node === this; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { top: 0, bottom: 300, height: 300 }; }
}
const bundle = async path => (await build({ entryPoints: [path], bundle: true, write: false,
  format: 'iife', globalName: 'feature' })).outputFiles[0].text;
const dragSource = await bundle('src/ui/redistribution/redistributionStageDrag.ts');
const tocSource = await bundle('src/ui/redistribution/redistributionToc.ts');
const tabsSource = await bundle('src/ui/redistribution/redistributionSettingsTabs.ts');

function setupDrag() {
  const list = new Element(), panel = new Element();
  const source = new Element(), target = new Element();
  source.dataset.stage = '0'; target.dataset.stage = '1';
  target.getBoundingClientRect = () => ({ top: 100, bottom: 200, height: 100 });
  list.querySelectorAll = () => [source, target];
  const frames = new Map(); let id = 0;
  const context = vm.createContext({ Element,
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: frame => frames.delete(frame) });
  vm.runInContext(dragSource, context);
  const moves = [];
  const dispose = context.feature.setupRedistributionStageDrag(list, panel, (...args) => moves.push(args));
  return { list, panel, source, target, frames, moves, dispose };
}

test('드래그는 대상의 위·아래 위치를 전달하고 가장자리 자동 스크롤을 종료한다', () => {
  for (const [clientY, after] of [[120, false], [180, true]]) {
    const { list, panel, source, target, frames, moves, dispose } = setupDrag();
    list.emit('dragstart', { target: source });
    panel.emit('dragover', { clientY: 295 });
    assert.equal(frames.size, 1);
    const [id, frame] = frames.entries().next().value;
    frames.delete(id); frame();
    assert.ok(panel.scrollTop > 0);
    list.emit('drop', { target, clientY });
    assert.deepEqual(moves, [[0, 1, after]]);
    assert.equal(frames.size, 0);
    dispose();
  }
});

test('드래그 종료·창 닫기는 프레임과 이벤트를 정리하고 잘못된 드롭은 이동하지 않는다', () => {
  const { list, panel, source, frames, moves, dispose } = setupDrag();
  list.emit('dragstart', { target: source });
  panel.emit('dragover', { clientY: 1 });
  list.emit('dragend');
  assert.equal(frames.size, 0);
  list.emit('drop', { target: source, clientY: 1 });
  assert.deepEqual(moves, []);
  list.emit('dragstart', { target: source });
  panel.emit('dragover', { clientY: 295 });
  dispose(); dispose();
  assert.equal(frames.size, 0);
  assert.equal(list.listeners.size, 0);
  assert.equal(panel.listeners.size, 0);
});

test('목차는 초성·혼합 검색 시 항목을 재생성하지 않고 결과 없음과 전체 복귀를 처리한다', () => {
  const items = ['에르핀', '코미'].map(name => Object.assign(new Element(), { dataset: { apostleName: name } }));
  const empty = new Element(), container = new Element(), search = new Element(), count = new Element();
  const toc = new Element(), top = new Element(), result = new Element(), mobileTopContainer = new Element();
  const fields = { '[data-toc-apostles]': container, '[data-toc-search]': search, '[data-toc-count]': count,
    '[data-toc-container]': toc, '[data-toc-top]': top, '.tcbe-rd-result-content': result,
    '[data-mobile-top-container]': mobileTopContainer };
  let htmlWrites = 0;
  Object.defineProperty(container, 'innerHTML', { set(value) { htmlWrites++; this.html = value; } });
  container.querySelectorAll = () => items;
  container.querySelector = () => empty;
  const dialog = { querySelector: selector => fields[selector] ?? null };
  const context = vm.createContext({ Element });
  vm.runInContext(tocSource, context);
  const update = context.feature.setupRedistributionToc(dialog, () => new Map());
  update({ actions: items.map((item, index) => ({ apostle: { apostleId: index, name: item.dataset.apostleName }, reset: index === 0 })) });
  assert.equal(toc.hidden, false);
  assert.equal(mobileTopContainer.hidden, false);
  assert.equal(count.textContent, '2명');
  const writes = htmlWrites;
  for (const query of ['ㅇㄹㅍ', '에ㄹ']) {
    search.value = query; search.emit('input');
    assert.equal(items[0].style.display, '');
    assert.equal(items[1].style.display, 'none');
  }
  search.value = '없는사도'; search.emit('input');
  assert.equal(empty.style.display, '');
  search.value = ''; search.emit('input');
  assert.ok(items.every(item => item.style.display === ''));
  assert.equal(empty.style.display, 'none');
  assert.equal(htmlWrites, writes);
  update({ actions: [] });
  assert.equal(toc.hidden, true);
  assert.equal(mobileTopContainer.hidden, true);
});

test('목차의 맨 위 이동은 창 크기에 맞는 스크롤 영역을 사용한다', () => {
  const top = new Element(), result = new Element(), container = new Element(), mobileTop = new Element();
  const calls = [];
  result.scrollTo = options => calls.push(['본문', options.top]);
  container.scrollTo = options => calls.push(['전체', options.top]);
  let narrow = false;
  const fields = { '[data-toc-top]': top, '.tcbe-rd-result-content': result,
    '.tcbe-rd-result-container': container, '[data-mobile-top]': mobileTop };
  const context = vm.createContext({ Element, window: { matchMedia: query => {
    assert.equal(query, '(max-width: 960px)');
    return { matches: narrow };
  } } });
  vm.runInContext(tocSource, context);
  context.feature.setupRedistributionToc({ querySelector: selector => fields[selector] ?? null }, () => new Map());
  top.emit('click');
  narrow = true;
  mobileTop.emit('click');
  narrow = false;
  top.emit('click');
  assert.deepEqual(calls, [['본문', 0], ['전체', 0], ['본문', 0]]);
});

test('설정 도움말 탭은 누락 패널에 안전하고 닫을 때 지연 분석을 취소한다', () => {
  const tabs = ['edit', 'help'].map(id => {
    const button = new Element(); button.dataset.settingsTab = id;
    button.setAttribute = (key, value) => { button[key] = value; };
    button.getAttribute = () => `rd-${id}-panel`;
    button.focus = () => { button.focused = true; };
    return button;
  });
  const container = new Element(), timers = new Map();
  const dialog = { querySelectorAll: () => tabs,
    querySelector: selector => selector === '[data-availability-container]' ? container : null };
  const context = vm.createContext({ setTimeout: callback => { timers.set(1, callback); return 1; },
    clearTimeout: id => timers.delete(id) });
  vm.runInContext(tabsSource, context);
  const dispose = context.feature.setupRedistributionSettingsTabs(dialog, new Map());
  tabs[0].emit('keydown', { key: 'End' });
  assert.equal(tabs[1]['aria-selected'], 'true');
  assert.equal(tabs[1].focused, true);
  assert.equal(timers.size, 1);
  tabs[1].emit('click');
  assert.equal(timers.size, 1);
  dispose(); dispose();
  assert.equal(timers.size, 0);
});
