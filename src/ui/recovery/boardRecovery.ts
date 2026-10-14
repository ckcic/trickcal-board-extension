import { formatNumber } from '../common/format.ts';
import type { ProgressMap } from '../../domain/types.ts';
import { calculateApostleRecovery, getBestRecoveryAlternative, getRecoveryNodes, getRecoveryTargets, subtractRecoveryCost, type RecoveryAlternative, type RecoveryResource, type RecoveryResult, type RecoverySelection } from '../../domain/boardRecovery.ts';
import { createEmptyCostSummary, NODE_TYPE, STAT_META_LIST } from '../../domain/boardProgress.ts';
import { sumCosts } from '../../domain/boardPathfinder.ts';
import { matchesKoreanSearch } from '../../domain/koreanSearch.ts';
import { closeAllTools, closeTool, registerToolModal } from '../common/toolModals.ts';
import { collectApostlePortraits, renderApostleAvatar } from '../common/apostlePortraits.ts';
import { renderResourceCost, renderResourceIcon as resourceIcon } from '../common/resources.ts';
import { getBoardNodeVisual, computeBoardGridLayout, getTileGridStyle } from '../board/boardNode.ts';
import { escapeHtml } from '../common/html.ts';
import { createCommonModal } from '../common/commonModal.ts';
import { copyTextWithFeedback } from '../common/clipboard.ts';
import { expandRecoveryPicks, getRecoveryStatOptions, loadRecoverySettings, saveRecoverySettings } from './boardRecoverySettings.ts';

export function closeBoardRecovery(): void { closeTool('recovery'); }
const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNumber(n)}`;
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

export function openBoardRecovery(progressMap: ProgressMap): void {
  closeAllTools();
  const savedSettings = loadRecoverySettings();
  const apostles = [...new Map([...progressMap.values()].filter(a => a.isOwned !== false).map(a => [a.apostleId, a])).values()];
  const portraits = collectApostlePortraits(progressMap);

  let generation = 0, closed = false, results: RecoveryResult[] = [], priority: RecoveryResource = 'hwang', limit = 0;
  let searchQuery = '', onlyPositive = false;
  const choices = new Map<number, string>();

  let unregisterTool = () => {};
  const modal = createCommonModal({
    id: 'tcbe-recovery-dialog',
    titleId: 'tcbe-rc-title',
    title: '황크·보크 회수 계산',
    badgeText: '베타',
    tabs: [
      { id: 'settings', label: '⚙️ 설정', panelId: 'tcbe-rc-settings' },
      { id: 'results', label: '📋 계산 결과', panelId: 'tcbe-rc-results' },
    ],
    initialTabId: 'settings',
    bodyHtml: `
      <p data-selection-summary aria-live="polite"></p><p data-status role="status"></p>
      <section id="tcbe-rc-settings" role="tabpanel" aria-labelledby="tcbe-recovery-dialog-tab-settings">
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
      </section>
      <section id="tcbe-rc-results" role="tabpanel" aria-labelledby="tcbe-recovery-dialog-tab-results" hidden>
        <p data-empty>설정 탭에서 제거 대상을 선택하고 계산하세요.</p><div data-output></div>
      </section>
    `,
    onClose: () => {
      closed = true;
      generation++;
      unregisterTool();
    },
  });

  unregisterTool = registerToolModal('recovery', modal.close);
  const dialog = modal.dialog;
  const status = dialog.querySelector<HTMLElement>('[data-status]')!;
  const output = dialog.querySelector<HTMLElement>('[data-output]')!;
  const calculate = dialog.querySelector<HTMLButtonElement>('[data-calculate]')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('[data-cancel]')!;

  const selectedInputs = () => [...dialog.querySelectorAll<HTMLInputElement>('[data-pick]:checked')];
  const read = (): RecoverySelection[] => expandRecoveryPicks(selectedInputs().map(input => input.dataset.pick!));
  const save = () => saveRecoverySettings({ picks: selectedInputs().map(input => input.dataset.pick!), compareFlowering: dialog.querySelector<HTMLInputElement>('[data-flowering]')!.checked });

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
      } catch { /* 계산 시 사도별 데이터 오류는 별도로 표시 */ }
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

  const generateSummaryText = (targets: RecoveryResult[]): string => {
    const lines: string[] = ['[트릭컬 보드 확장 - 황크·보크 회수 작업 순서]'];
    targets.forEach((res, idx) => {
      const plan = planFor(res);
      if (!plan) return;
      lines.push(`\n${idx + 1}. ${res.apostle.name} (순회수: 황크 ${signed(plan.net.ultraCrayon)}, 보크 ${signed(plan.net.epicCrayon)})`);
      lines.push(`   - 1단계: 전체 초기화 (환급 확보)`);
      if (plan.paint.length > 0) {
        lines.push(`   - 2단계 복구 (${plan.paint.length}칸):`);
        plan.paint.forEach((step, stepIdx) => {
          const kind = step.node.nodeType === NODE_TYPE.PETAL ? '꽃잎 개방' : step.node.nodeType === NODE_TYPE.HWANG_EXT ? '만개 확장 황크' : step.picked ? '복구' : '새 색칠';
          lines.push(`     ${stepIdx + 1}) ${step.boardIndex + 1}차 #${step.node.id} (${kind})`);
        });
      } else {
        lines.push(`   - 2단계: 다시 칠할 칸 없음`);
      }
    });
    return lines.join('\n');
  };

  const filterApostles = () => {
    const list = output.querySelector<HTMLElement>('[data-apostles-list]');
    if (!list) return;
    const items = list.querySelectorAll<HTMLDetailsElement>('.tcbe-rc-apostle');
    let visibleCount = 0;
    items.forEach(item => {
      const name = item.dataset.apostleName || '';
      const isPositive = item.dataset.netPositive === 'true';
      if (onlyPositive && !isPositive) {
        item.hidden = true;
        return;
      }
      if (searchQuery.trim() && !matchesKoreanSearch(name, searchQuery)) {
        item.hidden = true;
        return;
      }
      item.hidden = false;
      visibleCount++;
    });
    const countEl = output.querySelector<HTMLElement>('[data-search-count]');
    if (countEl) {
      countEl.textContent = (searchQuery.trim() || onlyPositive) ? `(표시: ${visibleCount}명)` : '';
    }
    const emptyEl = output.querySelector<HTMLElement>('[data-search-empty]');
    if (emptyEl) {
      emptyEl.hidden = visibleCount > 0;
    }
  };

  const render = () => {
    const allOrdered = sorted();
    limit = Math.min(limit, allOrdered.length);

    const activeForTotals = allOrdered.slice(0, limit);
    const totals = activeForTotals.reduce((sum, result) => {
      const plan = planFor(result);
      return plan ? { refund: sumCosts(sum.refund, plan.refund), spend: sumCosts(sum.spend, plan.spend) } : sum;
    }, { refund: createEmptyCostSummary(), spend: createEmptyCostSummary() });

    const net = subtractRecoveryCost(totals.refund, totals.spend);
    const extra = subtractRecoveryCost(totals.spend, totals.refund);
    for (const key of Object.keys(extra) as Array<keyof typeof extra>) extra[key] = Math.max(0, extra[key] || 0);

    output.innerHTML = `
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
        ${allOrdered.map((result, index) => {
          const plan = planFor(result), id = result.apostle.apostleId, alternatives = getRecoveryDisplayAlternatives(result);
          const base = alternatives[0];
          const extraBokr = plan ? Math.max(0, ...alternatives.map(p => p.net.epicCrayon - plan.net.epicCrayon)) : 0;
          const isPositive = Boolean(plan && (plan.net.ultraCrayon > 0 || plan.net.epicCrayon > 0));
          return `<details class="tcbe-rc-apostle" data-apostle="${id}" data-apostle-name="${escapeHtml(result.apostle.name)}" data-net-positive="${isPositive}">
            <summary><span class="tcbe-rc-summary-main">${index + 1}. ${renderApostleAvatar(id, result.apostle.name, portraits)} <span>${escapeHtml(result.apostle.name)}</span> ${plan ? `${netLabel(plan)}${plan.net.ultraCrayon <= 0 && plan.net.epicCrayon <= 0 ? ' · 회수 효과 없음' : ''}` : '· 계산 확인 필요'}${extraBokr ? `<span class="tcbe-rc-hint">다른 경로로 ${resourceIcon('bokr')} ${extraBokr}개 추가 회수 가능</span>` : ''}</span></summary>
            <div data-detail>${plan ? `<div class="tcbe-rc-alternatives">${alternatives.map(alternative => {
              const label = `${alternative.flowering ? '만개 허용' : '기본'} · ${resourceName(alternative.priority)} 회수 우선`;
              const difference = base && alternative !== base ? `<p>첫 경로 대비 ${resourceIcon('hwang')} ${signed(alternative.net.ultraCrayon - base.net.ultraCrayon)} · ${resourceIcon('bokr')} ${signed(alternative.net.epicCrayon - base.net.epicCrayon)}</p>` : '';
              return `<label class="tcbe-rc-alternative"><span><input type="radio" name="rc-${id}" data-alternative="${id}" value="${planKey(alternative)}" ${plan === alternative ? 'checked' : ''}><strong>${label}</strong></span><p>순회수 ${netLabel(alternative)}</p><p>사용 ${resourceIcon('watering-can')} ${alternative.spend.wateringCan || 0} · ${resourceIcon('gold')} ${alternative.spend.gold.toLocaleString('ko-KR')}</p>${difference}</label>`;
            }).join('')}</div>${result.alternatives.some(p => p.flowering) && !alternatives.some(p => p.flowering) ? '<p>만개 허용안도 비교했지만 기본안과 같은 색칠 계획입니다.</p>' : ''}<p>대상 ${result.targets.size}칸 · 미복구 ${result.targets.size - plan.repaintedTargets.length}칸 · 추천 경로에서 재복구 ${plan.repaintedTargets.length}칸</p>
            ${plan.usedNewBokr ? '<p class="tcbe-rc-notice">새 보크를 사용하지 않고 모든 보존 대상을 연결할 계획을 찾지 못해 새 보크 경로를 포함했습니다.</p>' : ''}
            <p>전체 환급: ${renderResourceCost(plan.refund)}</p><p>전체 복구·색칠: ${renderResourceCost(plan.spend)}</p>${renderStatChanges(plan)}
            <div data-map></div><p data-tile-info role="status">칸을 선택하면 상세 정보가 표시됩니다.</p>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
              <h4 style="margin:0;">작업 순서</h4>
              <button type="button" data-copy-apostle="${id}" style="font-size:12px; padding:3px 8px;">이 사도 작업 순서 복사</button>
            </div>
            <p>이 사도를 초기화한 뒤 필요한 추가 재화를 확보하고 아래 순서대로 칠하세요. 열린 관문·꽃잎은 다시 열지 않습니다.</p>
            <ol>${plan.paint.map(entry => `<li>${entry.boardIndex + 1}차 #${entry.node.id} ${entry.node.nodeType === NODE_TYPE.PETAL ? '꽃잎 개방' : entry.node.nodeType === NODE_TYPE.HWANG_EXT ? '만개 확장 황크 색칠' : entry.picked ? '복구' : '새 색칠'} · ${renderResourceCost(entry.cost)}</li>`).join('') || '<li>다시 칠할 칸 없음</li>'}</ol>` : `<p>${escapeHtml(result.error || '계획을 찾지 못했습니다.')}</p>`}</div></details>`;
        }).join('') || '<p>현재 칠한 제거 대상이 없습니다.</p>'}
      </div>
      <div data-search-empty hidden style="text-align: center; padding: 24px; color: #64748b; font-size: 14px;">검색 조건에 맞는 사도가 없습니다.</div>`;

    filterApostles();
  };

  dialog.addEventListener('toggle', event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.open) return;
    const result = results.find(r => r.apostle.apostleId === Number(details.dataset.apostle));
    const plan = result && planFor(result), map = details.querySelector<HTMLElement>('[data-map]');
    if (result && plan && map && !map.childElementCount) map.innerHTML = renderRecoveryMap(result, plan);
  }, true);

  dialog.addEventListener('input', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-search]')) {
      searchQuery = target.value;
      filterApostles();
    }
  });

  dialog.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.matches('[data-pick], [data-flowering]')) { invalidate(); return; }
    if (target.matches('[data-sort]')) { priority = target.value as RecoveryResource; render(); output.querySelector<HTMLSelectElement>('[data-sort]')?.focus(); }
    if (target.matches('[data-limit]')) { limit = Math.max(0, Math.min(results.length, Math.floor(Number(target.value) || 0))); render(); output.querySelector<HTMLInputElement>('[data-limit]')?.focus(); }
    if (target.matches('[data-only-positive]')) {
      onlyPositive = (target as HTMLInputElement).checked;
      filterApostles();
    }
    if (target.matches('[data-alternative]')) {
      const id = Number(target.dataset.alternative); choices.set(id, target.value); render();
      const details = dialog.querySelector<HTMLDetailsElement>(`[data-apostle="${id}"]`); if (details) details.open = true;
      details?.querySelector<HTMLInputElement>('[data-alternative]:checked')?.focus();
    }
  });

  dialog.addEventListener('click', async event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button) return;
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
      if (info) { info.textContent = button.title; if (entry) info.innerHTML += ` · 칸 비용: ${renderResourceCost(entry.cost)}`; } return;
    }
    if (button.hasAttribute('data-cancel')) {
      generation++; results = []; calculate.disabled = false; cancel.hidden = true;
      dialog.querySelector<HTMLElement>('[data-empty]')!.hidden = false;
      status.textContent = '계산을 취소했습니다.'; return;
    }
    if (button.hasAttribute('data-copy-summary')) {
      const activeForTotals = sorted().slice(0, limit);
      const text = generateSummaryText(activeForTotals);
      const statusSpan = output.querySelector<HTMLElement>('[data-copy-status]');
      await copyTextWithFeedback(text, statusSpan, '✓ 복사되었습니다.');
      return;
    }
    if (button.dataset.copyApostle) {
      const id = Number(button.dataset.copyApostle);
      const res = results.find(r => r.apostle.apostleId === id);
      if (res) {
        const text = generateSummaryText([res]);
        const origText = button.textContent;
        const ok = await copyTextWithFeedback(text, null);
        if (ok) {
          button.textContent = '✓ 복사완료';
          setTimeout(() => { button.textContent = origText; }, 2000);
        }
      }
      return;
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
    render(); modal.switchTab('results');
    dialog.querySelector<HTMLButtonElement>('[data-tab="results"]')!.focus();
  });

  updateSelection();
}
