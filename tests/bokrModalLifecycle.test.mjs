import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/ui/bokrModal.ts'], bundle: true, write: false, format: 'iife', globalName: 'modal' });

function setup(reducedMotion = false) {
  const timers = new Map();
  const containers = [];
  const values = new Map();
  const style = {
    getPropertyValue: key => values.get(key) || '',
    getPropertyPriority: () => '',
    setProperty: (key, value) => values.set(key, value),
    removeProperty: key => values.delete(key),
  };
  class Element {
    dataset = {};
    removed = false;
    isConnected = true;
    addEventListener() {}
    removeEventListener() {}
    querySelector() { return this.dialog; }
    querySelectorAll() { return []; }
    focus() {}
    remove() { this.removed = true; this.isConnected = false; }
  }
  const root = { clientWidth: 1185 };
  const body = { style, appendChild: container => containers.push(container) };
  const document = {
    documentElement: root, body, activeElement: null,
    createElement() { const container = new Element(); container.dialog = new Element(); return container; },
    addEventListener() {}, removeEventListener() {},
  };
  const context = vm.createContext({
    document, HTMLElement: Element,
    window: { innerWidth: 1200, matchMedia: () => ({ matches: reducedMotion }), addEventListener() {}, removeEventListener() {} },
    getComputedStyle: el => el === root ? { scrollbarGutter: 'auto' } : { marginRight: '0px' },
    setTimeout(fn, delay) { const id = Symbol(); timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(bundled.outputFiles[0].text, context);
  const cost = { basicCrayon: 0, averageCrayon: 0, epicCrayon: 0, ultraCrayon: 0, gold: 0 };
  let closed = 0;
  const options = { progress: { boards: [], name: '테스트 사도', personality: 0, unlockedBoardCount: 1 }, boardIndex: 0, targetNode: { id: 1, nodeType: 4 }, pathResult: { targetNodeCost: cost, pathCost: cost }, onClose: () => closed++ };
  return { modal: context.modal, options, containers, timers, style, closed: () => closed };
}

test('닫힘 애니메이션 동안 스크롤 잠금을 유지하고 중복 닫기에도 한 번만 정리한다', () => {
  const state = setup();
  state.modal.showBokrModal(state.options);
  state.modal.closeBokrModal();
  state.modal.closeBokrModal();
  assert.equal(state.containers[0].dataset.state, 'closed');
  assert.equal(state.containers[0].removed, false);
  assert.equal(state.style.getPropertyValue('overflow'), 'hidden');
  assert.equal(state.timers.size, 1);
  const timer = [...state.timers.values()][0];
  assert.equal(timer.delay, 200);
  timer.fn();
  assert.equal(state.containers[0].removed, true);
  assert.equal(state.style.getPropertyValue('overflow'), '');
  assert.equal(state.style.getPropertyValue('margin-right'), '');
  assert.equal(state.closed(), 1);
});

test('닫는 도중 새 모달을 열면 이전 타이머가 새 모달을 제거하지 않는다', () => {
  const state = setup();
  state.modal.showBokrModal(state.options);
  state.modal.closeBokrModal();
  state.modal.showBokrModal(state.options);
  assert.equal(state.timers.size, 0);
  assert.equal(state.containers[0].removed, true);
  assert.equal(state.containers[1].removed, false);
  assert.equal(state.containers[1].dataset.state, 'open');
  assert.equal(state.style.getPropertyValue('margin-right'), '15px');
  state.modal.closeBokrModal(true);
  assert.equal(state.containers[1].removed, true);
  assert.equal(state.style.getPropertyValue('overflow'), '');
});

test('동작 줄이기 설정에서는 애니메이션 대기 없이 스크롤과 모달을 정리한다', () => {
  const state = setup(true);
  state.modal.showBokrModal(state.options);
  state.modal.closeBokrModal();
  assert.equal(state.timers.size, 0);
  assert.equal(state.containers[0].removed, true);
  assert.equal(state.style.getPropertyValue('overflow'), '');
});
