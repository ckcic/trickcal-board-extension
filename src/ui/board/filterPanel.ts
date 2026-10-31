/**
 * @file filterPanel.ts
 * @description 트릭컬 노트의 사도별 탭 상단에 배치되는 스탯/성격/성급/보드차수별 필터 컨트롤 패널 및 스탯별 총 칸 수/수치 통계 바
 */

import { DEFAULT_FILTER_STATE } from '../../domain/filters.ts';
import { aggregateBokrStats, type StatAggregates } from '../../domain/statAggregates.ts';
import { PERSONALITY_META_LIST, STAT_META_LIST } from '../../domain/boardProgress.ts';
import { showUpdateBadge } from './updateBadge.ts';
import { getPopupLeft } from './popupPosition.ts';
import { openHwangRedistribution } from '../redistribution/hwangRedistribution.ts';
import { openBoardRecovery } from '../recovery/boardRecovery.ts';
import type {
  ProgressMap,
  FilterState,
  StatFilterTarget,
} from '../../domain/types.ts';

export interface FilterChangeCallback {
  (newState: FilterState): void;
}

type ToggleFilterKey = 'personality' | 'grade' | 'status' | 'boardLevel' | 'unlockedTier';
const PANEL_OPEN_STORAGE_KEY = 'tcbe_panel_open';
interface ToggleOption<T> { key: T; label: string; }

/** 생성과 갱신에서 같은 기본 방향·라벨·도움말을 사용한다. */
const SORT_DEFS = [
  { key: 'name', label: '이름순', initial: 'name_asc', alternate: 'name_desc',
    title: '이름 가나다순 오름차순(▴)/내림차순(▾)으로 사도를 정렬합니다.' },
  { key: 'unlocked', label: '<span class="tcbe-icon-gate"></span> 보드 해금', initial: 'unlocked_desc', alternate: 'unlocked_asc',
    title: '해금된 보드 수(3관~1관) 내림차순(▾)/오름차순(▴)으로 사도를 정렬합니다.' },
  { key: 'grade', label: '초기 성급', initial: 'grade_desc', alternate: 'grade_asc',
    title: '초기 성급(3성~1성) 내림차순(▾)/오름차순(▴)으로 사도를 정렬합니다.' },
  { key: 'personality', label: '성격순', initial: 'personality_asc', alternate: 'personality_desc',
    title: '성격(순수/냉정/광기/활발/우울/공명) 오름차순(▴)/내림차순(▾)으로 사도를 정렬합니다.' },
] as const;

export class FilterPanelController {
  private container: HTMLElement | null = null;
  private searchSlot: HTMLElement | null = null;
  private originalSearchElement: HTMLElement | null = null;
  private originalSearchParent: HTMLElement | null = null;
  private originalSearchNextSibling: Node | null = null;

  private state: FilterState = { ...DEFAULT_FILTER_STATE };
  private onFilterChange: FilterChangeCallback;

  /** 스탯 집계 캐시: 필터 조건 키 => 집계 데이터 */
  private statAggregatesCache = new Map<string, StatAggregates>();
  private summaryProgressMap: ProgressMap | null = null;
  private renderedSummaries = new WeakMap<HTMLElement, string>();

  constructor(onFilterChange: FilterChangeCallback) {
    this.onFilterChange = onFilterChange;
  }

  /**
   * 데이터 갱신 시 집계 캐시 초기화
   */
  public clearCache(): void {
    this.statAggregatesCache.clear();
    this.renderedSummaries = new WeakMap();
  }

  public getState(): FilterState {
    return { ...this.state };
  }

  /**
   * 검색창이 통합되어 있는지 확인
   */
  public hasIntegratedSearch(): boolean {
    return this.originalSearchElement !== null && document.body.contains(this.originalSearchElement);
  }

  public setVisible(visible: boolean) {
    if (this.container) {
      if (visible) {
        this.container.classList.remove('tcbe-hidden-by-tab');
      } else {
        this.container.classList.add('tcbe-hidden-by-tab');
      }
    }
  }

  /**
   * 필터 패널 DOM 생성 및 반환
   */
  public render(): HTMLElement {
    if (this.container && document.body.contains(this.container)) {
      return this.container;
    }

    const panel = document.createElement('div');
    panel.id = 'tcbe-filter-panel';
    panel.className = 'tcbe-panel-container';

    // 트릭컬 공식 스타일의 아코디언 토글 헤더 생성
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'tcbe-accordion-header';

    let isOpen = localStorage.getItem(PANEL_OPEN_STORAGE_KEY) !== 'false';
    header.setAttribute('data-state', isOpen ? 'open' : 'closed');
    header.setAttribute('aria-expanded', String(isOpen));

    header.innerHTML = `
      <div class="tcbe-accordion-title">
        <span>보크 진행도 필터</span>
        <span id="tcbe-update-badge-slot"></span>
      </div>
      <svg class="tcbe-accordion-chevron" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6"></path>
      </svg>
    `;

    // 최신 버전 업데이트 감지 비동기 실행 (신규 버전 존재 시에만 뱃지 노출)
    void showUpdateBadge(header);

    const content = document.createElement('div');
    content.className = `tcbe-accordion-content ${isOpen ? 'tcbe-open' : 'tcbe-closed'}`;
    content.setAttribute('data-state', isOpen ? 'open' : 'closed');

    header.addEventListener('click', () => {
      isOpen = !isOpen;
      localStorage.setItem(PANEL_OPEN_STORAGE_KEY, String(isOpen));
      const stateStr = isOpen ? 'open' : 'closed';
      header.setAttribute('data-state', stateStr);
      header.setAttribute('aria-expanded', String(isOpen));
      content.setAttribute('data-state', stateStr);

      if (isOpen) {
        content.classList.remove('tcbe-closed');
        content.classList.add('tcbe-open');
      } else {
        content.classList.remove('tcbe-open');
        content.classList.add('tcbe-closed');
      }
    });

    panel.appendChild(header);
    panel.appendChild(content);

    // ----------------------------------------------------
    // Row 0: 특수 계산 도구 (만개·황크 재분배, 황크·보크 회수)
    // ----------------------------------------------------
    const toolsRow = document.createElement('div');
    toolsRow.className = 'tcbe-panel-row tcbe-tools-row';

    const toolsLabel = document.createElement('span');
    toolsLabel.className = 'tcbe-panel-label';
    toolsLabel.textContent = '계산 도구:';
    toolsRow.appendChild(toolsLabel);

    const redistributionButton = document.createElement('button');
    redistributionButton.type = 'button';
    redistributionButton.className = 'tcbe-btn tcbe-btn-tool';
    redistributionButton.innerHTML = '✨ 만개·황크 재분배 <small class="tcbe-badge-tool-beta">베타</small>';
    redistributionButton.addEventListener('click', () => {
      if (this.summaryProgressMap) openHwangRedistribution(this.summaryProgressMap);
    });
    toolsRow.appendChild(redistributionButton);

    const recoveryButton = document.createElement('button');
    recoveryButton.type = 'button';
    recoveryButton.className = 'tcbe-btn tcbe-btn-tool';
    recoveryButton.innerHTML = '🧹 황크·보크 회수 계산 <small class="tcbe-badge-tool-beta">베타</small>';
    recoveryButton.addEventListener('click', () => {
      if (this.summaryProgressMap) openBoardRecovery(this.summaryProgressMap);
    });
    toolsRow.appendChild(recoveryButton);

    content.appendChild(toolsRow);

    // ----------------------------------------------------
    // Row 1: 사도 기본 속성 (성격, 초기 성급)
    // ----------------------------------------------------
    const row1 = document.createElement('div');
    row1.className = 'tcbe-panel-row';

    row1.appendChild(this.createToggleGroup('personality', '성격:', 'data-personality-id', [
      { key: 'all', label: '전체 성격' },
      ...PERSONALITY_META_LIST.map(meta => ({ key: meta.id,
        label: `<span class="tcbe-sprite-pers tcbe-sprite-pers-${meta.spriteIndex}"></span> ${meta.nameKo}` })),
    ], 'tcbe-btn-pers'));
    row1.appendChild(this.createToggleGroup('grade', '초기 성급:', 'data-grade-key', [
      { key: 'all', label: '전체' }, { key: 3, label: '3성' },
      { key: 2, label: '2성' }, { key: 1, label: '1성' },
    ]));
    content.appendChild(row1);

    // ----------------------------------------------------
    // Row 2: 보드 진행 상태, 표시 범위, 해금 관문 & 검색창/통계
    // ----------------------------------------------------
    const row2 = document.createElement('div');
    row2.className = 'tcbe-panel-row';

    row2.appendChild(this.createToggleGroup('status', '보크 상태:', 'data-status-key', [
      { key: 'all', label: '전체' }, { key: 'incomplete', label: '미완료' }, { key: 'complete', label: '완료' },
    ]));
    row2.appendChild(this.createToggleGroup('boardLevel', '표시 보드:', 'data-level-key', [
      { key: 'all', label: '전체' }, { key: '1', label: '1차' },
      { key: '2', label: '2차' }, { key: '3', label: '3차' },
    ]));
    row2.appendChild(this.createToggleGroup('unlockedTier', '<span class="tcbe-icon-gate"></span> 해금 관문:', 'data-tier-key', [
      { key: 'all', label: '전체' }, { key: 1, label: '1차' },
      { key: 2, label: '2차' }, { key: 3, label: '3차' },
    ]));

    // 2-4. 사도 이름 검색창 슬롯 (Row 2 우측)
    const searchSlot = document.createElement('div');
    searchSlot.id = 'tcbe-search-slot';
    searchSlot.className = 'tcbe-search-slot';
    row2.appendChild(searchSlot);
    this.searchSlot = searchSlot;

    // 2-5. 통계 카운터 표시 (Row 2 우측 끝)
    const statsSpan = document.createElement('div');
    statsSpan.id = 'tcbe-stats-counter';
    statsSpan.className = 'tcbe-stats-info';
    statsSpan.textContent = '데이터 불러오는 중...';
    row2.appendChild(statsSpan);

    content.appendChild(row2);

    // ----------------------------------------------------
    // Row 3: 정렬 기준 & 스탯별 작업 필터
    // ----------------------------------------------------
    const row3 = document.createElement('div');
    row3.className = 'tcbe-panel-row';

    // 3-1. 정렬 버튼 그룹 (이름순, 보드 해금 순, 초기 성급 순, 성격 순)
    const sortGroup = document.createElement('div');
    sortGroup.className = 'tcbe-panel-group tcbe-sort-group';

    const sortLabel = document.createElement('span');
    sortLabel.className = 'tcbe-panel-label';
    sortLabel.textContent = '정렬:';
    sortGroup.appendChild(sortLabel);

    SORT_DEFS.forEach(def => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tcbe-btn';
      button.setAttribute('data-sort-key', def.key);
      button.title = def.title;
      button.addEventListener('click', () => {
        this.state.sortBy = this.state.sortBy === def.initial ? def.alternate : def.initial;
        this.updateSortButtons(sortGroup);
        this.onFilterChange(this.getState());
      });
      sortGroup.appendChild(button);
    });
    this.updateSortButtons(sortGroup);

    row3.appendChild(sortGroup);

    // 3-2. 스탯별 작업 필터 (스프라이트 아이콘 + 호버 툴팁)
    const statGroup = document.createElement('div');
    statGroup.className = 'tcbe-panel-group';

    const statLabel = document.createElement('span');
    statLabel.className = 'tcbe-panel-label';
    statLabel.textContent = '스탯 필터:';
    statGroup.appendChild(statLabel);

    // 전체 스탯 버튼
    const allStatBtn = document.createElement('button');
    allStatBtn.type = 'button';
    allStatBtn.className = `tcbe-btn tcbe-btn-stat ${this.state.statCategory === 'all' ? 'tcbe-active' : ''}`;
    allStatBtn.textContent = '전체 스탯';
    allStatBtn.setAttribute('data-stat-key', 'all');
    allStatBtn.title = '모든 스탯의 보크 노드를 대상으로 필터링합니다.';
    allStatBtn.addEventListener('click', () => this.selectStat('all'));
    statGroup.appendChild(allStatBtn);

    // 개별 스탯 버튼
    STAT_META_LIST.forEach((meta) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tcbe-btn tcbe-btn-stat ${this.state.statCategory === meta.key ? 'tcbe-active' : ''}`;
      btn.innerHTML = `<span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span> ${meta.nameKo}`;
      btn.setAttribute('data-stat-key', meta.key);
      btn.id = `tcbe-btn-stat-${meta.key}`;
      btn.title = `${meta.nameKo} 보크: 1칸당 +${meta.valuePerNode}`;
      btn.addEventListener('click', () => this.selectStat(meta.key));
      statGroup.appendChild(btn);
    });
    row3.appendChild(statGroup);
    content.appendChild(row3);

    // ----------------------------------------------------
    // Row 4: 스탯별 총 칸수/칠한 칸수/스탯 수치 요약 바
    // ----------------------------------------------------
    const row4 = document.createElement('div');
    row4.id = 'tcbe-stat-summary-row';
    row4.className = 'tcbe-stat-summary-row';
    content.appendChild(row4);

    this.container = panel;
    return panel;
  }

  /** 필드별 값 타입과 기존 재클릭 시 전체 선택 동작을 유지한다. */
  private createToggleGroup<K extends ToggleFilterKey>(
    field: K, labelHtml: string, attrName: string,
    options: ToggleOption<FilterState[K]>[], buttonClass = ''
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'tcbe-panel-group';
    const label = document.createElement('span');
    label.className = 'tcbe-panel-label';
    label.innerHTML = labelHtml;
    group.appendChild(label);
    options.forEach(({ key, label }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tcbe-btn ${buttonClass} ${this.state[field] === key ? 'tcbe-active' : ''}`;
      button.innerHTML = label;
      button.setAttribute(attrName, String(key));
      button.addEventListener('click', () => {
        const nextKey = this.state[field] === key ? DEFAULT_FILTER_STATE[field] : key;
        this.state[field] = nextKey;
        this.updateButtonStylesByAttr(group, attrName, String(nextKey));
        this.onFilterChange(this.getState());
      });
      group.appendChild(button);
    });
    return group;
  }

  /** 스탯 버튼과 요약 카드가 같은 선택 상태와 알림을 사용한다. */
  private selectStat(key: StatFilterTarget): void {
    const nextKey = this.state.statCategory === key ? 'all' : key;
    this.state.statCategory = nextKey;
    if (this.container) this.updateButtonStylesByAttr(this.container, 'data-stat-key', nextKey);
    this.onFilterChange(this.getState());
  }

  /**
   * 해당 속성(attrName)을 가진 버튼들만 정확히 선별하여 tcbe-active 클래스 갱신
   */
  private updateButtonStylesByAttr(group: HTMLElement, attrName: string, activeValue: string) {
    const buttons = group.querySelectorAll<HTMLButtonElement>(`.tcbe-btn[${attrName}]`);
    buttons.forEach((b) => {
      if (b.getAttribute(attrName) === activeValue) {
        b.classList.add('tcbe-active');
      } else {
        b.classList.remove('tcbe-active');
      }
    });
  }

  /**
   * 정렬 버튼들의 활성 클래스 및 라벨(오름차순/내림차순 화살표) 갱신
   */
  private updateSortButtons(sortGroup: HTMLElement) {
    const buttons = sortGroup.querySelectorAll<HTMLButtonElement>('.tcbe-btn[data-sort-key]');
    buttons.forEach((btn) => {
      const key = btn.getAttribute('data-sort-key');
      const def = SORT_DEFS.find(item => item.key === key);
      if (!def) return;
      const isActive = this.state.sortBy === def.initial || this.state.sortBy === def.alternate;
      const direction = isActive ? this.state.sortBy : def.initial;
      btn.classList.toggle('tcbe-active', isActive);
      btn.innerHTML = `${def.label} ${direction.endsWith('_asc') ? '▴' : '▾'}`;
    });
  }

  public updateStats(
    visible: number,
    masterTotal: number,
    incompleteCount: number,
    statName?: string,
    persName?: string
  ) {
    const statsEl = document.getElementById('tcbe-stats-counter');
    if (statsEl) {
      const filters: string[] = [];
      if (persName) filters.push(persName);
      if (statName) filters.push(statName);
      const filterPrefix = filters.length > 0 ? `[${filters.join(' ')}] ` : '';
      const text = `표시: ${visible}명 / 전체 ${masterTotal}명 (${filterPrefix}미완료 ${incompleteCount}명)`;
      if (statsEl.textContent !== text) statsEl.textContent = text;
    }
  }

  /**
   * 필터 조건(성격, 성급, 보드 차수, 해금 관문)에 맞추어 스탯별 총 칸 수, 칠한 칸 수, 1칸당 수치 요약 바 갱신 (메모이제이션 적용)
   */
  public updateStatSummaryGrid(
    progressMap: ProgressMap,
    filter: FilterState
  ) {
    const summaryContainer = document.getElementById('tcbe-stat-summary-row');
    if (!summaryContainer) return;

    // 새 API 데이터는 집계와 DOM 캐시를 함께 무효화한다.
    if (this.summaryProgressMap !== progressMap) {
      this.clearCache();
      this.summaryProgressMap = progressMap;
    }

    // 캐시 키 생성 (해금관문_성급_성격_보드차수)
    const cacheKey = `${filter.unlockedTier}_${filter.grade}_${filter.personality}_${filter.boardLevel}`;
    const renderKey = `${cacheKey}_${filter.statCategory}`;
    if (this.renderedSummaries.get(summaryContainer) === renderKey) return;
    let statAggregates = this.statAggregatesCache.get(cacheKey);

    if (!statAggregates) {
      statAggregates = aggregateBokrStats(progressMap, filter);
      this.statAggregatesCache.set(cacheKey, statAggregates);
    }

    // DOM 갱신
    summaryContainer.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'tcbe-stat-summary-title';
    const scopeName = filter.boardLevel === 'all' ? '1~3차 전체' : `${filter.boardLevel}차 보드`;
    label.textContent = `[${scopeName}] 스탯별 보크 현황:`;
    summaryContainer.appendChild(label);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'tcbe-stat-summary-items';

    STAT_META_LIST.forEach((meta) => {
      const agg = statAggregates[meta.key];
      // 해당 조건에서 노드가 0칸인 스탯은 깔끔하게 숨김 처리
      if (agg.total === 0) return;

      const isDone = agg.total > 0 && agg.remaining === 0;
      const currentValue = (agg.picked * meta.valuePerNode).toLocaleString();
      const totalValue = (agg.total * meta.valuePerNode).toLocaleString();

      const item = document.createElement('div');
      item.className = `tcbe-summary-card ${filter.statCategory === meta.key ? 'tcbe-summary-active' : ''} ${isDone ? 'tcbe-summary-done' : ''}`;

      // 사도별 뱃지 스타일의 커스텀 툴팁 DOM 생성
      const tooltip = document.createElement('div');
      tooltip.className = 'tcbe-summary-tooltip';
      tooltip.innerHTML = `
        <div class="tcbe-tt-header">
          <span><span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span> ${meta.nameKo} 보크 현황</span>
          <span class="tcbe-sum-tt-per-node">1칸당 +${meta.valuePerNode}</span>
        </div>
        <div class="tcbe-sum-tt-body">
          <div class="tcbe-sum-tt-row">
            <span class="tcbe-sum-tt-label">칠한 칸 수:</span>
            <span class="tcbe-sum-tt-val ${isDone ? 'tcbe-tt-stat-done' : ''}">${agg.picked} / ${agg.total}칸 (남 ${agg.remaining}칸)</span>
          </div>
          <div class="tcbe-sum-tt-row">
            <span class="tcbe-sum-tt-label">현재 스탯 증가량:</span>
            <span class="tcbe-sum-tt-val tcbe-sum-tt-val-curr">+${currentValue}</span>
          </div>
          <div class="tcbe-sum-tt-row">
            <span class="tcbe-sum-tt-label">최대 스탯 증가량:</span>
            <span class="tcbe-sum-tt-val">+${totalValue}</span>
          </div>
        </div>
      `;

      item.innerHTML = `
        <span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span>
        <span class="tcbe-summary-name">${meta.nameKo}</span>
        <span class="tcbe-summary-val ${isDone ? 'tcbe-stat-done-text' : ''}">${agg.picked}/${agg.total}칸</span>
        <span class="tcbe-summary-badge ${isDone ? 'tcbe-badge-done-bg' : ''}">${isDone ? '완료' : `남${agg.remaining}`}</span>
      `;
      item.appendChild(tooltip);

      // 스마트 툴팁 위치 조절 (좁은 모바일 화면에서도 좌/우 경계를 넘지 않도록 보정)
      item.addEventListener('mouseenter', () => {
        const rect = item.getBoundingClientRect();
        const screenWidth = document.documentElement?.clientWidth || window.innerWidth;
        const tooltipWidth = tooltip.offsetWidth || 260;
        tooltip.style.right = 'auto';
        tooltip.style.left = `${getPopupLeft(rect.left, rect.width, tooltipWidth, screenWidth)}px`;
        if (rect.left + rect.width / 2 > screenWidth / 2) {
          tooltip.style.setProperty('--sum-chevron-left', 'auto');
          tooltip.style.setProperty('--sum-chevron-right', '24px');
        } else {
          tooltip.style.setProperty('--sum-chevron-left', '24px');
          tooltip.style.setProperty('--sum-chevron-right', 'auto');
        }
      });

      // 클릭 시 해당 스탯 필터로 안전하게 전환 (다른 필터 상태 보존)
      item.addEventListener('click', (e) => {
        // 툴팁 클릭 이벤트 전파 방지
        e.stopPropagation();
        this.selectStat(meta.key);
      });

      itemsContainer.appendChild(item);
    });

    summaryContainer.appendChild(itemsContainer);
    this.renderedSummaries.set(summaryContainer, renderKey);
  }

  /**
   * 사도 검색창을 패널 내에 통합하고, 사도 카드 목록 상단에 패널을 마운트
   */
  public mount(): void {
    const existingPanel = document.getElementById('tcbe-filter-panel');

    // 사이트 본래의 사도명 검색 입력창 검색
    const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="사도"]');

    // 사도별 화면이 아닌 경우(검색창이 존재하지 않고, 이전에 이동한 요소도 없는 경우) 마운트하지 않음
    if (!searchInput && !this.originalSearchElement) {
      return;
    }

    const panel = this.render();

    // 검색 입력창 또는 그 래퍼 컨테이너를 패널 내의 검색 슬롯으로 이동
    if (searchInput && this.searchSlot) {
      const searchContainer =
        (searchInput.closest('div.relative, div[class*="relative"]') as HTMLElement) ||
        searchInput.parentElement ||
        searchInput;

      if (searchContainer && !this.searchSlot.contains(searchContainer)) {
        this.originalSearchElement = searchContainer;
        this.originalSearchParent = searchContainer.parentElement;
        this.originalSearchNextSibling = searchContainer.nextSibling;
        this.searchSlot.appendChild(searchContainer);
      }
    }

    if (existingPanel && document.body.contains(existingPanel)) {
      return;
    }

    // 검색 컨테이너의 원래 부모 요소(또는 사도 그리드 컨테이너 직전)에 패널 삽입
    if (this.originalSearchParent && this.originalSearchParent.parentElement) {
      this.originalSearchParent.parentElement.insertBefore(panel, this.originalSearchParent);
      return;
    }

    // 대체 삽입 위치 탐색 (사도 카드 목록 상단)
    const cardGrid = document.querySelector('div.grid, div[class*="grid"], [data-slot="card"]')?.closest('div.grid, div[class*="grid"]');
    if (cardGrid && cardGrid.parentElement) {
      cardGrid.parentElement.insertBefore(panel, cardGrid);
      return;
    }

    const mainArea = document.querySelector('main') || document.querySelector('#root > div') || document.querySelector('#app');
    if (mainArea && mainArea.firstChild) {
      mainArea.insertBefore(panel, mainArea.firstChild);
    }
  }

  /**
   * 패널을 DOM에서 제거하고, 사도 검색창을 원래 DOM 위치로 복원
   */
  public unmount(): void {
    // 1. 이동했던 검색창을 원래 DOM 트리 위치로 복원
    if (this.originalSearchElement && this.originalSearchParent) {
      try {
        if (this.originalSearchNextSibling && this.originalSearchParent.contains(this.originalSearchNextSibling)) {
          this.originalSearchParent.insertBefore(this.originalSearchElement, this.originalSearchNextSibling);
        } else {
          this.originalSearchParent.appendChild(this.originalSearchElement);
        }
      } catch (err) {
        console.warn('[TCBE] Error restoring search element:', err);
      }
      this.originalSearchElement = null;
      this.originalSearchParent = null;
      this.originalSearchNextSibling = null;
    }

    // 2. 패널 요소를 DOM에서 안전하게 제거
    const panelEl = document.getElementById('tcbe-filter-panel') || this.container;
    if (panelEl && panelEl.parentElement) {
      panelEl.parentElement.removeChild(panelEl);
    }
    this.container = null;
  }
}
