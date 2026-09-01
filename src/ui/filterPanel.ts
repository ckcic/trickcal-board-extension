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
  private state: FilterState = {
    status: 'all',
    boardLevel: 'all',
    statCategory: 'all',
    personality: 'all',
    grade: 'all',
  };
  private onFilterChange: FilterChangeCallback;

  constructor(onFilterChange: FilterChangeCallback) {
    this.onFilterChange = onFilterChange;
  }

  public getState(): FilterState {
    return { ...this.state };
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
   * 필터 패널 DOM을 생성하거나 기존 컨테이너를 반환
   */
  public render(): HTMLElement {
    if (this.container && document.body.contains(this.container)) {
      return this.container;
    }

    const panel = document.createElement('div');
    panel.id = 'tcbe-filter-panel';
    panel.className = 'tcbe-panel-container';

    // ----------------------------------------------------
    // Row 1: 기본 조건 (보크 상태, 보드 차수, 태생 성급, 통계 카운터)
    // ----------------------------------------------------
    const row1 = document.createElement('div');
    row1.className = 'tcbe-panel-row';

    // 1. 보크 완료 상태 (전체/미완료/완료)
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
        if (this.state.status !== key) {
          this.state.status = key;
          this.updateButtonStylesByAttr(statusGroup, 'data-status-key', key);
          this.onFilterChange(this.getState());
        }
      });
      statusGroup.appendChild(btn);
    });
    row1.appendChild(statusGroup);

    // 2. 보드 차수 (전체/1차/2차/3차)
    const levelGroup = document.createElement('div');
    levelGroup.className = 'tcbe-panel-group';

    const levelLabel = document.createElement('span');
    levelLabel.className = 'tcbe-panel-label';
    levelLabel.textContent = '보드 기준:';
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
        if (this.state.boardLevel !== key) {
          this.state.boardLevel = key;
          this.updateButtonStylesByAttr(levelGroup, 'data-level-key', key);
          this.onFilterChange(this.getState());
        }
      });
      levelGroup.appendChild(btn);
    });
    row1.appendChild(levelGroup);

    // 3. 태생 성급 필터 (전체/3성/2성/1성)
    const gradeGroup = document.createElement('div');
    gradeGroup.className = 'tcbe-panel-group';

    const gradeLabel = document.createElement('span');
    gradeLabel.className = 'tcbe-panel-label';
    gradeLabel.textContent = '⭐ 태생 성급:';
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
        if (this.state.grade !== key) {
          this.state.grade = key;
          this.updateButtonStylesByAttr(gradeGroup, 'data-grade-key', String(key));
          this.onFilterChange(this.getState());
        }
      });
      gradeGroup.appendChild(btn);
    });
    row1.appendChild(gradeGroup);

    // 4. 통계 카운터 표시
    const statsSpan = document.createElement('div');
    statsSpan.id = 'tcbe-stats-counter';
    statsSpan.className = 'tcbe-stats-info';
    statsSpan.textContent = '데이터 불러오는 중...';
    row1.appendChild(statsSpan);

    panel.appendChild(row1);

    // ----------------------------------------------------
    // Row 2: 성격(Personality) 필터
    // ----------------------------------------------------
    const row2 = document.createElement('div');
    row2.className = 'tcbe-panel-row';

    const persGroup = document.createElement('div');
    persGroup.className = 'tcbe-panel-group';

    const persLabel = document.createElement('span');
    persLabel.className = 'tcbe-panel-label';
    persLabel.textContent = '🎭 성격별 필터:';
    persGroup.appendChild(persLabel);

    // 전체 성격 버튼
    const allPersBtn = document.createElement('button');
    allPersBtn.type = 'button';
    allPersBtn.className = `tcbe-btn tcbe-btn-pers ${this.state.personality === 'all' ? 'tcbe-active' : ''}`;
    allPersBtn.textContent = '전체 성격';
    allPersBtn.setAttribute('data-personality-id', 'all');
    allPersBtn.addEventListener('click', () => {
      if (this.state.personality !== 'all') {
        this.state.personality = 'all';
        this.updateButtonStylesByAttr(persGroup, 'data-personality-id', 'all');
        this.onFilterChange(this.getState());
      }
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
        if (this.state.personality !== meta.id) {
          this.state.personality = meta.id;
          this.updateButtonStylesByAttr(persGroup, 'data-personality-id', String(meta.id));
          this.onFilterChange(this.getState());
        }
      });
      persGroup.appendChild(btn);
    });
    row2.appendChild(persGroup);
    panel.appendChild(row2);

    // ----------------------------------------------------
    // Row 3: 스탯별 작업 필터 (스프라이트 아이콘 + 호버 툴팁)
    // ----------------------------------------------------
    const row3 = document.createElement('div');
    row3.className = 'tcbe-panel-row';

    const statGroup = document.createElement('div');
    statGroup.className = 'tcbe-panel-group';

    const statLabel = document.createElement('span');
    statLabel.className = 'tcbe-panel-label';
    statLabel.textContent = '🎯 스탯별 작업 필터:';
    statGroup.appendChild(statLabel);

    // 전체 스탯 버튼
    const allStatBtn = document.createElement('button');
    allStatBtn.type = 'button';
    allStatBtn.className = `tcbe-btn tcbe-btn-stat ${this.state.statCategory === 'all' ? 'tcbe-active' : ''}`;
    allStatBtn.textContent = '전체 스탯';
    allStatBtn.setAttribute('data-stat-key', 'all');
    allStatBtn.title = '모든 스탯의 보크 노드를 대상으로 필터링합니다.';
    allStatBtn.addEventListener('click', () => {
      if (this.state.statCategory !== 'all') {
        this.state.statCategory = 'all';
        this.updateButtonStylesByAttr(statGroup, 'data-stat-key', 'all');
        this.onFilterChange(this.getState());
      }
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
        if (this.state.statCategory !== meta.key) {
          this.state.statCategory = meta.key;
          this.updateButtonStylesByAttr(statGroup, 'data-stat-key', meta.key);
          this.onFilterChange(this.getState());
        }
      });
      statGroup.appendChild(btn);
    });
    row3.appendChild(statGroup);
    panel.appendChild(row3);

    // ----------------------------------------------------
    // Row 4: 스탯별 총 칸수/칠한 칸수/스탯 수치 요약 바 (호버 툴팁 포함)
    // ----------------------------------------------------
    const row4 = document.createElement('div');
    row4.id = 'tcbe-stat-summary-row';
    row4.className = 'tcbe-stat-summary-row';
    panel.appendChild(row4);

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
   * 필터 조건(성격, 성급, 보드 차수)에 맞추어 스탯별 총 칸 수, 칠한 칸 수, 1칸당 수치 요약 바 갱신
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
      // 태생 성급 필터
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
    label.textContent = `📊 [${scopeName}] 스탯별 보크 현황:`;
    summaryContainer.appendChild(label);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'tcbe-stat-summary-items';

    STAT_META_LIST.forEach((meta) => {
      const agg = statAggregates[meta.key];
      const isDone = agg.total > 0 && agg.remaining === 0;
      const currentValue = (agg.picked * meta.valuePerNode).toLocaleString();
      const totalValue = (agg.total * meta.valuePerNode).toLocaleString();

      const item = document.createElement('div');
      item.className = `tcbe-summary-card ${this.state.statCategory === meta.key ? 'tcbe-summary-active' : ''} ${isDone ? 'tcbe-summary-done' : ''}`;
      
      // 호버 툴팁: 1칸당 수치 및 총 증가 수치 안내
      item.title = `💡 ${meta.nameKo} 보크 (1칸당 +${meta.valuePerNode})\n• 칠한 칸: ${agg.picked}칸 (+${currentValue})\n• 남은 칸: ${agg.remaining}칸\n• 전체 칸: ${agg.total}칸 (+${totalValue})`;

      item.innerHTML = `
        <span class="tcbe-sprite-stat tcbe-sprite-stat-${meta.spriteIndex}"></span>
        <span class="tcbe-summary-name">${meta.nameKo}</span>
        <span class="tcbe-summary-val ${isDone ? 'tcbe-stat-done-text' : ''}">${agg.picked}/${agg.total}칸</span>
        <span class="tcbe-summary-badge ${isDone ? 'tcbe-badge-done-bg' : ''}">${isDone ? '완료' : `남${agg.remaining}`}</span>
      `;

      // 클릭 시 해당 스탯 필터로 안전하게 전환 (다른 필터 상태 보존)
      item.addEventListener('click', () => {
        const nextKey = this.state.statCategory === meta.key ? 'all' : meta.key;
        this.state.statCategory = nextKey;
        const panelEl = document.querySelector('#tcbe-filter-panel') as HTMLElement;
        if (panelEl) {
          this.updateButtonStylesByAttr(panelEl, 'data-stat-key', nextKey);
        }
        this.onFilterChange(this.getState());
      });

      itemsContainer.appendChild(item);

      // 상단 스탯 버튼의 툴팁도 동기화
      const btn = document.getElementById(`tcbe-btn-stat-${meta.key}`);
      if (btn) {
        btn.title = `💡 ${meta.nameKo} 보크 (1칸당 +${meta.valuePerNode})\n• 칠한 칸: ${agg.picked}/${agg.total}칸 (+${currentValue} / +${totalValue})\n• 남은 칸: ${agg.remaining}칸`;
      }
    });

    summaryContainer.appendChild(itemsContainer);
  }

  public mount(): void {
    if (document.getElementById('tcbe-filter-panel')) {
      return;
    }

    const panel = this.render();

    const searchInput = document.querySelector('input[placeholder*="사도"], input[type="text"], input[type="search"]');
    const searchContainer = searchInput?.closest('div')?.parentElement || searchInput?.closest('div');

    if (searchContainer && searchContainer.parentElement) {
      searchContainer.parentElement.insertBefore(panel, searchContainer);
      return;
    }

    const mainArea =
      document.querySelector('main') ||
      document.querySelector('#root > div') ||
      document.querySelector('#app') ||
      document.body;

    if (mainArea.firstChild) {
      mainArea.insertBefore(panel, mainArea.firstChild);
    } else {
      mainArea.appendChild(panel);
    }
  }
}
