import type { RedistributionStage } from '../domain/hwangRedistribution.ts';
import { getRedistributionStageStats } from './redistributionStageEditor.ts';

export const REDISTRIBUTION_SETTINGS_KEY = 'tcbe_redistribution_settings_v1';
export interface RedistributionSettings {
  owned: number;
  bokr: number;
  reset: number;
  searchMode: 'fast' | 'thorough';
  stages: RedistributionStage[];
}

export function parseRedistributionSettings(raw: string | null): RedistributionSettings | null {
  try {
    if (!raw) return null;
    const value = JSON.parse(raw);
    const integer = (n: unknown, max: number) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max;
    if (!value || !integer(value.owned, 1000000) || !integer(value.bokr, 1000000) || !integer(value.reset, 1000000) ||
      !['fast', 'thorough'].includes(value.searchMode) || !Array.isArray(value.stages) || !value.stages.length || value.stages.length > 30) return null;
    for (const stage of value.stages) {
      if (!stage || (stage.resource !== undefined && !['hwang', 'bokr'].includes(stage.resource)) ||
        typeof stage.allowBlocked !== 'boolean' || (stage.allowGates !== undefined && typeof stage.allowGates !== 'boolean') ||
        (stage.boardThrough !== undefined && !integer(stage.boardThrough, 2)) ||
        (stage.boardIndex !== undefined && !integer(stage.boardIndex, 2)) ||
        !Array.isArray(stage.targets) || !stage.targets.length || stage.targets.length > getRedistributionStageStats(stage).length) return null;
      const stats = new Set(getRedistributionStageStats(stage).map(([stat]) => stat));
      for (const target of stage.targets) {
        if (!target || !stats.has(target.stat) || (target.target !== null &&
          (typeof target.target !== 'number' || !Number.isFinite(target.target) || target.target < 0 || target.target > 100000))) return null;
      }
    }
    return value;
  } catch { return null; }
}

export function loadRedistributionSettings(): RedistributionSettings | null {
  try { return parseRedistributionSettings(localStorage.getItem(REDISTRIBUTION_SETTINGS_KEY)); }
  catch { return null; }
}

export function saveRedistributionSettings(settings: RedistributionSettings): void {
  const raw = JSON.stringify(settings);
  if (!parseRedistributionSettings(raw)) return;
  try { localStorage.setItem(REDISTRIBUTION_SETTINGS_KEY, raw); }
  catch { /* Storage may be unavailable; keep the editor usable. */ }
}
