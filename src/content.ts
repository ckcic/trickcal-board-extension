/**
 * @file content.ts
 * @description 트릭컬 노트 확장 프로그램의 콘텐츠 스크립트 (ISOLATED world) 메인 엔트리
 */

import { listenForBoardData } from './bridge/contentBridge.ts';
import {
  calculateAllApostlesProgress,
  PERSONALITY_META_LIST,
  STAT_META_LIST,
} from './domain/boardProgress.ts';
import type { ApostleProgress, ExtractedApiData, FilterState } from './domain/types.ts';
import { applyFilterToCards, enhanceApostleCards, setBadgesVisible } from './ui/boardEnhancer.ts';
import { FilterPanelController } from './ui/filterPanel.ts';

(() => {
  let latestProgressMap: Map<string, ApostleProgress> | null = null;
  let filterController: FilterPanelController | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isEnhancing = false;

  /**
   * 확장 프로그램의 스프라이트 이미지 URL을 CSS 커스텀 속성에 주입
   */
  function injectSpriteStyles() {
    try {
      const statUrl = chrome.runtime.getURL('webp/Stat.webp');
      const persUrl = chrome.runtime.getURL('webp/Common_UnitPersonality.webp');
      document.documentElement.style.setProperty('--tcbe-stat-sprite', `url("${statUrl}")`);
      document.documentElement.style.setProperty('--tcbe-personality-sprite', `url("${persUrl}")`);
    } catch {
      // 개발 환경 등에서 chrome.runtime을 사용할 수 없을 때의 폴백
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
   * 現在の画面が「使徒別」タブであるか判定
   * （ステータス別画面や別URLの場合は false を返却）
   */
  function isApostleTabActive(): boolean {
    // 1. URLが /board 以外の場合は即座に無効化
    if (!isBoardPage()) {
      return false;
    }

    // 2. 拡張機能DOMを除外したサイト本来の切り替えボタンを検出
    const allButtons = Array.from(document.querySelectorAll('button, a, div[role="button"], span'))
      .filter((el) => !el.closest('#tcbe-filter-panel') && !el.closest('.tcbe-badge-container'));

    // 「使徒別」切り替えボタンが存在する場合（＝現在はステータス別画面）
    const hasSwitchToApostleBtn = allButtons.some((el) => {
      const txt = el.textContent?.trim();
      return txt === '사도별';
    });
    if (hasSwitchToApostleBtn) {
      return false;
    }

    // 3. ステータス別画面特有の全体ステータスヘッダーの存在確認
    const hasStatHeaders = allButtons.some((el) => {
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

    // 4. 使徒名検索欄の存在確認（統合済みの場合も許可）
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
      // 태생 성급 필터
      if (filter.grade !== 'all' && prog.gradeDefault !== filter.grade) {
        return;
      }

      // 성격 필터
      if (filter.personality !== 'all' && prog.personality !== filter.personality) {
        return;
      }

      let isComplete = prog.bokr.isCompleted;
      let remaining = prog.bokr.remainingAll;
      let statSummary = filter.statCategory !== 'all' ? prog.bokr.byStat[filter.statCategory] : null;

      if (filter.boardLevel !== 'all') {
        const levelNum = Number(filter.boardLevel);
        const boardProg = prog.boards.find((b) => b.boardStepLevel === levelNum);
        if (boardProg) {
          isComplete = boardProg.unlocked && boardProg.bokr.picked === boardProg.bokr.total && boardProg.bokr.total > 0;
          remaining = boardProg.bokr.remaining;
          statSummary = filter.statCategory !== 'all' ? boardProg.bokr.byStat[filter.statCategory] : null;
        } else {
          return;
        }
      }

      if (filter.statCategory !== 'all') {
        if (statSummary && statSummary.total > 0 && statSummary.remaining > 0) {
          incompleteCount++;
        }
      } else {
        if (!isComplete && remaining > 0) {
          incompleteCount++;
        }
      }
    });

    return { incompleteCount, masterTotal, statName, persName };
  }

  /**
   * 現在のボード進捗とフィルタ状態をもとにUIを更新
   */
  function refreshUI() {
    if (!latestProgressMap || latestProgressMap.size === 0) {
      return;
    }

    if (isEnhancing) return;
    isEnhancing = true;

    try {
      const isBoard = isBoardPage();
      const isApostleTab = isBoard && isApostleTabActive();

      // /board URLでない、または使徒別タブでない場合は完全にアンマウント・非表示にして終了
      if (!isApostleTab) {
        if (filterController) {
          filterController.unmount();
        }
        setBadgesVisible(false);
        return;
      }

      // 使徒別タブである場合はマウントおよび表示を活性化
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
          };

      // 1. 사도 카드에 뱃지 삽입 및 업데이트
      enhanceApostleCards(latestProgressMap, filterState);

      // 2. 필터 및 정렬 적용
      const { total, visible } = applyFilterToCards(filterState, latestProgressMap);

      // 3. 통계 정보 및 스탯별 총 칸수/수치 요약 갱신
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

  function scheduleRefresh(delay = 150) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      refreshUI();
    }, delay);
  }

  function handleFilterChange(newState: FilterState) {
    if (!latestProgressMap) return;

    enhanceApostleCards(latestProgressMap, newState);
    const { total, visible } = applyFilterToCards(newState, latestProgressMap);
    const { incompleteCount, masterTotal, statName, persName } = countIncompleteApostles(
      latestProgressMap,
      newState
    );

    if (filterController) {
      filterController.updateStats(visible, total, masterTotal, incompleteCount, statName, persName);
      filterController.updateStatSummaryGrid(latestProgressMap, newState);
    }
  }

  injectSpriteStyles();

  filterController = new FilterPanelController(handleFilterChange);

  listenForBoardData((data: ExtractedApiData) => {
    try {
      latestProgressMap = calculateAllApostlesProgress(data);
      scheduleRefresh(50);
    } catch (err) {
      console.error('[TCBE] Error calculating board progress:', err);
    }
  });

  const observer = new MutationObserver((mutations) => {
    const hasExternalChanges = mutations.some((m) => {
      const target = m.target as HTMLElement;
      if (!target || !target.classList) return true;
      if (
        target.classList.contains('tcbe-badge-container') ||
        target.classList.contains('tcbe-tooltip') ||
        target.classList.contains('tcbe-panel-container') ||
        target.closest('#tcbe-filter-panel') ||
        target.closest('.tcbe-badge-container')
      ) {
        return false;
      }
      return true;
    });

    if (hasExternalChanges && latestProgressMap) {
      scheduleRefresh();
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // タブ切り替えボタンなどのクリック時に迅速に再判定
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target && !target.closest('#tcbe-filter-panel')) {
      scheduleRefresh(50);
    }
  });

  window.addEventListener('popstate', () => scheduleRefresh(50));
  window.addEventListener('hashchange', () => scheduleRefresh(50));
})();
