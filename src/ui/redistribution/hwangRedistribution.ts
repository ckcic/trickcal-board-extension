import { renderRedistributionTemplate } from './redistributionTemplate.ts';
import { setupRedistributionToc } from './redistributionToc.ts';
import { setupRedistributionSettingsTabs } from './redistributionSettingsTabs.ts';
import { setupRedistributionStageDrag } from './redistributionStageDrag.ts';
import { setupRedistributionCalculation } from './redistributionCalculation.ts';
import { readFormOptions, restoreFormOptions } from './redistributionForm.ts';
import { collectApostlePortraits } from '../common/apostlePortraits.ts';
import { closeAllTools, closeTool, registerToolModal } from '../common/toolModals.ts';
import { formatNumber } from '../common/format.ts';
import type { ProgressMap } from '../../domain/types.ts';
import { loadRedistributionSettings, saveRedistributionSettings } from './redistributionSettings.ts';
import { openExportPresetModal, openImportPresetModal } from './redistributionPresetModal.ts';
import {
  getSpentHwangCrayons,
  getSpentBokrCrayons,
  createRedistributionGoalPreview,
  createExampleRedistributionStages,
  type RedistributionPlan,
  type RedistributionStat,
} from '../../domain/hwangRedistribution.ts';
import { createCommonModal } from '../common/commonModal.ts';
import {
  renderRedistributionStageEditor,
  readRedistributionStages,
  getRedistributionStageStats,
  renderStageTargetHint,
} from './redistributionStageEditor.ts';
import {
  getHwangStatLimits,
  getRedistributionStatUnit,
  roundRedistributionTarget,
} from '../../domain/hwangStatLimits.ts';

export function closeHwangRedistribution(): void { closeTool('redistribution'); }


export function openHwangRedistribution(progressMap: ProgressMap): void {
  closeAllTools();
  let portraitMapCache: Map<string | number, string> | null = null;
  const getPortraitMap = () => (portraitMapCache ??= collectApostlePortraits(progressMap));
  const spentCrayons = getSpentHwangCrayons(progressMap);
  const spentBokr = getSpentBokrCrayons(progressMap);
  const ownedCount = new Set([...progressMap.values()].filter(a => a.isOwned !== false).map(a => a.apostleId)).size;
  const limits = getHwangStatLimits(progressMap);
  const bokrLimits = getHwangStatLimits(progressMap, 'bokr');
  const allGoal = createRedistributionGoalPreview(progressMap);
  const savedSettings = loadRedistributionSettings();
  let stages = savedSettings?.stages ?? createExampleRedistributionStages();

  let saveSettingsTimer: ReturnType<typeof setTimeout> | null = null;

  const bodyHtml = renderRedistributionTemplate(spentCrayons, spentBokr, ownedCount, limits, bokrLimits);

  let disposeDrag = () => {};
  let disposeSettingsTabs = () => {};
  let calculation = { dispose() {}, invalidateCurve() {} };
  let unregisterTool = () => {};
  const modal = createCommonModal({
    id: 'tcbe-redistribution-dialog',
    title: '만개·황크 재분배',
    badgeText: '베타',
    tabs: [
      { id: 'settings', label: '⚙️ 목표·예산 설정', panelId: 'tcbe-panel-settings' },
      { id: 'result', label: '📋 추천 결과 & 작업 순서', badge: '완료', badgeHidden: true, panelId: 'tcbe-panel-result' },
      { id: 'curve', label: '📈 인원별 비교 그래프', panelId: 'tcbe-panel-curve' },
    ],
    initialTabId: 'settings',
    bodyHtml,
    onClose: () => {
      unregisterTool();
      disposeDrag();
      disposeSettingsTabs();
      calculation.dispose();
      if (saveSettingsTimer !== null) {
        clearTimeout(saveSettingsTimer);
        saveSettings();
      }
    },
  });

  unregisterTool = registerToolModal('redistribution', modal.close);
  const dialog = modal.dialog;
  const targetList = dialog.querySelector<HTMLElement>('[data-targets]');
  const form = dialog.querySelector('form');
  if (!targetList || !form) { modal.close(); return; }
  if (savedSettings) restoreFormOptions(dialog, savedSettings, ownedCount);
  const saveSettings = () => {
    const options = readFormOptions(dialog);
    if (!options) return;
    saveRedistributionSettings({ owned: options.ownedCrayons, bokr: options.ownedBokr ?? 0, reset: options.maxReset,
      gold: options.ownedGold, wateringCan: options.ownedWateringCan, clouds: options.ownedClouds,
      searchMode: options.searchMode ?? 'fast', stages: options.stages ?? [] });
  };
  const debouncedSaveSettings = () => {
    if (saveSettingsTimer !== null) clearTimeout(saveSettingsTimer);
    saveSettingsTimer = setTimeout(() => { saveSettingsTimer = null; saveSettings(); }, 300);
  };
  let currentCalculatedPlan: RedistributionPlan | null = null;
  const invalidateResult = (event?: Event) => {
    if (event) debouncedSaveSettings();
    const targetName = event?.target instanceof HTMLInputElement ? event.target.name : '';
    const keepCurve = ['reset', 'gold', 'watering-can', 'clouds'].includes(targetName);
    if (!keepCurve) {
      calculation.invalidateCurve();
      dialog.querySelector('[data-curve-result]')?.replaceChildren();
      const curveStatus = dialog.querySelector('[data-curve-status]');
      if (curveStatus) curveStatus.textContent = '';
    }
    for (const [name, selector, spent] of [['owned', '[data-total]', spentCrayons], ['bokr', '[data-total-bokr]', spentBokr]] as const) {
      const extra = dialog.querySelector<HTMLInputElement>(`[name=${name}]`)?.valueAsNumber;
      const total = dialog.querySelector(selector);
      if (total) total.textContent = extra !== undefined && Number.isSafeInteger(extra) && extra >= 0 ? `${formatNumber(spent + extra)}개` : '입력을 확인해 주세요';
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
    const badge = dialog.querySelector<HTMLElement>('[data-tab-badge="result"]') || dialog.querySelector<HTMLElement>('[data-result-badge]');
    if (badge) badge.hidden = true;
    const status = dialog.querySelector('[data-status]');
    if (status) status.textContent = ' 설정을 변경했습니다. 다시 계산해 주세요.';
  };
  const renderTargets = () => {
    targetList.innerHTML = renderRedistributionStageEditor(stages, limits, bokrLimits, allGoal);
    for (const selector of ['[data-add-stage]', '[data-add-bokr-stage]']) {
      const button = dialog.querySelector<HTMLButtonElement>(selector);
      if (button) button.disabled = stages.length >= 30;
    }
  };
  const readTargets = () => { stages = readRedistributionStages(targetList); };
  renderTargets();
  invalidateResult();
  const status = dialog.querySelector('[data-status]');
  if (status) status.textContent = '';

  const updateToc = setupRedistributionToc(dialog, getPortraitMap);

  disposeSettingsTabs = setupRedistributionSettingsTabs(dialog, progressMap);

  disposeDrag = setupRedistributionStageDrag(targetList, dialog.querySelector<HTMLElement>('#tcbe-panel-settings'),
    (sourceIndex, targetIndex, after) => {
      readTargets();
      const [moved] = stages.splice(sourceIndex, 1);
      if (!moved) return;
      const insertIndex = after ? (sourceIndex < targetIndex ? targetIndex : targetIndex + 1)
        : (sourceIndex < targetIndex ? targetIndex - 1 : targetIndex);
      stages.splice(Math.max(0, Math.min(stages.length, insertIndex)), 0, moved);
      renderTargets();
      invalidateResult();
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
      const stageElement = event.target.closest<HTMLElement>('[data-stage]');
      if (!stageElement) return;
      readTargets();
      const stage = stages[Number(stageElement.dataset.stage)];
      if (!stage) return;
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
        const statSelect = row.querySelector<HTMLSelectElement>('[data-stat]');
        const resource = row.closest('[data-stage]')?.querySelector<HTMLInputElement>('[data-resource]:checked');
        const input = row.querySelector<HTMLInputElement>('[data-value]');
        if (!statSelect || !resource || !input) return;
        const stat = statSelect.value as RedistributionStat;
        const bokr = resource.value === 'bokr';
        const unit = bokr ? 1 : getRedistributionStatUnit(stat);
        input.step = String(unit); input.max = String(Math.floor(100000 / unit) * unit);
        if (Number.isFinite(input.valueAsNumber)) input.value = String(bokr ? Math.ceil(input.valueAsNumber) : roundRedistributionTarget(input.valueAsNumber, stat));
        const limit = row.querySelector('[data-limit]');
        if (limit) limit.textContent = renderStageTargetHint(stat, bokr, bokr ? bokrLimits : limits);
      }
    }
    if (event.target instanceof HTMLSelectElement && event.target.hasAttribute('data-mode')) {
      const input = event.target.closest('[data-target]')?.querySelector<HTMLInputElement>('[data-value]');
      if (!input) return;
      input.disabled = event.target.value === 'all'; input.required = !input.disabled;
    }
    readTargets(); renderTargets(); invalidateResult();
  });
  targetList.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-stage-action]') : null;
    if (!button) return;
    readTargets(); const index = Number(button.dataset.index), action = button.dataset.stageAction;
    const stage = stages[index]; if (!stage) return;
    const previousStage = stages[index - 1];
    if (action === 'up' && previousStage) [stages[index - 1], stages[index]] = [stage, previousStage];
    const nextStage = stages[index + 1];
    if (action === 'down' && nextStage) [stages[index], stages[index + 1]] = [nextStage, stage];
    if (action === 'delete' && stages.length > 1) stages.splice(index, 1);
    if (action === 'remove-target' && stage.targets.length > 1) stage.targets.splice(Number(button.dataset.targetIndex), 1);
    if (action === 'add-target') {
      const stat = getRedistributionStageStats(stage).map(([stat]) => stat).find(stat => !stage.targets.some(target => target.stat === stat));
      if (stat) stage.targets.push({ stat, target: stage.resource === 'bokr' ? null : 0 });
    }
    renderTargets(); invalidateResult();
  });
  dialog.querySelector('[data-add-bokr-stage]')?.addEventListener('click', () => {
    readTargets(); if (stages.length < 30) stages.push({ resource: 'bokr', boardThrough: 0, allowBlocked: false, targets: [{ stat: 'atk_phys', target: null }] });
    renderTargets(); invalidateResult();
  });
  dialog.querySelector('[data-add-stage]')?.addEventListener('click', () => {
    readTargets(); if (stages.length < 30) stages.push({ allowBlocked: false, targets: [{ stat: 'attack', target: 0 }] });
    renderTargets(); invalidateResult();
  });
  dialog.querySelector('[data-examples]')?.addEventListener('click', () => {
    stages = createExampleRedistributionStages(); renderTargets(); invalidateResult();
  });
  dialog.querySelector('[data-export-preset]')?.addEventListener('click', () => {
    readTargets();
    openExportPresetModal(dialog, stages);
  });
  dialog.querySelector('[data-import-preset]')?.addEventListener('click', () => {
    openImportPresetModal(dialog, importedStages => {
      stages = importedStages;
      renderTargets();
      invalidateResult();
      const status = dialog.querySelector<HTMLElement>('[data-status]');
      if (status) status.textContent = ` ${stages.length}개 단계 설정을 가져왔습니다.`;
    });
  });
  form.addEventListener('input', invalidateResult);
  form.addEventListener('change', invalidateResult);
  calculation = setupRedistributionCalculation({ dialog, progressMap, readOptions: () => readFormOptions(dialog),
    readTargets, updateToc, getPortraitMap, switchTab: modal.switchTab,
    onPlan: plan => { currentCalculatedPlan = plan; } });

}
