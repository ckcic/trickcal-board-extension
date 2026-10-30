import { renderRecoveryTemplate } from './recoveryTemplate.ts';
import { getRecoveryDisplayAlternatives, renderRecoveryMap, renderRecoveryResults, renderRecoveryTotalSummary, signed, planKey } from './recoveryResult.ts';
import type { ProgressMap } from '../../domain/types.ts';
import { calculateApostleRecovery, getRecoveryNodes, getRecoveryTargets, subtractRecoveryCost, type RecoveryNode, type RecoveryResource, type RecoveryResult, type RecoverySelection } from '../../domain/boardRecovery.ts';
import { createEmptyCostSummary, NODE_TYPE } from '../../domain/boardProgress.ts';
import { sumCosts } from '../../domain/boardPathfinder.ts';
import { matchesKoreanSearch } from '../../domain/koreanSearch.ts';
import { closeAllTools, closeTool, registerToolModal } from '../common/toolModals.ts';
import { collectApostlePortraits } from '../common/apostlePortraits.ts';
import { renderResourceCost } from '../common/resources.ts';
import { createCommonModal } from '../common/commonModal.ts';
import { copyTextWithFeedback } from '../common/clipboard.ts';
import { escapeHtml } from '../common/html.ts';
import { expandRecoveryPicks, loadRecoverySettings, saveRecoverySettings } from './boardRecoverySettings.ts';

export function closeBoardRecovery(): void { closeTool('recovery'); }
/** 기존 회수 UI 공개 함수의 import 경로를 유지한다. */
export { getRecoveryDisplayAlternatives, renderRecoveryMap } from './recoveryResult.ts';

export function openBoardRecovery(progressMap: ProgressMap): void {
  closeAllTools();
  const savedSettings = loadRecoverySettings();
  const apostles = [...new Map([...progressMap.values()].filter(a => a.isOwned !== false).map(a => [a.apostleId, a])).values()];
  const portraits = collectApostlePortraits(progressMap);
  // 모달이 열려 있는 동안 사도별 노드 레이아웃·비용을 캐시하여 체크박스 변경 및 계산 시 재사용한다.
  const cachedNodesByApostle = new Map<number, RecoveryNode[]>();
  const getCachedNodes = (apostle: (typeof apostles)[number]): RecoveryNode[] => {
    let cached = cachedNodesByApostle.get(apostle.apostleId);
    if (!cached) {
      cached = getRecoveryNodes(apostle);
      cachedNodesByApostle.set(apostle.apostleId, cached);
    }
    return cached;
  };

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
      { id: 'results', label: '📋 계산 결과', badge: '완료', badgeHidden: true, panelId: 'tcbe-rc-results' },
    ],
    initialTabId: 'settings',
    bodyHtml: renderRecoveryTemplate(savedSettings),
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
  const resultsBadge = dialog.querySelector<HTMLElement>('[data-tab-badge="results"]');

  const selectedInputs = () => [...dialog.querySelectorAll<HTMLInputElement>('[data-pick]:checked')];
  const read = (): RecoverySelection[] => expandRecoveryPicks(selectedInputs().map(input => input.dataset.pick!));
  const save = () => saveRecoverySettings({ picks: selectedInputs().map(input => input.dataset.pick!), compareFlowering: dialog.querySelector<HTMLInputElement>('[data-flowering]')!.checked });

  const updateSelection = () => {
    const selections = read();
    const counts = { hwang: selectedInputs().filter(input => input.dataset.pick!.startsWith('hwang:')).length, bokr: selectedInputs().filter(input => input.dataset.pick!.startsWith('bokr:')).length };
    let heroes = 0, tiles = 0, invested = createEmptyCostSummary();
    if (selections.length) {
      for (const apostle of apostles) {
        try {
          const nodes = getCachedNodes(apostle), targets = getRecoveryTargets(nodes, selections);
          if (targets.size) heroes++;
          tiles += targets.size;
          for (const entry of nodes) if (targets.has(entry.key)) invested = sumCosts(invested, entry.cost);
        } catch { /* 계산 시 사도별 데이터 오류는 별도로 표시 */ }
      }
    }
    dialog.querySelector<HTMLElement>('[data-selection-summary]')!.textContent = `동시 적용: 황크 ${counts.hwang}항목 · 보크 ${counts.bokr}항목 | 대상 ${heroes}명 · ${tiles}칸 | 대상 투자량: 황크 ${invested.ultraCrayon}개 · 보크 ${invested.epicCrayon}개`;
    calculate.disabled = !selections.length;
  };

  const invalidate = () => {
    save();
    generation++; results = []; choices.clear(); output.replaceChildren();
    if (resultsBadge) resultsBadge.hidden = true;
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

  const computeTotals = (allOrdered: RecoveryResult[]) => {
    const activeForTotals = allOrdered.slice(0, limit);
    const totals = activeForTotals.reduce((sum, result) => {
      const plan = planFor(result);
      return plan ? { refund: sumCosts(sum.refund, plan.refund), spend: sumCosts(sum.spend, plan.spend) } : sum;
    }, { refund: createEmptyCostSummary(), spend: createEmptyCostSummary() });

    const net = subtractRecoveryCost(totals.refund, totals.spend);
    const extra = subtractRecoveryCost(totals.spend, totals.refund);
    for (const key of Object.keys(extra) as Array<keyof typeof extra>) extra[key] = Math.max(0, extra[key] || 0);
    return { net, extra };
  };

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

  // 상위 N명 숫자 입력 변경 시에는 열린 카드와 스크롤을 보존하고 요약 영역만 부분 갱신한다.
  const updateLimitInPlace = () => {
    const allOrdered = sorted();
    limit = Math.min(limit, allOrdered.length);
    const { net, extra } = computeTotals(allOrdered);
    const totalEl = output.querySelector<HTMLElement>('[data-rc-total]');
    if (totalEl) totalEl.innerHTML = renderRecoveryTotalSummary(limit, net, extra);
    const copyBtn = output.querySelector<HTMLButtonElement>('[data-copy-summary]');
    if (copyBtn) copyBtn.textContent = `상위 ${limit}명 작업 순서 복사`;
    const items = output.querySelectorAll<HTMLDetailsElement>('.tcbe-rc-apostle');
    items.forEach((item, index) => {
      item.dataset.inLimit = String(index < limit);
    });
  };

  const render = () => {
    const openIds = new Set(
      [...output.querySelectorAll<HTMLDetailsElement>('.tcbe-rc-apostle[open]')]
        .map(el => Number(el.dataset.apostle))
    );
    const allOrdered = sorted();
    limit = Math.min(limit, allOrdered.length);
    const { net, extra } = computeTotals(allOrdered);

    output.innerHTML = renderRecoveryResults({ allOrdered, limit, priority, searchQuery, onlyPositive,
      portraits, planFor, net, extra });

    openIds.forEach(id => {
      const details = output.querySelector<HTMLDetailsElement>(`[data-apostle="${id}"]`);
      if (details) details.open = true;
    });
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
    if (target.matches('[data-limit]')) {
      limit = Math.max(0, Math.min(results.length, Math.floor(Number(target.value) || 0)));
      target.value = String(limit);
      updateLimitInPlace();
    }
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
      if (info) {
        info.innerHTML = `${escapeHtml(button.title)}${entry ? ` · 칸 비용: ${renderResourceCost(entry.cost)}` : ''}`;
      }
      return;
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
    if (resultsBadge) resultsBadge.hidden = true;
    dialog.querySelector<HTMLElement>('[data-empty]')!.hidden = true;
    let lastYieldTime = 0;
    for (let index = 0; index < apostles.length; index++) {
      const now = Date.now();
      if (index === 0 || now - lastYieldTime >= 16) {
        status.textContent = `회수 계획 계산 중 ${index + 1}/${apostles.length}`;
        lastYieldTime = now;
        await new Promise(resolve => setTimeout(resolve, 0));
        if (closed || token !== generation) return;
      }
      const apostle = apostles[index]!;
      try {
        const nodes = getCachedNodes(apostle);
        const result = calculateApostleRecovery(apostle, selections, compareFlowering, nodes);
        if (result.targets.size) results.push(result);
      }
      catch (error) { results.push({ apostle, nodes: [], targets: new Set(), alternatives: [], error: error instanceof Error ? error.message : '데이터를 확인할 수 없습니다.' }); }
    }
    // 계산 루프와 결과 DOM 파싱(innerHTML)을 별도 태스크로 분리해 단일 setTimeout 핸들러 지연을 방지한다.
    await new Promise(resolve => setTimeout(resolve, 0));
    if (closed || token !== generation) return;
    choices.clear(); limit = results.length;
    calculate.disabled = false; cancel.hidden = true;
    if (resultsBadge) resultsBadge.hidden = false;
    status.textContent = `계산 완료 · ${results.length}명. 사도별로 황크·보크 회수 경로를 비교하고 선택하세요.`;
    render(); modal.switchTab('results');
    dialog.querySelector<HTMLButtonElement>('[data-tab="results"]')!.focus();
  });

  // 저장된 선택 항목이 많을 때 모달 오픈 클릭 핸들러가 지연되지 않도록 요약 집계를 다음 틱으로 분리한다.
  if (savedSettings.picks.length > 0) {
    calculate.disabled = false;
    setTimeout(() => { if (!closed) updateSelection(); }, 0);
  } else {
    updateSelection();
  }
}
