import { escapeHtml } from './html.ts';
/**
 * @file normalStat.ts
 * @description 사도 카드에 삽입되는 일반칸(nodeType: 3)의 상세 진행도 팝업 및 스탯 테이블 DOM 생성 모듈
 */

import { PERSONALITY_META_LIST, STAT_META_LIST } from '../domain/boardProgress.ts';
import type { ApostleProgress } from '../domain/types.ts';

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

    // 물리적 틈새 0px 밀착을 위한 내부 카드 래퍼 (외부 래퍼는 버튼에 0px로 붙고 투명 패딩으로 8px 시각 간격 유지)
    const inner = document.createElement('div');
    inner.className = 'tcbe-normal-popup-inner';
    popup.appendChild(inner);

    // 헤더 영역
    const persMeta = PERSONALITY_META_LIST.find((p) => p.id === progress.personality);
    const persIconHtml = persMeta ? `<span class="tcbe-sprite-pers tcbe-sprite-pers-${persMeta.spriteIndex}"></span> ` : '';

    const header = document.createElement('div');
    header.className = 'tcbe-np-header';
    header.innerHTML = `
      <div class="tcbe-np-title">
        ${persIconHtml}${escapeHtml(progress.name)} (태생 ${progress.gradeDefault}성) <span class="tcbe-pastel-icon tcbe-pastel-basic"></span> 일반칸 현황
      </div>
      <div class="tcbe-np-header-right">
        <span class="tcbe-np-total-badge">총 ${normal.pickedNodes}/${normal.totalNodes} (${pct}%)</span>
        <span class="tcbe-np-breakdown-badge"><span class="tcbe-pastel-icon-mini tcbe-pastel-basic"></span>기본 ${normal.small.picked}/${normal.small.total} · <span class="tcbe-pastel-icon-mini tcbe-pastel-average"></span>강화 ${normal.large.picked}/${normal.large.total}</span>
      </div>
    `;
    inner.appendChild(header);

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
    inner.appendChild(boardsSection);

    // 스탯별 상세 테이블 섹션
    const tableSection = document.createElement('div');
    tableSection.className = 'tcbe-np-table-section';

    const tableTitle = document.createElement('div');
    tableTitle.className = 'tcbe-np-section-title';
    tableSection.appendChild(tableTitle);

    const table = document.createElement('table');
    table.className = 'tcbe-np-table';
    tableSection.appendChild(table);
    inner.appendChild(tableSection);

    // 현재 선택된 탭 상태 ('all' 또는 보드 인덱스 0, 1, 2)
    let currentTier: 'all' | number = 'all';

    function renderTable() {
      const tier = currentTier;
      const isAll = tier === 'all';

      // 1. 타이틀 업데이트
      if (isAll) {
        tableTitle.innerHTML = `스탯별 상세 <span>(전체 1~3차 통합)</span>:`;
      } else {
        const bObj = progress.boards[tier];
        const isUnlocked = bObj ? bObj.unlocked : false;
        tableTitle.innerHTML = `${tier + 1}차 보드 스탯별 상세 ${isUnlocked ? '' : '<span style="color:#ef4444; font-size:11px;">(미개방 보드)</span>'}:`;
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
      const activeStats = isAll ? normal.stats : progress.boards[tier]?.normal.stats;
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
    // 물리적 틈새 0px(100%) 밀착 배치 - 시각적 8px 간격은 내부 투명 패딩으로 완벽 보장
    const popupHeight = p.offsetHeight || 520;
    const availableTop = rect.top;
    const availableBottom = screenHeight - rect.bottom;

    if (availableTop < popupHeight && availableBottom > availableTop) {
      p.style.bottom = 'auto';
      p.style.top = '100%';
      p.classList.add('tcbe-popup-bottom');
    } else {
      p.style.top = 'auto';
      p.style.bottom = '100%';
      p.classList.remove('tcbe-popup-bottom');
    }
  };

  // 호버 열기/닫기 이벤트 (물리적으로 0px 밀착되었으므로 지연 타이머 없이 즉시 열고 닫음)
  container.addEventListener('mouseenter', () => {
    // 다른 카드가 이미 핀 고정되어 있다면 현재 카드의 호버 팝업은 띄우지 않음
    const hasPinned = document.querySelector('.tcbe-normal-badge-container.tcbe-pinned');
    if (hasPinned && hasPinned !== container) {
      return;
    }
    container.classList.add('tcbe-open');
    updatePopupPosition();
  });

  container.addEventListener('mouseleave', () => {
    if (container.classList.contains('tcbe-pinned')) {
      return; // 핀 고정된 상태에서는 마우스가 나가도 절대 닫지 않음
    }
    container.classList.remove('tcbe-open');
  });

  // 클릭에 의한 핀 고정(토글) 제어
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    ensurePopup();
    const isPinned = container.classList.toggle('tcbe-pinned');
    if (isPinned) {
      container.classList.add('tcbe-open');
      updatePopupPosition();
      // 다른 핀 고정 팝업 닫기
      document.querySelectorAll('.tcbe-normal-badge-container.tcbe-pinned').forEach((other) => {
        if (other !== container) {
          other.classList.remove('tcbe-pinned', 'tcbe-open');
        }
      });
    } else {
      container.classList.remove('tcbe-open');
    }
  });

  return container;
}

// 외부 클릭 시 열려 있거나 핀 고정된 일반칸 팝업 전체 닫기
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = e.target as Node | null;
    document.querySelectorAll('.tcbe-normal-badge-container').forEach((el) => {
      // 클릭 대상이 해당 컨테이너(버튼 또는 팝업 모달) 내부가 아니라면 닫기
      if (!target || !el.contains(target)) {
        el.classList.remove('tcbe-pinned', 'tcbe-open');
      }
    });
  });
}
