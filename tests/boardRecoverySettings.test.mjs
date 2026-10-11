import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRecoveryPicks, getRecoveryStatOptions, loadRecoverySettings, normalizeRecoveryPicks, RECOVERY_SETTINGS_KEY, saveRecoverySettings } from '../src/ui/boardRecoverySettings.ts';

test('황크 공격력은 하나의 선택으로 두 공격 범주를 전달하고 보크는 분리한다', () => {
  const options = getRecoveryStatOptions('hwang');
  assert.equal(options.find(meta => meta.key === 'atk_phys').nameKo, '공격력');
  assert.equal(options.some(meta => meta.key === 'atk_mag'), false);
  assert.equal(getRecoveryStatOptions('bokr').filter(meta => ['atk_phys', 'atk_mag'].includes(meta.key)).length, 2);
  assert.deepEqual(expandRecoveryPicks(['hwang:2:atk_phys', 'bokr:1:atk_mag']), [
    { resource: 'hwang', boardIndex: 2, stat: 'atk_phys' },
    { resource: 'hwang', boardIndex: 2, stat: 'atk_mag' },
    { resource: 'bokr', boardIndex: 1, stat: 'atk_mag' },
  ]);
});

test('저장한 제거 조건과 만개 비교를 복원하며 전체 해제도 저장한다', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const entries = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) } });
  try {
    saveRecoverySettings({ picks: ['hwang:0:atk_phys', 'bokr:2:crit_res'], compareFlowering: false });
    assert.deepEqual(loadRecoverySettings(), { picks: ['hwang:0:atk_phys', 'bokr:2:crit_res'], compareFlowering: false });
    saveRecoverySettings({ picks: [], compareFlowering: true });
    assert.deepEqual(loadRecoverySettings(), { picks: [], compareFlowering: true });
    entries.set(RECOVERY_SETTINGS_KEY, '{broken');
    assert.deepEqual(loadRecoverySettings(), { picks: [], compareFlowering: true });
  } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; }
});

test('잘못된 저장 조건을 제외하고 황크 물공·마공 선택을 하나로 합친다', () => {
  assert.deepEqual(normalizeRecoveryPicks(['hwang:0:atk_mag', 'hwang:0:atk_phys', 'bokr:2:atk_mag', 'hwang:3:hp', 'other:0:hp', null, 'hwang:0:hp:extra']), ['hwang:0:atk_phys', 'bokr:2:atk_mag']);
});

test('저장소 접근이 차단되어도 기본값으로 계산 설정을 제공한다', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    assert.deepEqual(loadRecoverySettings(), { picks: [], compareFlowering: true });
    assert.doesNotThrow(() => saveRecoverySettings({ picks: ['hwang:0:hp'], compareFlowering: false }));
  } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; }
});
