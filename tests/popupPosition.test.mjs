import assert from 'node:assert/strict';
import test from 'node:test';
import { getPopupLeft } from '../src/ui/board/popupPosition.ts';

test('좁은 창에서는 왼쪽과 오른쪽 버튼 모두 팝업을 화면 안으로 옮긴다', () => {
  for (const anchorLeft of [0, 98, 260, 400]) {
    const left = anchorLeft + getPopupLeft(anchorLeft, 150, 468, 500);
    assert.equal(left, 16);
    assert.equal(left + 468, 484);
  }
});

test('넓은 창에서는 기존 버튼 정렬을 유지하고 화면 끝에서만 보정한다', () => {
  assert.equal(getPopupLeft(100, 150, 530, 1200), -6);
  assert.equal(getPopupLeft(900, 150, 530, 1200), -374);
  assert.equal(getPopupLeft(0, 150, 530, 1200), 16);
  assert.equal(1100 + getPopupLeft(1100, 100, 530, 1200), 654);
});

test('창 크기가 바뀌면 새 팝업 폭과 화면 폭으로 위치를 다시 계산한다', () => {
  assert.equal(98 + getPopupLeft(98, 150, 530, 1200), 92);
  assert.equal(98 + getPopupLeft(98, 150, 448, 480), 16);
});
