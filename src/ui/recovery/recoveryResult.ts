/** 회수 결과의 카드·대안·지도 HTML 렌더링 */
import { getBestRecoveryAlternative, type RecoveryAlternative, type RecoveryResource, type RecoveryResult } from '../../domain/boardRecovery.ts';
import { NODE_TYPE, STAT_META_LIST } from '../../domain/constants.ts';
import type { ResourceCostSummary } from '../../domain/types.ts';
import { formatNumber } from '../common/format.ts';
import { renderApostleAvatar } from '../common/apostlePortraits.ts';
import { renderResourceCost, renderResourceIcon as resourceIcon } from '../common/resources.ts';
import { getBoardNodeVisual, computeBoardGridLayout, getTileGridStyle } from '../board/boardNode.ts';
import { escapeHtml } from '../common/html.ts';

export const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNumber(n)}`;
const resourceName = (resource: RecoveryResource) => resource === 'hwang' ? '황크' : '보크';
const netLabel = (plan: RecoveryAlternative) => `${resourceIcon('hwang')} ${signed(plan.net.ultraCrayon)} ${resourceIcon('bokr')} ${signed(plan.net.epicCrayon)}`;
export const planKey = (plan: RecoveryAlternative) => `${Number(plan.flowering)}:${plan.priority}`;

/** 정렬 기준과 무관하게 재화별 대안을 보여주고 같은 색칠 계획은 합친다. */
export function getRecoveryDisplayAlternatives(result: RecoveryResult): RecoveryAlternative[] {
  const seen = new Set<string>();
  return [false, true].flatMap(flowering => (['hwang', 'bokr'] as const).flatMap(priority => {
    const plan = getBestRecoveryAlternative(result, priority, flowering);
    if (!plan) return [];
    const signature = [...plan.selected].sort().join('/');
    if (seen.has(signature)) return [];
    seen.add(signature); return [plan];
  }));
}

export function renderRecoveryMap(result: RecoveryResult, plan: RecoveryAlternative): string {
  const entries = new Map(result.nodes.map(entry => [entry.key, entry]));
  const order = new Map(plan.paint.map((entry, index) => [entry.key, index + 1]));
  return `<div class="tcbe-rc-maps">${result.apostle.boards.map((board, boardIndex) => {
    const nodes = (board.masterNodes || []).map((node, nodeIndex) => ({ node, nodeIndex }))
      .filter(({ node }) => node.nodeType !== 0 && node.grid && Number.isSafeInteger(node.grid.x) && Number.isSafeInteger(node.grid.y) && node.grid.x >= 0 && node.grid.y >= 0);
    if (!nodes.length) return `<section><h4>${boardIndex + 1}차</h4>보드 좌표 없음</section>`;
    const layout = computeBoardGridLayout(nodes.map(({ node }) => node.grid!));
    if (!layout) return '<p>좌표 범위가 커 지도를 표시할 수 없습니다.</p>';
    const visualBoard = { ...board, stepStr: (board.masterNodes || []).map((_, index) => plan.selected.has(`${boardIndex}:${index}`) ? '1' : '0').join('') };
    const tiles = nodes.map(({ node, nodeIndex }) => {
      const key = `${boardIndex}:${nodeIndex}`, entry = entries.get(key), selected = plan.selected.has(key);
      const target = result.targets.has(key);
      const state = !board.unlocked ? 'locked' : target && selected ? 'repaint' : entry?.picked && !selected ? 'remove' : order.has(key) ? 'paint' : selected ? 'keep' : 'empty';
      const visual = getBoardNodeVisual(visualBoard, node, selected);
      const operation = { locked: '미해금', repaint: '제거 대상으로 선택했으나 추천 연결 경로에서 재복구', remove: '복구하지 않음', paint: entry?.picked ? '복구' : '새 연결칸', keep: '초기화 유지', empty: '미사용' }[state];
      const mapState = !board.unlocked ? 'empty' : entry?.picked ? selected ? 'keep' : 'remove' : selected ? 'add' : 'empty';
      const marker = { keep: '✓', add: '+', remove: '×', empty: '' }[mapState];
      const title = `${boardIndex + 1}차 #${node.id} ${visual.statName || ''} ${visual.flowering ? '만개 확장 황크' : visual.kind} · ${operation}${order.has(key) ? ` · 작업 ${order.get(key)}번` : ''}`;
      return `<button type="button" class="tcbe-map-tile tcbe-rd-tile tcbe-rd-${mapState} tcbe-rc-tile tcbe-rc-${state}${visual.classes}" data-tile="${boardIndex}:${nodeIndex}" style="${getTileGridStyle(node.grid!.x, node.grid!.y, layout)}background-position:${visual.background} 0" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${visual.contents}<span class="tcbe-rd-state-mark" aria-hidden="true">${marker}</span></button>`;
    }).join('');
    return `<section><h4>${boardIndex + 1}차 ${board.unlocked ? '' : '· 미해금'}</h4><div class="tcbe-rd-map" style="grid-template-columns:repeat(${layout.columns},32px);grid-template-rows:repeat(${layout.rowCount},32px)">${tiles}</div></section>`;
  }).join('')}</div>`;
}

function renderStatChanges(plan: RecoveryAlternative): string {
  return (['hwang', 'bokr'] as const).map(resource => {
    const changes = resource === 'hwang' ? plan.hwangDelta : plan.bokrDelta;
    return `<p>${resourceName(resource)} 스탯: ${STAT_META_LIST.filter(meta => Math.abs(changes[meta.key]) > .00001)
      .map(meta => `${meta.nameKo} ${signed(changes[meta.key])}${resource === 'hwang' ? '%' : ''}`).join(' · ') || '변화 없음'}</p>`;
  }).join('');
}

/** 사도별 비교 경로의 선택 상태와 첫 경로 대비 차이를 표시한다. */
function renderRecoveryAlternative(alternative: RecoveryAlternative, plan: RecoveryAlternative,
  base: RecoveryAlternative | undefined, id: number): string {
  const label = `${alternative.flowering ? '만개 허용' : '기본'} · ${resourceName(alternative.priority)} 회수 우선`;
  const difference = base && alternative !== base ? `<p>첫 경로 대비 ${resourceIcon('hwang')} ${signed(alternative.net.ultraCrayon - base.net.ultraCrayon)} · ${resourceIcon('bokr')} ${signed(alternative.net.epicCrayon - base.net.epicCrayon)}</p>` : '';
  return `<label class="tcbe-rc-alternative"><span><input type="radio" name="rc-${id}" data-alternative="${id}" value="${planKey(alternative)}" ${plan === alternative ? 'checked' : ''}><strong>${label}</strong></span><p>순회수 ${netLabel(alternative)}</p><p>사용 ${resourceIcon('watering-can')} ${alternative.spend.wateringCan || 0} · ${resourceIcon('gold')} ${alternative.spend.gold.toLocaleString('ko-KR')}</p>${difference}</label>`;
}

function renderRecoveryPaintStep(entry: RecoveryAlternative['paint'][number]): string {
  return `<li>${entry.boardIndex + 1}차 #${entry.node.id} ${entry.node.nodeType === NODE_TYPE.PETAL ? '꽃잎 개방' : entry.node.nodeType === NODE_TYPE.HWANG_EXT ? '만개 확장 황크 색칠' : entry.picked ? '복구' : '새 색칠'} · ${renderResourceCost(entry.cost)}</li>`;
}

/** 선택 경로의 재화·스탯·복구 순서를 한곳에서 표시한다. */
function renderRecoveryPlan(result: RecoveryResult, plan: RecoveryAlternative, alternatives: RecoveryAlternative[]): string {
  const id = result.apostle.apostleId, base = alternatives[0];
  return `<div class="tcbe-rc-alternatives">${alternatives.map(alternative => renderRecoveryAlternative(alternative, plan, base, id)).join('')}</div>${result.alternatives.some(p => p.flowering) && !alternatives.some(p => p.flowering) ? '<p>만개 허용안도 비교했지만 기본안과 같은 색칠 계획입니다.</p>' : ''}<p>대상 ${result.targets.size}칸 · 미복구 ${result.targets.size - plan.repaintedTargets.length}칸 · 추천 경로에서 재복구 ${plan.repaintedTargets.length}칸</p>
            ${plan.usedNewBokr ? '<p class="tcbe-rc-notice">새 보크를 사용하지 않고 모든 보존 대상을 연결할 계획을 찾지 못해 새 보크 경로를 포함했습니다.</p>' : ''}
            <p>전체 환급: ${renderResourceCost(plan.refund)}</p><p>전체 복구·색칠: ${renderResourceCost(plan.spend)}</p>${renderStatChanges(plan)}
            <div data-map></div><p data-tile-info role="status">칸을 선택하면 상세 정보가 표시됩니다.</p>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
              <h4 style="margin:0;">작업 순서</h4>
              <button type="button" data-copy-apostle="${id}" style="font-size:12px; padding:3px 8px;">이 사도 작업 순서 복사</button>
            </div>
            <p>이 사도를 초기화한 뒤 필요한 추가 재화를 확보하고 아래 순서대로 칠하세요. 열린 관문·꽃잎은 다시 열지 않습니다.</p>
            <ol>${plan.paint.map(renderRecoveryPaintStep).join('') || '<li>다시 칠할 칸 없음</li>'}</ol>`;
}

/** 계산 오류가 있는 사도도 같은 목록 안에서 안내한다. */
function renderRecoveryApostle(result: RecoveryResult, index: number, plan: RecoveryAlternative | undefined,
  portraits: Map<number | string, string>): string {
  const id = result.apostle.apostleId, alternatives = getRecoveryDisplayAlternatives(result);
  const extraBokr = plan ? Math.max(0, ...alternatives.map(p => p.net.epicCrayon - plan.net.epicCrayon)) : 0;
  const isPositive = Boolean(plan && (plan.net.ultraCrayon > 0 || plan.net.epicCrayon > 0));
  return `<details class="tcbe-rc-apostle" data-apostle="${id}" data-apostle-name="${escapeHtml(result.apostle.name)}" data-net-positive="${isPositive}">
            <summary><span class="tcbe-rc-summary-main">${index + 1}. ${renderApostleAvatar(id, result.apostle.name, portraits, result.apostle.personality)} <span>${escapeHtml(result.apostle.name)}</span> ${plan ? `${netLabel(plan)}${plan.net.ultraCrayon <= 0 && plan.net.epicCrayon <= 0 ? ' · 회수 효과 없음' : ''}` : '· 계산 확인 필요'}${extraBokr ? `<span class="tcbe-rc-hint">다른 경로로 ${resourceIcon('bokr')} ${extraBokr}개 추가 회수 가능</span>` : ''}</span></summary>
            <div data-detail>${plan ? renderRecoveryPlan(result, plan, alternatives) : `<p>${escapeHtml(result.error || '계획을 찾지 못했습니다.')}</p>`}</div></details>`;
}

export interface RecoveryResultView {
  allOrdered: RecoveryResult[];
  limit: number;
  priority: RecoveryResource;
  searchQuery: string;
  onlyPositive: boolean;
  portraits: Map<number | string, string>;
  planFor: (result: RecoveryResult) => RecoveryAlternative | undefined;
  net: ResourceCostSummary;
  extra: ResourceCostSummary;
}

/** 입력된 정렬·경로·누적 결과를 표시하며 계산 상태와 DOM을 변경하지 않는다. */
export function renderRecoveryResults(view: RecoveryResultView): string {
  const { allOrdered, limit, priority, searchQuery, onlyPositive, portraits, planFor, net, extra } = view;
  return `
      <div class="tcbe-rc-toolbar">
        <label>순위 기준 <select data-sort><option value="hwang" ${priority === 'hwang' ? 'selected' : ''}>황크 순회수</option><option value="bokr" ${priority === 'bokr' ? 'selected' : ''}>보크 순회수</option></select></label>
        <label>상위 <input type="number" data-limit min="0" max="${allOrdered.length}" value="${limit}">명 누적</label>
        <button type="button" data-copy-summary>상위 ${limit}명 작업 순서 복사</button>
        <span data-copy-status class="tcbe-rd-copy-status" aria-live="polite"></span>
      </div>
      <div class="tcbe-rc-toolbar" style="margin-top: 6px;">
        <label>사도 검색: <input type="search" data-search placeholder="이름 또는 초성 (예: ㅇㄹㅍ)" value="${escapeHtml(searchQuery)}"></label>
        <label style="cursor: pointer;"><input type="checkbox" data-only-positive ${onlyPositive ? 'checked' : ''}> 순회수 발생 사도만 보기</label>
        <span data-search-count class="tcbe-rc-hint"></span>
      </div>
      <p>순위 기준은 목록 순서만 바꿉니다. 사도별 경로를 선택하면 지도·작업 순서·누적 회수량에 적용됩니다.</p>
      <div class="tcbe-rc-total">선택한 상위 ${limit}명 순회수 · ${resourceIcon('hwang')} <strong>${signed(net.ultraCrayon)}</strong> · ${resourceIcon('bokr')} <strong>${signed(net.epicCrayon)}</strong><p>환급 외 준비 재화: ${renderResourceCost(extra)}</p></div>
      <p class="tcbe-rc-notice">추천 순회수량이며 최대 회수를 보장하지 않습니다. 초기화 환급 − 전체 복구 비용으로 계산합니다. 추가 재화와 초기화 가능 횟수를 확인하고, 필요한 환급을 먼저 확보한 뒤 복구하세요. 음수는 추가 필요량입니다.</p>
      <p>지도: 초록 ✓ 유지·복구 · 파랑 + 새로 칠함 · 빨강 × 지움 · 흐린 칸 미선택. 만개칸은 재분배 지도와 같은 꽃 모양으로 표시합니다. 칸을 누르면 상세 정보와 작업 번호를 확인할 수 있습니다.</p>
      <div data-apostles-list>
        ${allOrdered.map((result, index) => renderRecoveryApostle(result, index, planFor(result), portraits)).join('') || '<p>현재 칠한 제거 대상이 없습니다.</p>'}
      </div>
      <div data-search-empty hidden style="text-align: center; padding: 24px; color: #64748b; font-size: 14px;">검색 조건에 맞는 사도가 없습니다.</div>`;
}
