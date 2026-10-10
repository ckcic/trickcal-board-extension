import type { RedistributionStage } from '../domain/hwangRedistribution.ts';
import { validateRedistributionStages, exportRedistributionPreset, parseRedistributionPreset } from '../domain/redistributionPreset.ts';

export { exportRedistributionPreset, parseRedistributionPreset, validateRedistributionStages };

export const REDISTRIBUTION_SETTINGS_KEY = 'tcbe_redistribution_settings_v1';
export interface RedistributionSettings {
  owned: number;
  bokr: number;
  reset: number;
  gold?: number;
  wateringCan?: number;
  clouds?: number;
  searchMode: 'fast' | 'thorough';
  stages: RedistributionStage[];
}

export function parseRedistributionSettings(raw: string | null): RedistributionSettings | null {
  try {
    if (!raw) return null;
    const value = JSON.parse(raw);
    const integer = (n: unknown, max: number) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max;
    if (!value || !integer(value.owned, 1000000) || !integer(value.bokr, 1000000) || !integer(value.reset, 1000000) ||
      (value.gold !== undefined && !integer(value.gold, 2000000000)) ||
      (value.wateringCan !== undefined && !integer(value.wateringCan, 100000)) ||
      (value.clouds !== undefined && !integer(value.clouds, 1000000)) ||
      !['fast', 'thorough'].includes(value.searchMode)) return null;

    const validatedStages = validateRedistributionStages(value.stages);
    if (!validatedStages) return null;

    return {
      ...value,
      stages: validatedStages,
    };
  } catch { return null; }
}

export function loadRedistributionSettings(): RedistributionSettings | null {
  try { return parseRedistributionSettings(localStorage.getItem(REDISTRIBUTION_SETTINGS_KEY)); }
  catch { return null; }
}

export function saveRedistributionSettings(settings: RedistributionSettings): void {
  try {
    // 미입력 숫자의 NaN이 JSON에서 null(전부 목표)로 바뀌지 않도록 막는다.
    const raw = JSON.stringify(settings, (_key, value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('유효하지 않은 숫자');
      return value;
    });
    if (parseRedistributionSettings(raw)) localStorage.setItem(REDISTRIBUTION_SETTINGS_KEY, raw);
  } catch { /* 저장소를 사용할 수 없어도 편집기는 계속 사용할 수 있다. */ }
}
