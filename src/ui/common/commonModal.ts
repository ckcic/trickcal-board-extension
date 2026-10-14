/**
 * 공통 모달 다이얼로그 생성 및 라이프사이클 관리
 * WAI-ARIA 탭, 스크롤 잠금, 백드롭(바깥 영역) 클릭 닫기를 일관되게 관리합니다.
 */
import { lockPageScroll } from './scrollLock.ts';
import { escapeHtml } from './html.ts';

export interface ModalTabConfig {
  id: string;
  label: string;
  badge?: string;
  badgeHidden?: boolean;
  panelId?: string;
}

export interface CommonModalOptions {
  id: string;
  titleId?: string;
  title: string;
  badgeText?: string;
  tabs?: ModalTabConfig[];
  initialTabId?: string;
  onTabChange?: (tabId: string) => void;
  onClose?: () => void;
  headerExtrasHtml?: string;
  bodyHtml: string;
}

export interface CommonModalInstance {
  dialog: HTMLDialogElement;
  switchTab: (tabId: string) => void;
  close: () => void;
}

/**
 * 공통 모달 다이얼로그를 생성하여 화면에 표시합니다.
 */
export function createCommonModal(options: CommonModalOptions): CommonModalInstance {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.createElement('dialog');
  dialog.id = options.id;
  const titleId = options.titleId || `${options.id}-title`;
  dialog.setAttribute('aria-labelledby', titleId);

  const badgeHtml = options.badgeText ? ` <small>${escapeHtml(options.badgeText)}</small>` : '';
  const headerExtras = options.headerExtrasHtml || '';

  const tabsHtml = options.tabs && options.tabs.length > 0 ? `
    <nav class="tcbe-rd-main-tabs" role="tablist" aria-label="${escapeHtml(options.title)} 메뉴">
      ${options.tabs.map((tab, idx) => {
        const isSelected = options.initialTabId ? tab.id === options.initialTabId : idx === 0;
        const panelId = tab.panelId || `${options.id}-panel-${tab.id}`;
        const badge = tab.badge ? ` <span class="tcbe-rd-tab-badge" data-tab-badge="${tab.id}" ${tab.badgeHidden ? 'hidden' : ''}>${escapeHtml(tab.badge)}</span>` : '';
        return `<button type="button" role="tab" id="${options.id}-tab-${tab.id}" data-tab="${tab.id}" aria-controls="${panelId}" aria-selected="${isSelected}" tabindex="${isSelected ? 0 : -1}">${tab.label}${badge}</button>`;
      }).join('')}
    </nav>` : '';

  dialog.innerHTML = `
    <header>
      <h2 id="${titleId}">${options.title}${badgeHtml}</h2>
      ${headerExtras}
      <button type="button" data-close aria-label="${escapeHtml(options.title)} 닫기">닫기</button>
    </header>
    ${tabsHtml}
    ${options.bodyHtml}
  `;

  document.body.appendChild(dialog);
  const unlockScroll = lockPageScroll();

  let isClosed = false;
  const close = () => {
    if (isClosed) return;
    isClosed = true;
    options.onClose?.();
    dialog.close();
    dialog.remove();
    unlockScroll();
    if (previousFocus?.isConnected) {
      previousFocus.focus();
    }
  };

  // 탭 전환 처리
  const switchTab = (tabId: string) => {
    if (!options.tabs || options.tabs.length === 0) return;
    const tabButtons = dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabButtons.forEach(btn => {
      const active = btn.dataset.tab === tabId;
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
    });

    options.tabs.forEach(tab => {
      const panelId = tab.panelId || `${options.id}-panel-${tab.id}`;
      const panel = dialog.querySelector<HTMLElement>(`#${panelId}`);
      if (panel) {
        panel.hidden = tab.id !== tabId;
      }
    });

    options.onTabChange?.(tabId);
  };

  // 키보드 네비게이션 (방향키 및 Home/End 키로 탭 전환)
  const tablist = dialog.querySelector<HTMLElement>('[role="tablist"]');
  if (tablist) {
    tablist.addEventListener('keydown', event => {
      const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      const currentIndex = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      const nextTab = tabs[nextIndex];
      if (nextTab && nextTab.dataset.tab) {
        switchTab(nextTab.dataset.tab);
        nextTab.focus();
      }
    });

    tablist.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
      if (button && button.dataset.tab) {
        switchTab(button.dataset.tab);
      }
    });
  }

  // 닫기 버튼 이벤트 등록
  dialog.querySelector('[data-close]')?.addEventListener('click', close);

  // Escape 키로 닫기 이벤트 등록
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });

  // 백드롭(바깥 영역) 터치/클릭 시 닫기
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      const isOutside = (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      );
      if (isOutside) {
        close();
      }
    }
  });

  dialog.showModal();

  return {
    dialog,
    switchTab,
    close,
  };
}
