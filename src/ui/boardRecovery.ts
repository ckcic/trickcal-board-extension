/** 회수 설정과 결과는 기존 재분배 창과 분리해 제공한다. */
import { calculateApostleRecovery, getBestRecoveryAlternative, getRecoveryNodes, getRecoveryTargets, subtractRecoveryCost, type RecoveryAlternative, type RecoveryResource, type RecoveryResult, type RecoverySelection } from '../domain/boardRecovery.ts';
import { createEmptyCostSummary, NODE_TYPE, STAT_META_LIST } from '../domain/boardProgress.ts';
import { sumCosts } from '../domain/boardPathfinder.ts';
import type { ApostleProgress } from '../domain/types.ts';
import { collectApostlePortraits, closeHwangRedistribution, renderApostleAvatar, renderRedistributionCost } from './hwangRedistribution.ts';
import { getBoardNodeVisual } from './boardNode.ts';
import { escapeHtml } from './html.ts';
import { lockPageScroll } from './scrollLock.ts';
import { redistributionResourceIcon as resourceIcon } from './redistributionResource.ts';
import { expandRecoveryPicks, getRecoveryStatOptions, loadRecoverySettings, saveRecoverySettings } from './boardRecoverySettings.ts';

let dispose: (() => void) | null = null;
export function closeBoardRecovery(): void { dispose?.(); }
const signed = (n: number) => `${n > 0 ? '+' : ''}${Number(n.toFixed(1)).toLocaleString('ko-KR')}`;
const resourceName = (resource: RecoveryResource) => resource === 'hwang' ? '황크' : '보크';
const netLabel = (plan: RecoveryAlternative) => `${resourceIcon('hwang')} ${signed(plan.net.ultraCrayon)} ${resourceIcon('bokr')} ${signed(plan.net.epicCrayon)}`;
const planKey = (plan: RecoveryAlternative) => `${Number(plan.flowering)}:${plan.priority}`;

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
    const xs = nodes.map(({ node }) => node.grid!.x), ys = nodes.map(({ node }) => node.grid!.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    if (maxX - minX > 30 || maxY - minY > 50) return '<p>좌표 범위가 커 지도를 표시할 수 없습니다.</p>';
    const columns = Math.max(7, maxX - minX + 1), offset = Math.floor((columns - (maxX - minX + 1)) / 2);
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
      return `<button type="button" class="tcbe-map-tile tcbe-rd-tile tcbe-rd-${mapState} tcbe-rc-tile tcbe-rc-${state}${visual.classes}" data-tile="${boardIndex}:${nodeIndex}" style="grid-column:${maxX - node.grid!.x + 1 + offset};grid-row:${maxY - node.grid!.y + 1};background-position:${visual.background} 0" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${visual.contents}<span class="tcbe-rd-state-mark" aria-hidden="true">${marker}</span></button>`;
    }).join('');
    return `<section><h4>${boardIndex + 1}차 ${board.unlocked ? '' : '· 미해금'}</h4><div class="tcbe-rd-map" style="grid-template-columns:repeat(${columns},32px);grid-template-rows:repeat(${maxY - minY + 1},32px)">${tiles}</div></section>`;
  }).join('')}</div>`;
}

function renderStatChanges(plan: RecoveryAlternative): string {
  return (['hwang', 'bokr'] as const).map(resource => {
    const changes = resource === 'hwang' ? plan.hwangDelta : plan.bokrDelta;
    return `<p>${resourceName(resource)} 스탯: ${STAT_META_LIST.filter(meta => Math.abs(changes[meta.key]) > .00001)
      .map(meta => `${meta.nameKo} ${signed(changes[meta.key])}${resource === 'hwang' ? '%' : ''}`).join(' · ') || '변화 없음'}</p>`;
  }).join('');
}

export function openBoardRecovery(progressMap: Map<string, ApostleProgress>): void {
  closeBoardRecovery(); closeHwangRedistribution();
  const savedSettings = loadRecoverySettings();
  const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const apostles = [...new Map([...progressMap.values()].filter(a => a.isOwned !== false).map(a => [a.apostleId, a])).values()];
  const portraits = collectApostlePortraits(progressMap);
  const dialog = document.createElement('dialog');
  dialog.id = 'tcbe-recovery-dialog';
  dialog.setAttribute('aria-labelledby', 'tcbe-rc-title');
  dialog.innerHTML = `<header><h2 id="tcbe-rc-title">황크·보크 회수 계산 <small>베타</small></h2><button type="button" data-close>닫기</button></header>
    <nav class="tcbe-rd-main-tabs" role="tablist" aria-label="회수 계산">
      <button type="button" role="tab" id="tcbe-rc-tab-settings" data-tab="settings" aria-selected="true" aria-controls="tcbe-rc-settings">설정</button>
      <button type="button" role="tab" id="tcbe-rc-tab-results" data-tab="results" aria-selected="false" aria-controls="tcbe-rc-results" tabindex="-1">계산 결과</button>
    </nav><p data-selection-summary aria-live="polite"></p><p data-status role="status"></p>
    <section id="tcbe-rc-settings" role="tabpanel" aria-labelledby="tcbe-rc-tab-settings">
      <p>회수하고 싶은 칸을 체크하세요. 현재 목록 필터와 관계없이 보유 사도 전체를 계산합니다.</p>
      <p class="tcbe-rc-notice">선택하지 않은 황크·보크는 복구하고, 일반칸은 연결에 필요한 만큼 칠합니다. 게임·노트 데이터에는 적용하지 않습니다.</p>
      <div class="tcbe-rc-toolbar" aria-label="편집할 칸 종류"><button type="button" data-resource="hwang" aria-pressed="true">황크 선택</button><button type="button" data-resource="bokr" aria-pressed="false">보크 선택</button></div>
      ${(['hwang', 'bokr'] as const).map(resource => `<fieldset data-grid="${resource}" ${resource === 'bokr' ? 'hidden' : ''}><legend>${resourceName(resource)} 제거 대상</legend>
        ${[0, 1, 2].map(board => `<div class="tcbe-rc-check-row"><strong>${board + 1}차</strong><button type="button" data-all="${resource}:${board}">이 차수 전체 선택</button><div>${getRecoveryStatOptions(resource).map(meta =>
          `<label><input type="checkbox" data-pick="${resource}:${board}:${meta.key}" ${savedSettings.picks.includes(`${resource}:${board}:${meta.key}`) ? 'checked' : ''}>${meta.nameKo}</label>`).join('')}</div></div>`).join('')}
        <button type="button" data-clear="${resource}">${resourceName(resource)} 전체 해제</button></fieldset>`).join('')}
      <p>황크·보크 선택은 함께 적용됩니다. 보크를 회수하려면 해당 보크도 제거 대상으로 체크하세요.</p>
      <label><input type="checkbox" data-flowering ${savedSettings.compareFlowering ? 'checked' : ''}> 닫힌 꽃잎을 여는 만개 우회안도 비교</label>
      <p>만개안은 보크를 아끼는 대신 황크·물뿌리개가 더 필요할 수 있습니다. 이미 열린 꽃잎은 물뿌리개 비용을 다시 더하지 않습니다.</p>
      <div class="tcbe-rc-toolbar"><button type="button" data-calculate>회수량·초기화 순위 계산</button><button type="button" data-cancel hidden>계산 취소</button></div>
    </section><section id="tcbe-rc-results" role="tabpanel" aria-labelledby="tcbe-rc-tab-results" hidden>
      <p data-empty>설정 탭에서 제거 대상을 선택하고 계산하세요.</p><div data-output></div>
    </section>`;
  document.body.appendChild(dialog);
  const unlock = lockPageScroll();
  let generation = 0, closed = false, results: RecoveryResult[] = [], priority: RecoveryResource = 'hwang', limit = 0;
  const choices = new Map<number, string>();
  const status = dialog.querySelector<HTMLElement>('[data-status]')!;
  const output = dialog.querySelector<HTMLElement>('[data-output]')!;
  const calculate = dialog.querySelector<HTMLButtonElement>('[data-calculate]')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('[data-cancel]')!;
  const selectedInputs = () => [...dialog.querySelectorAll<HTMLInputElement>('[data-pick]:checked')];
  const read = (): RecoverySelection[] => expandRecoveryPicks(selectedInputs().map(input => input.dataset.pick!));
  const save = () => saveRecoverySettings({ picks: selectedInputs().map(input => input.dataset.pick!), compareFlowering: dialog.querySelector<HTMLInputElement>('[data-flowering]')!.checked });
  const switchTab = (name: string) => {
    dialog.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(tab => { const active = tab.dataset.tab === name; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
    dialog.querySelector<HTMLElement>('#tcbe-rc-settings')!.hidden = name !== 'settings';
    dialog.querySelector<HTMLElement>('#tcbe-rc-results')!.hidden = name !== 'results';
  };
  const updateSelection = () => {
    const selections = read();
    const counts = { hwang: selectedInputs().filter(input => input.dataset.pick!.startsWith('hwang:')).length, bokr: selectedInputs().filter(input => input.dataset.pick!.startsWith('bokr:')).length };
    let heroes = 0, tiles = 0, invested = createEmptyCostSummary();
    for (const apostle of apostles) {
      try {
        const nodes = getRecoveryNodes(apostle), targets = getRecoveryTargets(nodes, selections);
        if (targets.size) heroes++;
        tiles += targets.size;
        for (const entry of nodes) if (targets.has(entry.key)) invested = sumCosts(invested, entry.cost);
      } catch { /* 계산 시 사도별 데이터 오류를 별도로 표시한다. */ }
    }
    dialog.querySelector<HTMLElement>('[data-selection-summary]')!.textContent = `동시 적용: 황크 ${counts.hwang}항목 · 보크 ${counts.bokr}항목 | 대상 ${heroes}명 · ${tiles}칸 | 대상 투자량: 황크 ${invested.ultraCrayon}개 · 보크 ${invested.epicCrayon}개`;
    calculate.disabled = !selections.length;
  };
  const invalidate = () => {
    save();
    generation++; results = []; choices.clear(); output.replaceChildren();
    dialog.querySelector<HTMLElement>('[data-empty]')!.hidden = false;
    status.textContent = '설정이 변경되었습니다. 다시 계산하세요.';
    cancel.hidden = true; updateSelection();
  };
  const planFor = (result: RecoveryResult) => {
    const plans = getRecoveryDisplayAlternatives(result);
    return plans.find(plan => planKey(plan) === choices.get(result.apostle.apostleId)) || plans[0];
  };
  const sorted = () => [...results].sort((a, b) => {
    const pa = planFor(a), pb = planFor(b), main = priority === 'hwang' ? 'ultraCrayon' : 'epicCrayon', other = priority === 'hwang' ? 'epicCrayon' : 'ultraCrayon';
    return Number(!!pb) - Number(!!pa) || (pb?.net[main] || 0) - (pa?.net[main] || 0) ||
      (pb?.net[other] || 0) - (pa?.net[other] || 0) || a.apostle.apostleId - b.apostle.apostleId;
  });
  const render = () => {
    const ordered = sorted(); limit = Math.min(limit, ordered.length);
    const totals = ordered.slice(0, limit).reduce((sum, result) => { const plan = planFor(result); return plan ? { refund: sumCosts(sum.refund, plan.refund), spend: sumCosts(sum.spend, plan.spend) } : sum; }, { refund: createEmptyCostSummary(), spend: createEmptyCostSummary() });
    const net = subtractRecoveryCost(totals.refund, totals.spend);
    const extra = subtractRecoveryCost(totals.spend, totals.refund);
    for (const key of Object.keys(extra) as Array<keyof typeof extra>) extra[key] = Math.max(0, extra[key] || 0);
    output.innerHTML = `<div class="tcbe-rc-toolbar"><label>순위 기준 <select data-sort><option value="hwang" ${priority === 'hwang' ? 'selected' : ''}>황크 순회수</option><option value="bokr" ${priority === 'bokr' ? 'selected' : ''}>보크 순회수</option></select></label>
      <label>상위 <input type="number" data-limit min="0" max="${ordered.length}" value="${limit}">명 누적</label></div>
      <p>순위 기준은 목록 순서만 바꿉니다. 사도별 경로를 선택하면 지도·작업 순서·누적 회수량에 적용됩니다.</p>
      <div class="tcbe-rc-total">선택한 상위 ${limit}명 순회수 · ${resourceIcon('hwang')} <strong>${signed(net.ultraCrayon)}</strong> · ${resourceIcon('bokr')} <strong>${signed(net.epicCrayon)}</strong><p>환급 외 준비 재화: ${renderRedistributionCost(extra)}</p></div>
      <p class="tcbe-rc-notice">추천 순회수량이며 최대 회수를 보장하지 않습니다. 초기화 환급 − 전체 복구 비용으로 계산합니다. 추가 재화와 초기화 가능 횟수를 확인하고, 필요한 환급을 먼저 확보한 뒤 복구하세요. 음수는 추가 필요량입니다.</p>
      <p>지도: 초록 ✓ 유지·복구 · 파랑 + 새로 칠함 · 빨강 × 지움 · 흐린 칸 미선택. 만개칸은 재분배 지도와 같은 꽃 모양으로 표시합니다. 칸을 누르면 상세 정보와 작업 번호를 확인할 수 있습니다.</p>
      ${ordered.map((result, index) => {
        const plan = planFor(result), id = result.apostle.apostleId, alternatives = getRecoveryDisplayAlternatives(result);
        const base = alternatives[0];
        const extraBokr = plan ? Math.max(0, ...alternatives.map(p => p.net.epicCrayon - plan.net.epicCrayon)) : 0;
        return `<details class="tcbe-rc-apostle" data-apostle="${id}"><summary><span class="tcbe-rc-summary-main">${index + 1}. ${renderApostleAvatar(id, result.apostle.name, portraits)} <span>${escapeHtml(result.apostle.name)}</span> ${plan ? `${netLabel(plan)}${plan.net.ultraCrayon <= 0 && plan.net.epicCrayon <= 0 ? ' · 회수 효과 없음' : ''}` : '· 계산 확인 필요'}${extraBokr ? `<span class="tcbe-rc-hint">다른 경로로 ${resourceIcon('bokr')} ${extraBokr}개 추가 회수 가능</span>` : ''}</span></summary>
          <div data-detail>${plan ? `<div class="tcbe-rc-alternatives">${alternatives.map(alternative => {
            const label = `${alternative.flowering ? '만개 허용' : '기본'} · ${resourceName(alternative.priority)} 회수 우선`;
            const difference = base && alternative !== base ? `<p>첫 경로 대비 ${resourceIcon('hwang')} ${signed(alternative.net.ultraCrayon - base.net.ultraCrayon)} · ${resourceIcon('bokr')} ${signed(alternative.net.epicCrayon - base.net.epicCrayon)}</p>` : '';
            return `<label class="tcbe-rc-alternative"><span><input type="radio" name="rc-${id}" data-alternative="${id}" value="${planKey(alternative)}" ${plan === alternative ? 'checked' : ''}><strong>${label}</strong></span><p>순회수 ${netLabel(alternative)}</p><p>사용 ${resourceIcon('watering-can')} ${alternative.spend.wateringCan || 0} · ${resourceIcon('gold')} ${alternative.spend.gold.toLocaleString('ko-KR')}</p>${difference}</label>`;
          }).join('')}</div>${result.alternatives.some(p => p.flowering) && !alternatives.some(p => p.flowering) ? '<p>만개 허용안도 비교했지만 기본안과 같은 색칠 계획입니다.</p>' : ''}<p>대상 ${result.targets.size}칸 · 미복구 ${result.targets.size - plan.repaintedTargets.length}칸 · 추천 경로에서 재복구 ${plan.repaintedTargets.length}칸</p>
          ${plan.usedNewBokr ? '<p class="tcbe-rc-notice">새 보크를 사용하지 않고 모든 보존 대상을 연결할 계획을 찾지 못해 새 보크 경로를 포함했습니다.</p>' : ''}
          <p>전체 환급: ${renderRedistributionCost(plan.refund)}</p><p>전체 복구·색칠: ${renderRedistributionCost(plan.spend)}</p>${renderStatChanges(plan)}
          <div data-map></div><p data-tile-info role="status">칸을 선택하면 상세 정보가 표시됩니다.</p>
          <h4>작업 순서</h4><p>이 사도를 초기화한 뒤 필요한 추가 재화를 확보하고 아래 순서대로 칠하세요. 열린 관문·꽃잎은 다시 열지 않습니다.</p>
          <ol>${plan.paint.map(entry => `<li>${entry.boardIndex + 1}차 #${entry.node.id} ${entry.node.nodeType === NODE_TYPE.PETAL ? '꽃잎 개방' : entry.node.nodeType === NODE_TYPE.HWANG_EXT ? '만개 확장 황크 색칠' : entry.picked ? '복구' : '새 색칠'} · ${renderRedistributionCost(entry.cost)}</li>`).join('') || '<li>다시 칠할 칸 없음</li>'}</ol>` : `<p>${escapeHtml(result.error || '계획을 찾지 못했습니다.')}</p>`}</div></details>`;
      }).join('') || '<p>현재 칠한 제거 대상이 없습니다.</p>'}`;
  };
  dialog.addEventListener('toggle', event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.open) return;
    const result = results.find(r => r.apostle.apostleId === Number(details.dataset.apostle));
    const plan = result && planFor(result), map = details.querySelector<HTMLElement>('[data-map]');
    if (result && plan && map && !map.childElementCount) map.innerHTML = renderRecoveryMap(result, plan);
  }, true);
  dialog.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.matches('[data-pick], [data-flowering]')) { invalidate(); return; }
    if (target.matches('[data-sort]')) { priority = target.value as RecoveryResource; render(); output.querySelector<HTMLSelectElement>('[data-sort]')?.focus(); }
    if (target.matches('[data-limit]')) { limit = Math.max(0, Math.min(results.length, Math.floor(Number(target.value) || 0))); render(); output.querySelector<HTMLInputElement>('[data-limit]')?.focus(); }
    if (target.matches('[data-alternative]')) {
      const id = Number(target.dataset.alternative); choices.set(id, target.value); render();
      const details = dialog.querySelector<HTMLDetailsElement>(`[data-apostle="${id}"]`); if (details) details.open = true;
      details?.querySelector<HTMLInputElement>('[data-alternative]:checked')?.focus();
    }
  });
  dialog.addEventListener('click', async event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button) return;
    if (button.hasAttribute('data-close')) { closeBoardRecovery(); return; }
    if (button.dataset.tab) { switchTab(button.dataset.tab); return; }
    if (button.dataset.resource) {
      dialog.querySelectorAll<HTMLButtonElement>('[data-resource]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      dialog.querySelectorAll<HTMLElement>('[data-grid]').forEach(grid => grid.hidden = grid.dataset.grid !== button.dataset.resource); return;
    }
    if (button.dataset.all || button.dataset.clear) {
      const prefix = button.dataset.all || button.dataset.clear!;
      dialog.querySelectorAll<HTMLInputElement>('[data-pick]').forEach(input => { if (input.dataset.pick!.startsWith(`${prefix}:`)) input.checked = !!button.dataset.all; }); invalidate(); return;
    }
    if (button.dataset.tile) {
      const details = button.closest<HTMLDetailsElement>('[data-apostle]')!;
      const result = results.find(r => r.apostle.apostleId === Number(details.dataset.apostle));
      const entry = result?.nodes.find(n => n.key === button.dataset.tile);
      const info = details.querySelector<HTMLElement>('[data-tile-info]');
      if (info) { info.textContent = button.title; if (entry) info.innerHTML += ` · 칸 비용: ${renderRedistributionCost(entry.cost)}`; } return;
    }
    if (button.hasAttribute('data-cancel')) {
      generation++; results = []; calculate.disabled = false; cancel.hidden = true;
      dialog.querySelector<HTMLElement>('[data-empty]')!.hidden = false;
      status.textContent = '계산을 취소했습니다.'; return;
    }
    if (!button.hasAttribute('data-calculate')) return;
    const selections = read(); if (!selections.length) return;
    const token = ++generation, compareFlowering = dialog.querySelector<HTMLInputElement>('[data-flowering]')!.checked;
    calculate.disabled = true; cancel.hidden = false; results = []; output.replaceChildren();
    dialog.querySelector<HTMLElement>('[data-empty]')!.hidden = true;
    for (let index = 0; index < apostles.length; index++) {
      status.textContent = `회수 계획 계산 중 ${index + 1}/${apostles.length}`;
      await new Promise(resolve => setTimeout(resolve, 0));
      if (closed || token !== generation) return;
      const apostle = apostles[index]!;
      try { const result = calculateApostleRecovery(apostle, selections, compareFlowering); if (result.targets.size) results.push(result); }
      catch (error) { results.push({ apostle, nodes: [], targets: new Set(), alternatives: [], error: error instanceof Error ? error.message : '데이터를 확인할 수 없습니다.' }); }
    }
    choices.clear(); limit = results.length;
    calculate.disabled = false; cancel.hidden = true;
    status.textContent = `계산 완료 · ${results.length}명. 사도별로 황크·보크 회수 경로를 비교하고 선택하세요.`;
    render(); switchTab('results');
    dialog.querySelector<HTMLButtonElement>('[data-tab="results"]')!.focus();
  });
  dialog.querySelector('[role="tablist"]')!.addEventListener('keydown', event => {
    const keyEvent = event as KeyboardEvent;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(keyEvent.key)) return;
    keyEvent.preventDefault();
    const tabs = [...dialog.querySelectorAll<HTMLButtonElement>('[data-tab]')];
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next = keyEvent.key === 'Home' ? 0 : keyEvent.key === 'End' ? 1 : (current + 1) % 2;
    switchTab(tabs[next]!.dataset.tab!); tabs[next]!.focus();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeBoardRecovery(); });
  dispose = () => { closed = true; generation++; dialog.close(); dialog.remove(); unlock(); dispose = null; if (focus?.isConnected) focus.focus(); };
  updateSelection(); dialog.showModal();
}
