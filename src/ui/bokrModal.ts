/** 보크 클릭 모달에서 실제 위치, 목표 비용, 경로 비용을 안내한다. */
import { findLinkedPetalNode, getApostleBoardLayout, type BokrPathResult } from '../domain/boardPathfinder.ts';
import { getNodeStatCategories, getStatCategoryFromStatType, isBokrNode, isHwangNode, NODE_TYPE, PERSONALITY_META_LIST, STAT_META_LIST } from '../domain/boardProgress.ts';
import type { ApostleProgress, MasterBoardNode, ResourceCostSummary } from '../domain/types.ts';
import { STAT_TO_POSITIONS } from './tileHighlight.ts';
import { escapeHtml } from './html.ts';

export interface BokrModalOptions {
  progress: ApostleProgress;
  boardIndex: number;
  targetNode: MasterBoardNode;
  nodeIndex: number;
  pathResult: BokrPathResult;
  portraitUrl?: string;
  returnFocus?: HTMLElement;
  onToggleHighlight?: (enabled: boolean) => void;
  onClose?: () => void;
}

let activeModal: HTMLElement | null = null;
let disposeModal: (() => void) | null = null;

export function closeBokrModal(): void {
  disposeModal?.();
  disposeModal = null;
  activeModal?.remove();
  activeModal = null;
}

/** 목표 재화와 경로 재화를 같은 아이콘 및 단위로 표시한다. */
function renderCostItems(cost: ResourceCostSummary, showPathDefaults = false): string {
  const items: Array<[number, string, string]> = [
    [cost.basicCrayon, 'pastel-basic', '하급 크레파스'],
    [cost.averageCrayon, 'pastel-average', '중급 크레파스'],
    [cost.epicCrayon, 'pastel-epic', '상급 크레파스'],
    [cost.ultraCrayon, 'pastel-ultra', '최상급 크레파스'],
    [cost.wateringCan || 0, 'watering-can', '만개 물뿌리개'],
    [cost.gold, 'icon-gold', '골드'],
  ];
  return items.filter(([value, icon]) => value > 0 || (showPathDefaults && ['pastel-ultra', 'pastel-epic', 'icon-gold'].includes(icon))).map(([value, icon, label]) =>
    `<div class="tcbe-cost-item" aria-label="${label} ${icon === 'icon-gold' ? `${value / 1000}k` : `${value}개`} 필요"><span class="tcbe-cost-icon ${icon}" aria-hidden="true"></span><span><strong>${icon === 'icon-gold' ? `${value / 1000}k` : `${value}개`} 필요</strong></span></div>`
  ).join('') || '<div class="tcbe-cost-text">추가 재화 없음</div>';
}

/** 원본처럼 관문 안내를 경로 재화의 첫 행에 표시한다. */
export function renderBokrPathCost(pathResult: BokrPathResult): string {
  if (pathResult.isTargetPicked) return '<div class="tcbe-cost-item"><span class="tcbe-cost-icon tcbe-cost-check" aria-hidden="true"></span><span>이 칸은 색칠되어 있어요</span></div>';
  const gates = (pathResult.gateRequirements || []).map(gate =>
    `<div class="tcbe-cost-item"><span class="tcbe-cost-icon tcbe-cost-gate" aria-hidden="true"></span><span>${gate.boardLevel}번 관문 오픈 필요</span></div>`
  ).join('');
  return gates + renderCostItems(pathResult.pathCost, true);
}

/** 원본 좌표를 사용한 위치 보드로 요약 카드에 없는 일반칸도 함께 보여준다. */
export function renderBokrBoard(options: BokrModalOptions): string {
  const { progress, boardIndex, targetNode, pathResult } = options;
  const layout = getApostleBoardLayout(progress, boardIndex).filter(entry => entry.boardIndex === boardIndex);
  if (!layout.length) return '<p>보드 위치를 확인할 수 없습니다.</p>';
  const minX = Math.min(...layout.map(entry => entry.x));
  const maxX = Math.max(...layout.map(entry => entry.x));
  const maxY = Math.max(...layout.map(entry => entry.y));
  const minY = Math.min(...layout.map(entry => entry.y));
  const columns = Math.max(7, maxX - minX + 1);
  const columnOffset = Math.floor((columns - (maxX - minX + 1)) / 2);
  const path = new Set(pathResult.pathSteps?.map(step => `${step.boardIndex}:${step.nodeId}`));
  const tiles = layout.map(entry => {
    const node = entry.node;
    const categories = getNodeStatCategories(node);
    const key = categories[0];
    const meta = STAT_META_LIST.find(stat => stat.key === key);
    const combinedAttack = categories.includes('atk_phys') && categories.includes('atk_mag');
    const combinedDefense = categories.includes('def_phys') && categories.includes('def_mag');
    const statName = combinedAttack ? '물마공' : combinedDefense ? '물마방' : meta?.nameKo;
    const selected = entry.boardIndex === boardIndex && node.id === targetNode.id;
    const onPath = path.has(`${entry.boardIndex}:${node.id}`);
    const board = progress.boards[boardIndex]!;
    const petal = findLinkedPetalNode(board.masterNodes || [], node);
    const petalIndex = petal ? board.masterNodes!.indexOf(petal) : -1;
    const petalOpen = petal && board.unlocked !== false && board.stepStr?.[petalIndex] === '1';
    const flowering = node.nodeType === NODE_TYPE.HWANG_EXT;
    // 시작 칸과 관문은 원본의 고정 테두리를 사용하며 색칠 기록을 변경하지 않는다.
    const frame = node.nodeType === NODE_TYPE.START ? '0%'
      : node.nodeType === NODE_TYPE.GATE ? '50%'
      : isBokrNode(node) ? (entry.picked ? '83.3333%' : '100%')
      : isHwangNode(node) ? (entry.picked ? '33.3333%' : '66.6667%')
      : (entry.picked ? '0%' : '16.6667%');
    const kind = node.nodeType === NODE_TYPE.GATE ? '관문' : node.nodeType === NODE_TYPE.START ? '시작 칸'
      : isBokrNode(node) ? '보크' : isHwangNode(node) ? '황크' : '일반칸';
    const label = `${entry.boardIndex + 1}차 ${statName || kind} ${kind}${flowering ? ` · 꽃잎 ${petal ? petalOpen ? '열림' : '닫힘' : '상태 미확인'}` : ''}${selected ? ' · 선택한 칸' : ''}${entry.picked ? ' · 색칠 완료' : ''}`;
    const position = node.nodeType === NODE_TYPE.START ? '0%'
      : node.nodeType === NODE_TYPE.GATE ? '86.3636%'
      : combinedAttack ? (entry.picked ? '100%' : '95.4545%')
      : combinedDefense ? (entry.picked ? '90.9091%' : '86.3636%')
      : key ? STAT_TO_POSITIONS[key][entry.picked ? 'active' : 'inactive'][0] : '0%';
    const icon = `<span class="tcbe-map-icon${isHwangNode(node) && !entry.picked ? ' tcbe-map-hwang-inactive' : ''}" style="background-position:${position} 0"></span>`;
    const contents = flowering ? `<span class="tcbe-map-flower-frame" style="background-position:${frame} 0">${icon}</span>` : icon;
    return `<div class="tcbe-map-tile ${selected ? 'tcbe-map-selected' : ''} ${onPath ? 'tcbe-map-path' : ''}${flowering ? ` tcbe-map-flower tcbe-map-flower-${petalOpen ? 'open' : 'closed'}` : ''}" data-board="${entry.boardIndex + 1}" data-node="${node.id}" style="grid-column:${maxX - entry.x + 1 + columnOffset};grid-row:${maxY - entry.y + 1};background-position:${flowering ? 'center' : frame} 0" title="${escapeHtml(label)}" role="img" aria-label="${escapeHtml(label)}">${contents}</div>`;
  }).join('');
  return `<div class="tcbe-bokr-map" style="width:${columns * 32}px;aspect-ratio:${columns}/${maxY - minY + 1};grid-template-columns:repeat(${columns},1fr);grid-template-rows:repeat(${maxY - minY + 1},1fr)">${tiles}</div>`;
}

export function showBokrModal(options: BokrModalOptions): void {
  closeBokrModal();
  const { progress, boardIndex, targetNode, pathResult, portraitUrl, onToggleHighlight, onClose, returnFocus } = options;
  const personality = PERSONALITY_META_LIST.find(meta => meta.id === progress.personality);
  const key = getNodeStatCategories(targetNode)[0];
  const stat = STAT_META_LIST.find(meta => meta.key === key);
  const actualStat = targetNode.stats?.find(value => getStatCategoryFromStatType(value.statType) === key);
  const increase = actualStat?.statValue ?? stat?.valuePerNode;
  const container = document.createElement('div');
  container.id = 'tcbe-bokr-modal-container';
  container.className = 'tcbe-modal-root';
  container.innerHTML = `<div class="tcbe-modal-backdrop"></div>
    <section class="tcbe-bokr-dialog" role="dialog" aria-modal="true" aria-labelledby="tcbe-bokr-title" tabindex="-1">
      <header class="tcbe-bokr-header"><h2 id="tcbe-bokr-title">선택한 칸의 정보</h2><button type="button" class="tcbe-bokr-close-btn" aria-label="닫기"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></header>
      <div class="tcbe-bokr-body">
        <div class="tcbe-bokr-profile">${portraitUrl && /^https:\/\/(cdn\.)?note\.trickcal\.com\//.test(portraitUrl) ? `<div class="tcbe-bokr-portrait-frame"><img class="tcbe-bokr-portrait" data-personality="${personality?.id ?? 0}" src="${escapeHtml(portraitUrl)}" alt="${escapeHtml(progress.name)}"><img class="tcbe-bokr-portrait-leaf tcbe-bokr-portrait-leaf-left" src="https://note.trickcal.com/UI/Leaf_Icon_1.webp" alt=""><img class="tcbe-bokr-portrait-leaf tcbe-bokr-portrait-leaf-right" src="https://note.trickcal.com/UI/Leaf_Icon_1.webp" alt=""></div>` : ''}<div class="tcbe-bokr-profile-info"><div class="tcbe-bokr-hero-sub">${progress.unlockedBoardCount}차 보드 열림 · ${boardIndex + 1}차 보드</div><div class="tcbe-bokr-hero-name"><span class="tcbe-sprite-pers tcbe-sprite-pers-${personality?.spriteIndex ?? 0}" aria-label="${escapeHtml(personality?.nameKo || '')}"></span><strong>${escapeHtml(progress.name)}</strong></div></div></div>
        <div class="tcbe-bokr-layout">
          <section class="tcbe-bokr-location"><h3>선택한 칸 위치</h3><div class="tcbe-bokr-map-scroll tcbe-map-path-only">${renderBokrBoard(options)}</div>
            <h3>경로만 강조</h3><div class="tcbe-bokr-toggle-group" role="group" aria-label="경로만 강조"><button type="button" data-highlight="off" aria-pressed="false"><span class="tcbe-toggle-checkbox" aria-hidden="true"></span><span class="tcbe-toggle-label">끔</span></button><button type="button" data-highlight="on" aria-pressed="true"><span class="tcbe-toggle-checkbox" aria-hidden="true"></span><span class="tcbe-toggle-label">켬</span></button></div>
          </section>
          <div class="tcbe-bokr-costs"><section class="tcbe-bokr-card"><h3>선택한 칸 ${pathResult.isTargetPicked ? '원래 비용' : '비용'}</h3><div class="tcbe-bokr-stat-banner"><span class="tcbe-sprite-stat tcbe-sprite-stat-${stat?.spriteIndex ?? 0}" aria-hidden="true"></span><span>${escapeHtml(stat?.nameKo || '스탯 미상')}${increase === undefined ? '' : ` +${increase}`}</span></div>${renderCostItems(pathResult.targetNodeCost)}</section>
            <section class="tcbe-bokr-card"><h3>색칠 경로 추가 비용</h3>${renderBokrPathCost(pathResult)}</section>
          </div>
        </div>
      </div>
    </section>`;
  document.body.appendChild(container);
  activeModal = container;
  const dialog = container.querySelector<HTMLElement>('.tcbe-bokr-dialog')!;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  let highlight = true;
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); closeBokrModal(); }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.tcbe-modal-backdrop, .tcbe-bokr-close-btn, .tcbe-bokr-bottom-close-btn')) { closeBokrModal(); return; }
    const action = target?.closest<HTMLButtonElement>('[data-highlight]');
    if (!action) return;
    highlight = action.dataset.highlight === 'on';
    container.querySelector('.tcbe-bokr-map-scroll')?.classList.toggle('tcbe-map-path-only', highlight);
    dialog.querySelectorAll<HTMLButtonElement>('[data-highlight]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.highlight === 'on') === highlight)));
    onToggleHighlight?.(highlight);
  };
  const onRouteChange = () => closeBokrModal();
  container.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('popstate', onRouteChange);
  window.addEventListener('hashchange', onRouteChange);
  disposeModal = () => {
    container.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('popstate', onRouteChange);
    window.removeEventListener('hashchange', onRouteChange);
    document.body.style.overflow = previousOverflow;
    onClose?.();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  dialog.focus({ preventScroll: true });
  onToggleHighlight?.(true);
}
