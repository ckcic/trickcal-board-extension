/**
 * @file bokrModal.ts
 * @description 보크(상급 크레파스) 타일 클릭 시 목표 칸 및 도달 최단 경로와 필요 재화(하급/중급/상급 크레파스, 골드)를 안내하는 모달 컴포넌트
 */

import type { BokrPathResult } from '../domain/boardPathfinder.ts';
import {
  getNodeStatCategories,
  getStatCategoryFromStatType,
  PERSONALITY_META_LIST,
  STAT_META_LIST,
} from '../domain/boardProgress.ts';
import type { ApostleProgress, MasterBoardNode, ResourceCostSummary } from '../domain/types.ts';
import { formatGold } from './boardEnhancer.ts';
import { escapeHtml } from './html.ts';

export interface BokrModalOptions {
  progress: ApostleProgress;
  boardIndex: number; // 0: 1차, 1: 2차, 2: 3차
  targetNode: MasterBoardNode;
  nodeIndex: number;
  pathResult: BokrPathResult;
  onToggleHighlight?: (enabled: boolean) => void;
  onClose?: () => void;
}

let activeModalContainer: HTMLElement | null = null;
let activeKeydownListener: ((e: KeyboardEvent) => void) | null = null;
let isHighlightActive = true;
let activeOnClose: (() => void) | undefined;

/**
 * 활성화된 보크 상세 모달 닫기
 */
export function closeBokrModal(): void {
  const onClose = activeOnClose;
  activeOnClose = undefined;
  if (activeKeydownListener) {
    window.removeEventListener('keydown', activeKeydownListener);
    activeKeydownListener = null;
  }

  if (activeModalContainer) {
    activeModalContainer.remove();
    activeModalContainer = null;
  }
  onClose?.();
}

/** 경로가 황크나 꽃잎을 거치더라도 필요한 재화를 누락하지 않는다. */
function renderCostItems(cost: ResourceCostSummary): string {
  const items: Array<[number, string, string]> = [
    [cost.basicCrayon, 'pastel-basic', '하급 크레파스'],
    [cost.averageCrayon, 'pastel-average', '중급 크레파스'],
    [cost.epicCrayon, 'pastel-epic', '상급 크레파스'],
    [cost.ultraCrayon, 'pastel-ultra', '최상급 크레파스'],
    [cost.wateringCan || 0, '', '물뿌리개'],
    [cost.gold, 'icon-gold', '골드'],
  ];
  return items.filter(([value]) => value > 0).map(([value, icon, label]) => `
    <div class="tcbe-cost-item">
      <span class="tcbe-cost-icon ${icon}" aria-hidden="true">${icon ? '' : '💧'}</span>
      <span class="tcbe-cost-text">${label} <strong>${icon === 'icon-gold' ? formatGold(value) : `${value}개`}</strong></span>
    </div>`).join('') || '<div class="tcbe-cost-text">추가 재화 없음</div>';
}

/**
 * 보크(상급 크레파스) 타일 안내 모달 표시
 */
export function showBokrModal(options: BokrModalOptions): void {
  // 이미 열린 모달이 있다면 먼저 닫기
  closeBokrModal();

  const { progress, boardIndex, targetNode, pathResult, onToggleHighlight, onClose } = options;
  isHighlightActive = true;
  activeOnClose = onClose;

  // 1. 사도 및 스탯 메타정보 조회
  const personality = PERSONALITY_META_LIST.find((p) => p.id === progress.personality);
  const nodeStats = getNodeStatCategories(targetNode);
  const primaryStatKey = nodeStats[0] || 'hp';
  const defaultStatMeta = STAT_META_LIST[0]!;
  const statMeta = STAT_META_LIST.find((s) => s.key === primaryStatKey) ?? defaultStatMeta;

  const actualStat = targetNode.stats?.find(stat => getStatCategoryFromStatType(stat.statType) === primaryStatKey);
  const statIncreaseText = `+${actualStat?.statValue ?? statMeta.valuePerNode}`;

  const boardName = `${boardIndex + 1}차 보드`;
  const gridCoords = targetNode.grid
    ? `(x: ${targetNode.grid.x}, y: ${targetNode.grid.y})`
    : '';

  // 2. 모달 컨테이너 생성
  const container = document.createElement('div');
  container.id = 'tcbe-bokr-modal-container';
  container.className = 'tcbe-modal-root';

  // 백드롭 오버레이
  const backdrop = document.createElement('div');
  backdrop.className = 'tcbe-modal-backdrop';
  backdrop.addEventListener('click', () => {
    closeBokrModal();
  });

  // 다이얼로그 본체
  const dialog = document.createElement('div');
  dialog.className = 'tcbe-bokr-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  // 비용 요약 산출
  const targetCost = pathResult.targetNodeCost;
  const pathCost = pathResult.pathCost;
  const totalCost = pathResult.totalCost;

  // HTML 템플릿 렌더링
  dialog.innerHTML = `
    <div class="tcbe-bokr-header">
      <div class="tcbe-bokr-header-title">선택한 상급칸(보크) 정보 🍃</div>
      <button type="button" class="tcbe-bokr-close-btn" aria-label="닫기">✕</button>
    </div>

    <div class="tcbe-bokr-body">
      <!-- 사도 프로필 헤더 -->
      <div class="tcbe-bokr-hero-summary">
        <div class="tcbe-bokr-hero-info">
          <div class="tcbe-bokr-hero-sub">${boardName} · ${progress.unlockedBoardCount}차 보드 열림</div>
          <div class="tcbe-bokr-hero-name">
            <span class="tcbe-bokr-pers-badge pers-${personality?.id ?? 0}">${escapeHtml(personality?.nameKo || '')}</span>
            <strong>${escapeHtml(progress.name)}</strong>
          </div>
        </div>
      </div>

      <!-- 선택된 보크 스탯 요약 -->
      <div class="tcbe-bokr-stat-banner">
        <div class="tcbe-stat-icon-wrapper">
          <div class="tcbe-stat-icon stat-${primaryStatKey}"></div>
        </div>
        <div class="tcbe-bokr-stat-text">
          <div class="tcbe-bokr-stat-name">${escapeHtml(statMeta.nameKo)} <span class="tcbe-bokr-stat-val">${statIncreaseText}</span></div>
          <div class="tcbe-bokr-stat-loc">${boardName} ${gridCoords}</div>
        </div>
      </div>

      <!-- 2열 그리드: 선택 칸 비용 & 경로 추가 비용 -->
      <div class="tcbe-bokr-grid">
        <!-- 선택한 칸 비용 -->
        <div class="tcbe-bokr-card">
          <div class="tcbe-bokr-card-title">${pathResult.isTargetPicked ? '선택한 칸 원래 비용' : '선택한 칸 비용'}</div>
          <div class="tcbe-bokr-cost-list">
            ${renderCostItems(targetCost)}
          </div>
        </div>

        <!-- 색칠 경로 추가 비용 -->
        <div class="tcbe-bokr-card">
          <div class="tcbe-bokr-card-title">색칠 경로 추가 비용</div>
          ${
            pathResult.isTargetPicked
              ? `<div class="tcbe-bokr-already-picked">
                  <span class="tcbe-check-icon">✔</span> 이 칸은 색칠되어 있어요
                </div>`
              : `<div class="tcbe-bokr-cost-list">
                  <div class="tcbe-cost-path-desc">일반칸 <strong>${pathResult.unpickedNormalCount}칸</strong> 통과</div>
                  ${renderCostItems(pathCost)}
                  ${(pathResult.gateRequirements || []).map(gate => `<div class="tcbe-cost-text">${gate.boardLevel}차 관문 해금 필요 · 관문 재화 ${gate.items.reduce((sum, item) => sum + item.value, 0)}개</div>`).join('')}

                </div>`
          }
        </div>
      </div>

      <!-- 총 필요 비용 요약 (미칠해진 경우) -->
      ${
        !pathResult.isTargetPicked
          ? `<div class="tcbe-bokr-total-box">
              <div class="tcbe-bokr-total-label">💡 도달 및 획득 총 필요 재화</div>
              <div class="tcbe-bokr-total-items">
                ${renderCostItems(totalCost)}
              </div>
            </div>`
          : ''
      }

      <!-- 하단 액션: 경로 강조 토글 & 닫기 -->
      <div class="tcbe-bokr-footer">
        <div class="tcbe-bokr-toggle-wrapper">
          <span class="tcbe-bokr-toggle-label">카드에서 경로 강조</span>
          <div class="tcbe-bokr-toggle-group">
            <button type="button" class="tcbe-toggle-btn ${!isHighlightActive ? 'active' : ''}" data-action="toggle-off">끔</button>
            <button type="button" class="tcbe-toggle-btn ${isHighlightActive ? 'active' : ''}" data-action="toggle-on">✔ 켬</button>
          </div>
        </div>
        <button type="button" class="tcbe-bokr-bottom-close-btn">닫기</button>
      </div>
    </div>
  `;

  // 3. 이벤트 바인딩
  const closeBtn = dialog.querySelector<HTMLButtonElement>('.tcbe-bokr-close-btn');
  const bottomCloseBtn = dialog.querySelector<HTMLButtonElement>('.tcbe-bokr-bottom-close-btn');

  const handleClose = () => {
    closeBokrModal();
  };

  closeBtn?.addEventListener('click', handleClose);
  bottomCloseBtn?.addEventListener('click', handleClose);

  // 경로 강조 토글 버튼
  const btnOff = dialog.querySelector<HTMLButtonElement>('[data-action="toggle-off"]');
  const btnOn = dialog.querySelector<HTMLButtonElement>('[data-action="toggle-on"]');

  btnOff?.addEventListener('click', () => {
    isHighlightActive = false;
    btnOff.classList.add('active');
    btnOn?.classList.remove('active');
    if (onToggleHighlight) onToggleHighlight(false);
  });

  btnOn?.addEventListener('click', () => {
    isHighlightActive = true;
    btnOn.classList.add('active');
    btnOff?.classList.remove('active');
    if (onToggleHighlight) onToggleHighlight(true);
  });

  // ESC 키 닫기 이벤트 등록
  activeKeydownListener = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };
  window.addEventListener('keydown', activeKeydownListener);

  container.appendChild(backdrop);
  container.appendChild(dialog);
  document.body.appendChild(container);
  activeModalContainer = container;

  // 기본적으로 하이라이트 활성화 알림
  if (onToggleHighlight) {
    onToggleHighlight(true);
  }
}
