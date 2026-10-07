import { collectChangedCards, invalidateCardCaches } from './ui/mutations.ts';
import { readCommentArt } from './ui/commentArt.ts';
import { matchesApostleFilter } from './domain/filters.ts';
import { selectApostleIds } from './domain/listSelection.ts';
/**
 * @file content.ts
 * @description 트릭컬 노트 확장 프로그램의 콘텐츠 스크립트 (ISOLATED world) 메인 엔트리
 */

import { listenForBoardData } from './bridge/contentBridge.ts';
import { TILE_APOSTLE_ID, TILE_BOARD_LEVEL, TILE_NODE_ID } from './bridge/tileIdentity.ts';
import {
  calculateAllApostlesProgress,
  PERSONALITY_META_LIST,
  STAT_META_LIST,
} from './domain/boardProgress.ts';
import type { ApostleProgress, ExtractedApiData, FilterState } from './domain/types.ts';
import { applyFilterToCards, enhanceApostleCards, setBadgesVisible } from './ui/boardEnhancer.ts';
import { FilterPanelController } from './ui/filterPanel.ts';

(() => {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object' ||
        !('type' in message) || message.type !== 'TCBE_READ_COMMENT_ART') return;
    respond({ art: readCommentArt() });
  });
  let latestProgressMap: Map<string, ApostleProgress> | null = null;
  let filterController: FilterPanelController | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isEnhancing = false;
  const pendingCards = new Set<HTMLElement>();
  let pendingFullRefresh = false;
  let gridSelectionKey = '';
  let gridStats: { visible: number; total: number; key: string } | null = null;

  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (event.source !== window || event.origin !== window.location.origin ||
        data?.type !== 'TCBE_GRID_STATS' || data.source !== 'tcbe-main-interceptor' ||
        data.key !== gridSelectionKey || !Number.isSafeInteger(data.visible) || !Number.isSafeInteger(data.total) ||
        data.visible < 0 || data.total < data.visible) return;
    if (gridStats && gridStats.visible === data.visible && gridStats.total === data.total && gridStats.key === data.key) return;
    gridStats = { visible: data.visible, total: data.total, key: data.key };
    scheduleRefresh(50);
  });

  function updateVirtualGrid(active: boolean, filter?: FilterState) {
    const ids = active && latestProgressMap && filter ? selectApostleIds(latestProgressMap, filter) : [];
    const key = JSON.stringify([active, filter, ids]);
    if (key === gridSelectionKey) return;
    gridSelectionKey = key;
    gridStats = null;
    window.postMessage({ type: 'TCBE_GRID_FILTER', source: 'tcbe-content-bridge', active, ids, key }, window.location.origin);
  }

  /** 화면에서 사용하는 원본 및 CDN WebP 주소만 주입한다. */
  function injectSpriteStyles() {
    const assets: Record<string, string> = {
      '--tcbe-stat-sprite': 'https://note.trickcal.com/UI/Stat.webp',
      '--tcbe-personality-sprite': 'https://note.trickcal.com/UI/Common_UnitPersonality.webp',
      '--tcbe-gate-icon': 'https://note.trickcal.com/UI/Gate.webp',
      '--tcbe-pastel-basic': 'https://cdn.note.trickcal.com/Materials/aSidEcauOucIZOMZV_ilvVhKEpMIog9hK.webp',
      '--tcbe-pastel-average': 'https://cdn.note.trickcal.com/Materials/aXi__OXRlprdJ2aKDSV7RDndcgNnTjV4o.webp',
      '--tcbe-pastel-epic': 'https://cdn.note.trickcal.com/Materials/a1QwfDWjjHCxQv7K-KJLBtxDFxWM1CERq.webp',
      '--tcbe-pastel-ultra': 'https://cdn.note.trickcal.com/Materials/aekAKPsosli3qEanhqzUxly-2E_PXu1kV.webp',
      '--tcbe-gold-icon': 'https://cdn.note.trickcal.com/Materials/aJ3ElQvrIrOM6vPr2fJb_v79A_RC2YX6_.webp',
    };
    for (const [name, url] of Object.entries(assets)) {
      document.documentElement.style.setProperty(name, `url("${url}")`);
    }
  }

  /**
   * 현재 URL이 '/board'인지 확인
   */
  function isBoardPage(): boolean {
    const pathname = window.location.pathname;
    return pathname === '/board' || pathname.startsWith('/board/');
  }

  /**
   * 현재 화면이 '사도별' 탭인지 판별
   * (스탯별 화면이나 다른 URL인 경우 false 반환)
   */
  function isApostleTabActive(): boolean {
    // 1. URL이 /board 이외인 경우 즉시 비활성화
    if (!isBoardPage()) {
      return false;
    }

    // 2. 확장 프로그램 DOM을 제외한 사이트 본래의 전환 버튼 탐색 (불필요한 span 전체 탐색 제거)
    const navButtons = Array.from(document.querySelectorAll<HTMLElement>('button, a, div[role="button"]'))
      .filter((el) => !el.closest('#tcbe-filter-panel') && !el.closest('.tcbe-badge-container') && !el.closest('.tcbe-badge-row'));

    // '사도별' 전환 버튼이 존재하는 경우 (= 현재 스탯별 화면에 위치함)
    const hasSwitchToApostleBtn = navButtons.some((el) => {
      const txt = el.textContent?.trim();
      return txt === '사도별';
    });
    if (hasSwitchToApostleBtn) {
      return false;
    }

    // 3. 스탯별 화면 특유의 전체 스탯 헤더 존재 확인
    const hasStatHeaders = navButtons.some((el) => {
      const txt = el.textContent?.trim() || '';
      return (
        txt.startsWith('전체 HP') ||
        txt.startsWith('전체 물리') ||
        txt.startsWith('전체 마법') ||
        txt.startsWith('전체 치명') ||
        txt.startsWith('전체 치피') ||
        txt.startsWith('전체 치저')
      );
    });
    if (hasStatHeaders) {
      return false;
    }

    // 4. 사도명 검색창 존재 확인 (통합된 상태인 경우도 허용)
    const searchInput = document.querySelector('input[placeholder*="사도"]');
    const isSearchIntegrated = filterController ? filterController.hasIntegratedSearch() : false;

    if (!searchInput && !isSearchIntegrated) {
      return false;
    }

    return true;
  }

  /**
   * 현재 필터 조건(보드 기준, 스탯 기준)에 따라 미완료 사도 수를 정확히 계산
   */
  function countIncompleteApostles(
    progressMap: Map<string, ApostleProgress>,
    filter: FilterState
  ): { incompleteCount: number; masterTotal: number; statName?: string; persName?: string } {
    let incompleteCount = 0;
    const statName =
      filter.statCategory !== 'all'
        ? STAT_META_LIST.find((m) => m.key === filter.statCategory)?.nameKo
        : undefined;

    const persName =
      filter.personality !== 'all'
        ? PERSONALITY_META_LIST.find((p) => p.id === filter.personality)?.nameKo
        : undefined;

    const uniqueApostles = new Set<ApostleProgress>();
    progressMap.forEach((prog) => uniqueApostles.add(prog));
    const masterTotal = uniqueApostles.size;

    uniqueApostles.forEach((prog) => {
      if (matchesApostleFilter(prog, { ...filter, status: 'incomplete' })) incompleteCount++;
    });

    return { incompleteCount, masterTotal, statName, persName };
  }

  /**
   * 현재 보드 진행도와 필터 상태를 바탕으로 UI 갱신
   */
  function refreshUI(targetCards?: HTMLElement[]) {
    const dirtyCards = [...pendingCards];
    pendingCards.clear();
    pendingFullRefresh = false;
    invalidateCardCaches(dirtyCards);
    // 직접 갱신이 예약된 갱신까지 처리하므로 중복 실행을 취소한다.
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (!latestProgressMap || latestProgressMap.size === 0) {
      return;
    }

    if (isEnhancing) return;
    isEnhancing = true;

    try {
      const isBoard = isBoardPage();
      const isApostleTab = isBoard && isApostleTabActive();

      // /board URL이 아니거나 사도별 탭이 아닌 경우 완전히 언마운트/숨김 처리 후 종료
      if (!isApostleTab) {
        document.documentElement.removeAttribute('data-tcbe-board-level');
        updateVirtualGrid(false);
        if (filterController) {
          filterController.unmount();
        }
        setBadgesVisible(false);
        return;
      }

      // 사도별 탭인 경우 마운트 및 표시 활성화
      if (filterController) {
        filterController.mount();
        filterController.setVisible(true);
      }
      setBadgesVisible(true);

      const filterState = filterController
        ? filterController.getState()
        : {
            status: 'all' as const,
            boardLevel: 'all' as const,
            statCategory: 'all' as const,
            personality: 'all' as const,
            grade: 'all' as const,
            unlockedTier: 'all' as const,
            sortBy: 'name_asc' as const,
          };

      // 1. 사도 카드에 뱃지 삽입 및 업데이트
      document.documentElement.setAttribute('data-tcbe-board-level', filterState.boardLevel);
      updateVirtualGrid(true, filterState);
      const connectedCards = targetCards?.filter(card => card.isConnected);
      const enhanced = enhanceApostleCards(latestProgressMap, filterState, connectedCards);
      // 카드 식별이 실패하면 원본 구조 변경일 수 있으므로 전체 탐색으로 복구한다.
      if (connectedCards && enhanced !== connectedCards.length) {
        scheduleRefresh(0);
        return;
      }

      // 2. 필터 및 정렬 적용
      let { total, visible } = applyFilterToCards(filterState, latestProgressMap, connectedCards);
      if (connectedCards) {
        // 전체 통계에는 카드 속성만 읽고 내부 보드와 배지는 탐색하지 않는다.
        const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-tcbe-apostle-name]'))
          .filter(card => !card.closest('[role="dialog"], [data-slot="dialog-content"], [data-slot="dialog-overlay"]') &&
            latestProgressMap!.has(card.getAttribute('data-tcbe-apostle-name') || ''));
        total = cards.length;
        visible = cards.filter(card => !card.classList.contains('tcbe-card-hidden')).length;
      }

      // 3. 통계 정보 및 스탯별 총 칸수/수치 요약 갱신
      if (gridStats?.key === gridSelectionKey && document.querySelector('[data-testid="virtuoso-item-list"]')) {
        ({ total, visible } = gridStats);
      }
      if (filterController) {
        const { incompleteCount, masterTotal, statName, persName } = countIncompleteApostles(
          latestProgressMap,
          filterState
        );
        filterController.updateStats(visible, total, masterTotal, incompleteCount, statName, persName);
        filterController.updateStatSummaryGrid(latestProgressMap, filterState);
      }
    } finally {
      isEnhancing = false;
    }
  }

  function scheduleRefresh(delay = 150, cards?: Set<HTMLElement>) {
    if (cards) cards.forEach(card => pendingCards.add(card));
    else pendingFullRefresh = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      refreshUI(pendingFullRefresh ? undefined : [...pendingCards]);
    }, delay);
  }

  function handleFilterChange() {
    refreshUI();
  }

  injectSpriteStyles();

  filterController = new FilterPanelController(handleFilterChange);

  listenForBoardData((data: ExtractedApiData) => {
    try {
      latestProgressMap = calculateAllApostlesProgress(data);
      // 새로운 데이터를 수신했으므로 스탯 집계 캐시 초기화
      filterController?.clearCache();
      scheduleRefresh(50);
    } catch (err) {
      console.error('[TCBE] Error calculating board progress:', err);
    }
  });

  const observer = new MutationObserver((mutations) => {
    const changes = collectChangedCards(mutations);
    if (!changes.changed) return;
    changes.cards.forEach(card => pendingCards.add(card));
    if (latestProgressMap) scheduleRefresh(150, changes.fullRefresh ? undefined : changes.cards);
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class', 'alt', TILE_APOSTLE_ID, TILE_BOARD_LEVEL, TILE_NODE_ID],
  });

  // 탭 전환 버튼 등 클릭 시 신속하게 재판별
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target && !target.closest('#tcbe-filter-panel, #tcbe-bokr-modal-container')) {
      scheduleRefresh(50);
    }
  });

  window.addEventListener('popstate', () => scheduleRefresh(50));
  window.addEventListener('hashchange', () => scheduleRefresh(50));
})();
