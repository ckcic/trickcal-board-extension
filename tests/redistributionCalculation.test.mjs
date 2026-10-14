import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/ui/redistribution/redistributionCalculation.ts'], bundle: true,
  write: false, format: 'iife', globalName: 'calculation', plugins: [{ name: '계산·렌더링 대역', setup(builder) {
    builder.onLoad({ filter: /domain[\\/]hwangRedistribution\.ts$/ }, () => ({ contents:
      "export function* iterateHwangRedistribution() { yield { plan: globalThis.fakePlan, limit: 0 }; if (globalThis.fail) throw new Error('테스트 계산 실패'); }" }));
    builder.onLoad({ filter: /domain[\\/]redistributionCurve\.ts$/ }, () => ({ contents:
      'export function calculateRedistributionCurve(map, options, progress, signal) { return globalThis.curveHook(options, progress, signal); }' }));
    builder.onLoad({ filter: /ui[\\/]redistribution[\\/]redistributionResult\.ts$/ }, () => ({ contents:
      "export const renderRedistributionResult = () => '추천 결과'; export const generateOrdersText = () => '작업 순서';" }));
    builder.onLoad({ filter: /ui[\\/]redistribution[\\/]redistributionCurve\.ts$/ }, () => ({ contents:
      "export const renderRedistributionCurve = () => '그래프 결과';" }));
  } }] });

class Element {
  listeners = new Map();
  disabled = false;
  hidden = false;
  textContent = '';
  innerHTML = '';
  classList = { remove() {} };
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  emit(type, event = {}) { return this.listeners.get(type)?.({ target: this, preventDefault() {}, ...event }); }
  closest(selector) { return selector === '[data-curve]' ? this : null; }
  querySelector() { return null; }
  replaceChildren() { this.innerHTML = ''; }
}
function setup({ fail = false } = {}) {
  const form = new Element(), cancel = new Element(), status = new Element(), result = new Element();
  const curveStatus = new Element(), curveResult = new Element(), curveButton = new Element();
  const enabled = new Element(), disabled = new Element(); disabled.disabled = true;
  form.querySelectorAll = () => [enabled, disabled, cancel];
  form.reportValidity = () => true;
  const fields = { form, '[data-cancel-calculation]': cancel, '[data-status]': status, '[data-result]': result,
    '[data-curve-status]': curveStatus, '[data-curve-result]': curveResult };
  const dialog = new Element(); dialog.querySelector = selector => fields[selector] ?? null;
  const timers = new Map(); let id = 0;
  const options = { searchMode: 'fast', ownedCrayons: 10, maxReset: 2, stages: [] };
  const plan = { actions: [] };
  let finishCurve, curveSignal, curveOptions;
  const context = vm.createContext({ Element, HTMLImageElement: Element, AbortController, fail, fakePlan: plan,
    setTimeout: callback => { timers.set(++id, callback); return id; }, clearTimeout: timer => timers.delete(timer),
    curveHook: (options, progress, signal) => {
      curveSignal = signal; curveOptions = options; progress(1, 2, 1, 2);
      return new Promise(resolve => { finishCurve = resolve; });
    },
  });
  vm.runInContext(bundled.outputFiles[0].text, context);
  const completed = [], tabs = [];
  const controller = context.calculation.setupRedistributionCalculation({ dialog, progressMap: new Map(),
    readOptions: () => options, readTargets() {}, updateToc: next => assert.equal(next, plan),
    getPortraitMap: () => new Map(), switchTab: tab => tabs.push(tab), onPlan: next => completed.push(next) });
  const flush = async () => {
    const pending = [];
    while (timers.size) {
      const [key, callback] = timers.entries().next().value; timers.delete(key);
      const result = callback(); if (result?.then) pending.push(result);
      await Promise.resolve();
    }
    await Promise.all(pending);
  };
  return { controller, form, cancel, status, result, dialog, curveButton, curveResult, enabled, disabled,
    completed, tabs, timers, flush, finishCurve: () => finishCurve({}), getCurve: () => ({ signal: curveSignal, options: curveOptions }) };
}

test('추천 계산은 결과·목차·탭을 갱신하고 원래 비활성 입력 상태를 복원한다', async () => {
  const app = setup(); app.form.emit('submit');
  assert.equal(app.enabled.disabled, true);
  assert.equal(app.cancel.hidden, false);
  await app.flush();
  assert.equal(app.completed.length, 1);
  assert.equal(app.result.innerHTML, '추천 결과');
  assert.deepEqual(app.tabs, ['result']);
  assert.equal(app.enabled.disabled, false);
  assert.equal(app.disabled.disabled, true);
  assert.equal(app.cancel.hidden, true);
});

test('추천 취소와 오류는 결과를 확정하지 않고 입력을 복원한다', async () => {
  for (const fail of [false, true]) {
    const app = setup({ fail }); app.form.emit('submit');
    if (!fail) app.cancel.emit('click');
    await app.flush();
    assert.equal(app.completed.length, 0);
    assert.equal(app.enabled.disabled, false);
    assert.equal(app.cancel.hidden, true);
    assert.match(app.status.textContent, fail ? /테스트 계산 실패/ : /취소/);
  }
});

test('창 닫기는 대기 중인 추천을 취소하고 재실행을 막는다', async () => {
  const app = setup(); app.form.emit('submit');
  app.controller.dispose(); app.controller.dispose();
  assert.equal(app.timers.size, 0);
  assert.equal(app.enabled.disabled, false);
  app.form.emit('submit'); await app.flush();
  assert.equal(app.completed.length, 0);
  assert.equal(app.timers.size, 0);
});

test('추천 전 그래프를 계산할 수 있고 설정 변경·창 닫기·버튼 재클릭으로 취소한다', async () => {
  for (const cancel of ['없음', '설정', '닫기', '버튼']) {
    const app = setup();
    const task = app.dialog.emit('click', { target: app.curveButton });
    assert.equal(app.getCurve().options.maxReset, 0);
    assert.equal(app.curveButton.textContent, '그래프 계산 취소');
    if (cancel === '설정') app.controller.invalidateCurve();
    if (cancel === '닫기') app.controller.dispose();
    if (cancel === '버튼') await app.dialog.emit('click', { target: app.curveButton });
    assert.equal(app.getCurve().signal.aborted, cancel !== '없음');
    app.finishCurve(); await task;
    assert.equal(app.curveResult.innerHTML, cancel === '없음' ? '그래프 결과' : '');
    assert.equal(app.enabled.disabled, false);
    assert.equal(app.disabled.disabled, true);
    assert.equal(app.curveButton.textContent, '인원별 그래프 계산');
  }
});

test('필수 계산 DOM이 없으면 초기화와 해제가 안전하다', () => {
  const context = vm.createContext({}); vm.runInContext(bundled.outputFiles[0].text, context);
  const controller = context.calculation.setupRedistributionCalculation({ dialog: { querySelector: () => null } });
  controller.dispose(); controller.invalidateCurve();
});
