/**
 * @file filterPanel.ts
 * @description 트릭컬 노트의 사도별 탭 상단에 배치되는 스탯/성격/성급/보드차수별 필터 컨트롤 패널 및 스탯별 총 칸 수/수치 통계 바
 */

import { PERSONALITY_META_LIST, STAT_META_LIST } from '../domain/boardProgress.ts';
import type {
  ApostleProgress,
  BoardFilterLevel,
  BokrFilterStatus,
  FilterState,
  GradeFilterTarget,
  PersonalityFilterTarget,
  StatCategory,
  StatFilterTarget,
} from '../domain/types.ts';

export interface FilterChangeCallback {
  (newState: FilterState): void;
}

export class FilterPanelController {
  private container: HTMLElement | null = null;
  private searchSlot: HTMLElement | null = null;
  private originalSearchElement: HTMLElement | null = null;
  private originalSearchParent: HTMLElement | null = null;
  private originalSearchNextSibling: Node | null = null;

  private state: FilterState = {
    status: 'all',
    boardLevel: 'all',
    statCategory: 'all',
    personality: 'all',
    grade: 'all',
    unlockedTier: 'all',
    sortBy: 'name_asc',
  };
  private onFilterChange: FilterChangeCallback;

  constructor(onFilterChange: FilterChangeCallback) {
    this.onFilterChange = onFilterChange;
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

    let isOpen = localStorage.getItem('tcbe_panel_open') !== 'false';
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
    try {
      const currentVer = chrome.runtime?.getManifest?.()?.version || '1.0.4';
      checkForUpdate(currentVer).then((updateInfo) => {
        if (updateInfo?.hasUpdate) {
          const slot = header.querySelector('#tcbe-update-badge-slot');
          if (slot) {
            slot.innerHTML = `
              <a href="${updateInfo.releaseUrl}" target="_blank" class="tcbe-update-badge" title="새로운 버전(v${updateInfo.latestVersion})이 출시되었습니다! 클릭하여 다운로드 페이지로 이동">
                🚀 v${updateInfo.latestVersion} 업데이트
              </a>
            `;
            slot.querySelector('a')?.addEventListener('click', (e) => e.stopPropagation());
          }
        }
      });
    } catch {
      // 무시
    }

    const content = document.createElement('div');
    content.className = `tcbe-accordion-content ${isOpen ? 'tcbe-open' : 'tcbe-closed'}`;
    content.setAttribute('data-state', isOpen ? 'open' : 'closed');

    header.addEventListener('click', () => {
      isOpen = !isOpen;
      localStorage.setItem('tcbe_panel_open', String(isOpen));
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
    // Row 1: 사도 기본 속성 (성격, 초기 성급)
    // ----------------------------------------------------
    const row1 = document.createElement('div');
    row1.className = 'tcbe-panel-row';

    // 1-1. 성격(Personality) 필터
    const persGroup = document.createElement('div');
    persGroup.className = 'tcbe-panel-group';

    const persLabel = document.createElement('span');
    persLabel.className = 'tcbe-panel-label';
    persLabel.textContent = '성격:';
    persGroup.appendChild(persLabel);

    // 전체 성격 버튼
    const allPersBtn = document.createElement('button');
    allPersBtn.type = 'button';
    allPersBtn.className = `tcbe-btn tcbe-btn-pers ${this.state.personality === 'all' ? 'tcbe-active' : ''}`;
    allPersBtn.textContent = '전체 성격';
    allPersBtn.setAttribute('data-personality-id', 'all');
    allPersBtn.addEventListener('click', () => {
      this.state.personality = 'all';
      this.updateButtonStylesByAttr(persGroup, 'data-personality-id', 'all');
      this.onFilterChange(this.getState());
    });
    persGroup.appendChild(allPersBtn);

    // 개별 성격 버튼
    PERSONALITY_META_LIST.forEach((meta) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tcbe-btn tcbe-btn-pers ${this.state.personality === meta.id ? 'tcbe-active' : ''}`;
      btn.innerHTML = `<span class="tcbe-sprite-pers tcbe-sprite-pers-${meta.spriteIndex}"></span> ${meta.nameKo}`;
      btn.setAttribute('data-personality-id', String(meta.id));
      btn.addEventListener('click', () => {
        const nextKey = this.state.personality === meta.id ? 'all' : meta.id;
        this.state.personality = nextKey;
        this.updateButtonStylesByAttr(persGroup, 'data-personality-id', String(nextKey));
        this.onFilterChange(this.getState());
      });
      persGroup.appendChild(btn);
    });
    row1.appendChild(persGroup);

    // 1-2. 초기 성급 필터 (전체/3성/2성/1성)
    const gradeGroup = document.createElement('div');
    gradeGroup.className = 'tcbe-panel-group';

    const gradeLabel = document.createElement('span');
    gradeLabel.className = 'tcbe-panel-label';
    gradeLabel.textContent = '초기 성급:';
    gradeGroup.appendChild(gradeLabel);

    const gradeButtons: Array<{ key: GradeFilterTarget; label: string }> = [
      { key: 'all', label: '전체' },
      { key: 3, label: '3성' },
      { key: 2, label: '2성' },
      { key: 1, label: '1성' },
    ];

    gradeButtons.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tcbe-btn ${this.state.grade === key ? 'tcbe-active' : ''}`;
      btn.textContent = label;
      btn.setAttribute('data-grade-key', String(key));
      btn.addEventListener('click', () => {
        const nextKey: GradeFilterTarget = this.state.grade === key && key !== 'all' ? 'all' : key;
        this.state.grade = nextKey;
        this.updateButtonStylesByAttr(gradeGroup, 'data-grade-key', String(nextKey));
        this.onFilterChange(this.getState());
      });
      gradeGroup.appendChild(btn);
    });
    row1.appendChild(gradeGroup);
    content.appendChild(row1);

    // ----------------------------------------------------
    // Row 2: 보드 진행 상태, 표시 범위, 해금 관문 & 검색창/통계
    // ----------------------------------------------------
    const row2 = document.createElement('div');
    row2.className = 'tcbe-panel-row';

    // 2-1. 보크 완료 상태 (전체/미완료/완료)
    const statusGroup = document.createElement('div');
    statusGroup.className = 'tcbe-panel-group';

    const statusLabel = document.createElement('span');
    statusLabel.className = 'tcbe-panel-label';
    statusLabel.textContent = '보크 상태:';
    statusGroup.appendChild(statusLabel);

    const statusButtons: Array<{ key: BokrFilterStatus; label: string }> = [
      { key: 'all', label: '전체' },
      { key: 'incomplete', label: '미완료' },
      { key: 'complete', label: '완료' },
    ];

    statusButtons.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tcbe-btn ${this.state.status === key ? 'tcbe-active' : ''}`;
      btn.textContent = label;
      btn.setAttribute('data-status-key', key);
      btn.addEventListener('click', () => {
        const nextKey: BokrFilterStatus = this.state.status === key && key !== 'all' ? 'all' : key;
        this.state.status = nextKey;
        this.updateButtonStylesByAttr(statusGroup, 'data-status-key', nextKey);
        this.onFilterChange(this.getState());
      });
      statusGroup.appendChild(btn);
    });
    row2.appendChild(statusGroup);

    // 2-2. 표시 보드 (전체/1차/2차/3차)
    const levelGroup = document.createElement('div');
    levelGroup.className = 'tcbe-panel-group';

    const levelLabel = document.createElement('span');
    levelLabel.className = 'tcbe-panel-label';
    levelLabel.textContent = '표시 보드:';
    levelGroup.appendChild(levelLabel);

    const levelButtons: Array<{ key: BoardFilterLevel; label: string }> = [
      { key: 'all', label: '전체' },
      { key: '1', label: '1차' },
      { key: '2', label: '2차' },
      { key: '3', label: '3차' },
    ];

    levelButtons.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tcbe-btn ${this.state.boardLevel === key ? 'tcbe-active' : ''}`;
      btn.textContent = label;
      btn.setAttribute('data-level-key', key);
      btn.addEventListener('click', () => {
        const nextKey: BoardFilterLevel = this.state.boardLevel === key && key !== 'all' ? 'all' : key;
        this.state.boardLevel = nextKey;
        this.updateButtonStylesByAttr(levelGroup, 'data-level-key', nextKey);
        this.onFilterChange(this.getState());
      });
      levelGroup.appendChild(btn);
    });
    row2.appendChild(levelGroup);

    // 2-3. 해금 관문 필터 (전체 / 1차 / 2차 / 3차)
    const tierGroup = document.createElement('div');
    tierGroup.className = 'tcbe-panel-group';

    const tierLabel = document.createElement('span');
    tierLabel.className = 'tcbe-panel-label';
    tierLabel.innerHTML = '<span class="tcbe-icon-gate"></span> 해금 관문:';
    tierGroup.appendChild(tierLabel);

    const tierButtons: Array<{ key: UnlockedTierFilter; label: string }> = [
      { key: 'all', label: '전체' },
      { key: 1, label: '1차' },
      { key: 2, label: '2차' },
      { key: 3, label: '3차' },
    ];

    tierButtons.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tcbe-btn ${this.state.unlockedTier === key ? 'tcbe-active' : ''}`;
      btn.textContent = label;
      btn.setAttribute('data-tier-key', String(key));
      btn.addEventListener('click', () => {
        const nextKey: UnlockedTierFilter = this.state.unlockedTier === key && key !== 'all' ? 'all' : key;
        this.state.unlockedTier = nextKey;
        this.updateButtonStylesByAttr(tierGroup, 'data-tier-key', String(nextKey));
        this.onFilterChange(this.getState());
      });
      tierGroup.appendChild(btn);
    });
    row2.appendChild(tierGroup);

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

    // 이름순 (name_asc ↔ name_desc)
    const nameSortBtn = document.createElement('button');
    nameSortBtn.type = 'button';
    nameSortBtn.className = `tcbe-btn ${this.state.sortBy.startsWith('name') ? 'tcbe-active' : ''}`;
    nameSortBtn.setAttribute('data-sort-key', 'name');
    nameSortBtn.textContent = this.state.sortBy === 'name_desc' ? '이름순 ▾' : '이름순 ▴';
    nameSortBtn.title = '이름 가나다순 오름차순(▴)/내림차순(▾)으로 사도를 정렬합니다.';
    nameSortBtn.addEventListener('click', () => {
      this.state.sortBy = this.state.sortBy === 'name_asc' ? 'name_desc' : 'name_asc';
      this.updateSortButtons(sortGroup);
      this.onFilterChange(this.getState());
    });
    sortGroup.appendChild(nameSortBtn);

    // 보드 해금 순 (unlocked_desc ↔ unlocked_asc)
    const unlockSortBtn = document.createElement('button');
    unlockSortBtn.type = 'button';
    unlockSortBtn.className = `tcbe-btn ${this.state.sortBy.startsWith('unlocked') ? 'tcbe-active' : ''}`;
    unlockSortBtn.setAttribute('data-sort-key', 'unlocked');
    unlockSortBtn.innerHTML = `<span class="tcbe-icon-gate"></span> 보드 해금 ${this.state.sortBy === 'unlocked_asc' ? '▴' : '▾'}`;
    unlockSortBtn.title = '해금된 보드 수(3관~1관) 내림차순(▾)/오름차순(▴)으로 사도를 정렬합니다.';
    unlockSortBtn.addEventListener('click', () => {
      this.state.sortBy = this.state.sortBy === 'unlocked_desc' ? 'unlocked_asc' : 'unlocked_desc';
      this.updateSortButtons(sortGroup);
      this.onFilterChange(this.getState());
    });
    sortGroup.appendChild(unlockSortBtn);

    // 초기 성급 순 (grade_desc ↔ grade_asc)
    const gradeSortBtn = document.createElement('button');
    gradeSortBtn.type = 'button';
    gradeSortBtn.className = `tcbe-btn ${this.state.sortBy.startsWith('grade') ? 'tcbe-active' : ''}`;
    gradeSortBtn.setAttribute('data-sort-key', 'grade');
    gradeSortBtn.textContent = this.state.sortBy === 'grade_asc' ? '초기 성급 ▴' : '초기 성급 ▾';
    gradeSortBtn.title = '초기 성급(3성~1성) 내림차순(▾)/오름차순(▴)으로 사도를 정렬합니다.';
    gradeSortBtn.addEventListener('click', () => {
      this.state.sortBy = this.state.sortBy === 'grade_desc' ? 'grade_asc' : 'grade_desc';
      this.updateSortButtons(sortGroup);
      this.onFilterChange(this.getState());
    });
    sortGroup.appendChild(gradeSortBtn);

    // 성격 순 (personality_asc ↔ personality_desc)
    const persSortBtn = document.createElement('button');
    persSortBtn.type = 'button';
    persSortBtn.className = `tcbe-btn ${this.state.sortBy.startsWith('personality') ? 'tcbe-active' : ''}`;
    persSortBtn.setAttribute('data-sort-key', 'personality');
    persSortBtn.textContent = this.state.sortBy === 'personality_desc' ? '성격순 ▾' : '성격순 ▴';
    persSortBtn.title = '성격(순수/냉정/광기/활발/우울/공명) 오름차순(▴)/내림차순(▾)으로 사도를 정렬합니다.';
    persSortBtn.addEventListener('click', () => {
      this.state.sortBy = this.state.sortBy === 'personality_asc' ? 'personality_desc' : 'personality_asc';
      this.updateSortButtons(sortGroup);
      this.onFilterChange(this.getState());
    });
    sortGroup.appendChild(persSortBtn);

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
    allStatBtn.addEventListener('click', () => {
      this.state.statCategory = 'all';
      const panelEl = document.querySelector('#tcbe-filter-panel') as HTMLElement;
      if (panelEl) {
        this.updateButtonStylesByAttr(panelEl, 'data-stat-key', 'all');
      }
      this.onFilterChange(this.getState());
    });
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
      btn.addEventListener('click', () => {
        const nextKey = this.state.statCategory === meta.key ? 'all' : meta.key;
        this.state.statCategory = nextKey;
        const panelEl = document.querySelector('#tcbe-filter-panel') as HTMLElement;
        if (panelEl) {
          this.updateButtonStylesByAttr(panelEl, 'data-stat-key', nextKey);
        }
        this.onFilterChange(this.getState());
      });
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
      if (key === 'name') {
        const isActive = this.state.sortBy.startsWith('name');
        btn.classList.toggle('tcbe-active', isActive);
        btn.textContent = this.state.sortBy === 'name_desc' ? '이름순 ▾' : '이름순 ▴';
      } else if (key === 'unlocked') {
        const isActive = this.state.sortBy.startsWith('unlocked');
        btn.classList.toggle('tcbe-active', isActive);
        btn.innerHTML = `<span class="tcbe-icon-gate"></span> 보드 해금 ${this.state.sortBy === 'unlocked_asc' ? '▴' : '▾'}`;
      } else if (key === 'grade') {
        const isActive = this.state.sortBy.startsWith('grade');
        btn.classList.toggle('tcbe-active', isActive);
        btn.textContent = this.state.sortBy === 'grade_asc' ? '초기 성급 ▴' : '초기 성급 ▾';
      } else if (key === 'personality') {
        const isActive = this.state.sortBy.startsWith('personality');
        btn.classList.toggle('tcbe-active', isActive);
        btn.textContent = this.state.sortBy === 'personality_desc' ? '성격순 ▾' : '성격순 ▴';
      }
    });
  }

  public updateStats(
    visible: number,
    totalCards: number,
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
      statsEl.textContent = `표시: ${visible}명 / 전체 ${masterTotal}명 (${filterPrefix}미완료 ${incompleteCount}명)`;
    }
  }

  /**
   * 필터 조건(성격, 성급, 보드 차수, 해금 관문)에 맞추어 스탯별 총 칸 수, 칠한 칸 수, 1칸당 수치 요약 바 갱신
   */
  public updateStatSummaryGrid(
    progressMap: Map<string, ApostleProgress>,
    filter: FilterState
  ) {
    const summaryContainer = document.getElementById('tcbe-stat-summary-row');
    if (!summaryContainer) return;

    const uniqueApostles = new Set<ApostleProgress>();
    progressMap.forEach((prog) => uniqueApostles.add(prog));

    // 스탯별 칸 수 집계
    const statAggregates: Record<StatCategory, { picked: number; total: number; remaining: number }> = {
      hp: { picked: 0, total: 0, remaining: 0 },
      atk_phys: { picked: 0, total: 0, remaining: 0 },
      atk_mag: { picked: 0, total: 0, remaining: 0 },
      def_phys: { picked: 0, total: 0, remaining: 0 },
      def_mag: { picked: 0, total: 0, remaining: 0 },
      crit: { picked: 0, total: 0, remaining: 0 },
      crit_dmg: { picked: 0, total: 0, remaining: 0 },
      crit_res: { picked: 0, total: 0, remaining: 0 },
      crit_dmg_res: { picked: 0, total: 0, remaining: 0 },
    };

    uniqueApostles.forEach((prog) => {
      // 해금 관문 필터
      if (filter.unlockedTier !== 'all' && prog.unlockedBoardCount !== filter.unlockedTier) {
        return;
      }
      // 초기 성급 필터
      if (filter.grade !== 'all' && prog.gradeDefault !== filter.grade) {
        return;
      }
      // 성격 필터
      if (filter.personality !== 'all' && prog.personality !== filter.personality) {
        return;
      }

      STAT_META_LIST.forEach((meta) => {
        if (filter.boardLevel === 'all') {
          const s = prog.bokr.byStat[meta.key];
          if (s) {
            statAggregates[meta.key].picked += s.picked;
            statAggregates[meta.key].total += s.total;
            statAggregates[meta.key].remaining += s.remaining;
          }
        } else {
          const lvl = Number(filter.boardLevel);
          const bProg = prog.boards.find((b) => b.boardStepLevel === lvl);
          if (bProg) {
            const s = bProg.bokr.byStat[meta.key];
            if (s) {
              statAggregates[meta.key].picked += s.picked;
              statAggregates[meta.key].total += s.total;
              statAggregates[meta.key].remaining += s.remaining;
            }
          }
        }
      });
    });

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
      item.className = `tcbe-summary-card ${this.state.statCategory === meta.key ? 'tcbe-summary-active' : ''} ${isDone ? 'tcbe-summary-done' : ''}`;

      // 사도별 뱃지 스타일의 커스텀 툴팁 DOM 생성
      const tooltip = document.createElement('div');
      tooltip.className = 'tcbe-summary-tooltip';
      tooltip.innerHTML = `
        <div class="tcbe-tt-header">
          <span><span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span> ${meta.nameKo} 보크 현황</span>
          <span style="color: #38bdf8;">1칸당 +${meta.valuePerNode}</span>
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

      // 스마트 툴팁 위치 조절 (좌/우 뷰포트에 맞게 자동 정렬)
      item.addEventListener('mouseenter', () => {
        const rect = item.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        if (rect.left + rect.width / 2 > screenWidth / 2) {
          tooltip.style.left = 'auto';
          tooltip.style.right = '0';
          tooltip.style.setProperty('--sum-chevron-left', 'auto');
          tooltip.style.setProperty('--sum-chevron-right', '24px');
        } else {
          tooltip.style.left = '0';
          tooltip.style.right = 'auto';
          tooltip.style.setProperty('--sum-chevron-left', '24px');
          tooltip.style.setProperty('--sum-chevron-right', 'auto');
        }
      });

      // 클릭 시 해당 스탯 필터로 안전하게 전환 (다른 필터 상태 보존)
      item.addEventListener('click', (e) => {
        // 툴팁 클릭 이벤트 전파 방지
        e.stopPropagation();
        const nextKey = this.state.statCategory === meta.key ? 'all' : meta.key;
        this.state.statCategory = nextKey;
        const panelEl = document.querySelector('#tcbe-filter-panel') as HTMLElement;
        if (panelEl) {
          this.updateButtonStylesByAttr(panelEl, 'data-stat-key', nextKey);
        }
        this.onFilterChange(this.getState());
      });

      itemsContainer.appendChild(item);
    });

    summaryContainer.appendChild(itemsContainer);
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
