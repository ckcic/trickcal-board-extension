import type { ProgressMap } from '../../domain/types.ts';
import { iterateHwangRedistribution, type RedistributionPlan, type RedistributionOptions } from '../../domain/hwangRedistribution.ts';
import { calculateRedistributionCurve } from '../../domain/redistributionCurve.ts';
import { renderRedistributionCurve } from './redistributionCurve.ts';
import { renderRedistributionResult, generateOrdersText } from './redistributionResult.ts';
import { copyTextWithFeedback } from '../common/clipboard.ts';

interface CalculationContext {
  dialog: HTMLElement;
  progressMap: ProgressMap;
  readOptions: () => RedistributionOptions | null;
  readTargets: () => void;
  updateToc: (plan: RedistributionPlan) => void;
  getPortraitMap: () => Map<string | number, string>;
  switchTab: (tab: string) => void;
  onPlan: (plan: RedistributionPlan) => void;
}

/** 추천·그래프 실행 상태와 취소를 관리하고 닫힐 때 대기 작업을 해제한다. */
export function setupRedistributionCalculation(context: CalculationContext) {
  const { dialog, progressMap, readOptions, readTargets, updateToc, getPortraitMap, switchTab, onPlan } = context;
  let calculationController: AbortController | null = null;
  let curveController: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let currentCalculatedPlan: RedistributionPlan | null = null;
  let disposed = false;
  let restoreControls = () => {};
  const form = dialog.querySelector('form');
  const cancelCalculation = dialog.querySelector<HTMLButtonElement>('[data-cancel-calculation]');
  const status = dialog.querySelector<HTMLElement>('[data-status]');
  const result = dialog.querySelector<HTMLElement>('[data-result]');
  if (!form || !cancelCalculation || !status || !result) return { dispose() {}, invalidateCurve() {} };
  const disableControls = (form: HTMLFormElement) => {
    const controls = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select')]
      .map(control => ({ control, disabled: control.disabled }));
    controls.forEach(({ control }) => { control.disabled = true; });
    restoreControls = () => {
      controls.forEach(({ control, disabled }) => { control.disabled = disabled; });
      cancelCalculation.hidden = true;
    };
  };
  cancelCalculation.addEventListener('click', () => { calculationController?.abort(); status.textContent = ' 계산을 취소했습니다.'; });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (disposed || timer !== null || calculationController || curveController || !form.reportValidity()) return;
    readTargets();
    const options = readOptions();
    if (!options) return;
    disableControls(form);
    const controller = new AbortController(); calculationController = controller;
    cancelCalculation.hidden = false; cancelCalculation.disabled = false;
    status.textContent = ' 계산 중…'; result.replaceChildren();
    timer = setTimeout(async () => {
      timer = null;
      try {
        if (controller.signal.aborted) return;
        let plan: RedistributionPlan | undefined;
        for (const point of iterateHwangRedistribution(progressMap, options, true)) {
          if (controller.signal.aborted) return;
          plan = point.plan; status.textContent = ` 계산 중 · 초기화 상한 ${point.limit}명 기준 (요청 상한 ${options.maxReset}명)`;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (controller.signal.aborted) return;
        if (!plan) throw new Error('추천 결과를 생성하지 못했습니다.');
        currentCalculatedPlan = plan;
        onPlan(plan);
        result.classList.remove('tcbe-rd-stale-content');
        result.querySelector('.tcbe-rd-stale-banner')?.remove();
        result.innerHTML = renderRedistributionResult(plan, options, getPortraitMap());
        status.textContent = ' 계산 완료';
        updateToc(plan);
        const badge = dialog.querySelector<HTMLElement>('[data-tab-badge="result"]') || dialog.querySelector<HTMLElement>('[data-result-badge]');
        if (badge) badge.hidden = false;
        switchTab('result');
        const resultContent = dialog.querySelector<HTMLElement>('.tcbe-rd-result-content');
        if (resultContent) resultContent.scrollTo({ top: 0, behavior: 'smooth' });
        dialog.querySelector<HTMLElement>('.tcbe-rd-result-container')?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      catch (error) { status.textContent = error instanceof Error ? error.message : '계산에 실패했습니다.'; }
      finally { calculationController = null; restoreControls(); }
    }, 30);
  });
  dialog.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains('tcbe-rd-avatar')) {
      event.target.style.display = 'none';
    }
  }, true);
  dialog.addEventListener('click', async event => {
    if (disposed) return;
    const filterBtn = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-action-filter]') : null;
    if (filterBtn) {
      const filter = filterBtn.dataset.actionFilter;
      const chips = dialog.querySelectorAll<HTMLButtonElement>('[data-action-filter]');
      chips.forEach(chip => chip.classList.toggle('tcbe-rd-chip-active', chip === filterBtn));
      dialog.querySelectorAll<HTMLTableRowElement>('tr[data-action-row]').forEach(row => {
        row.hidden = filter !== 'all' && row.dataset.actionRow !== filter;
      });
      return;
    }
    const copyButton = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-copy-orders]') : null;
    if (copyButton && currentCalculatedPlan) {
      const statusEl = dialog.querySelector<HTMLElement>('[data-copy-status]');
      const text = generateOrdersText(currentCalculatedPlan);
      await copyTextWithFeedback(text, statusEl, '✓ 복사되었습니다.');
      return;
    }
    const curveButton = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-curve]') : null;
    if (curveButton) {
      if (calculationController) return;
      if (!form.reportValidity()) return;
      readTargets();
      const formOptions = readOptions();
      if (!formOptions) return;
      const options = { ...formOptions, maxReset: 0 };
      if (curveController) { curveController.abort(); return; }
      const controller = new AbortController(); curveController = controller;
      const status = dialog.querySelector<HTMLElement>('[data-curve-status]');
      const result = dialog.querySelector<HTMLElement>('[data-curve-result]');
      if (!status || !result) { curveController = null; return; }
      disableControls(form);
      curveButton.disabled = false; curveButton.textContent = '그래프 계산 취소'; result.replaceChildren();
      try {
        const curve = await calculateRedistributionCurve(progressMap, options, (_done, _total, limit, max) => { status.textContent = ` 계산 중 · 초기화 상한 ${limit}명 기준 (0~${max}명 비교)`; }, controller.signal);
        if (!controller.signal.aborted) { result.innerHTML = renderRedistributionCurve(curve); status.textContent = ' 계산 완료'; }
      } catch (error) { status.textContent = error instanceof Error ? error.message : '그래프 계산에 실패했습니다.'; }
      finally { curveController = null; curveButton.textContent = '인원별 그래프 계산'; restoreControls(); }
      return;
    }
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-show-map]') : null;
    if (!button) return;
    const map = dialog.querySelector<HTMLDetailsElement>(`#tcbe-rd-map-${button.dataset.showMap}`);
    if (map) { map.open = true; map.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  return {
    invalidateCurve: () => { curveController?.abort(); },
    dispose: () => {
      disposed = true;
      calculationController?.abort();
      curveController?.abort();
      if (timer !== null) { clearTimeout(timer); timer = null; }
      restoreControls();
    },
  };
}
