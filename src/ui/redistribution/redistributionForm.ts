import type { RedistributionOptions } from '../../domain/hwangRedistribution.ts';
import type { RedistributionSettings } from './redistributionSettings.ts';
import { readRedistributionStages } from './redistributionStageEditor.ts';

/** 저장·추천·그래프에서 같은 입력값을 읽으며 필수 요소가 없는 폼은 처리하지 않는다. */
export function readFormOptions(dialog: HTMLElement): RedistributionOptions | null {
  const owned = dialog.querySelector<HTMLInputElement>('[name=owned]');
  const bokr = dialog.querySelector<HTMLInputElement>('[name=bokr]');
  const reset = dialog.querySelector<HTMLInputElement>('[name=reset]');
  const searchMode = dialog.querySelector<HTMLSelectElement>('[name=search-mode]');
  const targetList = dialog.querySelector<HTMLElement>('[data-targets]');
  if (!owned || !bokr || !reset || !searchMode || !targetList) return null;
  if (searchMode.value !== 'fast' && searchMode.value !== 'thorough') return null;
  const optionalInt = (name: string): number | undefined => {
    const input = dialog.querySelector<HTMLInputElement>(`[name=${name}]`);
    if (!input?.value.trim()) return undefined;
    const value = input.valueAsNumber;
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  };
  return {
    searchMode: searchMode.value, ownedCrayons: owned.valueAsNumber, ownedBokr: bokr.valueAsNumber,
    maxReset: reset.valueAsNumber, ownedGold: optionalInt('gold'),
    ownedWateringCan: optionalInt('watering-can'), ownedClouds: optionalInt('clouds'),
    stages: readRedistributionStages(targetList),
  };
}

/** 저장된 입력을 복원하며 현재 보유 사도 수를 넘는 초기화 상한은 줄인다. */
export function restoreFormOptions(dialog: HTMLElement, saved: RedistributionSettings, ownedCount: number): void {
  const values = { owned: saved.owned, bokr: saved.bokr, reset: Math.min(saved.reset, ownedCount),
    gold: saved.gold, 'watering-can': saved.wateringCan, clouds: saved.clouds, 'search-mode': saved.searchMode };
  for (const [name, value] of Object.entries(values)) {
    const input = dialog.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`);
    if (input && value !== undefined) input.value = String(value);
  }
}
