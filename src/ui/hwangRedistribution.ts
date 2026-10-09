/** 만개·황크 재분배 베타의 입력, 계산 결과와 사도별 변경 지도를 표시한다. */
import { STAT_META_LIST, NODE_TYPE } from '../domain/boardProgress.ts';
import { getSpentHwangCrayons, recommendHwangRedistribution, type RedistributionPlan, type RedistributionOptions } from '../domain/hwangRedistribution.ts';
import type { ApostleProgress, ResourceCostSummary, StatCategory } from '../domain/types.ts';
import { escapeHtml } from './html.ts';
import { lockPageScroll } from './scrollLock.ts';

let dispose: (() => void) | null = null;
export function closeHwangRedistribution(): void { dispose?.(); }
const format = (value: number) => Number(value.toFixed(1)).toLocaleString('ko-KR');
const names = new Map(STAT_META_LIST.map(meta => [meta.key, meta.nameKo]));
const label = (cost: ResourceCostSummary) => [
  ['황크', cost.ultraCrayon], ['보크', cost.epicCrayon], ['중급', cost.averageCrayon], ['하급', cost.basicCrayon], ['골드', cost.gold],
].filter(([, value]) => Number(value) > 0).map(([name, value]) => `${name} ${format(Number(value))}`).join(' · ') || '없음';

/** 사용자 이름은 이스케이프하고 지도는 검증된 원본 좌표만 사용한다. */
export function renderRedistributionResult(plan: RedistributionPlan, options: RedistributionOptions): string {
  const rows = options.priorities.map(target => {
    const before = plan.before[target.stat];
    const after = plan.after[target.stat];
    const scale = Math.max(1, target.target, before, after);
    return `<tr><th>${names.get(target.stat)}</th><td>${format(target.target)}%</td><td>${format(before)}%</td><td>${format(after)}% <small>(${after >= before ? '+' : ''}${format(after - before)}%p)</small></td><td>${format(Math.max(0, target.target - after))}%p</td><td><span class="tcbe-rd-bar" aria-label="현재 ${format(before)}%, 추천 ${format(after)}%"><i style="width:${before / scale * 100}%"></i><b style="width:${after / scale * 100}%"></b></span></td></tr>`;
  }).join('');
  const maps = plan.actions.map(action => {
    const boards = action.apostle.boards.map((board, boardIndex) => {
      const entries = plan.nodes.filter(entry => entry.apostleId === action.apostle.apostleId && entry.boardIndex === boardIndex &&
        entry.node.nodeType !== 0 && entry.node.grid && entry.node.grid.x >= 0 && entry.node.grid.y >= 0);
      if (!entries.length) return '';
      const xs = entries.map(entry => entry.node.grid!.x), ys = entries.map(entry => entry.node.grid!.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      if (maxX - minX > 30 || maxY - minY > 50) return '<p>보드 좌표 범위가 커 지도를 생략했습니다.</p>';
      const tiles = entries.map(entry => {
        const selected = plan.selected.has(entry.key);
        const state = entry.picked ? selected ? 'keep' : 'remove' : selected ? 'add' : 'empty';
        const stat = Object.entries(entry.stats).find(([, value]) => value > 0)?.[0] as StatCategory | undefined;
        const text = stat ? names.get(stat) : entry.node.nodeType === NODE_TYPE.GATE ? '관' : entry.node.nodeType === NODE_TYPE.START ? '시' : '·';
        const operation = entry.picked && selected && action.reset && ![NODE_TYPE.GATE, NODE_TYPE.START, NODE_TYPE.PETAL].includes(entry.node.nodeType as 1 | 2 | 7) ? '초기화 후 복구' : { keep: '유지', remove: '지움', add: '새로 칠함', empty: '미선택' }[state];
        return `<span class="tcbe-rd-tile tcbe-rd-${state}" style="grid-column:${maxX - entry.node.grid!.x + 1};grid-row:${maxY - entry.node.grid!.y + 1}" title="${escapeHtml(`${boardIndex + 1}차 #${entry.node.id} ${text} · ${operation}`)}">${text}</span>`;
      }).join('');
      return `<div><h4>${boardIndex + 1}차</h4><div class="tcbe-rd-map" style="grid-template-columns:repeat(${maxX - minX + 1},22px);grid-template-rows:repeat(${maxY - minY + 1},22px)">${tiles}</div></div>`;
    }).join('');
    const paint = action.paint.map(entry => {
      const stat = Object.entries(entry.stats).filter(([, value]) => value > 0).map(([key, value]) => `${names.get(key as StatCategory)} +${format(value)}%`).join('/');
      return `<li>${entry.boardIndex + 1}차 #${entry.node.id} ${stat || (entry.node.nodeType === NODE_TYPE.BOKR ? '보크 복구·경로' : '일반칸 복구·경로')} <small>(${label(entry.cost)})</small></li>`;
    }).join('');
    return `<details class="tcbe-rd-apostle"><summary>${escapeHtml(action.apostle.name)} · ${action.reset ? '초기화 후 복구·재배치' : '추가 색칠'} · 황크 ${action.spend.ultraCrayon}개</summary>
      <p>환급: ${label(action.refund)}<br>다시 사용: ${label(action.spend)}<br>이 사도 작업 후 황크: ${format(action.balance)}개</p>
      <div class="tcbe-rd-maps">${boards}</div><details><summary>칠할 칸 순서 (${action.paint.length}칸)</summary><ol>${paint || '<li>추가로 칠할 칸 없음</li>'}</ol></details></details>`;
  }).join('');
  const extra = { ...plan.spend };
  for (const key of Object.keys(extra) as Array<keyof ResourceCostSummary>) extra[key] = Math.max(0, (plan.spend[key] || 0) - (plan.refund[key] || 0));
  return `<p class="tcbe-rd-notice">${plan.notes.map(escapeHtml).join(' ')} 열린 관문·꽃잎만 사용하며, 초기화한 사도의 기존 일반칸·보크는 모두 복구합니다. 황크 백분율만 비교하고 일반칸·보크의 추가 스탯은 평가하지 않습니다.</p>
    <p><strong>초기화 ${plan.resetCount}명 / 설정 상한 ${options.maxReset}명 · 미사용 황크 ${format(options.ownedCrayons)} → ${format(plan.remaining)}개</strong><br>가용 황크: 미사용 ${format(options.ownedCrayons)} + 초기화 환급 ${format(plan.refund.ultraCrayon)} = ${format(options.ownedCrayons + plan.refund.ultraCrayon)}개<br>환급 합계: ${label(plan.refund)}<br>사용 합계: ${label(plan.spend)}<br>환급 외 준비 재화: ${label(extra)}</p>
    <div class="tcbe-rd-table-wrap"><table><thead><tr><th>우선순위·스탯</th><th>목표</th><th>현재</th><th>추천</th><th>목표 부족</th><th>현재 / 추천</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3>작업 순서</h3><p>① ${plan.actions.filter(action => action.reset).map(action => escapeHtml(action.apostle.name)).join(', ') || '초기화 대상 없음'}${plan.resetCount ? '의 초기화를 먼저 모두 진행하세요.' : ''}<br>② 필요한 추가 재화를 준비한 뒤, 아래 순서로 사도별 칸을 복구하고 추가 색칠하세요. 칸 번호는 원본 데이터 ID이며 지도에 마우스를 올려 확인할 수 있습니다.</p>
    <p class="tcbe-rd-legend"><span class="tcbe-rd-keep">유지·복구</span><span class="tcbe-rd-add">새로 칠함</span><span class="tcbe-rd-remove">지움</span><span class="tcbe-rd-empty">미선택</span></p>${maps || '<p>현재 설정에서 변경할 칸이 없습니다.</p>'}`;
}

export function openHwangRedistribution(progressMap: Map<string, ApostleProgress>): void {
  closeHwangRedistribution();
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.createElement('dialog');
  const spentCrayons = getSpentHwangCrayons(progressMap);
  dialog.id = 'tcbe-redistribution-dialog';
  dialog.setAttribute('aria-labelledby', 'tcbe-rd-title');
  const defaults: Array<{ stat: StatCategory; target: number }> = [
    { stat: 'atk_phys', target: 2778 }, { stat: 'atk_mag', target: 2778 }, { stat: 'crit_dmg_res', target: 500 },
    { stat: 'hp', target: 1500 }, { stat: 'crit', target: 700 }, { stat: 'crit_dmg', target: 700 },
    { stat: 'def_phys', target: 0 }, { stat: 'def_mag', target: 0 }, { stat: 'crit_res', target: 0 },
  ];
  dialog.innerHTML = `<header><h2 id="tcbe-rd-title">만개·황크 재분배 <small>베타</small></h2><button type="button" data-close aria-label="재분배 창 닫기">닫기</button></header>
    <p>현재 필터와 관계없이 보유 사도 전체를 계산합니다. 게임이나 노트의 데이터를 변경하지 않으며, 입력과 결과는 이 창의 메모리에서만 처리합니다.</p>
    <p class="tcbe-rd-notice">초기화 시 열린 관문·꽃잎은 유지하고 나머지 칸의 재화는 전액 환급되는 조건입니다. 일반칸·보크 복구 비용을 포함하며, 새 관문·꽃잎 해금은 계산하지 않습니다.</p>
    <form><p>이미 사용한 황크 <strong>${format(spentCrayons)}개</strong> (자동 집계) + 추가 보유 황크 = 총 황크 <output data-total aria-live="polite">${format(spentCrayons)}개</output><br><small>추가 보유량을 입력하지 않으면 사용한 황크만 기준으로 계산합니다. 실제 재배분에는 초기화할 사도의 환급분만 사용합니다.</small></p><div class="tcbe-rd-inputs"><label>추가 보유 황크 (미사용) <input name="owned" type="number" min="0" max="1000000" step="1" value="0" required></label><label>초기화 인원 상한 <input name="reset" type="number" min="0" max="300" step="1" value="0" required></label></div>
    <details open><summary>스탯 목표·우선순위 설정</summary><p>위쪽 목표부터 우선합니다. 0은 해당 스탯에 황크를 따로 배분하지 않습니다. 기본 목표는 예시이며 자유롭게 수정하세요.</p><div data-targets></div></details>
    <button type="submit" class="tcbe-btn tcbe-active">추천안 계산</button><span data-status role="status" aria-live="polite"></span></form><section data-result aria-label="재분배 계산 결과"></section>`;
  const targetList = dialog.querySelector<HTMLElement>('[data-targets]')!;
  const invalidateResult = () => {
    const extra = dialog.querySelector<HTMLInputElement>('[name=owned]')?.valueAsNumber;
    const total = dialog.querySelector('[data-total]');
    if (total) total.textContent = extra !== undefined && Number.isSafeInteger(extra) && extra >= 0 ? `${format(spentCrayons + extra)}개` : '입력을 확인해 주세요';
    dialog.querySelector('[data-result]')?.replaceChildren();
    const status = dialog.querySelector('[data-status]');
    if (status) status.textContent = ' 설정을 변경했습니다. 다시 계산해 주세요.';
  };
  const renderTargets = () => {
    targetList.innerHTML = defaults.map((target, index) => `<div class="tcbe-rd-target"><label>${index + 1}. ${names.get(target.stat)} <input data-stat="${target.stat}" type="number" min="0" max="100000" step="0.1" value="${target.target}" required> %</label><button type="button" data-move="${index}" ${index === 0 ? 'disabled' : ''} aria-label="${names.get(target.stat)} 우선순위 올리기">↑</button></div>`).join('');
  };
  const readTargets = () => { for (const input of targetList.querySelectorAll<HTMLInputElement>('input[data-stat]')) {
    const target = defaults.find(item => item.stat === input.dataset.stat); if (target) target.target = input.valueAsNumber;
  } };
  renderTargets();
  targetList.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-move]') : null;
    if (!button) return;
    readTargets(); const index = Number(button.dataset.move);
    if (index > 0) { [defaults[index - 1], defaults[index]] = [defaults[index]!, defaults[index - 1]!]; renderTargets(); invalidateResult(); }
  });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const form = dialog.querySelector('form')!;
  form.addEventListener('input', invalidateResult);
  form.addEventListener('submit', event => {
    event.preventDefault(); if (timer !== null || !form.reportValidity()) return;
    readTargets();
    const options = { ownedCrayons: dialog.querySelector<HTMLInputElement>('[name=owned]')!.valueAsNumber,
      maxReset: dialog.querySelector<HTMLInputElement>('[name=reset]')!.valueAsNumber, priorities: defaults.map(item => ({ ...item })) };
    const status = dialog.querySelector<HTMLElement>('[data-status]')!;
    const result = dialog.querySelector<HTMLElement>('[data-result]')!;
    const controls = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')].map(control => ({ control, disabled: control.disabled }));
    controls.forEach(({ control }) => { control.disabled = true; });
    status.textContent = ' 계산 중…'; result.replaceChildren();
    timer = setTimeout(() => {
      timer = null;
      try { result.innerHTML = renderRedistributionResult(recommendHwangRedistribution(progressMap, options), options); status.textContent = ' 계산 완료'; }
      catch (error) { status.textContent = error instanceof Error ? error.message : '계산에 실패했습니다.'; }
      finally { controls.forEach(({ control, disabled }) => { control.disabled = disabled; }); }
    }, 30);
  });
  document.body.appendChild(dialog);
  const unlock = lockPageScroll();
  dispose = () => { dispose = null; if (timer !== null) clearTimeout(timer); dialog.close(); dialog.remove(); unlock(); if (returnFocus?.isConnected) returnFocus.focus(); };
  dialog.querySelector('[data-close]')?.addEventListener('click', closeHwangRedistribution);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeHwangRedistribution(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeHwangRedistribution();
  } });
  dialog.showModal();
}
