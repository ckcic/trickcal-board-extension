import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/ui/scrollLock.ts'], bundle: true, write: false, format: 'iife', globalName: 'scrollLock' });

function setup({ width = 1200, clientWidth = 1185, gutter = '', gutterPriority = '', computedGutter = 'auto', overflow = '', overflowPriority = '', margin = '', marginPriority = '', computedMargin = '0px' } = {}) {
  const changes = [];
  const style = (initial, label) => {
    const values = new Map(Object.entries(initial));
    return {
      getPropertyValue: key => values.get(key)?.[0] || '',
      getPropertyPriority: key => values.get(key)?.[1] || '',
      setProperty(key, value, priority) { values.set(key, [value, priority]); changes.push(`${label}:${key}=${value}`); },
      removeProperty(key) { values.delete(key); changes.push(`${label}:${key}=`); },
    };
  };
  const root = { clientWidth, style: style({ 'scrollbar-gutter': [gutter, gutterPriority] }, 'root') };
  const body = { style: style({ overflow: [overflow, overflowPriority], 'margin-right': [margin, marginPriority] }, 'body') };
  const context = vm.createContext({ document: { documentElement: root, body }, window: { innerWidth: width }, getComputedStyle: el => el === root ? { scrollbarGutter: computedGutter } : { marginRight: computedMargin } });
  vm.runInContext(bundled.outputFiles[0].text, context);
  return { root, body, changes, lock: context.scrollLock.lockPageScroll };
}

test('원본처럼 기존 body 여백에 스크롤바 폭을 더하고 해제 시 인라인 스타일과 우선순위를 복원한다', () => {
  const { root, body, changes, lock } = setup({ overflow: 'scroll', overflowPriority: 'important', margin: '8px', marginPriority: 'important', computedMargin: '8px' });
  const release = lock();
  assert.deepEqual(changes, ['body:margin-right=23px', 'body:overflow=hidden']);
  assert.equal(root.style.getPropertyValue('scrollbar-gutter'), '');
  assert.equal(body.style.getPropertyValue('overflow'), 'hidden');
  release();
  assert.equal(body.style.getPropertyValue('margin-right'), '8px');
  assert.equal(body.style.getPropertyPriority('margin-right'), 'important');
  assert.equal(body.style.getPropertyValue('overflow'), 'scroll');
  assert.equal(body.style.getPropertyPriority('overflow'), 'important');
  assert.deepEqual(changes.slice(-2), ['body:overflow=scroll', 'body:margin-right=8px']);
  release();
  assert.equal(changes.length, 4);
});

test('짧은 페이지와 오버레이 스크롤바에서는 새 스크롤바 여백을 만들지 않는다', () => {
  const { root, body, changes, lock } = setup({ clientWidth: 1200 });
  const release = lock();
  assert.equal(root.style.getPropertyValue('scrollbar-gutter'), '');
  release();
  assert.equal(body.style.getPropertyValue('overflow'), '');
  assert.deepEqual(changes, ['body:overflow=hidden', 'body:overflow=']);
});

test('기존 stable both-edges 설정을 유지하고 반복 개폐 후 임시 스타일을 남기지 않는다', () => {
  const existing = setup({ gutter: 'stable both-edges', computedGutter: 'stable both-edges' });
  existing.lock()();
  assert.equal(existing.root.style.getPropertyValue('scrollbar-gutter'), 'stable both-edges');
  assert.ok(existing.changes.every(change => change.startsWith('body:')));
  const plain = setup();
  plain.lock()();
  plain.lock()();
  assert.equal(plain.root.style.getPropertyValue('scrollbar-gutter'), '');
  assert.equal(plain.body.style.getPropertyValue('overflow'), '');
  assert.equal(plain.body.style.getPropertyValue('margin-right'), '');
});
