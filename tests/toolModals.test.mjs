import assert from 'node:assert/strict';
import test from 'node:test';
import { closeAllTools, closeTool, registerToolModal } from '../src/ui/common/toolModals.ts';
import { closeBoardRecovery } from '../src/ui/recovery/boardRecovery.ts';
import { closeHwangRedistribution } from '../src/ui/redistribution/hwangRedistribution.ts';

test('도구 전체 닫기는 등록된 모달을 한 번씩 닫고 계산 취소 콜백을 실행한다', () => {
  closeAllTools();
  const controller = new AbortController();
  const closed = [];
  registerToolModal('redistribution', () => { controller.abort(); closed.push('재분배'); });
  registerToolModal('recovery', () => closed.push('회수'));
  closeAllTools();
  closeAllTools();
  assert.deepEqual(closed, ['재분배', '회수']);
  assert.equal(controller.signal.aborted, true);
});

test('사용자가 이미 닫은 도구는 등록 해제 후 전체 닫기에서 다시 닫지 않는다', () => {
  let calls = 0;
  const unregister = registerToolModal('recovery', () => calls++);
  unregister();
  unregister();
  closeAllTools();
  assert.equal(calls, 0);
});

test('같은 도구를 다시 등록하면 기존 인스턴스를 닫고 오래된 해제는 새 인스턴스를 보존한다', () => {
  const closed = [];
  const unregisterOld = registerToolModal('redistribution', () => closed.push('이전'));
  registerToolModal('redistribution', () => closed.push('새로 열림'));
  unregisterOld();
  assert.deepEqual(closed, ['이전']);
  closeTool('redistribution');
  assert.deepEqual(closed, ['이전', '새로 열림']);
});

test('닫기 콜백의 재진입은 중복 실행하지 않고 그 안에서 새로 열린 도구를 보존한다', () => {
  const closed = [];
  registerToolModal('redistribution', () => {
    closed.push('이전');
    closeTool('redistribution');
    closeAllTools();
    registerToolModal('redistribution', () => closed.push('새로 열림'));
  });
  closeAllTools();
  assert.deepEqual(closed, ['이전']);
  closeAllTools();
  assert.deepEqual(closed, ['이전', '새로 열림']);
});

test('기능별 닫기 함수는 공통 레지스트리에서 해당 도구만 닫는다', () => {
  const closed = [];
  registerToolModal('redistribution', () => closed.push('재분배'));
  registerToolModal('recovery', () => closed.push('회수'));
  closeBoardRecovery();
  assert.deepEqual(closed, ['회수']);
  closeHwangRedistribution();
  assert.deepEqual(closed, ['회수', '재분배']);
  closeAllTools();
});
