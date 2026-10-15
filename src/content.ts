/**
 * @file content.ts
 * @description 트릭컬 노트 확장 프로그램의 콘텐츠 스크립트 (ISOLATED world) 메인 엔트리
 */

import { DIALOG_EXCLUSION_SELECTOR } from './ui/common/selectors.ts';
import { getUniqueApostles } from './domain/apostleProgress.ts';
import { collectChangedCards, invalidateCardCaches } from './ui/board/mutations.ts';
import { readCommentArt } from './ui/common/commentArt.ts';
import { DEFAULT_FILTER_STATE, matchesApostleFilter } from './domain/filters.ts';
import { selectApostleIds } from './domain/listSelection.ts';
import { listenForBoardData } from './bridge/contentBridge.ts';
import { listenForVirtualGridStats, type VirtualGridStats } from './bridge/virtualGridStats.ts';
import { createPageDetector } from './ui/board/pageDetector.ts';
import { BOARD_SPRITE_ASSETS } from './ui/board/assets.ts';
import { TILE_APOSTLE_ID, TILE_BOARD_LEVEL, TILE_NODE_ID } from './bridge/tileIdentity.ts';
import {
  calculateAllApostlesProgress,
  PERSONALITY_META_LIST,
  STAT_META_LIST,
} from './domain/boardProgress.ts';
import type { ProgressMap, ExtractedApiData, FilterState } from './domain/types.ts';
import { applyFilterToCards, enhanceApostleCards, setBadgesVisible } from './ui/board/boardEnhancer.ts';
import { FilterPanelController } from './ui/board/filterPanel.ts';
import { closeAllTools } from './ui/common/toolModals.ts';

(() => {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object' ||
        !('type' in message) || message.type !== 'TCBE_READ_COMMENT_ART') return;
    respond({ art: readCommentArt() });
  });
  let latestProgressMap: ProgressMap | null = null;
  let filterController: FilterPanelController | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isEnhancing = false;
  const pendingCards = new Set<HTMLElement>();
  let pendingFullRefresh = false;
  let gridSelectionKey = '';
  let gridStats: VirtualGridStats | null = null;
  const pageDetector = createPageDetector(document, window.location, () => filterController?.hasIntegratedSearch() ?? false);

  listenForVirtualGridStats(() => gridSelectionKey, stats => {
    if (gridStats && gridStats.visible === stats.visible && gridStats.total === stats.total && gridStats.key === stats.key) return;
    gridStats = stats;
    scheduleRefresh(50);
  }, window);

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
    for (const [name, url] of Object.entries(BOARD_SPRITE_ASSETS)) {
      document.documentElement.style.setProperty(name, `url("${url}")`);
    }
  }

  /**
   * 현재 필터 조건(보드 기준, 스탯 기준)에 따라 미완료 사도 수를 정확히 계산
   */
  function countIncompleteApostles(
    progressMap: ProgressMap,
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

    const uniqueApostles = getUniqueApostles(progressMap);
    const masterTotal = uniqueApostles.length;

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
      const isApostleTab = pageDetector.isApostleTabActive();

      // /board URL이 아니거나 사도별 탭이 아닌 경우 완전히 언마운트/숨김 처리 후 종료
      if (!isApostleTab) {
        closeAllTools();
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
        : { ...DEFAULT_FILTER_STATE };

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
      let { visible } = applyFilterToCards(filterState, latestProgressMap, connectedCards);
      if (connectedCards) {
        // 전체 통계에는 카드 속성만 읽고 내부 보드와 배지는 탐색하지 않는다.
        const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-tcbe-apostle-name]'))
          .filter(card => !card.closest(DIALOG_EXCLUSION_SELECTOR) &&
            latestProgressMap!.has(card.getAttribute('data-tcbe-apostle-name') || ''));
        visible = cards.filter(card => !card.classList.contains('tcbe-card-hidden')).length;
      }

      // 3. 통계 정보 및 스탯별 총 칸수/수치 요약 갱신
      if (gridStats?.key === gridSelectionKey && document.querySelector('[data-testid="virtuoso-item-list"]')) {
        visible = gridStats.visible;
      }
      if (filterController) {
        const { incompleteCount, masterTotal, statName, persName } = countIncompleteApostles(
          latestProgressMap,
          filterState
        );
        filterController.updateStats(visible, masterTotal, incompleteCount, statName, persName);
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
      closeAllTools();
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
    // 카드 부분 변경도 원본 DOM 변경이므로 페이지 판별 캐시를 보수적으로 무효화한다.
    pageDetector.invalidate();
    changes.cards.forEach(card => pendingCards.add(card));
    if (latestProgressMap) scheduleRefresh(150, changes.fullRefresh ? undefined : changes.cards);
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class', 'alt', 'placeholder', TILE_APOSTLE_ID, TILE_BOARD_LEVEL, TILE_NODE_ID],
  });

  // 탭 전환 버튼 등 클릭 시 신속하게 재판별
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target && !target.closest('#tcbe-filter-panel, #tcbe-bokr-modal-container, #tcbe-redistribution-dialog, #tcbe-recovery-dialog')) {
      pageDetector.invalidate();
      scheduleRefresh(50);
    }
  });

  const refreshPageState = () => { pageDetector.invalidate(); scheduleRefresh(50); };
  window.addEventListener('popstate', refreshPageState);
  window.addEventListener('hashchange', refreshPageState);
  window.addEventListener('pageshow', refreshPageState);
})();
