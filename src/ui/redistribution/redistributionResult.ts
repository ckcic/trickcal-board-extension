/**
 * @file redistributionResult.ts
 * @description 재분배 추천안 계산 결과, 작업 순서 표, 사도별 보드 지도 및 텍스트 요약 생성기
 */

import { formatNumber } from '../common/format.ts';
import { STAT_META_LIST, NODE_TYPE, isHwangNode } from '../../domain/boardProgress.ts';
import { getHwangTargetValue, readBokrValues, type RedistributionNode, type RedistributionStat, type RedistributionPlan, type RedistributionOptions } from '../../domain/hwangRedistribution.ts';
import type { ResourceCostSummary, StatCategory } from '../../domain/types.ts';
import { escapeHtml } from '../common/html.ts';
import { getBoardNodeVisual, computeBoardGridLayout, getTileGridStyle } from '../board/boardNode.ts';
import { renderRedistributionSummary } from './redistributionSummary.ts';
import { renderResourceCost, renderResourceIcon as resourceIcon } from '../common/resources.ts';
import { renderApostleAvatar } from '../common/apostlePortraits.ts';

const hwang = (node: RedistributionNode['node']) => isHwangNode(node) || node.nodeType === NODE_TYPE.HWANG_EXT;
const names = new Map<RedistributionStat, string>(STAT_META_LIST.map(meta => [meta.key, meta.nameKo]));
names.set('attack', '공격력');

/** 관문 아이템 렌더링 (골드/크레파스 제외 전용 재화) */
function renderGateItems(entry: RedistributionNode): string {
  if (entry.node.nodeType !== NODE_TYPE.GATE) return '';
  const items = (entry.node.requireItems || []).filter(item => ![610001,610002,610003,610004,610005].includes(item.item) && item.value > 0);
  return items.map(item => {
    const name = item.item === 4300000 ? '★1 공동 교단 증명서' : item.item >= 310000 && item.item < 320000 ? '지정 사도 증명서' : '관문 전용 재화 (종류 확인 필요)';
    return `<span title="원본 아이템 ${item.item}">${name} ${formatNumber(item.value)}개</span>`;
  }).join(' · ');
}

/**
 * 사도별 작업 순서 텍스트 생성 (클립보드 복사용)
 */
export function generateOrdersText(plan: RedistributionPlan): string {
  const lines: string[] = ['[만개·황크 재분배 작업 순서]'];
  const resets = plan.actions.filter(a => a.reset).map(a => a.apostle.name);
  if (resets.length) {
    lines.push(`1. 초기화 대상 (${resets.length}명): ${resets.join(', ')}`);
    lines.push('   (사도 초기화를 먼저 모두 진행하세요)');
  } else {
    lines.push('1. 초기화 대상: 없음 (추가 색칠만 진행)');
  }
  lines.push('\n2. 사도별 색칠 순서:');
  plan.actions.forEach((action, i) => {
    const actionDesc = action.reset ? '초기화 후 복구·색칠' : '추가 색칠';
    lines.push(`  ${i + 1}. ${action.apostle.name} (${actionDesc})`);
    for (let board = 0; board < 3; board++) {
      const entries = action.paint.filter(e => e.boardIndex === board);
      if (!entries.length) continue;
      const parts: string[] = [];
      const hwangCount = entries.filter(e => hwang(e.node)).length;
      const bokrCount = entries.filter(e => e.node.nodeType === NODE_TYPE.BOKR).length;
      const normalCount = entries.filter(e => e.node.nodeType === NODE_TYPE.NORMAL).length;
      const gateCount = entries.filter(e => e.node.nodeType === NODE_TYPE.GATE).length;
      const petalCount = entries.filter(e => e.node.nodeType === NODE_TYPE.PETAL).length;
      if (hwangCount) parts.push(`황크 ${hwangCount}`);
      if (bokrCount) parts.push(`보크 ${bokrCount}`);
      if (normalCount) parts.push(`일반 ${normalCount}`);
      if (gateCount) parts.push(`관문 개방 ${gateCount}`);
      if (petalCount) parts.push(`꽃잎 개방 ${petalCount}`);
      lines.push(`     - ${board + 1}차: ${parts.join(', ')}`);
    }
  });
  return lines.join('\n');
}

/**
 * 사도별 작업 순서 상세 테이블 렌더링
 */
function renderActionTable(plan: RedistributionPlan, portraitMap?: Map<number | string, string>): string {
  if (!plan.actions.length) return '';
  return `<div class="tcbe-rd-table-wrap"><table class="tcbe-rd-actions"><thead><tr><th>#</th><th>사도</th><th>할 일</th><th>차수별 칠할 칸</th><th>환급</th><th>사용</th><th>남은 황크</th></tr></thead><tbody>${plan.actions.map((action, index) => {
    const boards = [0, 1, 2].map(board => {
      const entries = action.paint.filter(entry => entry.boardIndex === board);
      if (!entries.length) return '';
      const parts = (['hwang', 'bokr'] as const).map(resource => {
        const count = new Map<string, number>();
        for (const entry of entries) {
          const metric = resource === 'hwang' ? entry.stats : entry.bokrStats;
          const attack = resource === 'hwang' && metric.atk_phys > 0 && metric.atk_phys === metric.atk_mag;
          if (attack) count.set('공격력', (count.get('공격력') || 0) + 1);
          for (const [stat, value] of Object.entries(metric)) if (value > 0 && !(attack && ['atk_phys', 'atk_mag'].includes(stat))) {
            const name = names.get(stat as StatCategory)!; count.set(name, (count.get(name) || 0) + 1);
          }
        }
        return count.size ? `${resource === 'hwang' ? '황' : '보'}: ${[...count].map(([stat, value]) => `${stat} ${value}`).join(' · ')}` : '';
      }).filter(Boolean);
      const normal = entries.filter(entry => entry.node.nodeType === NODE_TYPE.NORMAL).length;
      if (normal) parts.push(`일반 ${normal}`);
      const gates = entries.filter(entry => entry.node.nodeType === NODE_TYPE.GATE).length;
      if (gates) parts.push(`관문 개방 ${gates}`);
      const petals = entries.filter(entry => entry.node.nodeType === NODE_TYPE.PETAL).length;
      if (petals) parts.push(`꽃잎 개방 ${petals}`);
      return `<div><b class="tcbe-rd-badge">${board + 1}차</b> ${parts.join(' / ')}</div>`;
    }).join('');
    const avatar = renderApostleAvatar(action.apostle.apostleId, action.apostle.name, portraitMap);
    return `<tr data-action-row="${action.reset ? 'reset' : 'add'}"><td>${index + 1}</td><th><button type="button" data-show-map="${action.apostle.apostleId}">${avatar}<span>${escapeHtml(action.apostle.name)}</span></button></th><td>${action.reset ? '초기화 후 색칠' : '추가 색칠'}</td><td>${boards || '유지'}</td><td>${renderResourceCost(action.refund)}</td><td>${renderResourceCost(action.spend)}</td><td>${formatNumber(action.balance)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

/**
 * 추천 계산 결과 전체(요약, 순서표, 보드 지도) HTML 렌더링
 */
export function renderRedistributionResult(plan: RedistributionPlan, options: RedistributionOptions, portraitMap?: Map<number | string, string>): string {
  const summaries = plan.stageResults ?? (options.priorities || []).map(target => ({
    allowBlocked: true,
    targets: [{ ...target, all: false, before: getHwangTargetValue(plan.before, target.stat), after: getHwangTargetValue(plan.after, target.stat) }],
  }));

  // 사도·보드별 유효 노드 인덱스를 1회 구축하여 지도 렌더링 시 O(N) 필터링 반복을 제거한다.
  const nodesByApostleBoard = new Map<string, RedistributionNode[]>();
  for (const entry of plan.nodes) {
    if (entry.node.nodeType === 0 || !entry.node.grid || entry.node.grid.x < 0 || entry.node.grid.y < 0) continue;
    const key = `${entry.apostleId}:${entry.boardIndex}`;
    const list = nodesByApostleBoard.get(key);
    if (list) list.push(entry); else nodesByApostleBoard.set(key, [entry]);
  }

  const maps = plan.actions.map(action => {
    const boards = action.apostle.boards.map((board, boardIndex) => {
      const visualBoard = { ...board, stepStr: (board.masterNodes || []).map((_, nodeIndex) => plan.selected.has(`${action.apostle.apostleId}:${boardIndex}:${nodeIndex}`) ? '1' : '0').join('') };
      const entries = nodesByApostleBoard.get(`${action.apostle.apostleId}:${boardIndex}`) || [];
      if (!entries.length) return '';
      const layout = computeBoardGridLayout(entries.map(entry => entry.node.grid!));
      if (!layout) return '<p>보드 좌표 범위가 커 지도를 생략했습니다.</p>';
      const tiles = entries.map(entry => {
        const selected = plan.selected.has(entry.key);
        const state = entry.picked ? selected ? 'keep' : 'remove' : selected ? 'add' : 'empty';
        const visual = getBoardNodeVisual(visualBoard, entry.node, selected);
        const text = `${visual.statName || ''} ${visual.kind}`.trim();
        const operation = entry.node.nodeType === NODE_TYPE.GATE && !entry.picked && selected ? '관문 개방' : entry.picked && selected && action.reset && ![NODE_TYPE.GATE, NODE_TYPE.START, NODE_TYPE.PETAL].includes(entry.node.nodeType as 1 | 2 | 7) ? '초기화 후 복구' : { keep: '유지', remove: '지움', add: '새로 칠함', empty: '미선택' }[state];
        const title = escapeHtml(`${boardIndex + 1}차 #${entry.node.id} ${text}${visual.flowering ? ` · 꽃잎 ${visual.petalState}` : ''} · ${operation}`);
        return `<span class="tcbe-map-tile tcbe-rd-tile tcbe-rd-${state}${visual.classes}" data-board="${boardIndex + 1}" data-node="${entry.node.id}" style="${getTileGridStyle(entry.node.grid!.x, entry.node.grid!.y, layout)}background-position:${visual.background} 0" title="${title}" role="img" aria-label="${title}">${visual.contents}<span class="tcbe-rd-state-mark" aria-hidden="true">${{ keep: '✓', add: '+', remove: '×', empty: '' }[state]}</span></span>`;
      }).join('');
      return `<div><h4>${boardIndex + 1}차</h4><div class="tcbe-rd-map" style="grid-template-columns:repeat(${layout.columns},32px);grid-template-rows:repeat(${layout.rowCount},32px)">${tiles}</div></div>`;
    }).join('');
    const paint = action.paint.map(entry => {
      const combinedAttack = entry.stats.atk_phys > 0 && entry.stats.atk_phys === entry.stats.atk_mag;
      const stat = [combinedAttack ? `공격력 +${formatNumber(entry.stats.atk_phys)}% (물공·마공 각각)` : '',
        ...Object.entries(entry.stats).filter(([key, value]) => value > 0 && !(combinedAttack && ['atk_phys', 'atk_mag'].includes(key)))
          .map(([key, value]) => `${names.get(key as StatCategory)} +${formatNumber(value)}%`)].filter(Boolean).join('/');
      const bokrStat = entry.node.nodeType === NODE_TYPE.BOKR ? Object.entries(entry.bokrStats).filter(([, count]) => count > 0).map(([key]) => `${names.get(key as StatCategory)} +${formatNumber(readBokrValues(entry.node)[key as StatCategory])}`).join('/') : '';
      return `<li>${entry.boardIndex + 1}차 #${entry.node.id} ${stat || (entry.node.nodeType === NODE_TYPE.BOKR ? `${bokrStat} 보크` : entry.node.nodeType === NODE_TYPE.PETAL ? '꽃잎 개방' : entry.node.nodeType === NODE_TYPE.GATE ? '관문 개방' : '일반칸 복구·경로')} <span class="tcbe-rd-paint-cost">${renderResourceCost(entry.cost)} ${renderGateItems(entry)}</span></li>`;
    }).join('');
    const avatar = renderApostleAvatar(action.apostle.apostleId, action.apostle.name, portraitMap);
    return `<details class="tcbe-rd-apostle" id="tcbe-rd-map-${action.apostle.apostleId}"><summary>${avatar}<span>${escapeHtml(action.apostle.name)} · ${action.reset ? '초기화 후 복구·재배치' : '추가 색칠'} · 황크 ${action.spend.ultraCrayon}개 · 보크 ${action.spend.epicCrayon}개</span></summary>
      <p>환급: ${renderResourceCost(action.refund)}<br>다시 사용: ${renderResourceCost(action.spend)}<br>이 사도 작업 후 황크: ${formatNumber(action.balance)}개</p>
      <div class="tcbe-rd-maps">${boards}</div><details><summary>칠할 칸 순서 (${action.paint.length}칸)</summary><ol>${paint || '<li>추가로 칠할 칸 없음</li>'}</ol></details></details>`;
  }).join('');

  const extra = { ...plan.spend };
  for (const key of Object.keys(extra) as Array<keyof ResourceCostSummary>) extra[key] = Math.max(0, (plan.spend[key] || 0) - (plan.refund[key] || 0));
  const gateRows = plan.actions.flatMap(action => action.paint.filter(entry => entry.node.nodeType === NODE_TYPE.GATE).map(entry => `<li>${escapeHtml(action.apostle.name)} · ${entry.boardIndex + 1}차 관문 개방: ${renderResourceCost(entry.cost)} ${renderGateItems(entry)}</li>`));
  const hasGoldOption = options.ownedGold !== undefined;
  const hasCanOption = options.ownedWateringCan !== undefined || options.ownedClouds !== undefined;
  const totalOwnedCans = (options.ownedWateringCan ?? 0) + Math.floor((options.ownedClouds ?? 0) / 10);
  const cloudRemainder = (options.ownedClouds ?? 0) % 10;

  return `<h3 id="tcbe-sec-summary">계산 요약</h3><div class="tcbe-rd-cards"><div><small>초기화 / 설정 상한</small><strong>${plan.resetCount} / ${options.maxReset}명</strong></div><div><small>미사용 ${resourceIcon('hwang')}</small><strong>${formatNumber(options.ownedCrayons)} → ${formatNumber(plan.remaining)}개</strong></div>${plan.remainingBokr === undefined ? '' : `<div><small>미사용 ${resourceIcon('bokr')}</small><strong>${formatNumber(options.ownedBokr ?? 0)} → ${formatNumber(plan.remainingBokr)}개</strong></div>`}${hasGoldOption ? `<div><small>소지 ${resourceIcon('gold')}</small><strong class="${plan.remainingGold! >= 0 ? 'tcbe-rd-positive' : 'tcbe-rd-short'}">${formatNumber(options.ownedGold!)} → ${plan.remainingGold! >= 0 ? `잔여 ${formatNumber(plan.remainingGold!)}` : `부족 ${formatNumber(Math.abs(plan.remainingGold!))}`}</strong></div>` : ''}${hasCanOption ? `<div><small>소지 ${resourceIcon('watering-can')}</small><strong class="${plan.remainingWateringCan! >= 0 ? 'tcbe-rd-positive' : 'tcbe-rd-short'}">${totalOwnedCans}개 → ${plan.remainingWateringCan! >= 0 ? `잔여 ${plan.remainingWateringCan!}개` : `부족 ${Math.abs(plan.remainingWateringCan!)}개`}</strong></div>` : ''}</div>
    <div class="tcbe-rd-resources"><p>환급 합계: ${renderResourceCost(plan.refund)}</p><p>사용 합계: ${renderResourceCost(plan.spend)}</p><p>환급 외 준비 재화: ${renderResourceCost(extra)}${extra.wateringCan ? ` <small class="tcbe-rd-caption">(만개 물뿌리개 1개 = <span class="tcbe-rd-resource-icon sunshine-cloud tcbe-rd-sm" aria-hidden="true"></span>햇살구름 10개 상당, 총 햇살구름 ${extra.wateringCan * 10}개 필요)</small>` : ''}</p>${(hasGoldOption || hasCanOption) ? `<p class="tcbe-rd-balance-summary"><strong>소지 재화 차감 후 상태:</strong> ${hasGoldOption ? `골드 ${plan.remainingGold! >= 0 ? `<span class="tcbe-rd-positive">${formatNumber(plan.remainingGold!)} 잔여</span>` : `<span class="tcbe-rd-short">${formatNumber(Math.abs(plan.remainingGold!))} 부족</span>`}` : ''}${hasGoldOption && hasCanOption ? ' · ' : ''}${hasCanOption ? `물뿌리개 ${plan.remainingWateringCan! >= 0 ? `<span class="tcbe-rd-positive">${plan.remainingWateringCan!}개 잔여${cloudRemainder > 0 ? ` (구름 ${cloudRemainder}개 남음)` : ''}</span>` : `<span class="tcbe-rd-short">${Math.abs(plan.remainingWateringCan!)}개 부족 (<span class="tcbe-rd-resource-icon sunshine-cloud tcbe-rd-sm" aria-hidden="true"></span>햇살구름 ${Math.max(0, Math.abs(plan.remainingWateringCan!) * 10 - cloudRemainder)}개 추가 교환 필요)</span>`}` : ''}</p>` : ''}</div>
    ${gateRows.length ? `<div class="tcbe-rd-notice"><strong>추가로 열 관문 ${gateRows.length}개</strong><ul>${gateRows.join('')}</ul><p>골드·크레파스는 위 사용 합계에 포함됩니다. 증명서 등 전용 재화의 보유량과 게임 내 개방 조건은 별도 확인하세요.</p></div>` : ''}
    <details class="tcbe-rd-method"><summary>계산 기준·제한</summary><p class="tcbe-rd-notice">${plan.notes.map(escapeHtml).join(' ')} 관문 개방을 켠 단계만 새 관문 비용을 포함하며, 미개방 꽃잎은 물뿌리개·골드를 준비해 엽니다. 초기화한 사도는 목표 도달에 필수적인 최소 일반칸만 연결 복구하며(클린 슬레이트 최적화), 보크는 연결과 설정한 목표에 필요한 만큼 다시 칠합니다. 황크는 백분율, 보크는 스탯별 칸 수로 평가합니다. 일반칸 스탯은 평가하지 않습니다.</p></details>
    ${renderRedistributionSummary(plan, summaries)}
    <h3 id="tcbe-sec-orders">3. 작업 순서</h3>
    <div class="tcbe-rd-orders-tools">
      <button type="button" class="tcbe-rd-copy-btn" data-copy-orders>📋 작업 순서 텍스트 복사</button>
      <span class="tcbe-rd-copy-status" data-copy-status aria-live="polite"></span>
      <div class="tcbe-rd-filter-chips" style="display:flex;gap:6px;margin-left:auto;">
        <button type="button" class="tcbe-rd-chip tcbe-rd-chip-active" data-action-filter="all">전체 (${plan.actions.length}명)</button>
        <button type="button" class="tcbe-rd-chip" data-action-filter="reset">초기화 대상만 (${plan.actions.filter(a => a.reset).length}명)</button>
        <button type="button" class="tcbe-rd-chip" data-action-filter="add">추가 색칠만 (${plan.actions.filter(a => !a.reset).length}명)</button>
      </div>
    </div>
    <p>① ${plan.actions.filter(action => action.reset).map(action => escapeHtml(action.apostle.name)).join(', ') || '초기화 대상 없음'}${plan.resetCount ? '의 초기화를 먼저 모두 진행하세요.' : ''}<br>② 필요한 추가 재화를 준비한 뒤, 아래 순서로 사도별 최소 연결 복구 및 추가 색칠을 진행하세요. 칸 번호는 원본 데이터 ID이며 지도에 마우스를 올려 확인할 수 있습니다.</p>
    ${renderActionTable(plan, portraitMap)}<h3 id="tcbe-sec-maps">사도별 보드 지도</h3><p>사도 이름을 누르면 지도를 펼칠 수 있습니다. 테두리와 우측 위 기호로 변경 내용을 구분합니다.</p><p class="tcbe-rd-legend"><span class="tcbe-rd-keep">✓ 유지·복구</span><span class="tcbe-rd-add">+ 새로 칠함</span><span class="tcbe-rd-remove">× 지움</span><span class="tcbe-rd-empty">미선택</span></p>${maps || '<p>현재 설정에서 변경할 칸이 없습니다.</p>'}
`;
}
