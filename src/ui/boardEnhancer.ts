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
      statTag.innerHTML = `<span class="tcbe-sprite-stat tcbe-sprite-stat-${statMeta.spriteIndex}"></span> ${statMeta.nameKo} ${statSummary.picked}/${statSummary.total}${
        isStatDone ? ' ✓' : ` (남 ${statSummary.remaining})`
      }`;
      container.appendChild(statTag);
    }
  }

  // 5. 툴팁 지연 생성 (초기 대량 DOM 생성 및 Forced Reflow 방지)
  let tooltip: HTMLElement | null = null;

  function ensureTooltip(): HTMLElement {
    if (tooltip) return tooltip;

    const tt = document.createElement('div');
    tt.className = 'tcbe-tooltip';

    const persMeta = PERSONALITY_META_LIST.find((p) => p.id === progress.personality);
    const persIconHtml = persMeta ? `<span class="tcbe-sprite-pers tcbe-sprite-pers-${persMeta.spriteIndex}"></span> ` : '';

    const header = document.createElement('div');
    header.className = 'tcbe-tt-header';
    header.innerHTML = `<span>${persIconHtml}${progress.name} (태생 ${progress.gradeDefault}성) <span class="tcbe-pastel-icon tcbe-pastel-epic"></span> 상급칸 현황</span><span>총 ${progress.bokr.picked}/${progress.bokr.allTotal}개</span>`;
    tt.appendChild(header);

    progress.boards.forEach((b) => {
      const row = document.createElement('div');
      row.className = 'tcbe-tt-board-row';

      const title = document.createElement('div');
      title.className = 'tcbe-tt-board-title';
      title.textContent = b.unlocked
        ? `${b.boardStepLevel}차 보드: ${b.bokr.picked}/${b.bokr.total} (남 ${b.bokr.remaining})`
        : `${b.boardStepLevel}차 보드: 미개방 (상급칸 ${b.bokr.total}개)`;
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

      tt.appendChild(row);
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
    tt.appendChild(summaryRow);

    container.appendChild(tt);
    tooltip = tt;
    return tt;
  }

  // 스마트 툴팁 위치 조절 (호버 시에만 툴팁을 생성하고 위치 계산)
  container.addEventListener('mouseenter', () => {
    const tt = ensureTooltip();
    const rect = container.getBoundingClientRect();
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // 1. 좌우 위치 조절
    if (rect.left + rect.width / 2 > screenWidth / 2) {
      tt.style.left = 'auto';
      tt.style.right = '-6px';
      tt.style.setProperty('--chevron-left', 'auto');
      tt.style.setProperty('--chevron-right', '28px');
    } else {
      tt.style.left = '-6px';
      tt.style.right = 'auto';
      tt.style.setProperty('--chevron-left', '28px');
      tt.style.setProperty('--chevron-right', 'auto');
    }

    // 2. 상하 위치 조절 (위쪽 공간 부족 시 아래쪽으로 자동 전개)
    const tooltipHeight = tt.offsetHeight || 260;
    const availableTop = rect.top;
    const availableBottom = screenHeight - rect.bottom;

    if (availableTop < tooltipHeight && availableBottom > availableTop) {
      tt.style.bottom = 'auto';
      tt.style.top = 'calc(100% + 8px)';
      tt.classList.add('tcbe-popup-bottom');
    } else {
      tt.style.top = 'auto';
      tt.style.bottom = 'calc(100% + 8px)';
      tt.classList.remove('tcbe-popup-bottom');
    }
  });

  return container;
}

/**
 * 일반칸(nodeType: 3)의 상세 진행도 및 스탯 표시용 버튼 & 팝업 DOM 요소 생성
 */
export function createNormalStatElement(progress: ApostleProgress): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tcbe-normal-badge-container';

  const normal = progress.normal;
  const isComplete = normal.totalNodes > 0 && normal.pickedNodes === normal.totalNodes;
  const pct = normal.totalNodes > 0 ? ((normal.pickedNodes / normal.totalNodes) * 100).toFixed(1) : '0.0';

  if (isComplete) {
    container.classList.add('tcbe-normal-complete');
  }

  // 1. 버튼 요소
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tcbe-normal-btn';
  btn.title = '일반칸 스탯 상세 보기 (클릭 시 창 고정)';
  btn.innerHTML = `
    <span class="tcbe-normal-tag"><span class="tcbe-pastel-icon tcbe-pastel-basic"></span><span>일반칸</span></span>
    <span class="tcbe-normal-counts">${normal.pickedNodes}/${normal.totalNodes}</span>
    ${isComplete ? '<span class="tcbe-normal-complete-icon">✓</span>' : `<span class="tcbe-normal-pct">${pct}%</span>`}
  `;
  container.appendChild(btn);

  // 2. 팝업 요소 지연 생성 (호버 또는 클릭 전까지 수천 개의 DOM 노드 생성 방지)
  let popup: HTMLElement | null = null;

  function ensurePopup(): HTMLElement {
    if (popup) return popup;

    popup = document.createElement('div');
    popup.className = 'tcbe-normal-popup';

    // 헤더 영역
    const persMeta = PERSONALITY_META_LIST.find((p) => p.id === progress.personality);
    const persIconHtml = persMeta ? `<span class="tcbe-sprite-pers tcbe-sprite-pers-${persMeta.spriteIndex}"></span> ` : '';

    const header = document.createElement('div');
    header.className = 'tcbe-np-header';
    header.innerHTML = `
      <div class="tcbe-np-title">
        ${persIconHtml}<strong>${progress.name}</strong> 일반칸 스탯 현황
      </div>
      <div class="tcbe-np-header-right">
        <span class="tcbe-np-total-badge">총 ${normal.pickedNodes}/${normal.totalNodes} (${pct}%)</span>
        <span class="tcbe-np-breakdown-badge"><span class="tcbe-pastel-icon-mini tcbe-pastel-basic"></span>기본 ${normal.small.picked}/${normal.small.total} · <span class="tcbe-pastel-icon-mini tcbe-pastel-average"></span>강화 ${normal.large.picked}/${normal.large.total}</span>
        <button type="button" class="tcbe-np-close-btn" title="닫기" aria-label="닫기">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
    popup.appendChild(header);

    // 1, 2, 3차 보드별 진행도
    const boardsSection = document.createElement('div');
    boardsSection.className = 'tcbe-np-boards-section';

    const boardsHeader = document.createElement('div');
    boardsHeader.className = 'tcbe-np-section-header';
    boardsHeader.innerHTML = `
      <span class="tcbe-np-section-title">차수별 진행도:</span>
      <span class="tcbe-np-section-hint">💡 카드 클릭: 차수별 보기 · 일반칸 버튼 클릭: 창 고정</span>
    `;
    boardsSection.appendChild(boardsHeader);

    // 차수별 필터 탭 바
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tcbe-np-tabs-container';
    tabsContainer.innerHTML = `
      <button type="button" class="tcbe-np-tab-btn tcbe-active" data-tier="all">전체 (1~3차)</button>
      <button type="button" class="tcbe-np-tab-btn" data-tier="0">1차 보드</button>
      <button type="button" class="tcbe-np-tab-btn" data-tier="1">2차 보드</button>
      <button type="button" class="tcbe-np-tab-btn" data-tier="2">3차 보드</button>
    `;
    boardsSection.appendChild(tabsContainer);

    const boardsGrid = document.createElement('div');
    boardsGrid.className = 'tcbe-np-boards-grid';

    const cardElements: HTMLElement[] = [];

    progress.boards.forEach((b, bIdx) => {
      const bNormal = b.normal;
      const bPct = bNormal.totalNodes > 0 ? ((bNormal.pickedNodes / bNormal.totalNodes) * 100).toFixed(0) : '0';
      const bDone = b.unlocked && bNormal.totalNodes > 0 && bNormal.pickedNodes === bNormal.totalNodes;

      const bCard = document.createElement('div');
      bCard.className = `tcbe-np-board-card ${bDone ? 'tcbe-np-board-done' : ''} ${!b.unlocked ? 'tcbe-np-board-locked' : ''}`;
      bCard.setAttribute('data-tier', String(bIdx));
      bCard.title = `${b.boardStepLevel}차 보드 스탯 상세 보기`;

      let statusHtml = '';
      let subStatusHtml = '';

      if (!b.unlocked) {
        statusHtml = `<span class="tcbe-np-board-status tcbe-locked">미개방 (${bNormal.totalNodes}칸)</span>`;
        subStatusHtml = `<div class="tcbe-np-board-sub-status tcbe-locked"><span class="tcbe-pastel-icon-mini tcbe-pastel-basic"></span>기본 ${bNormal.small.total} · <span class="tcbe-pastel-icon-mini tcbe-pastel-average"></span>강화 ${bNormal.large.total}</div>`;
      } else if (bDone) {
        statusHtml = `<span class="tcbe-np-board-status tcbe-done">${bNormal.pickedNodes}/${bNormal.totalNodes} ✓</span>`;
        subStatusHtml = `<div class="tcbe-np-board-sub-status tcbe-done"><span class="tcbe-pastel-icon-mini tcbe-pastel-basic"></span>기본 ${bNormal.small.picked}/${bNormal.small.total} · <span class="tcbe-pastel-icon-mini tcbe-pastel-average"></span>강화 ${bNormal.large.picked}/${bNormal.large.total}</div>`;
      } else {
        statusHtml = `<span class="tcbe-np-board-status">${bNormal.pickedNodes}/${bNormal.totalNodes} (남 ${bNormal.remainingNodes})</span>`;
        subStatusHtml = `<div class="tcbe-np-board-sub-status"><span class="tcbe-pastel-icon-mini tcbe-pastel-basic"></span>기본 ${bNormal.small.picked}/${bNormal.small.total} · <span class="tcbe-pastel-icon-mini tcbe-pastel-average"></span>강화 ${bNormal.large.picked}/${bNormal.large.total}</div>`;
      }

      // 해당 차수에 속한 스탯 종류와 칸 수 미니 요약 칩들
      const statsChipsHtml = STAT_META_LIST.map((meta) => {
        const s = bNormal.stats[meta.key];
        const sTotal = s ? s.smallTotal + s.largeTotal : 0;
        if (sTotal === 0) return '';
        const sPicked = s ? s.smallPicked + s.largePicked : 0;
        const sDone = b.unlocked && sPicked === sTotal;
        return `<span class="tcbe-np-card-stat-chip ${sDone ? 'tcbe-chip-done' : ''}" title="${meta.nameKo}: ${sPicked}/${sTotal}칸">
          <span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span>
          <span>${sPicked}/${sTotal}</span>
        </span>`;
      }).join('');

      bCard.innerHTML = `
        <div class="tcbe-np-board-top-row">
          <div class="tcbe-np-board-label">${b.boardStepLevel}차 보드</div>
          ${statusHtml}
        </div>
        ${subStatusHtml}
        <div class="tcbe-np-board-bar-bg">
          <div class="tcbe-np-board-bar-fill" style="width: ${b.unlocked ? bPct : '0'}%"></div>
        </div>
        <div class="tcbe-np-board-stats-list">${statsChipsHtml}</div>
      `;

      bCard.addEventListener('click', () => {
        switchTier(bIdx);
      });

      boardsGrid.appendChild(bCard);
      cardElements.push(bCard);
    });
    boardsSection.appendChild(boardsGrid);
    popup.appendChild(boardsSection);

    // 스탯별 상세 테이블 섹션
    const tableSection = document.createElement('div');
    tableSection.className = 'tcbe-np-table-section';

    const tableTitle = document.createElement('div');
    tableTitle.className = 'tcbe-np-section-title';
    tableSection.appendChild(tableTitle);

    const table = document.createElement('table');
    table.className = 'tcbe-np-table';
    tableSection.appendChild(table);
    popup.appendChild(tableSection);

    // 현재 선택된 탭 상태 ('all' 또는 보드 인덱스 0, 1, 2)
    let currentTier: 'all' | number = 'all';

    function renderTable() {
      const isAll = currentTier === 'all';

      // 1. 타이틀 업데이트
      if (isAll) {
        tableTitle.innerHTML = `스탯별 상세 <span>(전체 1~3차 통합)</span>:`;
      } else {
        const bObj = progress.boards[currentTier];
        const isUnlocked = bObj ? bObj.unlocked : false;
        tableTitle.innerHTML = `${currentTier + 1}차 보드 스탯별 상세 ${isUnlocked ? '' : '<span style="color:#ef4444; font-size:11px;">(미개방 보드)</span>'}:`;
      }

      // 2. 헤더 구성
      table.innerHTML = `
        <thead>
          <tr>
            <th style="text-align: left;">스탯</th>
            <th style="text-align: right;">획득 스탯</th>
            <th style="text-align: right;">미획득 잔여</th>
            <th style="text-align: right;">총 스탯</th>
            <th style="text-align: center;">1칸당 상승량</th>
            <th style="text-align: center;">칸 수 (기본 / 강화)</th>
            <th style="text-align: center; width: 64px;">달성률</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = table.querySelector('tbody')!;
      const activeStats = isAll ? normal.stats : progress.boards[currentTier]?.normal.stats;
      let hasStat = false;

      for (const meta of STAT_META_LIST) {
        const s = activeStats ? activeStats[meta.key] : null;
        if (s && s.total > 0) {
          hasStat = true;
          const statPct = ((s.picked / s.total) * 100).toFixed(0);
          const isStatDone = s.remaining === 0;

          const isSmallDone = s.smallTotal > 0 && s.smallPicked === s.smallTotal;
          const isLargeDone = s.largeTotal > 0 && s.largePicked === s.largeTotal;

          const tr = document.createElement('tr');
          tr.className = isStatDone ? 'tcbe-np-tr-done' : '';
          tr.innerHTML = `
            <td class="tcbe-np-td-stat">
              <span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span>
              <span>${meta.nameKo}</span>
            </td>
            <td class="tcbe-np-td-val tcbe-np-val-picked">+${s.picked.toLocaleString()}</td>
            <td class="tcbe-np-td-val tcbe-np-val-rem">${isStatDone ? '<span class="tcbe-np-done-tag">완료</span>' : `+${s.remaining.toLocaleString()}`}</td>
            <td class="tcbe-np-td-val tcbe-np-val-total">+${s.total.toLocaleString()}</td>
            <td class="tcbe-np-td-unit-val">
              <span class="tcbe-np-unit-chip tcbe-np-pill-small">
                <span class="tcbe-pastel-icon-mini tcbe-pastel-basic"></span>+${s.smallUnitValue.toLocaleString()}
              </span>
              <span class="tcbe-np-unit-chip tcbe-np-pill-large">
                <span class="tcbe-pastel-icon-mini tcbe-pastel-average"></span>+${s.largeUnitValue.toLocaleString()}
              </span>
            </td>
            <td class="tcbe-np-td-breakdown">
              <span class="tcbe-np-pill-small ${isSmallDone ? 'tcbe-pill-done' : ''}">
                <span class="tcbe-pastel-icon-mini tcbe-pastel-basic"></span>기본 ${s.smallPicked}/${s.smallTotal}
              </span>
              <span class="tcbe-np-pill-large ${isLargeDone ? 'tcbe-pill-done' : ''}">
                <span class="tcbe-pastel-icon-mini tcbe-pastel-average"></span>강화 ${s.largePicked}/${s.largeTotal}
              </span>
            </td>
            <td class="tcbe-np-td-pct">
              <div class="tcbe-np-mini-pct-wrap">
                <span class="tcbe-np-mini-pct-text">${statPct}%</span>
                <div class="tcbe-np-mini-bar-bg">
                  <div class="tcbe-np-mini-bar-fill" style="width: ${statPct}%"></div>
                </div>
              </div>
            </td>
          `;
          tbody.appendChild(tr);
        }
      }

      if (!hasStat) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="7" style="text-align:center; padding: 14px; color:#94a3b8;">해당 차수에는 일반칸 스탯 데이터가 없습니다.</td>`;
        tbody.appendChild(tr);
      }
    }

    function switchTier(tier: 'all' | number) {
      currentTier = tier;

      tabsContainer.querySelectorAll<HTMLButtonElement>('.tcbe-np-tab-btn').forEach((btn) => {
        const bTier = btn.getAttribute('data-tier');
        if (bTier === String(tier)) {
          btn.classList.add('tcbe-active');
        } else {
          btn.classList.remove('tcbe-active');
        }
      });

      cardElements.forEach((card, idx) => {
        if (tier === idx) {
          card.classList.add('tcbe-card-selected');
        } else {
          card.classList.remove('tcbe-card-selected');
        }
      });

      renderTable();
    }

    tabsContainer.querySelectorAll<HTMLButtonElement>('.tcbe-np-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-tier');
        switchTier(t === 'all' ? 'all' : Number(t));
      });
    });

    renderTable();

    // 닫기 버튼 이벤트
    const closeBtn = popup.querySelector('.tcbe-np-close-btn');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      container.classList.remove('tcbe-pinned');
    });

    popup.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    container.appendChild(popup);
    return popup;
  }

  // 스마트 위치 조정 (호버 시에만 팝업을 생성하고 위치 계산)
  const updatePopupPosition = () => {
    const p = ensurePopup();
    const rect = container.getBoundingClientRect();
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // 1. 좌우 위치 조절
    if (rect.left + rect.width / 2 > screenWidth / 2) {
      p.style.left = 'auto';
      p.style.right = '-6px';
      p.style.setProperty('--np-chevron-left', 'auto');
      p.style.setProperty('--np-chevron-right', '28px');
    } else {
      p.style.left = '-6px';
      p.style.right = 'auto';
      p.style.setProperty('--np-chevron-left', '28px');
      p.style.setProperty('--np-chevron-right', 'auto');
    }

    // 2. 상하 위치 조절 (상단 헤더 잘림 방지: 위쪽 공간 부족 시 아래쪽으로 자동 전개)
    const popupHeight = p.offsetHeight || 520;
    const availableTop = rect.top;
    const availableBottom = screenHeight - rect.bottom;

    if (availableTop < popupHeight && availableBottom > availableTop) {
      p.style.bottom = 'auto';
      p.style.top = 'calc(100% + 8px)';
      p.classList.add('tcbe-popup-bottom');
    } else {
      p.style.top = 'auto';
      p.style.bottom = 'calc(100% + 8px)';
      p.classList.remove('tcbe-popup-bottom');
    }
  };

  container.addEventListener('mouseenter', () => {
    updatePopupPosition();
  });

  // 클릭에 의한 핀 고정(토글) 제어
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    ensurePopup();
    const isPinned = container.classList.toggle('tcbe-pinned');
    if (isPinned) {
      updatePopupPosition();
      // 다른 핀 고정 팝업 닫기
      document.querySelectorAll('.tcbe-normal-badge-container.tcbe-pinned').forEach((other) => {
        if (other !== container) {
          other.classList.remove('tcbe-pinned');
        }
      });
    }
  });

  return container;
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

// 외부 클릭 시 핀 고정된 일반칸 팝업 전체 닫기
if (typeof document !== 'undefined') {
  document.addEventListener('click', () => {
    document.querySelectorAll('.tcbe-normal-badge-container.tcbe-pinned').forEach((el) => {
      el.classList.remove('tcbe-pinned');
    });
  });
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
 * 사도 카드 내부의 보드 타일에 스탯 필터 하이라이트 테두리 적용/해제 (캐시 기반 고속화)
 * (보크 타일만 대상, 황크/일반 노드/게이트 완전 제외)
 */
export function updateBoardTileHighlights(
  card: HTMLElement,
  _progress: ApostleProgress,
  activeFilter?: FilterState
) {
  const targetStat = activeFilter?.statCategory || 'all';
  const currentStat = card.getAttribute('data-tcbe-highlight-stat') || 'all';

  // 캐시 확인: 이미 동일한 하이라이트 상태가 적용되어 있다면 수천 개 타일 DOM 순회 생략
  if (currentStat === targetStat) {
    return;
  }
  card.setAttribute('data-tcbe-highlight-stat', targetStat);

  // 1. 기존에 적용된 하이라이트 요소 초기화
  const existingHighlighted = card.querySelectorAll<HTMLElement>(
    '.tcbe-tile-highlight-rem, .tcbe-tile-highlight-done, [data-tcbe-tile-highlight]'
  );
  existingHighlighted.forEach((el) => {
    el.classList.remove('tcbe-tile-highlight-rem', 'tcbe-tile-highlight-done');
    el.removeAttribute('data-tcbe-tile-highlight');
  });

  if (targetStat === 'all') {
    return;
  }

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
  // 모달 다이얼로그 내부 요소는 사도 카드 대상에서 제외
  if (nameElement.closest('[role="dialog"], [data-slot="dialog-content"], [data-slot="dialog-overlay"]')) {
    return null;
  }

  // 1. data-slot="card" 속성을 가진 컨테이너가 있으면 최우선 반환
  const slotCard = nameElement.closest('[data-slot="card"]');
  if (slotCard) {
    return slotCard as HTMLElement;
  }

  // 2. 사도 카드 특유의 클래스 조합 확인 (bg-dialog-background, text-card-foreground 등)
  const dialogCard = nameElement.closest('.bg-dialog-background, .text-card-foreground');
  if (dialogCard && !dialogCard.closest('[role="dialog"], [data-slot="dialog-content"]')) {
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
      !parent.closest('[role="dialog"], [data-slot="dialog-content"]') &&
      (parent.getAttribute('data-slot') === 'card' ||
       parent.classList.contains('rounded-xxl') ||
       parent.className.includes('card') ||
       parent.className.includes('item'))
    ) {
      return parent as HTMLElement;
    }
    curr = parent;
  }
  return null;
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

    if (!cachedName) {
      card.setAttribute(ATTR_APOSTLE_NAME, progress.name);
      card.setAttribute(ATTR_APOSTLE_ID, String(progress.apostleId));
    }

    const filterKey = `${activeFilter?.statCategory || 'all'}_${activeFilter?.boardLevel || 'all'}_${activeFilter?.status || 'all'}_${activeFilter?.grade || 'all'}`;
    const existingRow = card.querySelector('.tcbe-badge-row');
    const existingOldBadge = card.querySelector('.tcbe-badge-container');

    // 이미 올바른 필터 조건으로 렌더링된 배지 행이 있다면 DOM 재생성 및 교체 생략
    if (!existingRow || existingRow.getAttribute('data-tcbe-rendered-filter') !== filterKey) {
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

      if (!existingRow || existingRow.getAttribute('data-tcbe-rendered-filter') !== filterKey) {
        const newRow = createApostleEnhanceRow(progress, activeFilter);
        newRow.setAttribute('data-tcbe-rendered-filter', filterKey);

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
  const sortedNames = Array.from(apostleProgressMap.values())
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

    let isMatch = true;

    // 1. 초기 성급 필터 (1성, 2성, 3성)
    if (filter.grade !== 'all') {
      if (progress.gradeDefault !== filter.grade) {
        isMatch = false;
      }
    }

    // 2. 해금 관문 필터 (1차, 2차, 3차)
    if (isMatch && filter.unlockedTier !== 'all') {
      if (progress.unlockedBoardCount !== filter.unlockedTier) {
        isMatch = false;
      }
    }

    // 3. 성격 필터
    if (isMatch && filter.personality !== 'all') {
      if (progress.personality !== filter.personality) {
        isMatch = false;
      }
    }

    // 4. 보드 차수(1차/2차/3차/전체)에 따른 판정 대상 보크 데이터 추출
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

    // 5. 스탯 지정 필터가 활성화된 경우
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
      // 6. 전체 스탯 기준 보크 완료/미완료 판정
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
