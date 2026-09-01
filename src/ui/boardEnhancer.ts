/**
 * @file boardEnhancer.ts
 * @description 트릭컬 노트의 사도 카드 DOM을 감지하여 스탯별/성격별/성급별 보크 진행도 뱃지를 삽입/업데이트하고 정렬 및 필터링을 수행
 */

import { PERSONALITY_META_LIST, STAT_META_LIST } from '../domain/boardProgress.ts';
import type { ApostleProgress, FilterState, StatCategory } from '../domain/types.ts';

/** 사도 카드를 식별하기 위한 데이터 속성 */
export const ATTR_APOSTLE_NAME = 'data-tcbe-apostle-name';
export const ATTR_APOSTLE_ID = 'data-tcbe-apostle-id';
export const ATTR_ENHANCED = 'data-tcbe-enhanced';

/**
 * 트릭컬 노트 BoardTile.webp 스프라이트의 스탯별 bg-position 매핑
 * (치피: 63.6364%/59.0909%, 치저: 72.7273%/68.1818%)
 */
export const STAT_TO_POSITIONS: Record<StatCategory, { active: string[]; inactive: string[] }> = {
  hp: {
    active: ['9.0909%'],
    inactive: ['4.5455%'],
  },
  atk_phys: {
    active: ['18.1818%'],
    inactive: ['13.6364%'],
  },
  atk_mag: {
    active: ['27.2727%'],
    inactive: ['22.7273%'],
  },
  def_phys: {
    active: ['36.3636%'],
    inactive: ['31.8182%'],
  },
  def_mag: {
    active: ['45.4545%'],
    inactive: ['40.9091%'],
  },
  crit: {
    active: ['54.5455%'],
    inactive: ['50%'],
  },
  crit_dmg: {
    active: ['63.6364%'],
    inactive: ['59.0909%'],
  },
  crit_res: {
    active: ['72.7273%'],
    inactive: ['68.1818%'],
  },
  crit_dmg_res: {
    active: ['81.8182%'],
    inactive: ['77.2727%'],
  },
};

/**
 * 클래스 문자열 내에 특정 bg-position-[pos_0] 클래스가 존재하는지 정확히 검사
 */
function hasTilePosition(className: string, pos: string): boolean {
  return className.includes(`bg-position-[${pos}_0]`) || className.includes(`bg-position-[${pos}]`);
}

/**
 * 텍스트 또는 이미지 alt로부터 사도 진행도 데이터를 검색 (스킨명 괄호 접미사 지원)
 */
export function findProgressByName(
  nameToProgress: Map<string, ApostleProgress>,
  rawText: string
): ApostleProgress | undefined {
  if (!rawText) return undefined;
  const trimmed = rawText.trim();
  const normalized = trimmed.replace(/\s+/g, '');

  // 1. 완전 일치 (예: "다야(퓨어샤인)", "가비아", "마요(멋짐)")
  if (nameToProgress.has(trimmed)) {
    return nameToProgress.get(trimmed);
  }
  if (nameToProgress.has(normalized)) {
    return nameToProgress.get(normalized);
  }

  // 2. 괄호 안의 스킨명 제거 후 일치 (예: "우로스(사악)" -> "우로스")
  const withoutBracket = trimmed.replace(/\([^)]*\)/g, '').trim();
  const withoutBracketNorm = withoutBracket.replace(/\s+/g, '');
  if (withoutBracket && nameToProgress.has(withoutBracket)) {
    return nameToProgress.get(withoutBracket);
  }
  if (withoutBracketNorm && nameToProgress.has(withoutBracketNorm)) {
    return nameToProgress.get(withoutBracketNorm);
  }

  // 3. 괄호 앞부분만 추출
  const bracketIndex = trimmed.indexOf('(');
  if (bracketIndex > 0) {
    const baseName = trimmed.slice(0, bracketIndex).trim();
    if (nameToProgress.has(baseName)) {
      return nameToProgress.get(baseName);
    }
  }

  return undefined;
}

/**
 * 진행도 정보 및 현재 필터 상태를 바탕으로 뱃지 DOM 요소를 생성
 */
export function createBadgeElement(
  progress: ApostleProgress,
  activeFilter?: FilterState
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tcbe-badge-container';

  // 현재 필터링된 보드 차수(1차/2차/3차)가 지정되어 있다면 해당 차수 기준 뱃지 수치 계산
  let bokrPicked = progress.bokr.picked;
  let bokrTotal = progress.bokr.allTotal;
  let bokrRemaining = progress.bokr.remainingAll;
  let isComplete = progress.bokr.isCompleted;

  if (activeFilter && activeFilter.boardLevel !== 'all') {
    const lvl = Number(activeFilter.boardLevel);
    const bProg = progress.boards.find((b) => b.boardStepLevel === lvl);
    if (bProg) {
      bokrPicked = bProg.bokr.picked;
      bokrTotal = bProg.bokr.total;
      bokrRemaining = bProg.bokr.remaining;
      isComplete = bProg.unlocked && bProg.bokr.picked === bProg.bokr.total && bProg.bokr.total > 0;
    }
  }

  if (isComplete) {
    container.classList.add('tcbe-badge-complete');
  }

  // 1. 기본 라벨 (보크)
  const tag = document.createElement('span');
  tag.className = 'tcbe-badge-bokr-tag';
  tag.textContent = activeFilter && activeFilter.boardLevel !== 'all' ? `${activeFilter.boardLevel}차 보크` : '보크';
  container.appendChild(tag);

  // 2. 기본 카운트
  const counts = document.createElement('span');
  counts.className = 'tcbe-badge-counts';
  counts.textContent = `${bokrPicked}/${bokrTotal}`;
  container.appendChild(counts);

  // 3. 남은 개수 또는 완료 아이콘
  if (isComplete) {
    const icon = document.createElement('span');
    icon.className = 'tcbe-badge-complete-icon';
    icon.textContent = '✓';
    container.appendChild(icon);
  } else {
    const rem = document.createElement('span');
    rem.className = 'tcbe-badge-remaining';
    rem.textContent = `· 남 ${bokrRemaining}`;
    container.appendChild(rem);
  }

  // 4. 특정 스탯이 선택된 경우, 스프라이트 아이콘이 포함된 미니 태그 표시
  if (activeFilter && activeFilter.statCategory !== 'all') {
    const targetStat = activeFilter.statCategory;
    const statMeta = STAT_META_LIST.find((m) => m.key === targetStat);

    let statSummary = progress.bokr.byStat[targetStat];
    if (activeFilter.boardLevel !== 'all') {
      const lvl = Number(activeFilter.boardLevel);
      const bProg = progress.boards.find((b) => b.boardStepLevel === lvl);
      if (bProg) {
        statSummary = bProg.bokr.byStat[targetStat];
      }
    }

    if (statMeta && statSummary && statSummary.total > 0) {
      const statTag = document.createElement('span');
      const isStatDone = statSummary.remaining === 0;
      statTag.className = `tcbe-stat-highlight-tag ${isStatDone ? 'tcbe-stat-done' : ''}`;
      statTag.innerHTML = `<span class="tcbe-sprite-stat tcbe-sprite-stat-${statMeta.spriteIndex}"></span> ${statMeta.nameKo} ${statSummary.picked}/${statSummary.total}${
        isStatDone ? ' ✓' : ` (남 ${statSummary.remaining})`
      }`;
      container.appendChild(statTag);
    }
  }

  // 5. 툴팁 (차수별 및 스탯별 상세 현황)
  const tooltip = document.createElement('div');
  tooltip.className = 'tcbe-tooltip';

  const persMeta = PERSONALITY_META_LIST.find((p) => p.id === progress.personality);
  const persIconHtml = persMeta ? `<span class="tcbe-sprite-pers tcbe-sprite-pers-${persMeta.spriteIndex}"></span> ` : '';

  const header = document.createElement('div');
  header.className = 'tcbe-tt-header';
  header.innerHTML = `<span>${persIconHtml}${progress.name} (태생 ${progress.gradeDefault}성) 보크 현황</span><span>총 ${progress.bokr.picked}/${progress.bokr.allTotal}개</span>`;
  tooltip.appendChild(header);

  progress.boards.forEach((b) => {
    const row = document.createElement('div');
    row.className = 'tcbe-tt-board-row';

    const title = document.createElement('div');
    title.className = 'tcbe-tt-board-title';
    title.textContent = b.unlocked
      ? `${b.boardStepLevel}차 보드: ${b.bokr.picked}/${b.bokr.total} (남 ${b.bokr.remaining})`
      : `${b.boardStepLevel}차 보드: 미개방 (보크 ${b.bokr.total}개)`;
    row.appendChild(title);

    if (b.bokr.total > 0) {
      const grid = document.createElement('div');
      grid.className = 'tcbe-tt-stats-grid';

      for (const meta of STAT_META_LIST) {
        const s = b.bokr.byStat[meta.key];
        if (s && s.total > 0) {
          const item = document.createElement('div');
          item.className = 'tcbe-tt-stat-item';
          const isDone = b.unlocked && s.remaining === 0;
          item.innerHTML = `<span class="tcbe-tt-stat-name"><span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span>${meta.nameKo}:</span> <span class="tcbe-tt-stat-val ${
            isDone ? 'tcbe-tt-stat-done' : 'tcbe-tt-stat-rem'
          }">${s.picked}/${s.total}</span>`;
          grid.appendChild(item);
        }
      }
      row.appendChild(grid);
    }

    tooltip.appendChild(row);
  });

  const summaryRow = document.createElement('div');
  summaryRow.className = 'tcbe-tt-board-row';
  summaryRow.style.borderBottom = 'none';

  const summaryTitle = document.createElement('div');
  summaryTitle.className = 'tcbe-tt-board-title';
  summaryTitle.style.color = '#f59e0b';
  summaryTitle.textContent = '1~3차 전체 스탯별 요약:';
  summaryRow.appendChild(summaryTitle);

  const sumGrid = document.createElement('div');
  sumGrid.className = 'tcbe-tt-stats-grid';

  for (const meta of STAT_META_LIST) {
    const s = progress.bokr.byStat[meta.key];
    if (s && s.total > 0) {
      const item = document.createElement('div');
      item.className = 'tcbe-tt-stat-item';
      const isDone = s.remaining === 0;
      item.innerHTML = `<span class="tcbe-tt-stat-name"><span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span>${meta.nameKo}:</span> <span class="tcbe-tt-stat-val ${
        isDone ? 'tcbe-tt-stat-done' : 'tcbe-tt-stat-rem'
      }">${s.picked}/${s.total}${isDone ? '✓' : `(남${s.remaining})`}</span>`;
      sumGrid.appendChild(item);
    }
  }
  summaryRow.appendChild(sumGrid);
  tooltip.appendChild(summaryRow);

  container.appendChild(tooltip);

  return container;
}

/**
 * 보드 기준 필터에 따라 사도 카드 내부의 1, 2, 3차 보드 열 및 묶음 row 표시/숨김
 */
export function applyBoardLevelVisibility(card: HTMLElement, boardLevel: FilterState['boardLevel']) {
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
 * 사도 카드 내부의 보드 타일에 스탯 필터 하이라이트 테두리 적용/해제
 * (보크 타일만 대상, 황크/일반 노드/게이트 완전 제외)
 */
export function updateBoardTileHighlights(
  card: HTMLElement,
  _progress: ApostleProgress,
  activeFilter?: FilterState
) {
  // 1. 기존에 적용된 하이라이트 클래스 및 속성 초기화
  const existingHighlighted = card.querySelectorAll<HTMLElement>(
    '.tcbe-tile-highlight-rem, .tcbe-tile-highlight-done, [data-tcbe-tile-highlight]'
  );
  existingHighlighted.forEach((el) => {
    el.classList.remove('tcbe-tile-highlight-rem', 'tcbe-tile-highlight-done');
    el.removeAttribute('data-tcbe-tile-highlight');
  });

  if (!activeFilter || activeFilter.statCategory === 'all') {
    return;
  }

  const targetStat = activeFilter.statCategory;
  const statPositions = STAT_TO_POSITIONS[targetStat];
  if (!statPositions) return;

  // 2. 카드 내의 모든 보드 타일 내부 이미지 요소 탐색
  const tileImages = Array.from(
    card.querySelectorAll<HTMLElement>('div[class*="--img-board-tile"]')
  );

  tileImages.forEach((imgEl) => {
    const cls = imgEl.className;
    // imgEl의 부모인 rect 요소 (.bg-(image:--img-board-rect))
    const rectEl = (imgEl.closest('div[class*="--img-board-rect"]') as HTMLElement) || imgEl.parentElement;
    if (!rectEl) return;

    const rectCls = rectEl.className;

    // ★ 황크 타일 완전 제외 (33.3333% = 활성 황크, 66.6667% = 비활성 황크)
    if (rectCls.includes('33.3333%') || rectCls.includes('66.6667%')) {
      return;
    }

    // ★ 일반 노드 완전 제외 (0% = 활성 일반, 16.6667% = 비활성 일반)
    if (rectCls.includes('bg-position-[0%_0]') || rectCls.includes('16.6667%')) {
      return;
    }

    // ★ 게이트나 시작 타일 제외
    if (cls.includes('86.3636%') || cls.includes('bg-position-[0%_0]')) {
      return;
    }

    // 보크 타일의 활성화 / 비활성화 매칭
    const isActiveMatch = statPositions.active.some((p) => hasTilePosition(cls, p));
    const isInactiveMatch = statPositions.inactive.some((p) => hasTilePosition(cls, p));

    if (isActiveMatch || isInactiveMatch) {
      rectEl.setAttribute('data-tcbe-tile-highlight', targetStat);

      if (isActiveMatch) {
        rectEl.classList.add('tcbe-tile-highlight-done');
      } else {
        rectEl.classList.add('tcbe-tile-highlight-rem');
      }
    }
  });
}

/**
 * 사도 이름 요소를 기준으로 최상위 사도 카드 컨테이너를 탐색
 */
function findCardContainer(nameElement: Element): HTMLElement | null {
  // 1. data-slot="card" 속성을 가진 컨테이너가 있으면 최우선 반환
  const slotCard = nameElement.closest('[data-slot="card"]');
  if (slotCard) {
    return slotCard as HTMLElement;
  }

  // 2. 사도 카드 특유의 클래스 조합 확인 (bg-dialog-background, text-card-foreground 등)
  const dialogCard = nameElement.closest('.bg-dialog-background, .text-card-foreground');
  if (dialogCard) {
    return dialogCard as HTMLElement;
  }

  // 3. 상위 탐색 로직 (폴백)
  let curr: Element | null = nameElement;
  for (let i = 0; i < 8; i++) {
    if (!curr || curr === document.body) break;
    const parent = curr.parentElement;
    if (!parent) break;

    if (
      parent.tagName === 'DIV' &&
      (parent.getAttribute('data-slot') === 'card' ||
       parent.classList.contains('rounded-xxl') ||
       parent.className.includes('card') ||
       parent.className.includes('item'))
    ) {
      return parent as HTMLElement;
    }
    curr = parent;
  }
  return (nameElement.closest('div') as HTMLElement) || (nameElement.parentElement as HTMLElement);
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

  // 1. 최상위 사도 카드 요소들 직접 탐색
  const cardElements = document.querySelectorAll<HTMLElement>(
    '[data-slot="card"], div.bg-dialog-background'
  );

  const processedCards = new Set<HTMLElement>();

  cardElements.forEach((card) => {
    // 사도 이미지(img[alt]) 또는 텍스트에서 사도 이름 찾기
    const imgEl = card.querySelector<HTMLImageElement>('img[alt]');
    const imgAlt = imgEl?.getAttribute('alt')?.trim();

    let progress: ApostleProgress | undefined;
    let nameElement: HTMLElement | null = null;

    if (imgAlt) {
      progress = findProgressByName(nameToProgress, imgAlt);
    }

    const textElements = Array.from(
      card.querySelectorAll<HTMLElement>('div, span, h2, h3, h4, p, strong, b')
    );

    if (!progress) {
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

    if (!nameElement) {
      const targetNameNorm = progress.name.replace(/\s+/g, '');
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

    card.setAttribute(ATTR_APOSTLE_NAME, progress.name);
    card.setAttribute(ATTR_APOSTLE_ID, String(progress.apostleId));

    const filterKey = `${activeFilter?.statCategory || 'all'}_${activeFilter?.boardLevel || 'all'}_${activeFilter?.status || 'all'}_${activeFilter?.grade || 'all'}`;
    const existingBadge = card.querySelector('.tcbe-badge-container');

    if (!existingBadge || existingBadge.getAttribute('data-tcbe-rendered-filter') !== filterKey) {
      const newBadge = createBadgeElement(progress, activeFilter);
      newBadge.setAttribute('data-tcbe-rendered-filter', filterKey);

      if (existingBadge) {
        existingBadge.replaceWith(newBadge);
      } else if (nameElement) {
        if (nameElement.nextSibling) {
          nameElement.parentNode?.insertBefore(newBadge, nameElement.nextSibling);
        } else {
          nameElement.parentNode?.appendChild(newBadge);
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
      const existingBadge = card.querySelector('.tcbe-badge-container');

      if (!existingBadge || existingBadge.getAttribute('data-tcbe-rendered-filter') !== filterKey) {
        const newBadge = createBadgeElement(progress, activeFilter);
        newBadge.setAttribute('data-tcbe-rendered-filter', filterKey);

        if (existingBadge) {
          existingBadge.replaceWith(newBadge);
        } else {
          if (el.nextSibling) {
            el.parentNode?.insertBefore(newBadge, el.nextSibling);
          } else {
            el.parentNode?.appendChild(newBadge);
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

  cards.forEach((card) => {
    const apostleName = card.getAttribute(ATTR_APOSTLE_NAME);
    if (!apostleName) return;

    const progress = apostleProgressMap.get(apostleName);
    if (!progress) return;

    total++;

    // 1. 보드 차수별 카드 내 가시성 적용 (1차 선택 시 1차만 표시 등)
    applyBoardLevelVisibility(card, filter.boardLevel);

    // 2. 보드 타일 하이라이트 실시간 적용 (보크 타일만 대상)
    updateBoardTileHighlights(card, progress, filter);

    let isMatch = true;

    // 1. 태생 성급 필터 (1성, 2성, 3성)
    if (filter.grade !== 'all') {
      if (progress.gradeDefault !== filter.grade) {
        isMatch = false;
      }
    }

    // 2. 성격 필터
    if (isMatch && filter.personality !== 'all') {
      if (progress.personality !== filter.personality) {
        isMatch = false;
      }
    }

    // 3. 보드 차수(1차/2차/3차/전체)에 따른 판정 대상 보크 데이터 추출
    let targetPicked = progress.bokr.picked;
    let targetTotal = progress.bokr.allTotal;
    let targetRemaining = progress.bokr.remainingAll;
    let isTargetComplete = progress.bokr.isCompleted;
    let targetStatSummary = filter.statCategory !== 'all' ? progress.bokr.byStat[filter.statCategory] : null;

    if (isMatch && filter.boardLevel !== 'all') {
      const levelNum = Number(filter.boardLevel);
      const boardProg = progress.boards.find((b) => b.boardStepLevel === levelNum);
      if (boardProg) {
        targetPicked = boardProg.bokr.picked;
        targetTotal = boardProg.bokr.total;
        targetRemaining = boardProg.bokr.remaining;
        isTargetComplete = boardProg.unlocked && boardProg.bokr.picked === boardProg.bokr.total && boardProg.bokr.total > 0;
        targetStatSummary = filter.statCategory !== 'all' ? boardProg.bokr.byStat[filter.statCategory] : null;
      } else {
        isMatch = false;
      }
    }

    // 4. 스탯 지정 필터가 활성화된 경우
    if (isMatch && filter.statCategory !== 'all') {
      if (!targetStatSummary || targetStatSummary.total === 0) {
        // 선택된 보드(또는 전체)에 해당 스탯 보크가 아예 없는 사도는 숨김
        isMatch = false;
      } else {
        const isStatDone = targetStatSummary.remaining === 0 && targetStatSummary.total > 0;
        if (filter.status === 'incomplete' && isStatDone) {
          // 해당 스탯 칸을 전부 칠했으면 미완료 필터에서 숨김!
          isMatch = false;
        } else if (filter.status === 'complete' && !isStatDone) {
          // 해당 스탯 칸이 아직 남아있으면 완료 필터에서 숨김!
          isMatch = false;
        }
      }
    } else if (isMatch) {
      // 5. 전체 스탯 기준 보크 완료/미완료 판정
      if (filter.status === 'incomplete') {
        if (isTargetComplete || targetRemaining === 0) {
          // 해당 범위의 모든 보크를 전부 칠했으면 미완료 필터에서 숨김!
          isMatch = false;
        }
      } else if (filter.status === 'complete') {
        if (!isTargetComplete || targetRemaining > 0) {
          // 아직 칠해야 할 보크가 남아있으면 완료 필터에서 숨김!
          isMatch = false;
        }
      }
    }

    if (isMatch) {
      card.classList.remove('tcbe-card-hidden');
      visible++;
    } else {
      card.classList.add('tcbe-card-hidden');
    }
  });

  return { total, visible };
}

/**
 * 拡張機能バッジ・ハイライト・カード非表示状態の一括表示/非表示制御
 * （ステータス別タブなど使徒別以外の画面遷移時に完全復元）
 */
export function setBadgesVisible(visible: boolean) {
  const badges = document.querySelectorAll('.tcbe-badge-container');
  badges.forEach((b) => {
    if (visible) {
      b.classList.remove('tcbe-hidden-by-tab');
    } else {
      b.classList.add('tcbe-hidden-by-tab');
    }
  });

  if (!visible) {
    // 1. タイルハイライトの解除
    const highlights = document.querySelectorAll('.tcbe-tile-highlight-rem, .tcbe-tile-highlight-done');
    highlights.forEach((h) => {
      h.classList.remove('tcbe-tile-highlight-rem', 'tcbe-tile-highlight-done');
    });

    // 2. フィルタによる非表示クラス（tcbe-card-hidden）を全解除
    const hiddenCards = document.querySelectorAll('.tcbe-card-hidden');
    hiddenCards.forEach((c) => {
      c.classList.remove('tcbe-card-hidden');
    });

    // 3. ボード次数の表示状態をすべて展開（all）に復元
    const allCards = document.querySelectorAll<HTMLElement>(`[${ATTR_APOSTLE_NAME}]`);
    allCards.forEach((c) => {
      applyBoardLevelVisibility(c, 'all');
    });
  }
}
