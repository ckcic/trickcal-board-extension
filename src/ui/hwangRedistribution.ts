import { redistributionResourceIcon as resourceIcon } from './redistributionResource.ts';
import { loadRedistributionSettings, saveRedistributionSettings } from './redistributionSettings.ts';
import { findProgressByName } from './cardDetector.ts';
import { STAT_META_LIST, NODE_TYPE, isHwangNode } from '../domain/boardProgress.ts';
import { openExportPresetModal, openImportPresetModal } from './redistributionPresetModal.ts';
import { getSpentHwangCrayons, getSpentBokrCrayons, getAttackPathAvailability, getHwangTargetValue, createRedistributionGoalPreview, readBokrValues, createExampleRedistributionStages, iterateHwangRedistribution, type RedistributionNode, type RedistributionStat, type RedistributionPlan, type RedistributionOptions, type RedistributionAction } from '../domain/hwangRedistribution.ts';
import type { ApostleProgress, ResourceCostSummary, StatCategory } from '../domain/types.ts';
import { escapeHtml } from './html.ts';
import { lockPageScroll } from './scrollLock.ts';
import { getBoardNodeVisual } from './boardNode.ts';
import { renderRedistributionStageEditor, readRedistributionStages, renderHwangStatLimits, getRedistributionStageStats, renderStageTargetHint } from './redistributionStageEditor.ts';
import { renderRedistributionSummary } from './redistributionSummary.ts';
import { calculateRedistributionCurve } from '../domain/redistributionCurve.ts';
import { renderRedistributionCurve } from './redistributionCurve.ts';
import { getHwangStatLimits, getRedistributionStatUnit, roundRedistributionTarget } from '../domain/hwangStatLimits.ts';
import { matchesKoreanSearch } from '../domain/koreanSearch.ts';

let dispose: (() => void) | null = null;
export function closeHwangRedistribution(): void { dispose?.(); }
const format = (value: number) => Number(value.toFixed(1)).toLocaleString('ko-KR');
const hwang = (node: RedistributionNode['node']) => isHwangNode(node) || node.nodeType === NODE_TYPE.HWANG_EXT;
const names = new Map<RedistributionStat, string>(STAT_META_LIST.map(meta => [meta.key, meta.nameKo]));
names.set('attack', '공격력');
/** 합계·사도별 환급·칸별 비용에 같은 재화 아이콘을 대응한다. */
export function renderRedistributionCost(cost: ResourceCostSummary): string {
  const items: Array<[number, string, string]> = [
    [cost.ultraCrayon, 'pastel-ultra', '황크'], [cost.epicCrayon, 'pastel-epic', '보크'],
    [cost.averageCrayon, 'pastel-average', '중급 크레파스'], [cost.basicCrayon, 'pastel-basic', '하급 크레파스'],
    [cost.wateringCan || 0, 'watering-can', '만개 물뿌리개'], [cost.gold, 'icon-gold', '골드'],
  ];
  return items.filter(([value]) => value > 0).map(([value, icon, name]) =>
    `<span class="tcbe-rd-resource" title="${name}" aria-label="${name} ${format(value)}${icon === 'icon-gold' ? '' : '개'}"><span class="tcbe-rd-resource-icon ${icon}" aria-hidden="true"></span><span>${format(value)}${icon === 'icon-gold' ? '' : '개'}</span></span>`
  ).join(' ') || '없음';
}


/** Gold/crayons are already in cost totals; preserve other gate items separately. */
function renderGateItems(entry: RedistributionNode): string {
  if (entry.node.nodeType !== NODE_TYPE.GATE) return '';
  const items = (entry.node.requireItems || []).filter(item => ![610001,610002,610003,610004,610005].includes(item.item) && item.value > 0);
  return items.map(item => {
    const name = item.item === 4300000 ? '★1 공동 교단 증명서' : item.item >= 310000 && item.item < 320000 ? '지정 사도 증명서' : '관문 전용 재화 (종류 확인 필요)';
    return `<span title="원본 아이템 ${item.item}">${name} ${format(item.value)}개</span>`;
  }).join(' · ');
}

export function collectApostlePortraits(progressMap?: Map<string, ApostleProgress>): Map<number | string, string> {
  const map = new Map<number | string, string>();

  // 1. progressMap의 모든 사도에 대해 HeroIcons CDN 기본 초상화 등록
  if (progressMap) {
    progressMap.forEach(progress => {
      if (progress.icon) {
        const cdnUrl = `https://cdn.note.trickcal.com/HeroIcons/${progress.icon}.webp`;
        map.set(progress.apostleId, cdnUrl);
        map.set(progress.name, cdnUrl);
      }
    });
  }

  if (typeof document === 'undefined') return map;

  // 2. DOM에 렌더링된 사도 카드가 있으면 실제 렌더링된 이미지(스킨 등)로 덮어쓰기
  document.querySelectorAll<HTMLElement>('[data-tcbe-apostle-id]').forEach(card => {
    const id = Number(card.getAttribute('data-tcbe-apostle-id'));
    const name = card.getAttribute('data-tcbe-apostle-name');
    const img = card.querySelector<HTMLImageElement>('img[alt]') || card.querySelector<HTMLImageElement>('img');
    if (img?.src) {
      if (id) map.set(id, img.src);
      if (name) map.set(name, img.src);
    }
  });

  if (progressMap) {
    document.querySelectorAll<HTMLImageElement>('img[alt]').forEach(img => {
      const alt = img.alt?.trim();
      if (!alt || !img.src) return;
      const progress = findProgressByName(progressMap, alt);
      if (progress) {
        map.set(progress.apostleId, img.src);
        map.set(progress.name, img.src);
      }
    });
  }

  document.querySelectorAll<HTMLImageElement>('img[alt]').forEach(img => {
    const alt = img.alt?.trim();
    if (alt && img.src && !map.has(alt) && /^https:\/\/(cdn\.)?note\.trickcal\.com\//.test(img.src)) {
      map.set(alt, img.src);
    }
  });

  return map;
}

export function renderApostleAvatar(apostleId: number, name: string, portraitMap?: Map<number | string, string>): string {
  if (!portraitMap) return '';
  const url = portraitMap.get(apostleId) || portraitMap.get(name);
  if (!url) return '';
  return `<img class="tcbe-rd-avatar" src="${escapeHtml(url)}" alt="" aria-hidden="true" loading="lazy" onerror="this.style.display='none'">`;
}

/** 작업 순서 텍스트 복사용 포맷터 */
function generateOrdersText(plan: RedistributionPlan): string {
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

/** 사용자 이름은 이스케이프하고 지도는 검증된 원본 좌표만 사용한다. */
export function renderRedistributionResult(plan: RedistributionPlan, options: RedistributionOptions, portraitMap?: Map<number | string, string>): string {
  const summaries = plan.stageResults ?? (options.priorities || []).map(target => ({ allowBlocked: true,
    targets: [{ ...target, all: false, before: getHwangTargetValue(plan.before, target.stat), after: getHwangTargetValue(plan.after, target.stat) }] }));
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
      const xs = entries.map(entry => entry.node.grid!.x), ys = entries.map(entry => entry.node.grid!.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      if (maxX - minX > 30 || maxY - minY > 50) return '<p>보드 좌표 범위가 커 지도를 생략했습니다.</p>';
      const columns = Math.max(7, maxX - minX + 1);
      const offset = Math.floor((columns - (maxX - minX + 1)) / 2);
      const tiles = entries.map(entry => {
        const selected = plan.selected.has(entry.key);
        const state = entry.picked ? selected ? 'keep' : 'remove' : selected ? 'add' : 'empty';
        const visual = getBoardNodeVisual(visualBoard, entry.node, selected);
        const text = `${visual.statName || ''} ${visual.kind}`.trim();
        const operation = entry.node.nodeType === NODE_TYPE.GATE && !entry.picked && selected ? '관문 개방' : entry.picked && selected && action.reset && ![NODE_TYPE.GATE, NODE_TYPE.START, NODE_TYPE.PETAL].includes(entry.node.nodeType as 1 | 2 | 7) ? '초기화 후 복구' : { keep: '유지', remove: '지움', add: '새로 칠함', empty: '미선택' }[state];
        const title = escapeHtml(`${boardIndex + 1}차 #${entry.node.id} ${text}${visual.flowering ? ` · 꽃잎 ${visual.petalState}` : ''} · ${operation}`);
        return `<span class="tcbe-map-tile tcbe-rd-tile tcbe-rd-${state}${visual.classes}" data-board="${boardIndex + 1}" data-node="${entry.node.id}" style="grid-column:${maxX - entry.node.grid!.x + 1 + offset};grid-row:${maxY - entry.node.grid!.y + 1};background-position:${visual.background} 0" title="${title}" role="img" aria-label="${title}">${visual.contents}<span class="tcbe-rd-state-mark" aria-hidden="true">${{ keep: '✓', add: '+', remove: '×', empty: '' }[state]}</span></span>`;
      }).join('');
      return `<div><h4>${boardIndex + 1}차</h4><div class="tcbe-rd-map" style="grid-template-columns:repeat(${columns},32px);grid-template-rows:repeat(${maxY - minY + 1},32px)">${tiles}</div></div>`;
    }).join('');
    const paint = action.paint.map(entry => {
      const combinedAttack = entry.stats.atk_phys > 0 && entry.stats.atk_phys === entry.stats.atk_mag;
      const stat = [combinedAttack ? `공격력 +${format(entry.stats.atk_phys)}% (물공·마공 각각)` : '',
        ...Object.entries(entry.stats).filter(([key, value]) => value > 0 && !(combinedAttack && ['atk_phys', 'atk_mag'].includes(key)))
          .map(([key, value]) => `${names.get(key as StatCategory)} +${format(value)}%`)].filter(Boolean).join('/');
      const bokrStat = entry.node.nodeType === NODE_TYPE.BOKR ? Object.entries(entry.bokrStats).filter(([, count]) => count > 0).map(([key]) => `${names.get(key as StatCategory)} +${format(readBokrValues(entry.node)[key as StatCategory])}`).join('/') : '';
      return `<li>${entry.boardIndex + 1}차 #${entry.node.id} ${stat || (entry.node.nodeType === NODE_TYPE.BOKR ? `${bokrStat} 보크` : entry.node.nodeType === NODE_TYPE.PETAL ? '꽃잎 개방' : entry.node.nodeType === NODE_TYPE.GATE ? '관문 개방' : '일반칸 복구·경로')} <span class="tcbe-rd-paint-cost">${renderRedistributionCost(entry.cost)} ${renderGateItems(entry)}</span></li>`;
    }).join('');
    const avatar = renderApostleAvatar(action.apostle.apostleId, action.apostle.name, portraitMap);
    return `<details class="tcbe-rd-apostle" id="tcbe-rd-map-${action.apostle.apostleId}"><summary>${avatar}<span>${escapeHtml(action.apostle.name)} · ${action.reset ? '초기화 후 복구·재배치' : '추가 색칠'} · 황크 ${action.spend.ultraCrayon}개 · 보크 ${action.spend.epicCrayon}개</span></summary>
      <p>환급: ${renderRedistributionCost(action.refund)}<br>다시 사용: ${renderRedistributionCost(action.spend)}<br>이 사도 작업 후 황크: ${format(action.balance)}개</p>
      <div class="tcbe-rd-maps">${boards}</div><details><summary>칠할 칸 순서 (${action.paint.length}칸)</summary><ol>${paint || '<li>추가로 칠할 칸 없음</li>'}</ol></details></details>`;
  }).join('');
  const extra = { ...plan.spend };
  for (const key of Object.keys(extra) as Array<keyof ResourceCostSummary>) extra[key] = Math.max(0, (plan.spend[key] || 0) - (plan.refund[key] || 0));
  const gateRows = plan.actions.flatMap(action => action.paint.filter(entry => entry.node.nodeType === NODE_TYPE.GATE).map(entry => `<li>${escapeHtml(action.apostle.name)} · ${entry.boardIndex + 1}차 관문 개방: ${renderRedistributionCost(entry.cost)} ${renderGateItems(entry)}</li>`));
  const hasGoldOption = options.ownedGold !== undefined;
  const hasCanOption = options.ownedWateringCan !== undefined || options.ownedClouds !== undefined;
  const totalOwnedCans = (options.ownedWateringCan ?? 0) + Math.floor((options.ownedClouds ?? 0) / 10);
  const cloudRemainder = (options.ownedClouds ?? 0) % 10;
  return `<h3 id="tcbe-sec-summary">계산 요약</h3><div class="tcbe-rd-cards"><div><small>초기화 / 설정 상한</small><strong>${plan.resetCount} / ${options.maxReset}명</strong></div><div><small>미사용 ${resourceIcon('hwang')}</small><strong>${format(options.ownedCrayons)} → ${format(plan.remaining)}개</strong></div>${plan.remainingBokr === undefined ? '' : `<div><small>미사용 ${resourceIcon('bokr')}</small><strong>${format(options.ownedBokr ?? 0)} → ${format(plan.remainingBokr)}개</strong></div>`}${hasGoldOption ? `<div><small>소지 ${resourceIcon('gold')}</small><strong class="${plan.remainingGold! >= 0 ? 'tcbe-rd-positive' : 'tcbe-rd-short'}">${format(options.ownedGold!)} → ${plan.remainingGold! >= 0 ? `잔여 ${format(plan.remainingGold!)}` : `부족 ${format(Math.abs(plan.remainingGold!))}`}</strong></div>` : ''}${hasCanOption ? `<div><small>소지 ${resourceIcon('watering-can')}</small><strong class="${plan.remainingWateringCan! >= 0 ? 'tcbe-rd-positive' : 'tcbe-rd-short'}">${totalOwnedCans}개 → ${plan.remainingWateringCan! >= 0 ? `잔여 ${plan.remainingWateringCan!}개` : `부족 ${Math.abs(plan.remainingWateringCan!)}개`}</strong></div>` : ''}</div>
    <div class="tcbe-rd-resources"><p>환급 합계: ${renderRedistributionCost(plan.refund)}</p><p>사용 합계: ${renderRedistributionCost(plan.spend)}</p><p>환급 외 준비 재화: ${renderRedistributionCost(extra)}${extra.wateringCan ? ` <small class="tcbe-rd-caption">(만개 물뿌리개 1개 = <span class="tcbe-rd-resource-icon sunshine-cloud tcbe-rd-sm" aria-hidden="true"></span>햇살구름 10개 상당, 총 햇살구름 ${extra.wateringCan * 10}개 필요)</small>` : ''}</p>${(hasGoldOption || hasCanOption) ? `<p class="tcbe-rd-balance-summary"><strong>소지 재화 차감 후 상태:</strong> ${hasGoldOption ? `골드 ${plan.remainingGold! >= 0 ? `<span class="tcbe-rd-positive">${format(plan.remainingGold!)} 잔여</span>` : `<span class="tcbe-rd-short">${format(Math.abs(plan.remainingGold!))} 부족</span>`}` : ''}${hasGoldOption && hasCanOption ? ' · ' : ''}${hasCanOption ? `물뿌리개 ${plan.remainingWateringCan! >= 0 ? `<span class="tcbe-rd-positive">${plan.remainingWateringCan!}개 잔여${cloudRemainder > 0 ? ` (구름 ${cloudRemainder}개 남음)` : ''}</span>` : `<span class="tcbe-rd-short">${Math.abs(plan.remainingWateringCan!)}개 부족 (<span class="tcbe-rd-resource-icon sunshine-cloud tcbe-rd-sm" aria-hidden="true"></span>햇살구름 ${Math.max(0, Math.abs(plan.remainingWateringCan!) * 10 - cloudRemainder)}개 추가 교환 필요)</span>`}` : ''}</p>` : ''}</div>
    ${gateRows.length ? `<div class="tcbe-rd-notice"><strong>추가로 열 관문 ${gateRows.length}개</strong><ul>${gateRows.join('')}</ul><p>골드·크레파스는 위 사용 합계에 포함됩니다. 증명서 등 전용 재화의 보유량과 게임 내 개방 조건은 별도 확인하세요.</p></div>` : ''}
    <details class="tcbe-rd-method"><summary>계산 기준·제한</summary><p class="tcbe-rd-notice">${plan.notes.map(escapeHtml).join(' ')} 관문 개방을 켠 단계만 새 관문 비용을 포함하며, 미개방 꽃잎은 물뿌리개·골드를 준비해 엽니다. 초기화한 사도는 목표 도달에 필수적인 최소 일반칸만 연결 복구하며(클린 슬레이트 최적화), 보크는 연결과 설정한 목표에 필요한 만큼 다시 칠합니다. 황크는 백분율, 보크는 스탯별 칸 수로 평가합니다. 일반칸 스탯은 평가하지 않습니다.</p></details>
    ${renderRedistributionSummary(plan, summaries)}
    <h3 id="tcbe-sec-orders">3. 작업 순서</h3>
    <div class="tcbe-rd-orders-tools"><button type="button" class="tcbe-rd-copy-btn" data-copy-orders>📋 작업 순서 텍스트 복사</button><span class="tcbe-rd-copy-status" data-copy-status aria-live="polite"></span></div>
    <p>① ${plan.actions.filter(action => action.reset).map(action => escapeHtml(action.apostle.name)).join(', ') || '초기화 대상 없음'}${plan.resetCount ? '의 초기화를 먼저 모두 진행하세요.' : ''}<br>② 필요한 추가 재화를 준비한 뒤, 아래 순서로 사도별 최소 연결 복구 및 추가 색칠을 진행하세요. 칸 번호는 원본 데이터 ID이며 지도에 마우스를 올려 확인할 수 있습니다.</p>
    ${renderActionTable(plan, portraitMap)}<h3 id="tcbe-sec-maps">사도별 보드 지도</h3><p>사도 이름을 누르면 지도를 펼칠 수 있습니다. 테두리와 우측 위 기호로 변경 내용을 구분합니다.</p><p class="tcbe-rd-legend"><span class="tcbe-rd-keep">✓ 유지·복구</span><span class="tcbe-rd-add">+ 새로 칠함</span><span class="tcbe-rd-remove">× 지움</span><span class="tcbe-rd-empty">미선택</span></p>${maps || '<p>현재 설정에서 변경할 칸이 없습니다.</p>'}
`;
}

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
    return `<tr><td>${index + 1}</td><th><button type="button" data-show-map="${action.apostle.apostleId}">${avatar}<span>${escapeHtml(action.apostle.name)}</span></button></th><td>${action.reset ? '초기화 후 색칠' : '추가 색칠'}</td><td>${boards || '유지'}</td><td>${renderRedistributionCost(action.refund)}</td><td>${renderRedistributionCost(action.spend)}</td><td>${format(action.balance)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

export function openHwangRedistribution(progressMap: Map<string, ApostleProgress>): void {
  closeHwangRedistribution();
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const portraitMap = collectApostlePortraits(progressMap);
  const dialog = document.createElement('dialog');
  const spentCrayons = getSpentHwangCrayons(progressMap);
  const spentBokr = getSpentBokrCrayons(progressMap);
  const availability = getAttackPathAvailability(progressMap);
  const ownedCount = new Set([...progressMap.values()].filter(a => a.isOwned !== false).map(a => a.apostleId)).size;
  const limits = getHwangStatLimits(progressMap);
  const bokrLimits = getHwangStatLimits(progressMap, 'bokr');
  const allGoal = createRedistributionGoalPreview(progressMap);
  let curveController: AbortController | null = null;
  let calculationController: AbortController | null = null;
  dialog.id = 'tcbe-redistribution-dialog';
  dialog.setAttribute('aria-labelledby', 'tcbe-rd-title');
  const savedSettings = loadRedistributionSettings();
  let stages = savedSettings?.stages ?? createExampleRedistributionStages();
  dialog.innerHTML = `<header><h2 id="tcbe-rd-title">만개·황크 재분배 <small>베타</small></h2><button type="button" data-close aria-label="재분배 창 닫기">닫기</button></header>
    <nav class="tcbe-rd-main-tabs" role="tablist" aria-label="재분배 메인 메뉴">
      <button type="button" role="tab" id="tcbe-tab-settings" data-main-tab="settings" aria-controls="tcbe-panel-settings" aria-selected="true">⚙️ 목표·예산 설정</button>
      <button type="button" role="tab" id="tcbe-tab-result" data-main-tab="result" aria-controls="tcbe-panel-result" aria-selected="false" tabindex="-1">📋 추천 결과 &amp; 작업 순서 <span class="tcbe-rd-tab-badge" data-result-badge hidden>완료</span></button>
      <button type="button" role="tab" id="tcbe-tab-curve" data-main-tab="curve" aria-controls="tcbe-panel-curve" aria-selected="false" tabindex="-1">📈 인원별 비교 그래프</button>
    </nav>
    <div class="tcbe-rd-panels">
      <section role="tabpanel" id="tcbe-panel-settings" aria-labelledby="tcbe-tab-settings" class="tcbe-rd-panel">
        <div class="tcbe-rd-settings-view">
          <p>현재 필터와 관계없이 보유 사도 전체를 계산합니다. 게임이나 노트의 데이터를 변경하지 않습니다.</p>
          <p class="tcbe-rd-notice">초기화해도 열린 관문·꽃잎과 기본 색칠된 1차 시작 칸은 유지됩니다. 지워지는 칸에서 사용한 크레파스 4종·골드만 돌려받으며 물뿌리개는 반환되지 않습니다.</p>
          <form>
            <div class="tcbe-rd-budget-overview">${(['hwang','bokr'] as const).map(resource => `<div>${resourceIcon(resource)} <span>이미 사용 <strong>${format(resource === 'hwang' ? spentCrayons : spentBokr)}개</strong></span><span>+ 미사용 보유 = 총 <output ${resource === 'hwang' ? 'data-total' : 'data-total-bokr'} aria-live="polite">${format(resource === 'hwang' ? spentCrayons : spentBokr)}개</output></span></div>`).join('')}</div>
            <div class="tcbe-rd-inputs"><label>${resourceIcon('hwang')} 추가 보유 (미사용) <input aria-label="추가 보유 황크 (미사용)" name="owned" type="number" min="0" max="1000000" step="1" value="0" required></label><label>${resourceIcon('bokr')} 추가 보유 (미사용) <input aria-label="추가 보유 보크 (미사용)" name="bokr" type="number" min="0" max="1000000" step="1" value="0" required></label><label>초기화 인원 상한 <input name="reset" type="number" min="0" max="${ownedCount}" step="1" value="0" required></label></div>
            <div class="tcbe-rd-inputs tcbe-rd-optional-inputs"><label><span class="tcbe-rd-resource-icon icon-gold" aria-hidden="true"></span> 소지 골드 <input name="gold" type="number" min="0" max="2000000000" step="1" placeholder="선택 (생략 가능)"></label><label><span class="tcbe-rd-resource-icon watering-can" aria-hidden="true"></span> 소지 물뿌리개 <input name="watering-can" type="number" min="0" max="100000" step="1" placeholder="선택 (개수)"></label><label><span class="tcbe-rd-resource-icon sunshine-cloud" aria-hidden="true"></span> 소지 햇살구름 <input name="clouds" type="number" min="0" max="1000000" step="1" placeholder="10개 = 1물뿌리개"></label></div>
            <p>황크·보크는 추가 보유량과 초기화 환급분 안에서 사용합니다. 소지 골드와 물뿌리개/햇살구름(10개당 물뿌리개 1개 환산)을 입력하면 차감 후 잔여/부족분을 계산하며, 미입력 시 순수 필요량만 표시합니다.</p>
            ${renderHwangStatLimits(limits)}${renderHwangStatLimits(bokrLimits, 'bokr')}
            <details open data-settings><summary>목표·경로 설정</summary>
            <div class="tcbe-rd-tabs" role="tablist" aria-label="목표 설정 메뉴"><button type="button" role="tab" id="rd-edit-tab" data-settings-tab="edit" aria-controls="rd-edit-panel" aria-selected="true">단계별 우선순위</button><button type="button" role="tab" id="rd-help-tab" data-settings-tab="help" aria-controls="rd-help-panel" aria-selected="false" tabindex="-1">목표·경로 도움말</button></div>
            <section role="tabpanel" id="rd-edit-panel" aria-labelledby="rd-edit-tab"><p>단계 순서대로 목표를 채웁니다. <small style="color:#64748b;">(⠿ 드래그 또는 번호 드롭다운으로 순서 직접 변경)</small></p>
            <div data-targets></div><div class="tcbe-rd-stage-tools"><button type="button" data-add-stage>${resourceIcon('hwang')} 단계 추가</button><button type="button" data-add-bokr-stage>${resourceIcon('bokr')} 단계 추가</button><button type="button" data-examples>예시 7단계로 되돌리기</button><button type="button" data-export-preset class="tcbe-rd-preset-btn" title="현재 단계 목록을 JSON 텍스트로 내보내고 복사합니다">📋 설정 내보내기</button><button type="button" data-import-preset class="tcbe-rd-preset-btn" title="공유받은 단계 설정 JSON을 붙여넣어 가져옵니다">📥 설정 가져오기</button></div></section>
            <section role="tabpanel" id="rd-help-panel" aria-labelledby="rd-help-tab" hidden><h4>목표와 누적 범위</h4><p>황크 공격력은 물공·마공 각각 6%, 나머지는 8% 단위입니다. 보크는 물공·마공을 구분합니다. 1~2차 목표 20칸은 두 차수를 합쳐 20칸이며, 1차 목표와 중복해서 더하지 않습니다.</p><h4>막힌 경로와 관문은 별개입니다</h4><p>막힌 경로는 <strong>황크 방어력(물방·마방)·치저</strong> 칸을 통과해야 하는 경로입니다. 포함을 끄면 색칠 여부와 무관하게 그 황크를 통과하지 않습니다. <strong>보크 방어력·치저는 통과할 수 있습니다.</strong> 기존 칠한 칸을 자동으로 지우지는 않으며 초기화 시 일반칸 복구 경로는 별도로 유지합니다.</p><p>‘관문 개방 포함’을 켜면 잠긴 보드도 경로를 연결해 계산합니다. 필요한 관문의 골드·크레파스와 증명서 등 전용 재화를 결과에 표시합니다. 전용 재화의 보유량과 게임 내 개방 조건은 별도로 확인해야 합니다. 끈 단계는 처음 열려 있던 보드 범위만 목표로 삼습니다.</p><h4>공격력 전부의 계산 범위</h4><div class="tcbe-rd-table-wrap"><table><thead><tr><th>관문 기준</th><th>막힌 경로 제외</th><th>막힌 경로 포함</th></tr></thead><tbody><tr><th>관문 개방 끔</th><td>${format(availability.current.unblocked)}% (${availability.current.unblocked / 6}칸)</td><td>${format(availability.current.all)}% (${availability.current.all / 6}칸)</td></tr><tr><th>관문 개방 켬 · 최대 범위</th><td>${format(availability.opened.unblocked)}% (${availability.opened.unblocked / 6}칸)</td><td>${format(availability.opened.all)}% (${availability.opened.all / 6}칸)</td></tr></tbody></table></div><p>모두 보유 사도와 꽃잎 개방을 포함한 경로 기준이며, 예산 적용 전입니다. ‘전체 최대’와 현재 관문에서 가능한 ‘전부’는 다를 수 있습니다.</p></section></details>
            <div class="tcbe-rd-search-mode"><label>계산 방식 <select name="search-mode"><option value="fast">빠른 탐색</option><option value="thorough">상세 탐색 (느림)</option></select></label><small>빠른 탐색은 초기화 조합 비교를 줄입니다. 상세 탐색은 더 좋은 조합을 찾을 수 있지만 오래 걸립니다.</small></div>
            <div class="tcbe-rd-sticky-bar">
              <button type="submit" class="tcbe-btn tcbe-active">추천안 계산</button>
              <button type="button" data-cancel-calculation hidden>계산 취소</button>
              <span data-status role="status" aria-live="polite"></span>
            </div>
          </form>
        </div>
      </section>
      <section role="tabpanel" id="tcbe-panel-result" aria-labelledby="tcbe-tab-result" class="tcbe-rd-panel" hidden>
        <div class="tcbe-rd-result-container">
          <div class="tcbe-rd-result-content" data-result aria-label="재분배 계산 결과">
            <div class="tcbe-rd-empty-placeholder"><p>👈 <strong>[목표·예산 설정]</strong> 탭에서 예산과 목표를 확인한 후<br><strong>[추천안 계산]</strong>을 누르면 여기에 상세 작업 순서와 사도별 보드 지도가 표시됩니다.</p></div>
          </div>
          <nav class="tcbe-rd-toc" aria-label="빠른 이동 목차" data-toc-container hidden>
            <div class="tcbe-rd-toc-header"><strong>빠른 이동 목차</strong></div>
            <div class="tcbe-rd-toc-section">
              <span class="tcbe-rd-toc-category">주요 섹션</span>
              <button type="button" class="tcbe-rd-toc-item" data-toc-target="tcbe-sec-summary">📊 계산 요약 &amp; 재화</button>
              <button type="button" class="tcbe-rd-toc-item" data-toc-target="tcbe-sec-stages">🎯 목표 달성 요약</button>
              <button type="button" class="tcbe-rd-toc-item" data-toc-target="tcbe-sec-orders">🔢 3. 작업 순서</button>
              <button type="button" class="tcbe-rd-toc-item" data-toc-target="tcbe-sec-maps">🗺️ 사도별 지도 전체</button>
            </div>
            <div class="tcbe-rd-toc-section" data-toc-apostles-section>
              <div class="tcbe-rd-toc-category"><span>사도별 바로가기</span><span class="tcbe-rd-toc-count" data-toc-count></span></div>
              <input type="search" class="tcbe-rd-toc-search" data-toc-search placeholder="사도 이름 검색 (초성 지원)" aria-label="사도 이름 검색">
              <div class="tcbe-rd-toc-apostles" data-toc-apostles></div>
            </div>
            <div class="tcbe-rd-toc-footer">
              <button type="button" class="tcbe-rd-toc-top" data-toc-top>↑ 맨 위로</button>
            </div>
          </nav>
        </div>
      </section>
      <section role="tabpanel" id="tcbe-panel-curve" aria-labelledby="tcbe-tab-curve" class="tcbe-rd-panel" hidden>
        <div class="tcbe-rd-curve-preview">
          <h3>초기화 인원별 스탯 미리 계산</h3>
          <p>추천안을 먼저 계산할 필요 없이 현재 예산·목표로 0명부터 전체 인원을 비교합니다. 그래프를 확인한 뒤 초기화 인원 상한을 정하고 추천안을 계산하세요.</p>
          <div class="tcbe-rd-curve-controls"><button type="button" data-curve>인원별 그래프 계산</button><span data-curve-status role="status" aria-live="polite"></span></div>
          <div data-curve-result></div>
        </div>
      </section>
    </div>`;
  const targetList = dialog.querySelector<HTMLElement>('[data-targets]')!;
  const readOptionalInt = (name: string): number | undefined => {
    const input = dialog.querySelector<HTMLInputElement>(`[name=${name}]`);
    if (!input || !input.value.trim()) return undefined;
    const num = input.valueAsNumber;
    return Number.isSafeInteger(num) && num >= 0 ? num : undefined;
  };
  if (savedSettings) {
    for (const name of ['owned', 'bokr', 'reset'] as const) {
      dialog.querySelector<HTMLInputElement>(`[name=${name}]`)!.value = String(name === 'reset' ? Math.min(savedSettings.reset, ownedCount) : savedSettings[name]);
    }
    if (savedSettings.gold !== undefined) dialog.querySelector<HTMLInputElement>('[name=gold]')!.value = String(savedSettings.gold);
    if (savedSettings.wateringCan !== undefined) dialog.querySelector<HTMLInputElement>('[name=watering-can]')!.value = String(savedSettings.wateringCan);
    if (savedSettings.clouds !== undefined) dialog.querySelector<HTMLInputElement>('[name=clouds]')!.value = String(savedSettings.clouds);
    dialog.querySelector<HTMLSelectElement>('[name=search-mode]')!.value = savedSettings.searchMode;
  }
  const saveSettings = () => saveRedistributionSettings({
    owned: dialog.querySelector<HTMLInputElement>('[name=owned]')!.valueAsNumber,
    bokr: dialog.querySelector<HTMLInputElement>('[name=bokr]')!.valueAsNumber,
    reset: dialog.querySelector<HTMLInputElement>('[name=reset]')!.valueAsNumber,
    gold: readOptionalInt('gold'),
    wateringCan: readOptionalInt('watering-can'),
    clouds: readOptionalInt('clouds'),
    searchMode: dialog.querySelector<HTMLSelectElement>('[name=search-mode]')!.value as 'fast' | 'thorough',
    stages: readRedistributionStages(targetList),
  });
  let saveSettingsTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSaveSettings = () => {
    if (saveSettingsTimer !== null) clearTimeout(saveSettingsTimer);
    saveSettingsTimer = setTimeout(saveSettings, 300);
  };
  let currentCalculatedPlan: RedistributionPlan | null = null;
  const invalidateResult = (event?: Event) => {
    debouncedSaveSettings();
    const targetName = event?.target instanceof HTMLInputElement ? event.target.name : '';
    const keepCurve = ['reset', 'gold', 'watering-can', 'clouds'].includes(targetName);
    if (!keepCurve) {
      curveController?.abort();
      dialog.querySelector('[data-curve-result]')?.replaceChildren();
      const curveStatus = dialog.querySelector('[data-curve-status]');
      if (curveStatus) curveStatus.textContent = '';
    }
    for (const [name, selector, spent] of [['owned', '[data-total]', spentCrayons], ['bokr', '[data-total-bokr]', spentBokr]] as const) {
      const extra = dialog.querySelector<HTMLInputElement>(`[name=${name}]`)?.valueAsNumber;
      const total = dialog.querySelector(selector);
      if (total) total.textContent = extra !== undefined && Number.isSafeInteger(extra) && extra >= 0 ? `${format(spent + extra)}개` : '입력을 확인해 주세요';
    }
    const result = dialog.querySelector<HTMLElement>('[data-result]');
    if (currentCalculatedPlan && result && result.children.length > 0) {
      result.classList.add('tcbe-rd-stale-content');
      if (!result.querySelector('.tcbe-rd-stale-banner')) {
        const banner = document.createElement('div');
        banner.className = 'tcbe-rd-stale-banner';
        banner.innerHTML = '<span>⚠️ 목표·예산 설정이 변경되었습니다. 변경사항을 반영하려면 <strong>추천안 계산</strong>을 다시 실행하세요.</span>';
        result.prepend(banner);
      }
    } else {
      result?.replaceChildren();
      const tocContainer = dialog.querySelector<HTMLElement>('[data-toc-container]');
      if (tocContainer) tocContainer.hidden = true;
    }
    const badge = dialog.querySelector<HTMLElement>('[data-result-badge]');
    if (badge) badge.hidden = true;
    const status = dialog.querySelector('[data-status]');
    if (status) status.textContent = ' 설정을 변경했습니다. 다시 계산해 주세요.';
  };
  const renderTargets = () => {
    targetList.innerHTML = renderRedistributionStageEditor(stages, limits, bokrLimits, allGoal);
    dialog.querySelector<HTMLButtonElement>('[data-add-stage]')!.disabled = stages.length >= 30;
    dialog.querySelector<HTMLButtonElement>('[data-add-bokr-stage]')!.disabled = stages.length >= 30;
  };
  const readTargets = () => { stages = readRedistributionStages(targetList); };
  renderTargets();
  invalidateResult();
  dialog.querySelector('[data-status]')!.textContent = '';

  const mainTabs = [...dialog.querySelectorAll<HTMLButtonElement>('[data-main-tab]')];
  const selectMainTab = (tabName: 'settings' | 'result' | 'curve') => {
    for (const tab of mainTabs) {
      const active = tab.dataset.mainTab === tabName;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = dialog.querySelector<HTMLElement>(`#${tab.getAttribute('aria-controls')}`);
      if (panel) panel.hidden = !active;
    }
  };
  for (const tab of mainTabs) {
    tab.addEventListener('click', () => selectMainTab(tab.dataset.mainTab as 'settings' | 'result' | 'curve'));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = mainTabs[event.key === 'Home' ? 0 : event.key === 'End' ? mainTabs.length - 1 : (mainTabs.indexOf(tab) + 1) % mainTabs.length]!;
      selectMainTab(next.dataset.mainTab as 'settings' | 'result' | 'curve');
      next.focus();
    });
  }

  let currentTocPlan: RedistributionPlan | null = null;
  const renderTocApostles = (actions: RedistributionAction[]) => {
    const apostlesContainer = dialog.querySelector<HTMLElement>('[data-toc-apostles]');
    if (!apostlesContainer) return;
    if (!actions.length) {
      apostlesContainer.innerHTML = '<div style="color:#94a3b8;padding:8px 4px;text-align:center;">사도 없음</div>';
      return;
    }
    apostlesContainer.innerHTML = actions.map(action => {
      const badgeClass = action.reset ? 'tcbe-rd-toc-badge-reset' : 'tcbe-rd-toc-badge-add';
      const badgeText = action.reset ? '초기화' : '추가';
      const avatar = renderApostleAvatar(action.apostle.apostleId, action.apostle.name, portraitMap);
      return `<button type="button" class="tcbe-rd-toc-item tcbe-rd-toc-apostle-item" data-toc-target="tcbe-rd-map-${action.apostle.apostleId}" data-apostle-name="${escapeHtml(action.apostle.name)}">${avatar}<span class="tcbe-rd-toc-name" title="${escapeHtml(action.apostle.name)}">${escapeHtml(action.apostle.name)}</span><span class="tcbe-rd-toc-badge ${badgeClass}">${badgeText}</span></button>`;
    }).join('') + '<div class="tcbe-rd-toc-empty" style="color:#94a3b8;padding:8px 4px;text-align:center;display:none;">검색 결과 없음</div>';
  };

  const filterTocApostles = (query: string) => {
    const apostlesContainer = dialog.querySelector<HTMLElement>('[data-toc-apostles]');
    if (!apostlesContainer) return;
    const q = query.trim();
    const items = apostlesContainer.querySelectorAll<HTMLButtonElement>('.tcbe-rd-toc-apostle-item');
    const emptyEl = apostlesContainer.querySelector<HTMLElement>('.tcbe-rd-toc-empty');
    let visibleCount = 0;
    for (const item of items) {
      const name = item.dataset.apostleName || '';
      const visible = !q || matchesKoreanSearch(name, q);
      item.style.display = visible ? '' : 'none';
      if (visible) visibleCount++;
    }
    if (emptyEl) emptyEl.style.display = visibleCount === 0 ? '' : 'none';
  };

  const updateToc = (plan: RedistributionPlan) => {
    currentTocPlan = plan;
    const tocContainer = dialog.querySelector<HTMLElement>('[data-toc-container]');
    const countEl = dialog.querySelector<HTMLElement>('[data-toc-count]');
    const searchInput = dialog.querySelector<HTMLInputElement>('[data-toc-search]');
    if (!tocContainer) return;
    if (!plan.actions.length) {
      tocContainer.hidden = true;
      return;
    }
    if (countEl) countEl.textContent = `${plan.actions.length}명`;
    if (searchInput) searchInput.value = '';
    renderTocApostles(plan.actions);
    tocContainer.hidden = false;
  };

  dialog.querySelector<HTMLInputElement>('[data-toc-search]')?.addEventListener('input', event => {
    filterTocApostles((event.target as HTMLInputElement).value);
  });

  const resultContent = dialog.querySelector<HTMLElement>('.tcbe-rd-result-content') || dialog.querySelector<HTMLElement>('[data-result]')!;
  dialog.querySelector('[data-toc-top]')?.addEventListener('click', () => {
    resultContent.scrollTo({ top: 0, behavior: 'smooth' });
  });
  dialog.querySelector('[data-toc-container]')?.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-toc-target]');
    if (!button) return;
    const targetId = button.dataset.tocTarget;
    if (!targetId) return;
    const targetElement = dialog.querySelector<HTMLElement>(`#${targetId}`);
    if (targetElement) {
      if (targetElement instanceof HTMLDetailsElement) {
        targetElement.open = true;
      } else {
        const details = targetElement.closest<HTMLDetailsElement>('details');
        if (details) details.open = true;
      }
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  const settingsTabs = [...dialog.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')];
  const selectTab = (button: HTMLButtonElement) => {
    for (const item of settingsTabs) {
      const active = item === button;
      item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1;
      dialog.querySelector<HTMLElement>(`#${item.getAttribute('aria-controls')}`)!.hidden = !active;
    }
  };
  for (const button of settingsTabs) {
    button.addEventListener('click', () => selectTab(button));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = settingsTabs[event.key === 'Home' ? 0 : event.key === 'End' ? settingsTabs.length - 1 : (settingsTabs.indexOf(button) + 1) % settingsTabs.length]!;
      selectTab(next); next.focus();
    });
  }

  // 우선순위 단계 드래그 앤 드롭 순서 변경 및 가장자리 자동 스크롤(Auto Scroll)
  let dragSourceIndex: number | null = null;
  let autoScrollRafId: number | null = null;
  let autoScrollSpeed = 0;
  const settingsPanel = dialog.querySelector<HTMLElement>('#tcbe-panel-settings')!;

  const stopAutoScroll = () => {
    if (autoScrollRafId !== null) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }
    autoScrollSpeed = 0;
  };

  const autoScrollLoop = () => {
    if (autoScrollSpeed !== 0 && settingsPanel) {
      settingsPanel.scrollTop += autoScrollSpeed;
      autoScrollRafId = requestAnimationFrame(autoScrollLoop);
    } else {
      stopAutoScroll();
    }
  };

  const updateAutoScroll = (clientY: number) => {
    if (!settingsPanel || dragSourceIndex === null) {
      stopAutoScroll();
      return;
    }
    const rect = settingsPanel.getBoundingClientRect();
    const edgeThreshold = 80;
    const maxSpeed = 16;

    if (clientY < rect.top + edgeThreshold && clientY >= rect.top - 60) {
      const distance = Math.max(0, clientY - rect.top);
      const factor = (edgeThreshold - distance) / edgeThreshold;
      autoScrollSpeed = -Math.max(3, Math.round(Math.min(1, factor) * maxSpeed));
    } else if (clientY > rect.bottom - edgeThreshold && clientY <= rect.bottom + 60) {
      const distance = Math.max(0, rect.bottom - clientY);
      const factor = (edgeThreshold - distance) / edgeThreshold;
      autoScrollSpeed = Math.max(3, Math.round(Math.min(1, factor) * maxSpeed));
    } else {
      autoScrollSpeed = 0;
    }

    if (autoScrollSpeed !== 0 && autoScrollRafId === null) {
      autoScrollRafId = requestAnimationFrame(autoScrollLoop);
    } else if (autoScrollSpeed === 0 && autoScrollRafId !== null) {
      stopAutoScroll();
    }
  };

  settingsPanel.addEventListener('dragover', event => {
    if (dragSourceIndex !== null) {
      event.preventDefault();
      updateAutoScroll(event.clientY);
    }
  });

  targetList.addEventListener('dragstart', event => {
    const stage = (event.target as HTMLElement).closest<HTMLElement>('[data-stage]');
    if (!stage) return;
    dragSourceIndex = Number(stage.dataset.stage);
    stage.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(dragSourceIndex));
    }
  });
  targetList.addEventListener('dragover', event => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    updateAutoScroll(event.clientY);
    const targetStage = (event.target as HTMLElement).closest<HTMLElement>('[data-stage]');
    if (!targetStage || dragSourceIndex === null) return;
    const rect = targetStage.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    targetList.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
      if (el !== targetStage) el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    if (event.clientY < midY) {
      targetStage.classList.add('drag-over-top');
      targetStage.classList.remove('drag-over-bottom');
    } else {
      targetStage.classList.add('drag-over-bottom');
      targetStage.classList.remove('drag-over-top');
    }
  });
  targetList.addEventListener('dragleave', event => {
    const targetStage = (event.target as HTMLElement).closest<HTMLElement>('[data-stage]');
    if (targetStage && !targetStage.contains(event.relatedTarget as Node)) {
      targetStage.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  });
  targetList.addEventListener('drop', event => {
    event.preventDefault();
    stopAutoScroll();
    const targetStage = (event.target as HTMLElement).closest<HTMLElement>('[data-stage]');
    targetList.querySelectorAll('.drag-over-top, .drag-over-bottom, .dragging').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
    if (!targetStage || dragSourceIndex === null) return;
    const targetIndex = Number(targetStage.dataset.stage);
    if (dragSourceIndex === targetIndex) return;
    readTargets();
    const [moved] = stages.splice(dragSourceIndex, 1);
    if (moved) {
      const rect = targetStage.getBoundingClientRect();
      const insertIndex = event.clientY > rect.top + rect.height / 2
        ? (dragSourceIndex < targetIndex ? targetIndex : targetIndex + 1)
        : (dragSourceIndex < targetIndex ? targetIndex - 1 : targetIndex);
      stages.splice(Math.max(0, Math.min(stages.length, insertIndex)), 0, moved);
      renderTargets();
      invalidateResult();
    }
    dragSourceIndex = null;
  });
  targetList.addEventListener('dragend', () => {
    stopAutoScroll();
    targetList.querySelectorAll('.drag-over-top, .drag-over-bottom, .dragging').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
    dragSourceIndex = null;
  });

  targetList.addEventListener('change', event => {
    if (event.target instanceof HTMLSelectElement && event.target.hasAttribute('data-stage-order')) {
      const oldIndex = Number(event.target.dataset.stageOrder);
      const newIndex = Number(event.target.value);
      if (oldIndex !== newIndex && oldIndex >= 0 && oldIndex < stages.length && newIndex >= 0 && newIndex < stages.length) {
        readTargets();
        const [moved] = stages.splice(oldIndex, 1);
        if (moved) {
          stages.splice(newIndex, 0, moved);
          renderTargets();
          invalidateResult();
        }
      }
      return;
    }
    if (event.target instanceof HTMLInputElement && event.target.hasAttribute('data-resource')) {
      readTargets(); const stage = stages[Number(event.target.closest<HTMLElement>('[data-stage]')!.dataset.stage)]!;
      const bokr = stage.resource === 'bokr';
      stage.boardIndex = undefined; stage.boardThrough = bokr ? 0 : undefined;
      stage.targets = [...new Map(stage.targets.map(target => {
        const stat = bokr && target.stat === 'attack' ? 'atk_phys' : !bokr && ['atk_phys', 'atk_mag'].includes(target.stat) ? 'attack' : target.stat;
        return [stat, { stat, target: null }];
      })).values()];
      renderTargets(); invalidateResult(); return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      const row = event.target.closest('[data-target]');
      if (row) {
        const stat = row.querySelector<HTMLSelectElement>('[data-stat]')!.value as RedistributionStat;
        const bokr = row.closest('[data-stage]')!.querySelector<HTMLInputElement>('[data-resource]:checked')!.value === 'bokr';
        const unit = bokr ? 1 : getRedistributionStatUnit(stat);
        const input = row.querySelector<HTMLInputElement>('[data-value]')!;
        input.step = String(unit); input.max = String(Math.floor(100000 / unit) * unit);
        if (Number.isFinite(input.valueAsNumber)) input.value = String(bokr ? Math.ceil(input.valueAsNumber) : roundRedistributionTarget(input.valueAsNumber, stat));
        row.querySelector('[data-limit]')!.textContent = renderStageTargetHint(stat, bokr, bokr ? bokrLimits : limits);
      }
    }
    if (event.target instanceof HTMLSelectElement && event.target.hasAttribute('data-mode')) {
      const row = event.target.closest('[data-target]')!;
      const input = row.querySelector<HTMLInputElement>('[data-value]')!;
      input.disabled = event.target.value === 'all'; input.required = !input.disabled;
    }
    readTargets(); renderTargets(); invalidateResult();
  });
  targetList.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-stage-action]') : null;
    if (!button) return;
    readTargets(); const index = Number(button.dataset.index), action = button.dataset.stageAction;
    const stage = stages[index]; if (!stage) return;
    if (action === 'up' && index > 0) [stages[index - 1], stages[index]] = [stage, stages[index - 1]!];
    if (action === 'down' && index < stages.length - 1) [stages[index], stages[index + 1]] = [stages[index + 1]!, stage];
    if (action === 'delete' && stages.length > 1) stages.splice(index, 1);
    if (action === 'remove-target' && stage.targets.length > 1) stage.targets.splice(Number(button.dataset.targetIndex), 1);
    if (action === 'add-target') {
      const stat = getRedistributionStageStats(stage).map(([stat]) => stat).find(stat => !stage.targets.some(target => target.stat === stat));
      if (stat) stage.targets.push({ stat, target: stage.resource === 'bokr' ? null : 0 });
    }
    renderTargets(); invalidateResult();
  });
  dialog.querySelector('[data-add-bokr-stage]')!.addEventListener('click', () => {
    readTargets(); if (stages.length < 30) stages.push({ resource: 'bokr', boardThrough: 0, allowBlocked: false, targets: [{ stat: 'atk_phys', target: null }] });
    renderTargets(); invalidateResult();
  });
  dialog.querySelector('[data-add-stage]')!.addEventListener('click', () => {
    readTargets(); if (stages.length < 30) stages.push({ allowBlocked: false, targets: [{ stat: 'attack', target: 0 }] });
    renderTargets(); invalidateResult();
  });
  dialog.querySelector('[data-examples]')!.addEventListener('click', () => {
    stages = createExampleRedistributionStages(); renderTargets(); invalidateResult();
  });
  dialog.querySelector('[data-export-preset]')!.addEventListener('click', () => {
    readTargets();
    openExportPresetModal(dialog, stages);
  });
  dialog.querySelector('[data-import-preset]')!.addEventListener('click', () => {
    openImportPresetModal(dialog, importedStages => {
      stages = importedStages;
      renderTargets();
      invalidateResult();
      const status = dialog.querySelector<HTMLElement>('[data-status]');
      if (status) status.textContent = ` ${stages.length}개 단계 설정을 가져왔습니다.`;
    });
  });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const form = dialog.querySelector('form')!;
  form.addEventListener('input', invalidateResult);
  form.addEventListener('change', invalidateResult);
  const cancelCalculation = dialog.querySelector<HTMLButtonElement>('[data-cancel-calculation]')!;
  cancelCalculation.addEventListener('click', () => { calculationController?.abort(); dialog.querySelector('[data-status]')!.textContent = ' 계산을 취소했습니다.'; });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (timer !== null || calculationController || curveController || !form.reportValidity()) return;
    readTargets();
    const options: RedistributionOptions = {
      searchMode: dialog.querySelector<HTMLSelectElement>('[name=search-mode]')!.value as 'fast' | 'thorough',
      ownedCrayons: dialog.querySelector<HTMLInputElement>('[name=owned]')!.valueAsNumber,
      ownedBokr: dialog.querySelector<HTMLInputElement>('[name=bokr]')!.valueAsNumber,
      maxReset: dialog.querySelector<HTMLInputElement>('[name=reset]')!.valueAsNumber,
      ownedGold: readOptionalInt('gold'),
      ownedWateringCan: readOptionalInt('watering-can'),
      ownedClouds: readOptionalInt('clouds'),
      stages,
    };
    const status = dialog.querySelector<HTMLElement>('[data-status]')!;
    const result = dialog.querySelector<HTMLElement>('[data-result]')!;
    const controls = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select')].map(control => ({ control, disabled: control.disabled }));
    controls.forEach(({ control }) => { control.disabled = true; });
    const controller = new AbortController(); calculationController = controller;
    cancelCalculation.hidden = false; cancelCalculation.disabled = false;
    status.textContent = ' 계산 중…'; result.replaceChildren();
    timer = setTimeout(async () => {
      timer = null;
      try {
        let plan: RedistributionPlan | undefined;
        for (const point of iterateHwangRedistribution(progressMap, options, true)) {
          if (controller.signal.aborted) return;
          plan = point.plan; status.textContent = ` 계산 중 · 초기화 상한 ${point.limit}명 기준 (요청 상한 ${options.maxReset}명)`;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (controller.signal.aborted) return;
        currentCalculatedPlan = plan!;
        result.classList.remove('tcbe-rd-stale-content');
        result.querySelector('.tcbe-rd-stale-banner')?.remove();
        result.innerHTML = renderRedistributionResult(plan!, options, portraitMap);
        status.textContent = ' 계산 완료';
        updateToc(plan!);
        const badge = dialog.querySelector<HTMLElement>('[data-result-badge]');
        if (badge) badge.hidden = false;
        selectMainTab('result');
        const resultContent = dialog.querySelector<HTMLElement>('.tcbe-rd-result-content');
        if (resultContent) resultContent.scrollTo({ top: 0, behavior: 'smooth' });
      }
      catch (error) { status.textContent = error instanceof Error ? error.message : '계산에 실패했습니다.'; }
      finally { calculationController = null; cancelCalculation.hidden = true; controls.forEach(({ control, disabled }) => { control.disabled = disabled; }); }
    }, 30);
  });
  document.body.appendChild(dialog);
  dialog.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains('tcbe-rd-avatar')) {
      event.target.style.display = 'none';
    }
  }, true);
  dialog.addEventListener('click', async event => {
    const copyButton = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-copy-orders]') : null;
    if (copyButton && currentCalculatedPlan) {
      const statusEl = dialog.querySelector<HTMLElement>('[data-copy-status]');
      const text = generateOrdersText(currentCalculatedPlan);
      try {
        await navigator.clipboard.writeText(text);
        if (statusEl) {
          statusEl.textContent = '✓ 복사 완료';
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
        }
      } catch {
        if (statusEl) statusEl.textContent = '복사 실패 (권한 필요)';
      }
      return;
    }
    const curveButton = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-curve]') : null;
    if (curveButton) {
      if (calculationController) return;
      if (!form.reportValidity()) return;
      readTargets();
      const options: RedistributionOptions = {
        searchMode: dialog.querySelector<HTMLSelectElement>('[name=search-mode]')!.value as 'fast' | 'thorough',
        ownedCrayons: dialog.querySelector<HTMLInputElement>('[name=owned]')!.valueAsNumber,
        ownedBokr: dialog.querySelector<HTMLInputElement>('[name=bokr]')!.valueAsNumber,
        ownedGold: readOptionalInt('gold'),
        ownedWateringCan: readOptionalInt('watering-can'),
        ownedClouds: readOptionalInt('clouds'),
        maxReset: 0,
        stages,
      };
      if (curveController) { curveController.abort(); return; }
      const controller = new AbortController(); curveController = controller;
      const status = dialog.querySelector<HTMLElement>('[data-curve-status]')!, result = dialog.querySelector<HTMLElement>('[data-curve-result]')!;
      const controls = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select')].map(control => ({ control, disabled: control.disabled }));
      controls.forEach(({ control }) => { control.disabled = true; });
      curveButton.disabled = false; curveButton.textContent = '그래프 계산 취소'; result.replaceChildren();
      try {
        const curve = await calculateRedistributionCurve(progressMap, options, (_done, _total, limit, max) => { status.textContent = ` 계산 중 · 초기화 상한 ${limit}명 기준 (0~${max}명 비교)`; }, controller.signal);
        if (!controller.signal.aborted) { result.innerHTML = renderRedistributionCurve(curve); status.textContent = ' 계산 완료'; }
      } catch (error) { status.textContent = error instanceof Error ? error.message : '그래프 계산에 실패했습니다.'; }
      finally { curveController = null; curveButton.textContent = '인원별 그래프 계산'; controls.forEach(({ control, disabled }) => { control.disabled = disabled; }); }
      return;
    }
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-show-map]') : null;
    if (!button) return;
    const map = dialog.querySelector<HTMLDetailsElement>(`#tcbe-rd-map-${button.dataset.showMap}`);
    if (map) { map.open = true; map.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  const unlock = lockPageScroll();
  dispose = () => { dispose = null; stopAutoScroll(); calculationController?.abort(); curveController?.abort(); if (timer !== null) clearTimeout(timer); if (saveSettingsTimer !== null) { clearTimeout(saveSettingsTimer); saveSettings(); } dialog.close(); dialog.remove(); unlock(); if (returnFocus?.isConnected) returnFocus.focus(); };
  dialog.querySelector('[data-close]')?.addEventListener('click', closeHwangRedistribution);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeHwangRedistribution(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeHwangRedistribution();
  } });
  dialog.showModal();
}
