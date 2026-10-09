import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRedistributionSettings, saveRedistributionSettings, parseRedistributionSettings } from '../src/ui/redistributionSettings.ts';

test('재분배 예산과 단계 설정을 저장하고 다시 읽는다', () => {
  const data = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value),
  } });
  try {
    const settings = { owned: 123, bokr: 456, reset: 3, searchMode: 'thorough', stages: [
      { resource: 'bokr', boardThrough: 2, allowBlocked: false, allowGates: true, targets: [{ stat: 'atk_mag', target: null }] },
      { allowBlocked: true, targets: [{ stat: 'attack', target: 600 }] },
    ] };
    saveRedistributionSettings(settings);
    assert.deepEqual(loadRedistributionSettings(), settings);
    saveRedistributionSettings({ ...settings, owned: NaN });
    assert.deepEqual(loadRedistributionSettings(), settings);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('손상되거나 지원하지 않는 설정은 무시한다', () => {
  for (const raw of [null, '{', '{}', 'null', JSON.stringify({ owned: 0, bokr: 0, reset: 0, searchMode: 'fast', stages: [{ allowBlocked: false, targets: [{ stat: '<script>', target: 1 }] }] })]) {
    assert.equal(parseRedistributionSettings(raw), null);
  }
});
