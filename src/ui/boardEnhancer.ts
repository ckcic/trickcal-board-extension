import { matchesApostleFilter } from '../domain/filters.ts';
/**
 * @file boardEnhancer.ts
 * @description 트릭컬 노트의 사도 카드 DOM을 감지하여 뱃지/하이라이트/필터/정렬을 오케스트레이션하는 진입점 모듈
 */

import type { ApostleProgress, FilterState } from '../domain/types.ts';
import { createBadgeElement } from './badge.ts';
import { findCardContainer, findProgressByName } from './cardDetector.ts';
import { createNormalStatElement } from './normalStat.ts';
import { updateBoardTileHighlights } from './tileHighlight.ts';

// --- 하위 모듈 재-export (외부 모듈의 기존 import 경로 호환) ---
export { createBadgeElement } from './badge.ts';
export { findProgressByName } from './cardDetector.ts';
export { createNormalStatElement } from './normalStat.ts';
export { STAT_TO_POSITIONS, updateBoardTileHighlights } from './tileHighlight.ts';

/** 사도 카드를 식별하기 위한 데이터 속성 */
export const ATTR_APOSTLE_NAME = 'data-tcbe-apostle-name';
export const ATTR_APOSTLE_ID = 'data-tcbe-apostle-id';
export const ATTR_ENHANCED = 'data-tcbe-enhanced';

/** 분리된 행은 자동 해제하고 새 API 데이터는 객체 참조로 구분한다. */
const renderedProgress = new WeakMap<Element, ApostleProgress>();

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

/**
 * 보드 기준 필터에 따라 사도 카드 내부의 1, 2, 3차 보드 열 및 묶음 row 표시/숨김 (캐시 적용)
 */
export function applyBoardLevelVisibility(card: HTMLElement, boardLevel: FilterState['boardLevel']) {
  // 캐시 확인: 이미 동일한 표시 상태가 적용되어 있다면 DOM 순회/갱신 생략
  if (card.getAttribute('data-tcbe-visible-level') === boardLevel) {
    return;
  }
  card.setAttribute('data-tcbe-visible-level', boardLevel);

  let b1Col: HTMLElement | null = null;
  let b2Col: HTMLElement | null = null;
  let b3Col: HTMLElement | null = null;

  const titleElements = Array.from(
    card.querySelectorAll<HTMLElement>('.bg-charaboard-active-title-background, .bg-charaboard-inactive-title-background, div, span')
  );

  for (const el of titleElements) {
    const text = el.textContent?.trim();
    if (text === '1차 보드' && !b1Col) {
      b1Col = (el.parentElement?.classList.contains('flex-auto') ? el.parentElement : el.closest('.flex-auto')) as HTMLElement;
    } else if (text === '2차 보드' && !b2Col) {
      b2Col = (el.parentElement?.classList.contains('flex-auto') ? el.parentElement : el.closest('.flex-auto')) as HTMLElement;
    } else if (text === '3차 보드' && !b3Col) {
      b3Col = (el.parentElement?.classList.contains('flex-auto') ? el.parentElement : el.closest('.flex-auto')) as HTMLElement;
    }
  }

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
  activeFilter?: FilterState
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
  const cardElements = document.querySelectorAll<HTMLElement>(
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

    const filterKey = `${activeFilter?.statCategory || 'all'}_${activeFilter?.boardLevel || 'all'}_${activeFilter?.status || 'all'}_${activeFilter?.grade || 'all'}`;
    const existingRow = card.querySelector('.tcbe-badge-row');
    const existingOldBadge = card.querySelector('.tcbe-badge-container');

    // 이미 올바른 필터 조건으로 렌더링된 배지 행이 있다면 DOM 재생성 및 교체 생략
    if (!existingRow || renderedProgress.get(existingRow) !== progress || existingRow.getAttribute('data-tcbe-rendered-filter') !== filterKey) {
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

    card.setAttribute(ATTR_ENHANCED, 'true');
    processedCards.add(card);
    enhancedCount++;
  });

  // 폴백: 혹시 cardElements로 잡히지 않은 카드가 있다면 기존 방식으로 탐색
  if (enhancedCount < apostleProgressMap.size / 2) {
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

      const filterKey = `${activeFilter?.statCategory || 'all'}_${activeFilter?.boardLevel || 'all'}_${activeFilter?.status || 'all'}_${activeFilter?.grade || 'all'}`;
      const existingRow = card.querySelector('.tcbe-badge-row');
      const existingOldBadge = card.querySelector('.tcbe-badge-container');

      if (!existingRow || renderedProgress.get(existingRow) !== progress || existingRow.getAttribute('data-tcbe-rendered-filter') !== filterKey) {
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
  apostleProgressMap: Map<string, ApostleProgress>
): { total: number; visible: number } {
  const cards = document.querySelectorAll<HTMLElement>(`[${ATTR_APOSTLE_NAME}]`);
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
