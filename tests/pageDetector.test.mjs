import assert from 'node:assert/strict';
import test from 'node:test';
import { createPageDetector } from '../src/ui/board/pageDetector.ts';

function setup() {
  const state = { pathname: '/board', search: true, integrated: false, buttons: [], scans: 0 };
  const doc = {
    querySelector: () => state.search ? {} : null,
    querySelectorAll: () => { state.scans++; return state.buttons; },
  };
  const button = (text, owned = false) => ({ textContent: text, closest: () => owned ? {} : null });
  const detector = createPageDetector(doc, state, () => state.integrated);
  return { state, button, detector };
}

test('페이지 판별은 보드 URL에만 적용하며 이름·검색 필터 갱신 시 탐색 결과를 재사용한다', () => {
  const { state, detector } = setup();
  state.pathname = '/other';
  assert.equal(detector.isApostleTabActive(), false);
  assert.equal(state.scans, 0);
  state.pathname = '/board';
  assert.equal(detector.isApostleTabActive(), true);
  assert.equal(detector.isApostleTabActive(), true);
  assert.equal(state.scans, 1);
  state.pathname = '/board/child';
  assert.equal(detector.isApostleTabActive(), true);
  assert.equal(state.scans, 2);
  state.pathname = '/boards';
  assert.equal(detector.isApostleTabActive(), false);
  state.pathname = '/board';
  assert.equal(detector.isApostleTabActive(), true);
  assert.equal(state.scans, 3);
});

for (const text of ['사도별', '전체 HP', '전체 물리 공격력', '전체 마법 공격력', '전체 치명', '전체 치피', '전체 치저']) {
  test(`페이지 판별은 원본 스탯 화면의 '${text}'를 인식한다`, () => {
    const { state, button, detector } = setup();
    state.buttons = [button(` ${text} `)];
    assert.equal(detector.isApostleTabActive(), false);
    state.buttons = [button(text, true)];
    detector.invalidate();
    assert.equal(detector.isApostleTabActive(), true);
  });
}

test('원본 화면 변경 후 캐시 무효화로 같은 URL의 사도·스탯 전환을 다시 판별한다', () => {
  const { state, button, detector } = setup();
  assert.equal(detector.isApostleTabActive(), true);
  state.buttons = [button('사도별')];
  detector.invalidate();
  assert.equal(detector.isApostleTabActive(), false);
  state.buttons = [];
  detector.invalidate();
  assert.equal(detector.isApostleTabActive(), true);
  assert.equal(state.scans, 3);
});

test('검색창의 이동·제거·통합 상태는 버튼 캐시를 유지해도 즉시 반영한다', () => {
  const { state, detector } = setup();
  assert.equal(detector.isApostleTabActive(), true);
  state.search = false;
  assert.equal(detector.isApostleTabActive(), false);
  state.integrated = true;
  assert.equal(detector.isApostleTabActive(), true);
  state.integrated = false;
  assert.equal(detector.isApostleTabActive(), false);
  state.search = true;
  assert.equal(detector.isApostleTabActive(), true);
  assert.equal(state.scans, 1);
});
