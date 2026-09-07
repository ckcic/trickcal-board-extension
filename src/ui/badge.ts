import { escapeHtml } from './html.ts';
/**
 * @file badge.ts
 * @description 사도 카드에 삽입되는 상급칸(보크) 진행도 뱃지 및 상세 툴팁 포털 DOM 생성 모듈
 */

import { PERSONALITY_META_LIST, STAT_META_LIST } from '../domain/boardProgress.ts';
import type { ApostleProgress, FilterState } from '../domain/types.ts';

/**
 * 상급칸(보크) 상세 현황 툴팁 내부 HTML 생성
 */
function generateBokrTooltipHtml(progress: ApostleProgress): string {
  const persMeta = PERSONALITY_META_LIST.find((p) => p.id === progress.personality);
  const persIconHtml = persMeta ? `<span class="tcbe-sprite-pers tcbe-sprite-pers-${persMeta.spriteIndex}"></span> ` : '';

  let html = `
    <div class="tcbe-tt-header">
      <span>${persIconHtml}${escapeHtml(progress.name)} (태생 ${progress.gradeDefault}성) <span class="tcbe-pastel-icon tcbe-pastel-epic"></span> 상급칸 현황</span>
      <span>총 ${progress.bokr.picked}/${progress.bokr.allTotal}개</span>
    </div>
  `;

  progress.boards.forEach((b) => {
    const titleText = b.unlocked
      ? `${b.boardStepLevel}차 보드: ${b.bokr.picked}/${b.bokr.total} (남 ${b.bokr.remaining})`
      : `${b.boardStepLevel}차 보드: 미개방 (상급칸 ${b.bokr.total}개)`;

    html += `<div class="tcbe-tt-board-row"><div class="tcbe-tt-board-title">${titleText}</div>`;

    if (b.bokr.total > 0) {
      html += `<div class="tcbe-tt-stats-grid">`;
      for (const meta of STAT_META_LIST) {
        const s = b.bokr.byStat[meta.key];
        if (s && s.total > 0) {
          const isDone = b.unlocked && s.remaining === 0;
          html += `<div class="tcbe-tt-stat-item">
            <span class="tcbe-tt-stat-name"><span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span>${meta.nameKo}:</span>
            <span class="tcbe-tt-stat-val ${isDone ? 'tcbe-tt-stat-done' : 'tcbe-tt-stat-rem'}">${s.picked}/${s.total}</span>
          </div>`;
        }
      }
      html += `</div>`;
    }

    html += `</div>`;
  });

  html += `
    <div class="tcbe-tt-board-row" style="border-bottom: none;">
      <div class="tcbe-tt-board-title" style="color: #f59e0b;">1~3차 전체 스탯별 요약:</div>
      <div class="tcbe-tt-stats-grid">
  `;

  for (const meta of STAT_META_LIST) {
    const s = progress.bokr.byStat[meta.key];
    if (s && s.total > 0) {
      const isDone = s.remaining === 0;
      html += `<div class="tcbe-tt-stat-item">
        <span class="tcbe-tt-stat-name"><span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span>${meta.nameKo}:</span>
        <span class="tcbe-tt-stat-val ${isDone ? 'tcbe-tt-stat-done' : 'tcbe-tt-stat-rem'}">${s.picked}/${s.total}${isDone ? '✓' : `(남${s.remaining})`}</span>
      </div>`;
    }
  }

  html += `</div></div>`;
  return html;
}

// 전역 상급칸 포털 툴팁 싱글톤 (최상위 레이어로 어떤 카드/모달 쌓임 맥락에도 갇히지 않음)
let globalPortalTooltipEl: HTMLElement | null = null;
let globalPortalTooltipInner: HTMLElement | null = null;
let currentHoveredContainer: HTMLElement | null = null;
let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureGlobalPortalTooltip(): { el: HTMLElement; inner: HTMLElement } {
  if (globalPortalTooltipEl && globalPortalTooltipInner) {
    return { el: globalPortalTooltipEl, inner: globalPortalTooltipInner };
  }

  const el = document.createElement('div');
  el.className = 'tcbe-portal-tooltip font-onemobile';
  el.style.display = 'none';

  const inner = document.createElement('div');
  inner.className = 'tcbe-portal-tooltip-inner font-onemobile';
  inner.style.fontFamily = '"ONE-Mobile-POP", var(--font-one-mobile-pop), "Pretendard", "SUIT", sans-serif';
  el.appendChild(inner);

  el.addEventListener('mouseenter', () => {
    if (tooltipHideTimer) {
      clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    }
  });

  el.addEventListener('mouseleave', () => {
    hideGlobalPortalTooltip();
  });

  const mountTarget = document.getElementById('root') || document.body;
  mountTarget.appendChild(el);
  globalPortalTooltipEl = el;
  globalPortalTooltipInner = inner;

  window.addEventListener('scroll', () => {
    if (currentHoveredContainer && globalPortalTooltipEl && globalPortalTooltipEl.style.display !== 'none') {
      updatePortalTooltipPosition(currentHoveredContainer, globalPortalTooltipEl);
    }
  }, { passive: true });

  return { el, inner };
}

function updatePortalTooltipPosition(container: HTMLElement, el: HTMLElement) {
  const rect = container.getBoundingClientRect();
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // 1. 좌우 위치 (position: fixed 기준)
  if (rect.left + rect.width / 2 > screenWidth / 2) {
    el.style.left = 'auto';
    el.style.right = `${Math.max(8, screenWidth - rect.right - 6)}px`;
    el.style.setProperty('--chevron-left', 'auto');
    el.style.setProperty('--chevron-right', '28px');
  } else {
    el.style.left = `${Math.max(8, rect.left - 6)}px`;
    el.style.right = 'auto';
    el.style.setProperty('--chevron-left', '28px');
    el.style.setProperty('--chevron-right', 'auto');
  }

  // 2. 상하 위치 (position: fixed 기준)
  const tooltipHeight = el.offsetHeight || 260;
  const availableTop = rect.top;
  const availableBottom = screenHeight - rect.bottom;

  if (availableTop < tooltipHeight && availableBottom > availableTop) {
    el.style.bottom = 'auto';
    el.style.top = `${rect.bottom}px`;
    el.classList.add('tcbe-popup-bottom');
  } else {
    el.style.top = 'auto';
    el.style.bottom = `${screenHeight - rect.top}px`;
    el.classList.remove('tcbe-popup-bottom');
  }
}

function showGlobalPortalTooltip(container: HTMLElement, progress: ApostleProgress) {
  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }
  currentHoveredContainer = container;
  const { el, inner } = ensureGlobalPortalTooltip();

  inner.innerHTML = generateBokrTooltipHtml(progress);
  el.style.display = 'block';
  updatePortalTooltipPosition(container, el);
}

function hideGlobalPortalTooltip(immediate = false) {
  if (immediate) {
    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    if (globalPortalTooltipEl) globalPortalTooltipEl.style.display = 'none';
    currentHoveredContainer = null;
    return;
  }
  if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
  tooltipHideTimer = setTimeout(() => {
    if (globalPortalTooltipEl) globalPortalTooltipEl.style.display = 'none';
    currentHoveredContainer = null;
  }, 50);
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

  // 1. 기본 라벨 (상급칸)
  const tag = document.createElement('span');
  tag.className = 'tcbe-badge-bokr-tag';
  const bokrLabel = activeFilter && activeFilter.boardLevel !== 'all' ? `${activeFilter.boardLevel}차 상급칸` : '상급칸';
  tag.innerHTML = `<span class="tcbe-pastel-icon tcbe-pastel-epic"></span><span>${bokrLabel}</span>`;
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
      statTag.innerHTML = `<span class="tcbe-sprite-stat tcbe-sprite-stat-${statMeta.spriteIndex}"></span> ${statMeta.nameKo} ${statSummary.picked}/${statSummary.total}${isStatDone ? ' ✓' : ` (남 ${statSummary.remaining})`
        }`;
      container.appendChild(statTag);
    }
  }

  // 5. 상급칸 툴팁 연결 (호버 시 전역 포털로 즉시 최상위 노출)
  container.addEventListener('mouseenter', () => {
    showGlobalPortalTooltip(container, progress);
  });

  container.addEventListener('mouseleave', () => {
    hideGlobalPortalTooltip();
  });

  return container;
}
