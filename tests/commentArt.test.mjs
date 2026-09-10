import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { selectCommentArt } from '../src/ui/commentArt.ts';

test('짧은 주석은 제외하고 문자 아트의 공백과 줄바꿈은 보존한다', () => {
  const art = Array(10).fill('   ..::xxOOxx::..      ..::xxOOxx::..').join('\n');
  assert.equal(selectCommentArt(['일반 주석', art]), art);
  assert.equal(selectCommentArt(['일반 주석']), null);
  assert.equal(selectCommentArt(['x'.repeat(100_001)]), null);
});

test('팝업은 매번 새 아트를 받아 HTML 실행 없이 표시하고 연결 실패를 안내한다', async () => {
  const bundle = await build({ entryPoints: ['src/popup.ts'], bundle: true, write: false, format: 'iife' });
  const status = { textContent: '' };
  const title = { textContent: '' };
  const art = { textContent: '', hidden: true, style: {} };
  let reply = '<img src=x onerror=alert(1)>\n문자 아트';
  let fail = false;
  const context = vm.createContext({
    document: { getElementById: id => id === 'status' ? status : id === 'title' ? title : art },
    chrome: { tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async () => { if (fail) throw new Error('연결 실패'); return { art: reply }; },
    } },
  });
  const open = async () => {
    vm.runInContext(bundle.outputFiles[0].text, context);
    await new Promise(resolve => setImmediate(resolve));
  };
  await open();
  assert.equal(art.textContent, reply);
  assert.equal(art.hidden, false);
  assert.equal(title.textContent, '찾았다!');
  reply = '업데이트된 그림';
  await open();
  assert.equal(art.textContent, reply);
  fail = true;
  await open();
  assert.match(status.textContent, /새로고침/);
  assert.equal(title.textContent, '숨은 그림');
});
