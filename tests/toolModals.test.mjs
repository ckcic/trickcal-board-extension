import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
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

test('클립보드 유틸은 복사 성공 시 완료 메시지를 일정 시간 후 지우고 실패 시 권한 필요 안내를 표시한다', async () => {
  const clipBundle = await build({ entryPoints: ['src/ui/common/clipboard.ts'], bundle: true, write: false, format: 'iife', globalName: 'clipMod' });
  let pendingTimer = null;
  let shouldFail = false;
  let copied = '';
  const context = vm.createContext({
    navigator: {
      clipboard: {
        writeText: async text => {
          if (shouldFail) throw new Error('denied');
          copied = text;
        },
      },
    },
    setTimeout: fn => { pendingTimer = fn; return 1; },
  });
  vm.runInContext(clipBundle.outputFiles[0].text, context);

  const statusEl = { textContent: '' };
  const ok = await context.clipMod.copyTextWithFeedback('작업 순서 본문', statusEl, '✓ 복사됨', 1000);
  assert.equal(ok, true);
  assert.equal(copied, '작업 순서 본문');
  assert.equal(statusEl.textContent, '✓ 복사됨');
  pendingTimer?.();
  assert.equal(statusEl.textContent, '');

  shouldFail = true;
  const fail = await context.clipMod.copyTextWithFeedback('실패 텍스트', statusEl);
  assert.equal(fail, false);
  assert.equal(statusEl.textContent, '복사 실패 (권한 필요)');
});

test('공통 모달은 키보드 탭 이동, 서브모달 Escape 보호, 아바타 로드 에러 숨김, 백드롭 닫기 및 포커스 복원을 처리한다', async () => {
  const modalBundle = await build({
    entryPoints: ['src/ui/common/commonModal.ts'], bundle: true, write: false, format: 'iife', globalName: 'modalMod',
    plugins: [{ name: 'scrollLock-stub', setup(b) { b.onLoad({ filter: /scrollLock\.ts$/ }, () => ({ contents: 'export function lockPageScroll() { return () => {}; }' })); } }],
  });

  class FakeHTMLElement {}
  class FakeHTMLImageElement extends FakeHTMLElement {}
  class FakeHTMLDialogElement extends FakeHTMLElement {}

  const makeNode = (tag = 'div') => {
    const attrs = new Map();
    const listeners = new Map();
    const classes = new Set();
    const proto = tag === 'dialog' ? FakeHTMLDialogElement.prototype : tag === 'img' ? FakeHTMLImageElement.prototype : FakeHTMLElement.prototype;
    const node = Object.create(proto);
    Object.assign(node, {
      id: '', tagName: tag.toUpperCase(), innerHTML: '', textContent: '', hidden: false, open: false, tabIndex: 0,
      dataset: {}, style: { display: '' }, isConnected: true, children: [],
      classList: { contains: c => classes.has(c), add: c => classes.add(c) },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: k => attrs.get(k) ?? null,
      appendChild(c) { this.children.push(c); return c; },
      addEventListener: (type, fn) => listeners.set(type, fn),
      trigger: (type, ev = {}) => listeners.get(type)?.({ preventDefault() {}, ...ev }),
      showModal() { this.open = true; },
      close() { this.open = false; },
      remove() { this.isConnected = false; },
      focus() { focused = this; },
      getBoundingClientRect: () => ({ left: 100, right: 500, top: 100, bottom: 400 }),
    });
    return node;
  };

  const tab1 = Object.assign(makeNode('button'), { dataset: { tab: 't1' } });
  tab1.setAttribute('aria-selected', 'true');
  const tab2 = Object.assign(makeNode('button'), { dataset: { tab: 't2' } });
  tab2.setAttribute('aria-selected', 'false');
  const panel1 = Object.assign(makeNode('section'), { id: 'm-panel-t1', hidden: false });
  const panel2 = Object.assign(makeNode('section'), { id: 'm-panel-t2', hidden: true });
  const tablist = makeNode('nav');
  tablist.querySelectorAll = () => [tab1, tab2];
  const closeBtn = makeNode('button');
  let hasSubModal = false;
  let focused = null;
  const prevButton = makeNode('button');
  let dialogNode = null;

  const context = vm.createContext({
    HTMLElement: FakeHTMLElement,
    HTMLImageElement: FakeHTMLImageElement,
    HTMLDialogElement: FakeHTMLDialogElement,
    document: {
      activeElement: prevButton,
      body: { appendChild: d => { dialogNode = d; } },
      getElementById: () => null,
      createElement: tag => {
        const d = makeNode(tag);
        d.querySelectorAll = sel => sel === '[role="tab"]' ? [tab1, tab2] : [];
        d.querySelector = sel => {
          if (sel === '[role="tablist"]') return tablist;
          if (sel === '[data-close]') return closeBtn;
          if (sel === '#m-panel-t1') return panel1;
          if (sel === '#m-panel-t2') return panel2;
          if (sel === '.tcbe-rd-modal-overlay') return hasSubModal ? {} : null;
          return null;
        };
        return d;
      },
    },
  });
  vm.runInContext(modalBundle.outputFiles[0].text, context);

  const switched = [];
  let closedCount = 0;
  const modal = context.modalMod.createCommonModal({
    id: 'm', title: '테스트 모달',
    tabs: [{ id: 't1', label: '탭1' }, { id: 't2', label: '탭2' }],
    onTabChange: id => switched.push(id),
    onClose: () => closedCount++,
    bodyHtml: '<div></div>',
  });

  // 1. 키보드 ArrowRight -> 탭2 전환, Home -> 탭1 전환, End -> 탭2 전환
  tablist.trigger('keydown', { key: 'ArrowRight' });
  assert.equal(tab2.getAttribute('aria-selected'), 'true');
  assert.equal(panel1.hidden, true);
  assert.equal(panel2.hidden, false);
  tablist.trigger('keydown', { key: 'Home' });
  assert.equal(tab1.getAttribute('aria-selected'), 'true');
  tablist.trigger('keydown', { key: 'End' });
  assert.equal(tab2.getAttribute('aria-selected'), 'true');
  assert.deepEqual(switched, ['t2', 't1', 't2']);

  // 2. 아바타 이미지 에러 캡처 위임 시 display = 'none' 처리
  const brokenAvatar = makeNode('img');
  brokenAvatar.classList.add('tcbe-rd-avatar');
  dialogNode.trigger('error', { target: brokenAvatar });
  assert.equal(brokenAvatar.style.display, 'none');

  // 3. 서브모달이 열려 있을 때 Escape(cancel) 이벤트는 부모 모달을 닫지 않음
  hasSubModal = true;
  dialogNode.trigger('cancel');
  assert.equal(closedCount, 0);
  assert.equal(dialogNode.open, true);

  // 4. 다이얼로그 내부 클릭은 유지하고 바깥(백드롭) 좌표 클릭 시 닫히며 이전 포커스 복원
  dialogNode.trigger('click', { target: dialogNode, clientX: 250, clientY: 250 });
  assert.equal(closedCount, 0);
  dialogNode.trigger('click', { target: dialogNode, clientX: 20, clientY: 20 });
  assert.equal(closedCount, 1);
  assert.equal(dialogNode.open, false);
  assert.equal(focused, prevButton);
  modal.close();
  assert.equal(closedCount, 1);
});
