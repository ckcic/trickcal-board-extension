import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

// 화면·계산 렌더러만 대체하고 실제 이벤트 연결과 설정 저장·복원 경로를 실행한다.
const substitutes = {
  commonModal: `export const createCommonModal = options => {
    globalThis.closeModal = options.onClose;
    return { dialog: globalThis.dialog, close: options.onClose, switchTab() {} };
  };`,
  redistributionTemplate: `export const renderRedistributionTemplate = () => '';
    export const renderResourcePriorityList = () => '';`,
  redistributionStageEditor: `export const renderRedistributionStageEditor = stages => JSON.stringify(stages);
    export const readRedistributionStages = list => structuredClone(list.stages);
    export const getRedistributionStageStats = () => [['attack', '공격력'], ['hp', 'HP']];
    export const renderStageTargetHint = () => '';
    export const updateStageTargetRowElement = () => {};`,
  redistributionForm: `export const readFormOptions = dialog => ({
      ownedCrayons: 5, ownedBokr: 28, maxReset: 0, searchMode: 'fast', stages: dialog.list.stages });
    export const restoreFormOptions = () => {};
    export const resetFormResourceWeights = () => {};
    export const resetFormResourcePriority = () => {};`,
  redistributionStageDrag: `export const setupRedistributionStageDrag = (_list, _panel, move) => {
    globalThis.moveStage = move; return () => {}; };`,
  redistributionCalculation: `export const setupRedistributionCalculation = () => ({ dispose() {}, invalidateCurve() {} });`,
  redistributionSettingsTabs: `export const setupRedistributionSettingsTabs = () => () => {};`,
  redistributionToc: `export const setupRedistributionToc = () => () => {};`,
  redistributionPresetModal: `export const openExportPresetModal = () => {};
    export const openImportPresetModal = (_dialog, accept) => accept(globalThis.importedStages);`,
};
const bundled = await build({ entryPoints: ['src/ui/redistribution/hwangRedistribution.ts'],
  bundle: true, write: false, format: 'iife', globalName: 'feature',
  plugins: [{ name: '화면 대역', setup(builder) {
    builder.onLoad({ filter: /\.ts$/ }, args => {
      const name = args.path.split(/[\\/]/).at(-1).replace('.ts', '');
      return substitutes[name] ? { contents: substitutes[name] } : undefined;
    });
  } }],
});

class Element {
  listeners = new Map();
  dataset = {};
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  emit(type, target = this) { this.listeners.get(type)?.({ target }); }
  closest(selector) { return selector === '[data-stage-action]' ? this : null; }
  querySelectorAll() { return []; }
  set innerHTML(value) { this.stages = JSON.parse(value); }
}

function setup() {
  const list = new Element(), form = new Element();
  const selectors = ['[data-add-stage]', '[data-add-bokr-stage]', '[data-examples]', '[data-import-preset]'];
  const fields = new Map(selectors.map(selector => [selector, new Element()]));
  fields.set('[data-targets]', list); fields.set('form', form);
  const dialog = { list, querySelector: selector => fields.get(selector) ?? null };
  const storage = new Map(), timers = new Map(); let id = 0;
  const context = vm.createContext({ dialog, Element, HTMLInputElement: Element,
    HTMLSelectElement: Element, structuredClone,
    setTimeout: callback => { timers.set(++id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    localStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value) },
  });
  vm.runInContext(bundled.outputFiles[0].text, context);
  const open = () => context.feature.openHwangRedistribution(new Map());
  const flush = () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } };
  const action = (stageAction, index) => {
    const button = new Element(); button.dataset = { stageAction, index: String(index) };
    list.emit('click', button);
  };
  open(); flush();
  assert.equal(storage.size, 0, '열기만 해서는 기존 설정을 덮어쓰지 않는다');
  return { context, list, fields, storage, action, flush, open };
}

for (const closeImmediately of [false, true]) {
  test(`단계 삭제 후 ${closeImmediately ? '즉시 닫아도' : '자동 저장 후'} 다시 열면 삭제가 유지된다`, () => {
    const app = setup();
    const before = structuredClone(app.list.stages);
    app.action('delete', before.length - 1);
    if (closeImmediately) app.context.closeModal();
    else app.flush();
    app.open();
    assert.deepEqual(app.list.stages, before.slice(0, -1));
  });
}

test('단계 추가·버튼 순서 변경·드래그·예시 복원·가져오기도 자동 저장한다', () => {
  const app = setup();
  const verify = () => {
    const expected = structuredClone(app.list.stages);
    app.flush(); app.context.closeModal(); app.open(); app.flush();
    assert.deepEqual(app.list.stages, expected);
  };
  app.fields.get('[data-add-stage]').emit('click'); verify();
  app.fields.get('[data-add-bokr-stage]').emit('click'); verify();
  app.action('up', app.list.stages.length - 1); verify();
  app.context.moveStage(0, 2, true); verify();
  app.fields.get('[data-examples]').emit('click'); verify();
  app.context.importedStages = [{ allowBlocked: false, targets: [{ stat: 'hp', target: 12 }] }];
  app.fields.get('[data-import-preset]').emit('click'); verify();
});
