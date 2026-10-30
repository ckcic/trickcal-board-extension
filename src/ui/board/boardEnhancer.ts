/**
 * @file boardEnhancer.ts
 * @description 트릭컬 노트의 사도 카드 DOM을 감지하여 뱃지/하이라이트/필터/정렬 및 보크 타일 경로 탐색을 오케스트레이션하는 진입점 모듈
 */

import { DIALOG_EXCLUSION_SELECTOR } from '../common/selectors.ts';
import { getUniqueApostles } from '../../domain/apostleProgress.ts';
import { matchesApostleFilter } from '../../domain/filters.ts';
import { selectApostleIds } from '../../domain/listSelection.ts';
import { findApostlePathToBokr } from '../../domain/boardPathfinder.ts';
import { TILE_APOSTLE_ID, TILE_BOARD_LEVEL, TILE_NODE_ID } from '../../bridge/tileIdentity.ts';
import type { ProgressMap, ApostleProgress, FilterState } from '../../domain/types.ts';
import { createBadgeElement } from './badge.ts';
import { closeBokrModal, showBokrModal } from './bokrModal.ts';
import { findCardContainer } from './cardDetector.ts';
import { findProgressByName } from '../../domain/apostleLookup.ts';
import { createNormalStatElement } from './normalStat.ts';
import { updateBoardTileHighlights } from './tileHighlight.ts';



/** 사도 카드를 식별하기 위한 데이터 속성 */
const ATTR_APOSTLE_NAME = 'data-tcbe-apostle-name';
const ATTR_APOSTLE_ID = 'data-tcbe-apostle-id';
const ATTR_ENHANCED = 'data-tcbe-enhanced';

/** 분리된 행은 자동 해제하고 새 API 데이터는 객체 참조로 구분한다. */
const renderedProgress = new WeakMap<Element, ApostleProgress>();

/** 진행도 맵별 사도 이름·ID 역방향 조회 맵 캐시 */
const nameToProgressCache = new WeakMap<ProgressMap, { size: number; map: Map<string, ApostleProgress> }>();

function getNameToProgressMap(apostleProgressMap: ProgressMap): Map<string, ApostleProgress> {
  const cached = nameToProgressCache.get(apostleProgressMap);
  if (cached && cached.size === apostleProgressMap.size) {
    return cached.map;
  }
  const map = new Map<string, ApostleProgress>();
  getUniqueApostles(apostleProgressMap).forEach((prog) => {
    if (prog.name) {
      const trimmed = prog.name.trim();
      const normalized = trimmed.replace(/\s+/g, '');
      map.set(trimmed, prog);
      map.set(normalized, prog);
      map.set(String(prog.apostleId), prog);
    }
  });
  nameToProgressCache.set(apostleProgressMap, { size: apostleProgressMap.size, map });
  return map;
}

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
 * 보크 배지와 일반칸 버튼을 포함하는 행 컨테이너 생성
 */
function createApostleEnhanceRow(
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
function clearPathHighlights(): void {
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
function getBoardTiles(col: HTMLElement | null): HTMLElement[] {
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

/** 차수별 열 표시 여부이며 1·2차는 같은 부모 행을 공유한다. */
const BOARD_LEVEL_VISIBILITY: Record<FilterState['boardLevel'], readonly [boolean, boolean, boolean]> = {
  all: [true, true, true],
  '1': [true, false, false],
  '2': [false, true, false],
  '3': [false, false, true],
};

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

  const [show1, show2, show3] = BOARD_LEVEL_VISIBILITY[boardLevel];
  const elements: Array<[HTMLElement | null, boolean]> = [
    [b1Col, show1], [b2Col, show2], [b3Col, show3], [row12, show1 || show2], [row3, show3],
  ];
  for (const [element, visible] of elements) {
    if (element) element.style.display = visible ? '' : 'none';
  }
}

/** 카드 내부에서 사도 이름과 일치하는 요소를 찾고 필요하면 사도 ID도 대조한다. */
function findCardName(
  card: HTMLElement, nameToProgress: Map<string, ApostleProgress>, expectedApostleId?: number
): { progress: ApostleProgress; element: HTMLElement } | null {
  const textElements = card.querySelectorAll<HTMLElement>('div, span, h2, h3, h4, p, strong, b');
  for (const element of textElements) {
    if (element.children.length > 2) continue;
    const text = element.textContent?.trim();
    if (!text) continue;
    const progress = findProgressByName(nameToProgress, text);
    if (progress && (expectedApostleId === undefined || progress.apostleId === expectedApostleId)) {
      return { progress, element };
    }
  }
  return null;
}

/** 두 탐색 경로에서 배지 재사용·삽입과 카드 기능 연결을 같은 순서로 처리한다. */
function enhanceCard(
  card: HTMLElement, progress: ApostleProgress, activeFilter: FilterState | undefined,
  resolveAnchor: () => Element | null
): void {
  if (card.getAttribute(ATTR_APOSTLE_NAME) !== progress.name) {
    card.setAttribute(ATTR_APOSTLE_NAME, progress.name);
  }
  if (card.getAttribute(ATTR_APOSTLE_ID) !== String(progress.apostleId)) {
    card.setAttribute(ATTR_APOSTLE_ID, String(progress.apostleId));
  }
  const existingRow = card.querySelector('.tcbe-badge-row');
  const existingOldBadge = card.querySelector('.tcbe-badge-container');
  if (!reuseEnhanceRow(existingRow, progress, activeFilter)) {
    // 기존 행을 교체하거나 재사용할 때는 이름 요소를 다시 탐색하지 않는다.
    const anchor = !existingRow && !existingOldBadge ? resolveAnchor() : null;
    const newRow = createApostleEnhanceRow(progress, activeFilter);
    newRow.setAttribute('data-tcbe-rendered-filter', badgeFilterKey(activeFilter));
    renderedProgress.set(newRow, progress);
    if (existingRow) {
      existingRow.replaceWith(newRow);
    } else if (existingOldBadge) {
      existingOldBadge.replaceWith(newRow);
    } else if (anchor) {
      if (anchor.nextSibling) {
        anchor.parentNode?.insertBefore(newRow, anchor.nextSibling);
      } else {
        anchor.parentNode?.appendChild(newRow);
      }
    }
  }
  if (activeFilter) applyBoardLevelVisibility(card, activeFilter.boardLevel);
  updateBoardTileHighlights(card, progress, activeFilter);
  attachBokrTileClickListener(card, progress);
  card.setAttribute(ATTR_ENHANCED, 'true');
}

/**
 * 페이지 내의 사도 카드를 탐색하여 뱃지를 삽입 또는 업데이트하고 타일 하이라이트 및 보드 차수 가시성을 갱신
 */
export function enhanceApostleCards(
  apostleProgressMap: ProgressMap,
  activeFilter?: FilterState,
  targetCards?: HTMLElement[]
): number {
  let enhancedCount = 0;

  const nameToProgress = getNameToProgressMap(apostleProgressMap);

  // 1. 최상위 사도 카드 요소들 직접 탐색 (모달 다이얼로그 요소는 엄격 제외)
  const cardElements = targetCards ?? document.querySelectorAll<HTMLElement>(
    '[data-slot="card"]:not([role="dialog"]):not([data-slot="dialog-content"]), div.bg-dialog-background:not([role="dialog"]):not([data-slot="dialog-content"]):not([data-slot="dialog-overlay"])'
  );

  const processedCards = new Set<HTMLElement>();

  cardElements.forEach((card) => {
    if (card.closest(DIALOG_EXCLUSION_SELECTOR)) {
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
      const found = findCardName(card, nameToProgress);
      if (found) {
        progress = found.progress;
        nameElement = found.element;
      }
    }

    if (!progress) return;

    const matchedProgress = progress;
    enhanceCard(card, progress, activeFilter,
      () => nameElement ?? findCardName(card, nameToProgress, matchedProgress.apostleId)?.element ?? null);
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

      enhanceCard(card, progress, activeFilter, () => el);
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
  apostleProgressMap: ProgressMap,
  targetCards?: HTMLElement[]
): { total: number; visible: number } {
  const cards = targetCards ?? document.querySelectorAll<HTMLElement>(`[${ATTR_APOSTLE_NAME}]`);
  let total = 0;
  let visible = 0;

  // 가상 목록이 아닌 일반 카드 목록에서만 필요 시 지연 계산한다.
  let orderByApostleId: Map<number, number> | null = null;
  const getOrderByApostleId = () => {
    if (!orderByApostleId) {
      orderByApostleId = new Map(
        selectApostleIds(apostleProgressMap, filter).map((apostleId, index) => [apostleId, index])
      );
    }
    return orderByApostleId;
  };

  cards.forEach((card) => {
    if (card.closest(DIALOG_EXCLUSION_SELECTOR)) {
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

      const targetOrder = String(getOrderByApostleId().get(progress.apostleId) ?? 0);

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
