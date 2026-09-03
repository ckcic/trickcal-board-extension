import test from 'node:test';
import assert from 'node:assert';
import { compareSemver } from '../src/domain/updateChecker.ts';

test('Semver 버전 비교 테스트', async (t) => {
  await t.test('더 높은 버전 판별', () => {
    assert.strictEqual(compareSemver('1.0.4', '1.0.3'), 1);
    assert.strictEqual(compareSemver('1.0.5', '1.0.4'), 1);
    assert.strictEqual(compareSemver('v1.1.0', '1.0.4'), 1);
    assert.strictEqual(compareSemver('2.0.0', 'v1.9.9'), 1);
  });

  await t.test('동일 버전 판별', () => {
    assert.strictEqual(compareSemver('1.0.4', '1.0.4'), 0);
    assert.strictEqual(compareSemver('v1.0.4', '1.0.4'), 0);
  });

  await t.test('더 낮은 버전 판별', () => {
    assert.strictEqual(compareSemver('1.0.3', '1.0.4'), -1);
    assert.strictEqual(compareSemver('v1.0.2', '1.0.4'), -1);
  });
});
