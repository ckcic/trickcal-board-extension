import assert from 'node:assert/strict';
import test from 'node:test';
import { findTileIdentity, TILE_APOSTLE_ID, TILE_BOARD_LEVEL, TILE_NODE_ID } from '../src/bridge/tileIdentity.ts';
import { attachBokrTileClickListener, getBoardCols, resolveBokrTile } from '../src/ui/boardEnhancer.ts';

const tile = (nodeId, level = 1, apostleId = 123) => {
  const attrs = new Map([[TILE_NODE_ID, String(nodeId)], [TILE_BOARD_LEVEL, String(level)],
    [TILE_APOSTLE_ID, String(apostleId)]]);
  return {
    getAttribute: key => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: key => attrs.delete(key),
  };
};
const progress = {
  apostleId: 123,
  boards: [{
    nodes: [
      { nodeId: 50, isBokr: false }, { nodeId: 20, isBokr: true },
      { nodeId: 70, isBokr: false }, { nodeId: 80, isBokr: false },
    ],
    masterNodes: [{ id: 50, nodeType: 3 }, { id: 20, nodeType: 4 },
      { id: 70, nodeType: 5 }, { id: 80, nodeType: 6 }],
  }],
};

test('MAIN 타일의 컴포넌트에서 노드 ID·사도·차수를 함께 검증한다', () => {
  const element = { '__reactFiber$fake': { memoizedProps: {}, return: {
    memoizedProps: { node: { id: 20, nodeType: 4 }, noGrid: true }, return: {
      memoizedProps: { node: { id: 20, nodeType: 4 }, heroUid: '123', nth: 1 },
    },
  } } };
  assert.deepEqual(findTileIdentity(element), { nodeId: 20, apostleId: 123, boardLevel: 1 });
  element.__reactFiber$fake.return.return.memoizedProps.nth = 0;
  assert.equal(findTileIdentity(element), null);
  assert.equal(findTileIdentity({}), null);
});

test('요약 타일은 API 배열 순서와 달라도 ID로 연결하며 황크·꽃잎·다른 사도는 제외한다', () => {
  assert.equal(resolveBokrTile(tile(20), progress).nodeIndex, 1);
  assert.equal(resolveBokrTile(tile(70), progress), null);
  assert.equal(resolveBokrTile(tile(80), progress), null);
  assert.equal(resolveBokrTile(tile(20, 1, 456), progress), null);
  assert.equal(resolveBokrTile(tile(20, 2), progress), null);
  assert.equal(resolveBokrTile(tile(1), progress), null);
});

test('원본이 DOM을 재사용하면 현재 호스트 props와 일치하는 Fiber 트리의 식별자를 사용한다', () => {
  const hostProps = { className: '원본 타일' };
  const element = { '__reactProps$fake': hostProps, '__reactFiber$fake': {
    memoizedProps: { className: '이전 타일' },
    return: { memoizedProps: { node: { id: 20 }, heroUid: 123, nth: 1 } },
    alternate: { memoizedProps: hostProps,
      return: { memoizedProps: { node: { id: 70 }, heroUid: 456, nth: 2 } },
    },
  } };
  assert.deepEqual(findTileIdentity(element), { nodeId: 70, apostleId: 456, boardLevel: 2 });
});

test('기존에 잘못 표시된 꽃잎·황크를 해제하고 새 데이터와 원본 타일 교체를 반영한다', () => {
  let tiles = [tile(80), tile(70), tile(20)];
  tiles.forEach(t => t.setAttribute('data-tcbe-is-bokr', 'true'));
  const attrs = new Map();
  let bindings = 0;
  const card = {
    getAttribute: key => attrs.get(key), setAttribute: (key, value) => attrs.set(key, value),
    querySelectorAll: () => tiles, addEventListener: () => bindings++,
  };
  attachBokrTileClickListener(card, progress);
  assert.deepEqual(tiles.map(t => t.getAttribute('data-tcbe-is-bokr')), [null, null, 'true']);
  tiles = [tile(20), tile(70)];
  attachBokrTileClickListener(card, progress);
  assert.deepEqual(tiles.map(t => t.getAttribute('data-tcbe-is-bokr')), ['true', null]);
  const changed = { ...progress, boards: [{ ...progress.boards[0], nodes: [{ nodeId: 20, isBokr: false }] }] };
  attachBokrTileClickListener(card, changed);
  assert.equal(tiles[0].getAttribute('data-tcbe-is-bokr'), null);
  assert.equal(bindings, 1);
});

test('보드 열은 원본 제목만 조회하고 열린 차수 문구나 확장 팝업을 선택하지 않는다', () => {
  const cols = [{}, {}, {}];
  const titles = cols.map((parentElement, i) => ({ textContent: `${i + 1} 차 보드`,
    parentElement: { ...parentElement, classList: { contains: () => true } },
  }));
  const card = { querySelectorAll: selector => {
    assert.equal(selector, '.bg-charaboard-active-title-background, .bg-charaboard-inactive-title-background');
    return titles;
  } };
  const result = getBoardCols(card);
  assert.equal(result.b1Col, titles[0].parentElement);
  assert.equal(result.b2Col, titles[1].parentElement);
  assert.equal(result.b3Col, titles[2].parentElement);
});

test('브리지는 클릭 직전에 식별자를 갱신하고 페이지 복원 및 해제 때 감시를 정리한다', async () => {
  const { installTileIdentityBridge } = await import('../src/bridge/tileIdentity.ts');
  const original = new Map(['document', 'window', 'Element', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  const docListeners = new Map();
  const winListeners = new Map();
  const observers = [];
  const frames = new Map();
  let nextFrame = 0;
  class FakeElement {
    nodeType = 1;
    attrs = new Map();
    __reactFiber$test = { memoizedProps: { node: { id: 20 }, heroUid: 123, nth: 1 } };
    closest(selector) { return selector.startsWith('[data-slot') ? this : null; }
    hasAttribute(key) { return this.attrs.has(key); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    setAttribute(key, value) { this.attrs.set(key, value); }
    removeAttribute(key) { this.attrs.delete(key); }
  }
  const element = new FakeElement();
  globalThis.Element = FakeElement;
  globalThis.document = {
    documentElement: {}, querySelectorAll: () => [element],
    addEventListener: (key, listener) => docListeners.set(key, listener),
    removeEventListener: key => docListeners.delete(key),
  };
  globalThis.window = {
    addEventListener: (key, listener) => winListeners.set(key, listener),
    removeEventListener: key => winListeners.delete(key),
  };
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
  };
  globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  try {
    const dispose = installTileIdentityBridge();
    assert.equal(element.getAttribute(TILE_NODE_ID), '20');
    observers[0].callback([{ type: 'childList', target: element }]);
    assert.equal(frames.size, 1);
    element.__reactFiber$test.memoizedProps = { node: { id: 50 }, heroUid: 456, nth: 2 };
    docListeners.get('click')({ target: element });
    assert.equal(element.getAttribute(TILE_NODE_ID), '50');
    assert.equal(element.getAttribute(TILE_APOSTLE_ID), '456');
    winListeners.get('pagehide')();
    assert.equal(frames.size, 0);
    assert.equal(observers[0].connected, false);
    winListeners.get('pageshow')({ persisted: true });
    assert.equal(observers[1].connected, true);
    element.__reactFiber$test.memoizedProps = {};
    docListeners.get('click')({ target: element });
    assert.equal(element.getAttribute(TILE_NODE_ID), null);
    dispose();
    assert.equal(observers[1].connected, false);
    assert.equal(docListeners.size, 0);
    assert.equal(winListeners.size, 0);
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
