import { matchesApostleFilter } from '../domain/filters.ts';
/**
 * @file boardEnhancer.ts
 * @description 트릭컬 노트의 사도 카드 DOM을 감지하여 뱃지/하이라이트/필터/정렬 및 보크 타일 경로 탐색을 오케스트레이션하는 진입점 모듈
 */

import { findApostlePathToBokr } from '../domain/boardPathfinder.ts';
import { TILE_APOSTLE_ID, TILE_BOARD_LEVEL, TILE_NODE_ID } from '../bridge/tileIdentity.ts';
import type { ApostleProgress, FilterState } from '../domain/types.ts';
import { createBadgeElement } from './badge.ts';
import { closeBokrModal, showBokrModal } from './bokrModal.ts';
import { findCardContainer, findProgressByName } from './cardDetector.ts';
import { createNormalStatElement } from './normalStat.ts';
import { updateBoardTileHighlights } from './tileHighlight.ts';

// --- 하위 모듈 재-export (외부 모듈의 기존 import 경로 호환) ---
export { createBadgeElement } from './badge.ts';
export { closeBokrModal, showBokrModal } from './bokrModal.ts';
export { findCardContainer, findProgressByName } from './cardDetector.ts';
export { createNormalStatElement } from './normalStat.ts';
export { STAT_TO_POSITIONS, updateBoardTileHighlights } from './tileHighlight.ts';

/** 사도 카드를 식별하기 위한 데이터 속성 */
export const ATTR_APOSTLE_NAME = 'data-tcbe-apostle-name';
export const ATTR_APOSTLE_ID = 'data-tcbe-apostle-id';
export const ATTR_ENHANCED = 'data-tcbe-enhanced';

/** 분리된 행은 자동 해제하고 새 API 데이터는 객체 참조로 구분한다. */
const renderedProgress = new WeakMap<Element, ApostleProgress>();

/** 보크 표시가 달라지는 조건만 캐시 키에 포함한다. */
function badgeFilterKey(filter?: FilterState): string {
  return `${filter?.statCategory || 'all'}_${filter?.boardLevel || 'all'}`;
}

/** 같은 진행도에서는 일반칸 버튼과 팝업을 유지하고 보크 배지만 교체한다. */
function reuseEnhanceRow(row: Element | null, progress: ApostleProgress, filter?: FilterState): boolean {
  if (!row || renderedProgress.get(row) !== progress) return false;
  const badge = row.querySelector('.tcbe-badge-container');
  const normal = row.querySelector('.tcbe-normal-badge-container');
  if (!badge || !normal) return false;
  const key = badgeFilterKey(filter);
  if (row.getAttribute('data-tcbe-rendered-filter') !== key) {
    badge.replaceWith(createBadgeElement(progress, filter));
    row.setAttribute('data-tcbe-rendered-filter', key);
  }
  return true;
}

/**
 * 골드 수치를 트릭컬 노트 스타일의 'k' 단위로 포맷팅 (예: 300,000 -> '300k', 10,000 -> '10k', 0 -> '0k')
 */
export function formatGold(gold: number): string {
  if (!gold || gold === 0) return '0k';
  if (gold >= 1000) {
    const kVal = gold / 1000;
    const formatted = Number.isInteger(kVal)
      ? kVal.toLocaleString()
      : kVal.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return `${formatted}k`;
  }
  return `${gold.toLocaleString()}`;
}

/**
 * 보크 배지와 일반칸 버튼을 포함하는 행 컨테이너 생성
 */
export function createApostleEnhanceRow(
  progress: ApostleProgress,
  activeFilter?: FilterState
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'tcbe-badge-row';

  const bokrBadge = createBadgeElement(progress, activeFilter);
  const normalBadge = createNormalStatElement(progress);

  row.appendChild(bokrBadge);
  row.appendChild(normalBadge);

  return row;
}

/** 카드와 사도 진행도 데이터 간의 매핑 캐시 */
const cardToProgress = new WeakMap<HTMLElement, ApostleProgress>();

/** 현재 경로 강조 하이라이트가 적용된 타일 엘리먼트 집합 */
const activePathHighlightedTiles = new Set<HTMLElement>();

/**
 * 현재 적용된 보크 경로 하이라이트(.tcbe-path-highlight)를 모두 제거
 */
export function clearPathHighlights(): void {
  activePathHighlightedTiles.forEach((el) => {
    el.classList.remove('tcbe-path-highlight');
  });
  activePathHighlightedTiles.clear();
}

/**
 * 사도 카드 내부의 1, 2, 3차 보드 열 엘리먼트 추출
 */
export function getBoardCols(card: HTMLElement): {
  b1Col: HTMLElement | null;
  b2Col: HTMLElement | null;
  b3Col: HTMLElement | null;
} {
  let b1Col: HTMLElement | null = null;
  let b2Col: HTMLElement | null = null;
  let b3Col: HTMLElement | null = null;

  if (!card || typeof card.querySelectorAll !== 'function') {
    return { b1Col, b2Col, b3Col };
  }

  const titleElements = Array.from(
    card.querySelectorAll<HTMLElement>(
      '.bg-charaboard-active-title-background, .bg-charaboard-inactive-title-background'
    )
  );

  for (const el of titleElements) {
    const text = el.textContent?.replace(/\s/g, '');
    if (!text) continue;

    // 타이틀의 부모 요소(bg-emerald-100/60 p-2 등)가 해당 보드의 타일들을 감싸는 컨테이너
    const colContainer = (el.parentElement?.classList.contains('flex-auto')
      ? el.parentElement
      : el.closest('.flex-auto')) || el.parentElement;

    if (!colContainer) continue;

    if (text === '1차보드' && !b1Col) {
      b1Col = colContainer as HTMLElement;
    } else if (text === '2차보드' && !b2Col) {
      b2Col = colContainer as HTMLElement;
    } else if (text === '3차보드' && !b3Col) {
      b3Col = colContainer as HTMLElement;
    }
  }

  return { b1Col, b2Col, b3Col };
}

/**
 * 특정 보드 열 내부의 타일(div[class*="--img-board-rect"]) 엘리먼트 배열 반환
 */
export function getBoardTiles(col: HTMLElement | null): HTMLElement[] {
  if (!col) return [];
  const tiles = Array.from(col.querySelectorAll<HTMLElement>('div[class*="--img-board-rect"]'));
  if (tiles.length > 0) return tiles;
  const fallbackTiles = Array.from(col.querySelectorAll<HTMLElement>('div[class*="board-rect"]'));
  if (fallbackTiles.length > 0) return fallbackTiles;
  return [];
}

/** 브리지 식별자를 현재 사도의 마스터 데이터와 대조하며 순서 기반 추정은 하지 않는다. */
export function resolveBokrTile(tile: HTMLElement, progress: ApostleProgress) {
  if (tile.getAttribute(TILE_APOSTLE_ID) !== String(progress.apostleId)) return null;
  const boardLevel = Number(tile.getAttribute(TILE_BOARD_LEVEL));
  const rawNodeId = tile.getAttribute(TILE_NODE_ID);
  if (rawNodeId === null || !Number.isInteger(boardLevel) || boardLevel < 1 || boardLevel > 3) return null;
  const matchedIndex = progress.boards.findIndex(entry => entry.boardStepLevel === boardLevel);
  const boardIndex = matchedIndex >= 0 ? matchedIndex : boardLevel - 1;
  const board = progress.boards[boardIndex];
  const nodeId = Number(rawNodeId);
  if (!Number.isSafeInteger(nodeId) || rawNodeId.trim() === '') return null;
  const nodeProgress = board?.nodes.find(node => node.nodeId === nodeId);
  if (!nodeProgress?.isBokr) return null;
  const nodeIndex = board?.masterNodes?.findIndex(node => node.id === nodeId) ?? -1;
  const targetNode = board?.masterNodes?.[nodeIndex];
  return targetNode && board ? { board, boardIndex, nodeIndex, targetNode } : null;
}

/**
 * 사도 카드 내부의 보크 타일에 마우스 커서 및 클릭 이벤트 위임 리스너 등록
 */
export function attachBokrTileClickListener(card: HTMLElement, progress: ApostleProgress): void {
  if (!card || typeof card.getAttribute !== 'function' || typeof card.addEventListener !== 'function') {
    return;
  }
  cardToProgress.set(card, progress);

  // 카드 재사용이나 데이터 갱신 때 기존의 잘못된 표시도 제거한다.
  getBoardTiles(card).forEach(tile => {
    if (resolveBokrTile(tile, progress)) tile.setAttribute('data-tcbe-is-bokr', 'true');
    else tile.removeAttribute('data-tcbe-is-bokr');
  });

  // 카드가 이미 클릭 바인딩되어 있다면 중복 등록 방지
  if (card.getAttribute('data-tcbe-bokr-click-bound') === 'true') {
    return;
  }
  card.setAttribute('data-tcbe-bokr-click-bound', 'true');

  // 캡처링 단계에서 인터셉트하여 원본 React 라우터의 사도 상세 페이지 이동 방지
  card.addEventListener(
    'click',
    (e) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target) return;

      const rectEl = target.closest<HTMLElement>('div[class*="--img-board-rect"]');
      if (!rectEl) return;

      const curProgress = cardToProgress.get(card) || progress;
      const matched = resolveBokrTile(rectEl, curProgress);
      if (!matched?.board.masterNodes) return;
      const { boardIndex, targetNode, nodeIndex } = matched;

      // 식별자 대조와 경로 계산에 성공한 경우에만 원본 클릭을 차단한다.
      const pathResult = findApostlePathToBokr(curProgress, boardIndex, targetNode.id);
      if (!pathResult) return;

      // 원본 링크 클릭 차단
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // 경로 하이라이트 토글 함수
      const applyHighlight = (enabled: boolean) => {
        clearPathHighlights();
        if (!enabled) return;
        const pathTiles = new Set(pathResult.pathSteps?.map(step => `${step.boardIndex + 1}:${step.nodeId}`));
        getBoardTiles(card).forEach(tileEl => {
          if (tileEl.getAttribute(TILE_APOSTLE_ID) === String(curProgress.apostleId) &&
              pathTiles.has(`${tileEl.getAttribute(TILE_BOARD_LEVEL)}:${tileEl.getAttribute(TILE_NODE_ID)}`)) {
            tileEl.classList.add('tcbe-path-highlight');
            activePathHighlightedTiles.add(tileEl);
          }
        });
      };

      // 보크 상세 및 경로 모달 노출
      showBokrModal({
        progress: curProgress,
        boardIndex,
        targetNode,
        nodeIndex,
        pathResult,
        portraitUrl: card.querySelector<HTMLImageElement>('img[alt]')?.src,
        returnFocus: rectEl,
        onToggleHighlight: applyHighlight,
        onClose: () => {
          clearPathHighlights();
        },
      });
    },
    true
  );
}

/**
 * 보드 기준 필터에 따라 사도 카드 내부의 1, 2, 3차 보드 열 및 묶음 row 표시/숨김 (캐시 적용)
 */
export function applyBoardLevelVisibility(card: HTMLElement, boardLevel: FilterState['boardLevel']) {
  // 가상 목록은 새 카드가 측정되기 전부터 전역 CSS로 같은 차수를 표시한다.
  if (card.closest('.virtuoso-grid-item')) return;
  // 캐시 확인: 이미 동일한 표시 상태가 적용되어 있다면 DOM 순회/갱신 생략
  if (card.getAttribute('data-tcbe-visible-level') === boardLevel) {
    return;
  }
  card.setAttribute('data-tcbe-visible-level', boardLevel);

  const { b1Col, b2Col, b3Col } = getBoardCols(card);

  // 1, 2차 보드를 묶는 부모 row (b1Col 또는 b2Col의 부모)
  const row12 = (b1Col?.parentElement || b2Col?.parentElement) as HTMLElement | null;
  // 3차 보드를 묶는 부모 row (b3Col의 부모)
  const row3 = b3Col?.parentElement as HTMLElement | null;

  if (boardLevel === '1') {
    if (b1Col) b1Col.style.display = '';
    if (b2Col) b2Col.style.display = 'none';
    if (b3Col) b3Col.style.display = 'none';
    if (row12) row12.style.display = '';
    if (row3) row3.style.display = 'none';
  } else if (boardLevel === '2') {
    if (b1Col) b1Col.style.display = 'none';
    if (b2Col) b2Col.style.display = '';
    if (b3Col) b3Col.style.display = 'none';
    if (row12) row12.style.display = '';
    if (row3) row3.style.display = 'none';
  } else if (boardLevel === '3') {
    if (b1Col) b1Col.style.display = 'none';
    if (b2Col) b2Col.style.display = 'none';
    if (b3Col) b3Col.style.display = '';
    if (row12) row12.style.display = 'none';
    if (row3) row3.style.display = '';
  } else {
    // 'all' (전체)
    if (b1Col) b1Col.style.display = '';
    if (b2Col) b2Col.style.display = '';
    if (b3Col) b3Col.style.display = '';
    if (row12) row12.style.display = '';
    if (row3) row3.style.display = '';
  }
}

/**
 * 페이지 내의 사도 카드를 탐색하여 뱃지를 삽입 또는 업데이트하고 타일 하이라이트 및 보드 차수 가시성을 갱신
 */
export function enhanceApostleCards(
  apostleProgressMap: Map<string, ApostleProgress>,
  activeFilter?: FilterState,
  targetCards?: HTMLElement[]
): number {
  let enhancedCount = 0;

  const nameToProgress = new Map<string, ApostleProgress>();
  apostleProgressMap.forEach((prog) => {
    if (prog.name) {
      const trimmed = prog.name.trim();
      const normalized = trimmed.replace(/\s+/g, '');
      nameToProgress.set(trimmed, prog);
      nameToProgress.set(normalized, prog);
      nameToProgress.set(String(prog.apostleId), prog);
    }
  });

  // 1. 최상위 사도 카드 요소들 직접 탐색 (모달 다이얼로그 요소는 엄격 제외)
  const cardElements = targetCards ?? document.querySelectorAll<HTMLElement>(
    '[data-slot="card"]:not([role="dialog"]):not([data-slot="dialog-content"]), div.bg-dialog-background:not([role="dialog"]):not([data-slot="dialog-content"]):not([data-slot="dialog-overlay"])'
  );

  const processedCards = new Set<HTMLElement>();

  cardElements.forEach((card) => {
    if (card.closest('[role="dialog"], [data-slot="dialog-content"], [data-slot="dialog-overlay"]')) {
      return;
    }
    // 캐시 확인: 이미 식별된 카드는 속성에서 직접 조회하여 불필요한 텍스트 DOM 순회 생략
    let progress: ApostleProgress | undefined;
    const cachedName = card.getAttribute(ATTR_APOSTLE_NAME);
    if (cachedName && nameToProgress.has(cachedName)) {
      progress = nameToProgress.get(cachedName);
    }

    if (!progress) {
      // 사도 이미지(img[alt])에서 사도 이름 찾기
      const imgEl = card.querySelector<HTMLImageElement>('img[alt]');
      const imgAlt = imgEl?.getAttribute('alt')?.trim();
      if (imgAlt) {
        progress = findProgressByName(nameToProgress, imgAlt);
      }
    }

    let nameElement: HTMLElement | null = null;
    if (!progress) {
      const textElements = Array.from(
        card.querySelectorAll<HTMLElement>('div, span, h2, h3, h4, p, strong, b')
      );
      for (const el of textElements) {
        if (el.children.length > 2) continue;
        const text = el.textContent?.trim();
        if (!text) continue;
        const found = findProgressByName(nameToProgress, text);
        if (found) {
          progress = found;
          nameElement = el;
          break;
        }
      }
    }

    if (!progress) return;

    if (cachedName !== progress.name) {
      card.setAttribute(ATTR_APOSTLE_NAME, progress.name);
      card.setAttribute(ATTR_APOSTLE_ID, String(progress.apostleId));
    }

    const filterKey = badgeFilterKey(activeFilter);
    const existingRow = card.querySelector('.tcbe-badge-row');
    const existingOldBadge = card.querySelector('.tcbe-badge-container');

    // 이미 올바른 필터 조건으로 렌더링된 배지 행이 있다면 DOM 재생성 및 교체 생략
    if (!reuseEnhanceRow(existingRow, progress, activeFilter)) {
      if (!nameElement && !existingRow && !existingOldBadge) {
        const textElements = Array.from(
          card.querySelectorAll<HTMLElement>('div, span, h2, h3, h4, p, strong, b')
        );
        for (const el of textElements) {
          if (el.children.length > 2) continue;
          const text = el.textContent?.trim();
          if (!text) continue;
          const found = findProgressByName(nameToProgress, text);
          if (found && found.apostleId === progress.apostleId) {
            nameElement = el;
            break;
          }
        }
      }

      const newRow = createApostleEnhanceRow(progress, activeFilter);
      newRow.setAttribute('data-tcbe-rendered-filter', filterKey);
      renderedProgress.set(newRow, progress);

      if (existingRow) {
        existingRow.replaceWith(newRow);
      } else if (existingOldBadge) {
        existingOldBadge.replaceWith(newRow);
      } else if (nameElement) {
        if (nameElement.nextSibling) {
          nameElement.parentNode?.insertBefore(newRow, nameElement.nextSibling);
        } else {
          nameElement.parentNode?.appendChild(newRow);
        }
      }
    }

    // 보드 차수별 가시성(1차, 2차, 3차 필터) 적용
    if (activeFilter) {
      applyBoardLevelVisibility(card, activeFilter.boardLevel);
    }

    // 보드 타일 하이라이트 갱신
    updateBoardTileHighlights(card, progress, activeFilter);

    // 보크 타일 클릭 리스너 및 마킹 적용
    attachBokrTileClickListener(card, progress);
    card.setAttribute(ATTR_ENHANCED, 'true');
    processedCards.add(card);
    enhancedCount++;
  });

  // 검색 결과는 전체 사도 수보다 적을 수 있다. 정상 카드를 하나도 식별하지 못했을 때만 보조 탐색한다.
  if (!targetCards && enhancedCount === 0) {
    const candidates = document.querySelectorAll('span, p, div, h2, h3, h4, strong, b');
    candidates.forEach((el) => {
      const text = el.textContent?.trim();
      if (!text) return;
      const progress = findProgressByName(nameToProgress, text);
      if (!progress) return;

      const card = findCardContainer(el);
      if (!card || processedCards.has(card)) return;

      card.setAttribute(ATTR_APOSTLE_NAME, progress.name);
      card.setAttribute(ATTR_APOSTLE_ID, String(progress.apostleId));

      const filterKey = badgeFilterKey(activeFilter);
      const existingRow = card.querySelector('.tcbe-badge-row');
      const existingOldBadge = card.querySelector('.tcbe-badge-container');

      if (!reuseEnhanceRow(existingRow, progress, activeFilter)) {
        const newRow = createApostleEnhanceRow(progress, activeFilter);
        newRow.setAttribute('data-tcbe-rendered-filter', filterKey);
        renderedProgress.set(newRow, progress);

        if (existingRow) {
          existingRow.replaceWith(newRow);
        } else if (existingOldBadge) {
          existingOldBadge.replaceWith(newRow);
        } else {
          if (el.nextSibling) {
            el.parentNode?.insertBefore(newRow, el.nextSibling);
          } else {
            el.parentNode?.appendChild(newRow);
          }
        }
      }

      if (activeFilter) {
        applyBoardLevelVisibility(card, activeFilter.boardLevel);
      }
      updateBoardTileHighlights(card, progress, activeFilter);
      attachBokrTileClickListener(card, progress);
      card.setAttribute(ATTR_ENHANCED, 'true');
      processedCards.add(card);
      enhancedCount++;
    });
  }

  return enhancedCount;
}

/**
 * 필터 조건(보드 기준, 스탯 기준, 보크 상태)에 따라 사도 카드의 표시/숨김 처리
 */
export function applyFilterToCards(
  filter: FilterState,
  apostleProgressMap: Map<string, ApostleProgress>,
  targetCards?: HTMLElement[]
): { total: number; visible: number } {
  const cards = targetCards ?? document.querySelectorAll<HTMLElement>(`[${ATTR_APOSTLE_NAME}]`);
  let total = 0;
  let visible = 0;

  // 사도 가나다순(한국어 이름 순) 인덱스 맵 생성 (기본 정렬 및 2차 정렬 키)
  const sortedNames = Array.from(new Set(apostleProgressMap.values()))
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b, 'ko'));
  const nameOrderMap = new Map<string, number>();
  sortedNames.forEach((name, index) => {
    nameOrderMap.set(name, index);
  });

  cards.forEach((card) => {
    if (card.closest('[role="dialog"], [data-slot="dialog-content"], [data-slot="dialog-overlay"]')) {
      return;
    }
    const apostleName = card.getAttribute(ATTR_APOSTLE_NAME);
    if (!apostleName) return;

    const progress = apostleProgressMap.get(apostleName);
    if (!progress) return;

    total++;

    // 가상 목록의 입력은 MAIN 브리지에서 이미 필터·정렬했다.
    // 렌더된 카드만 다시 숨기면 높이 0인 슬롯을 측정하여 스크롤 범위가 흔들린다.
    if (card.closest('.virtuoso-grid-item')) {
      card.classList.remove('tcbe-card-hidden');
      if (card.style.order !== '') card.style.order = '';
      updateBoardTileHighlights(card, progress, filter);
      visible++;
      return;
    }

    // 1. 보드 차수별 카드 내 가시성 적용 (1차 선택 시 1차만 표시 등)
    applyBoardLevelVisibility(card, filter.boardLevel);

    // 2. 보드 타일 하이라이트 실시간 적용 (보크 타일만 대상)
    updateBoardTileHighlights(card, progress, filter);

    const isMatch = matchesApostleFilter(progress, filter);

    if (isMatch) {
      if (card.classList.contains('tcbe-card-hidden')) {
        card.classList.remove('tcbe-card-hidden');
      }
      visible++;

      const nameIndex = nameOrderMap.get(progress.name) ?? 0;
      const totalNames = sortedNames.length;
      let targetOrder = '';

      // 7. 사도 카드 정렬(Sort) 적용 (오름차순/내림차순 지원 및 동일 순위 가나다순)
      if (filter.sortBy === 'name_asc') {
        targetOrder = String(nameIndex);
      } else if (filter.sortBy === 'name_desc') {
        targetOrder = String(totalNames - nameIndex);
      } else if (filter.sortBy === 'unlocked_desc') {
        // 3관 -> 1관 (동일 관문 내 가나다순)
        targetOrder = String((3 - progress.unlockedBoardCount) * 10000 + nameIndex);
      } else if (filter.sortBy === 'unlocked_asc') {
        // 1관 -> 3관 (동일 관문 내 가나다순)
        targetOrder = String(progress.unlockedBoardCount * 10000 + nameIndex);
      } else if (filter.sortBy === 'grade_desc') {
        // 3성 -> 1성 (동일 성급 내 가나다순)
        targetOrder = String((3 - progress.gradeDefault) * 10000 + nameIndex);
      } else if (filter.sortBy === 'grade_asc') {
        // 1성 -> 3성 (동일 성급 내 가나다순)
        targetOrder = String(progress.gradeDefault * 10000 + nameIndex);
      } else if (filter.sortBy === 'personality_asc') {
        // 성격 순 (순수 -> 냉정 -> 광기 -> 활발 -> 우울 -> 공명, 동일 성격 내 가나다순)
        targetOrder = String(progress.personality * 10000 + nameIndex);
      } else if (filter.sortBy === 'personality_desc') {
        // 성격 역순 (공명 -> 우울 -> 활발 -> 광기 -> 냉정 -> 순수, 동일 성격 내 가나다순)
        targetOrder = String((5 - progress.personality) * 10000 + nameIndex);
      }

      // 불필요한 Reflow/재렌더링 방지를 위해 order에 실제 변경이 있을 때만 업데이트
      if (card.style.order !== targetOrder) {
        card.style.order = targetOrder;
      }
    } else {
      if (!card.classList.contains('tcbe-card-hidden')) {
        card.classList.add('tcbe-card-hidden');
      }
      if (card.style.order !== '') {
        card.style.order = '';
      }
    }
  });

  return { total, visible };
}

/**
 * 확장 프로그램 배지 / 하이라이트 / 카드 숨김 상태 일괄 표시/숨김 제어
 * (스탯별 탭 등 사도별 이외의 화면 전환 시 완전 복원)
 */
export function setBadgesVisible(visible: boolean) {
  const badges = document.querySelectorAll('.tcbe-badge-container, .tcbe-badge-row');
  badges.forEach((b) => {
    if (visible) {
      b.classList.remove('tcbe-hidden-by-tab');
    } else {
      b.classList.add('tcbe-hidden-by-tab');
    }
  });

  if (!visible) {
    closeBokrModal();
    document.querySelectorAll('[data-tcbe-is-bokr]').forEach(tile => tile.removeAttribute('data-tcbe-is-bokr'));
    // 1. 타일 하이라이트 해제
    const highlights = document.querySelectorAll('.tcbe-tile-highlight-rem, .tcbe-tile-highlight-done');
    highlights.forEach((h) => {
      h.classList.remove('tcbe-tile-highlight-rem', 'tcbe-tile-highlight-done');
      h.removeAttribute('data-tcbe-tile-highlight');
    });

    // 2. 필터에 의한 숨김 클래스(tcbe-card-hidden) 전체 해제
    const hiddenCards = document.querySelectorAll('.tcbe-card-hidden');
    hiddenCards.forEach((c) => {
      c.classList.remove('tcbe-card-hidden');
    });

    // 3. 보드 차수 및 하이라이트 캐시 속성을 리셋하고 원래 표시로 복원
    const allCards = document.querySelectorAll<HTMLElement>(`[${ATTR_APOSTLE_NAME}]`);
    allCards.forEach((c) => {
      c.removeAttribute('data-tcbe-visible-level');
      c.removeAttribute('data-tcbe-highlight-stat');
      applyBoardLevelVisibility(c, 'all');
      if (c.style.order !== '') {
        c.style.order = '';
      }
    });
  }
}
