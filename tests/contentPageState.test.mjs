import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { DEFAULT_FILTER_STATE } from '../src/domain/filters.ts';
import { calculateAllApostlesProgress } from '../src/domain/boardProgress.ts';
import { mockHeroInfo, mockMasterBoard, mockText, mockUserApostles } from './fixtures/sanitizedData.mjs';

const bundled = await build({ entryPoints: ['src/content.ts'], bundle: true, write: false, format: 'iife',
  plugins: [{ name: '콘텐츠 진입점 UI 대역', setup(builder) {
    builder.onLoad({ filter: /domain[\\/]boardProgress\.ts$/ }, () => ({ contents:
      'export const STAT_META_LIST = [], PERSONALITY_META_LIST = []; export const calculateAllApostlesProgress = () => globalThis.progressMap;' }));
    builder.onLoad({ filter: /ui[\\/]board[\\/]boardEnhancer\.ts$/ }, () => ({ contents:
      'export const enhanceApostleCards = () => 1; export const applyFilterToCards = () => ({total:1,visible:1}); export const setBadgesVisible = () => {};' }));
    builder.onLoad({ filter: /ui[\\/]board[\\/]filterPanel\.ts$/ }, () => ({ contents: `
      export class FilterPanelController {
        constructor(callback) { globalThis.filterChanged = callback; }
        hasIntegratedSearch() { return globalThis.integrated; }
        getState() { return globalThis.filter; }
        mount() { globalThis.panelStates.push('표시'); }
        unmount() { globalThis.panelStates.push('숨김'); }
        setVisible() {} clearCache() {} updateStats() {} updateStatSummaryGrid() {}
      }` }));
    builder.onLoad({ filter: /bridge[\\/]contentBridge\.ts$/ }, () => ({ contents:
      'export function listenForBoardData(callback) { globalThis.receiveData = callback; return () => {}; }' }));
  } }] });

class Element {
  constructor(owned = false) { this.owned = owned; this.nodeType = 1; }
  closest() { return this.owned ? {} : null; }
}
function setup() {
  const state = { buttons: [], search: true, scans: 0 };
  const windowListeners = new Map(), documentListeners = new Map(), timers = new Map(), sent = [];
  let timerId = 0, observer, observerOptions;
  const host = { location: { pathname: '/board', origin: 'https://note.trickcal.com' },
    addEventListener: (type, callback) => windowListeners.set(type, callback),
    removeEventListener() {}, postMessage: message => sent.push(message) };
  const context = vm.createContext({ window: host, Element,
    document: { body: {}, documentElement: { style: { setProperty() {} }, setAttribute() {}, removeAttribute() {} },
      querySelector: selector => selector === 'input[placeholder*="사도"]' && state.search ? {} : null,
      querySelectorAll: selector => {
        if (selector === 'button, a, div[role="button"]') { state.scans++; return state.buttons; }
        return [];
      }, addEventListener: (type, callback) => documentListeners.set(type, callback),
    },
    chrome: { runtime: { onMessage: { addListener() {} } } },
    MutationObserver: class {
      constructor(callback) { observer = callback; }
      observe(_target, options) { observerOptions = options; }
    },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    progressMap: calculateAllApostlesProgress({ apostles: mockUserApostles, board: mockMasterBoard,
      heroInfo: mockHeroInfo, text: mockText }),
    filter: DEFAULT_FILTER_STATE, integrated: false, panelStates: [],
  });
  vm.runInContext(bundled.outputFiles[0].text, context);
  const flush = () => {
    for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
  };
  context.receiveData({}); flush();
  const mutation = (owned = false) => observer([{ type: 'characterData', target: {
    nodeType: 3, parentElement: new Element(owned) } }]);
  return { state, context, host, sent, flush, mutation, windowListeners, documentListeners,
    timerCount: () => timers.size, observerOptions, lastPanelState: () => context.panelStates.at(-1) };
}

test('콘텐츠 진입점은 필터·통계 갱신에서 캐시를 재사용하고 원본 DOM·페이지 이벤트에서 무효화한다', () => {
  const app = setup();
  assert.equal(app.lastPanelState(), '표시');
  assert.equal(app.state.scans, 1);
  app.context.filterChanged();
  assert.equal(app.state.scans, 1);
  app.mutation(true); app.flush();
  assert.equal(app.state.scans, 1);
  app.state.buttons = [Object.assign(new Element(), { textContent: '사도별' })];
  app.mutation(); app.flush();
  assert.equal(app.lastPanelState(), '숨김');
  assert.equal(app.state.scans, 2);
  app.state.buttons = [];
  app.documentListeners.get('click')({ target: new Element() }); app.flush();
  assert.equal(app.lastPanelState(), '표시');
  for (const type of ['popstate', 'hashchange', 'pageshow']) {
    const scans = app.state.scans;
    app.windowListeners.get(type)(); app.flush();
    assert.equal(app.state.scans, scans + 1);
  }
  app.host.location.pathname = '/other';
  app.windowListeners.get('popstate')(); app.flush();
  assert.equal(app.lastPanelState(), '숨김');
  assert.ok(app.observerOptions.attributeFilter.includes('placeholder'));
});

test('콘텐츠 통계 구독은 오래된 키·다른 출처·중복 통계를 제외하고 정상 갱신에서 페이지를 재탐색하지 않는다', () => {
  const app = setup();
  const data = { type: 'TCBE_GRID_STATS', source: 'tcbe-main-interceptor', visible: 1, total: 3,
    key: app.sent.at(-1).key };
  const send = overrides => app.windowListeners.get('message')({ source: app.host,
    origin: app.host.location.origin, data, ...overrides });
  send({ data: { ...data, key: '지난선택' } });
  send({ origin: 'https://example.invalid' });
  assert.equal(app.timerCount(), 0);
  send(); assert.equal(app.timerCount(), 1); app.flush();
  assert.equal(app.state.scans, 1);
  send(); assert.equal(app.timerCount(), 0);
  app.state.search = false; app.context.integrated = true; app.context.filterChanged();
  assert.equal(app.lastPanelState(), '표시');
  app.context.integrated = false; app.context.filterChanged();
  assert.equal(app.lastPanelState(), '숨김');
});
