import test from 'node:test';
import assert from 'node:assert';
import { checkForUpdate, compareSemver } from '../src/domain/updateChecker.ts';

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

test('1.0.6 설치 전후와 다음 릴리스의 업데이트 알림을 올바르게 판정한다', async (t) => {
  const storage = new Map();
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      tag_name: 'v1.0.6',
      html_url: 'https://github.com/ckcic/trickcal-board-extension/releases/tag/v1.0.6',
      name: 'v1.0.6',
    }),
  }));
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
    else delete globalThis.sessionStorage;
  });

  const beforeInstall = await checkForUpdate('1.0.5');
  assert.strictEqual(beforeInstall.hasUpdate, true);
  assert.strictEqual(beforeInstall.latestVersion, '1.0.6');

  // 같은 릴리스 캐시가 남아 있어도 설치 버전을 다시 비교한다.
  const afterInstall = await checkForUpdate('1.0.6');
  assert.strictEqual(afterInstall.hasUpdate, false);
  assert.strictEqual(afterInstall.currentVersion, '1.0.6');
  assert.strictEqual(fetch.mock.callCount(), 1);

  // 캐시 만료 후 다음 버전을 수신하면 다시 알림을 표시한다.
  const cached = JSON.parse(storage.get('tcbe_update_check_cache'));
  storage.set('tcbe_update_check_cache', JSON.stringify({ ...cached, timestamp: 0 }));
  fetch.mock.mockImplementation(async () => ({
    ok: true,
    json: async () => ({ tag_name: 'v1.0.7', name: 'v1.0.7' }),
  }));
  const nextRelease = await checkForUpdate('1.0.6');
  assert.strictEqual(nextRelease.hasUpdate, true);
  assert.strictEqual(nextRelease.latestVersion, '1.0.7');
  assert.strictEqual(fetch.mock.callCount(), 2);
});

test('1.0.7 설치 전후와 다음 릴리스의 업데이트 알림을 올바르게 판정한다', async (t) => {
  const storage = new Map();
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      tag_name: 'v1.0.7',
      html_url: 'https://github.com/ckcic/trickcal-board-extension/releases/tag/v1.0.7',
      name: 'v1.0.7',
    }),
  }));
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
    else delete globalThis.sessionStorage;
  });

  const beforeInstall = await checkForUpdate('1.0.6');
  assert.strictEqual(beforeInstall.hasUpdate, true);
  assert.strictEqual(beforeInstall.latestVersion, '1.0.7');

  // 같은 릴리스 캐시가 남아 있어도 설치 버전을 다시 비교한다.
  const afterInstall = await checkForUpdate('1.0.7');
  assert.strictEqual(afterInstall.hasUpdate, false);
  assert.strictEqual(afterInstall.currentVersion, '1.0.7');
  assert.strictEqual(fetch.mock.callCount(), 1);

  // 캐시 만료 후 다음 버전을 수신하면 다시 알림을 표시한다.
  const cached = JSON.parse(storage.get('tcbe_update_check_cache'));
  storage.set('tcbe_update_check_cache', JSON.stringify({ ...cached, timestamp: 0 }));
  fetch.mock.mockImplementation(async () => ({
    ok: true,
    json: async () => ({ tag_name: 'v1.0.8', name: 'v1.0.8' }),
  }));
  const nextRelease = await checkForUpdate('1.0.7');
  assert.strictEqual(nextRelease.hasUpdate, true);
  assert.strictEqual(nextRelease.latestVersion, '1.0.8');
  assert.strictEqual(fetch.mock.callCount(), 2);
});
