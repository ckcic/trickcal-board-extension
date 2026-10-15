import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/ui/board/updateBadge.ts'], bundle: true, write: false,
  format: 'iife', globalName: 'badge', plugins: [{ name: '가명-업데이트-조회', setup(builder) {
    builder.onLoad({ filter: /domain[\\/]updateChecker\.ts$/ }, () => ({ contents:
      'export async function checkForUpdate(version) { return globalThis.checkUpdate(version); }' }));
  } }] });

function setup(info, version = '1.0.9') {
  const calls = [], links = [];
  const slot = { replaceChildren: link => { links.splice(0, links.length, link); } };
  const header = { querySelector: () => slot };
  const context = vm.createContext({ chrome: { runtime: { getManifest: () => ({ version }) } },
    checkUpdate: async current => { calls.push(current); if (info instanceof Error) throw info; return info; },
    document: { getElementById: () => null, createElement: tag => {
      assert.equal(tag, 'a');
      return { addEventListener(type, handler) { this[type] = handler; } };
    } } });
  vm.runInContext(bundle.outputFiles[0].text, context);
  return { run: () => context.badge.showUpdateBadge(header), calls, links, context };
}

test('업데이트 배지는 설치 버전으로 조회하고 안전한 다운로드 링크와 클릭 전파 차단을 유지한다', async () => {
  const state = setup({ hasUpdate: true, latestVersion: '1.1.0' });
  await state.run();
  assert.deepEqual(state.calls, ['1.0.9']);
  assert.equal(state.links.length, 1);
  const link = state.links[0];
  assert.equal(link.href, 'https://github.com/ckcic/trickcal-board-extension/releases/latest');
  assert.equal(link.textContent, '🚀 v1.1.0 업데이트');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(link.className, 'tcbe-update-badge');
  let stopped = false;
  link.click({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
});

test('새 버전이 없거나 조회가 실패하면 배지를 만들지 않고 오류를 전파하지 않는다', async () => {
  for (const info of [null, { hasUpdate: false }, new Error('가명 조회 실패')]) {
    const state = setup(info);
    await state.run();
    assert.equal(state.links.length, 0);
  }
});

test('설치 버전이나 확장 API가 없으면 버전을 추측하거나 조회하지 않는다', async () => {
  for (const withoutChrome of [false, true]) {
    const state = setup({ hasUpdate: true }, '');
    if (withoutChrome) delete state.context.chrome;
    await state.run();
    assert.deepEqual(state.calls, []);
    assert.deepEqual(state.links, []);
  }
});
