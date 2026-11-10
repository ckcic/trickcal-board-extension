import { DEFAULT_RESOURCE_PRIORITY, DEFAULT_RESOURCE_WEIGHTS, normalizeResourcePriority, type AuxiliaryResourceKey, type ResourceWeightConfig } from '../../domain/constants.ts';
import type { RedistributionCostMode, RedistributionOptions } from '../../domain/hwangRedistribution.ts';
import type { RedistributionSettings } from './redistributionSettings.ts';
import { readRedistributionStages } from './redistributionStageEditor.ts';
import { renderResourcePriorityList } from './redistributionTemplate.ts';

const WEIGHT_KEYS: Array<keyof ResourceWeightConfig> = [
  'ultraCrayon', 'epicCrayon', 'averageCrayon', 'basicCrayon',
  'wateringCan', 'goldPer10k', 'commonProof', 'proof', 'eldainProof',
];

/** 저장·추천·그래프에서 같은 입력값을 읽으며 필수 요소가 없는 폼은 처리하지 않는다. */
export function readFormOptions(dialog: HTMLElement): RedistributionOptions | null {
  const owned = dialog.querySelector<HTMLInputElement>('[name=owned]');
  const bokr = dialog.querySelector<HTMLInputElement>('[name=bokr]');
  const reset = dialog.querySelector<HTMLInputElement>('[name=reset]');
  const searchMode = dialog.querySelector<HTMLSelectElement>('[name=search-mode]');
  const costModeEl = dialog.querySelector<HTMLSelectElement>('[name=cost-mode]');
  const targetList = dialog.querySelector<HTMLElement>('[data-targets]');
  if (!owned || !bokr || !reset || !searchMode || !targetList) return null;
  if (searchMode.value !== 'fast' && searchMode.value !== 'thorough') return null;
  const costMode: RedistributionCostMode | undefined =
    costModeEl?.value === 'weighted' ? 'weighted' : costModeEl?.value === 'strict' ? 'strict' : undefined;
  const optionalInt = (name: string): number | undefined => {
    const input = dialog.querySelector<HTMLInputElement>(`[name=${name}]`);
    if (!input?.value.trim()) return undefined;
    const value = input.valueAsNumber;
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  };
  let resourceWeights: Partial<ResourceWeightConfig> | undefined;
  for (const key of WEIGHT_KEYS) {
    const input = dialog.querySelector<HTMLInputElement>(`[name=weight-${key}]`);
    if (!input) continue;
    const val = input.valueAsNumber;
    if (Number.isFinite(val) && val >= 0) {
      resourceWeights ??= {};
      resourceWeights[key] = val;
    }
  }
  const priorityList = dialog.querySelector<HTMLElement>('[data-priority-list]');
  const priorityItems = priorityList?.querySelectorAll?.<HTMLElement>('[data-priority-key]');
  const resourcePriority: AuxiliaryResourceKey[] | undefined = priorityItems && priorityItems.length > 0
    ? normalizeResourcePriority(Array.from(priorityItems, el => el.getAttribute('data-priority-key') || ''))
    : undefined;
  return {
    searchMode: searchMode.value,
    ...(costMode ? { costMode } : {}),
    ...(resourcePriority ? { resourcePriority } : {}),
    ...(resourceWeights ? { resourceWeights } : {}),
    ownedCrayons: owned.valueAsNumber, ownedBokr: bokr.valueAsNumber,
    maxReset: reset.valueAsNumber, ownedGold: optionalInt('gold'),
    ownedWateringCan: optionalInt('watering-can'), ownedClouds: optionalInt('clouds'),
    stages: readRedistributionStages(targetList),
  };
}

/** 저장된 입력을 복원하며 현재 보유 사도 수를 넘는 초기화 상한은 줄인다. */
export function restoreFormOptions(dialog: HTMLElement, saved: RedistributionSettings, ownedCount: number): void {
  const values: Record<string, string | number | undefined> = {
    owned: saved.owned, bokr: saved.bokr, reset: Math.min(saved.reset, ownedCount),
    gold: saved.gold, 'watering-can': saved.wateringCan, clouds: saved.clouds,
    'search-mode': saved.searchMode, 'cost-mode': saved.costMode,
  };
  if (saved.resourceWeights) {
    for (const key of WEIGHT_KEYS) {
      const val = saved.resourceWeights[key];
      if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
        values[`weight-${key}`] = val;
      }
    }
  }
  if (saved.resourcePriority) {
    const priorityList = dialog.querySelector<HTMLElement>('[data-priority-list]');
    if (priorityList) priorityList.innerHTML = renderResourcePriorityList(saved.resourcePriority);
  }
  for (const [name, value] of Object.entries(values)) {
    const input = dialog.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`);
    if (input && value !== undefined) input.value = String(value);
  }
}

/** 재화 가중치 입력을 기본값으로 초기화한다. */
export function resetFormResourceWeights(dialog: HTMLElement): void {
  for (const key of WEIGHT_KEYS) {
    const input = dialog.querySelector<HTMLInputElement>(`[name=weight-${key}]`);
    if (input) input.value = String(DEFAULT_RESOURCE_WEIGHTS[key]);
  }
}

/** 보조 재화 절약 우선순위 순서를 기본값으로 초기화한다. */
export function resetFormResourcePriority(dialog: HTMLElement): void {
  const priorityList = dialog.querySelector<HTMLElement>('[data-priority-list]');
  if (priorityList) priorityList.innerHTML = renderResourcePriorityList(DEFAULT_RESOURCE_PRIORITY);
}
