import { STAT_META_LIST } from '../domain/boardProgress.ts';
import type { RecoveryResource, RecoverySelection } from '../domain/boardRecovery.ts';

export const RECOVERY_SETTINGS_KEY = 'tcbe_recovery_settings_v1';
export interface RecoverySettings { picks: string[]; compareFlowering: boolean }

export function getRecoveryStatOptions(resource: RecoveryResource) {
  return STAT_META_LIST.filter(meta => resource !== 'hwang' || meta.key !== 'atk_mag')
    .map(meta => ({ ...meta, nameKo: resource === 'hwang' && meta.key === 'atk_phys' ? '공격력' : meta.nameKo }));
}

export function normalizeRecoveryPicks(picks: unknown): string[] {
  if (!Array.isArray(picks)) return [];
  return [...new Set(picks.filter((pick): pick is string => typeof pick === 'string').flatMap(pick => {
    const [resource, board, stat, extra] = pick.split(':');
    if (extra !== undefined || !['hwang', 'bokr'].includes(resource!) || !['0', '1', '2'].includes(board!) || !STAT_META_LIST.some(meta => meta.key === stat)) return [];
    return [`${resource}:${board}:${resource === 'hwang' && stat === 'atk_mag' ? 'atk_phys' : stat}`];
  }))];
}

/** 황크 공격력 체크 하나로 물리/마법 공격력 범주를 모두 제거 대상으로 전달한다. */
export function expandRecoveryPicks(picks: string[]): RecoverySelection[] {
  return normalizeRecoveryPicks(picks).flatMap(pick => {
    const [resource, board, stat] = pick.split(':');
    const selection = { resource: resource as RecoveryResource, boardIndex: Number(board), stat: stat as RecoverySelection['stat'] };
    return resource === 'hwang' && stat === 'atk_phys' ? [selection, { ...selection, stat: 'atk_mag' as const }] : [selection];
  });
}

export function loadRecoverySettings(): RecoverySettings {
  try {
    const value = JSON.parse(localStorage.getItem(RECOVERY_SETTINGS_KEY) || 'null');
    return { picks: normalizeRecoveryPicks(value?.picks), compareFlowering: typeof value?.compareFlowering === 'boolean' ? value.compareFlowering : true };
  } catch { return { picks: [], compareFlowering: true }; }
}

export function saveRecoverySettings(settings: RecoverySettings): void {
  try { localStorage.setItem(RECOVERY_SETTINGS_KEY, JSON.stringify({ picks: normalizeRecoveryPicks(settings.picks), compareFlowering: settings.compareFlowering })); }
  catch { /* 저장소를 사용할 수 없어도 계산은 계속 제공한다. */ }
}
