/**
 * 재분배 단계 프리셋 공유 및 JSON 내보내기/가져오기 도메인 로직
 */
import { STAT_CATEGORIES } from './boardProgress.ts';
import type { RedistributionStage, RedistributionStat, RedistributionTarget } from './hwangRedistribution.ts';

/** 표준 프리셋 타입 식별자 */
export const PRESET_TYPE = 'tcbe-redistribution-preset' as const;
/** 현재 지원하는 프리셋 버전 */
export const PRESET_VERSION = 1 as const;

/** 황크 단계에서 허용되는 스탯 (공격력 통합형 + 7대 스탯) */
export const HWANG_VALID_STATS: readonly RedistributionStat[] = [
  'attack',
  ...STAT_CATEGORIES.filter(c => c !== 'atk_phys' && c !== 'atk_mag'),
];

/** 보크 단계에서 허용되는 스탯 (물공/마공 개별 포함 8대 스탯) */
export const BOKR_VALID_STATS: readonly RedistributionStat[] = STAT_CATEGORIES;

/** 프리셋 내보내기/가져오기 표준 JSON 스키마 */
export interface RedistributionPreset {
  type: typeof PRESET_TYPE;
  version: typeof PRESET_VERSION;
  stages: RedistributionStage[];
}

/** 정수 및 범위 검사 */
const isIntegerInRange = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;

/**
 * 단일 단계 객체가 유효한지 검증하고 정규화된 RedistributionStage를 반환합니다.
 * 유효하지 않으면 null을 반환합니다. 알려진 필드만 추출하여 불필요한 속성을 차단합니다.
 */
export function validateRedistributionStage(raw: unknown): RedistributionStage | null {
  if (!raw || typeof raw !== 'object') return null;
  const stage = raw as Record<string, unknown>;

  const resource = stage.resource;
  if (resource !== undefined && resource !== 'hwang' && resource !== 'bokr') return null;
  const isBokr = resource === 'bokr';

  if (typeof stage.allowBlocked !== 'boolean') return null;
  if (stage.allowGates !== undefined && typeof stage.allowGates !== 'boolean') return null;

  if (stage.boardThrough !== undefined && !isIntegerInRange(stage.boardThrough, 0, 2)) return null;
  if (stage.boardIndex !== undefined && !isIntegerInRange(stage.boardIndex, 0, 2)) return null;
  if (!isBokr && (stage.boardIndex !== undefined || stage.boardThrough !== undefined)) return null;
  if (stage.boardIndex !== undefined && stage.boardThrough !== undefined) return null;

  if (!Array.isArray(stage.targets) || stage.targets.length === 0) return null;

  const validStatSet = new Set<string>(isBokr ? BOKR_VALID_STATS : HWANG_VALID_STATS);
  if (stage.targets.length > validStatSet.size) return null;

  const seen = new Set<string>();
  const validatedTargets: RedistributionTarget[] = [];

  for (const target of stage.targets) {
    if (!target || typeof target !== 'object') return null;
    const t = target as Record<string, unknown>;
    const stat = t.stat as RedistributionStat;

    if (typeof stat !== 'string' || !validStatSet.has(stat) || seen.has(stat)) return null;
    seen.add(stat);

    let val: number | null = null;
    if (t.target !== null && t.target !== undefined) {
      if (typeof t.target !== 'number' || !Number.isFinite(t.target) || t.target < 0 || t.target > 100000) return null;
      if (isBokr && !Number.isSafeInteger(t.target)) return null;
      val = t.target;
    }
    validatedTargets.push({ stat, target: val });
  }

  const result: RedistributionStage = {
    allowBlocked: stage.allowBlocked,
    targets: validatedTargets,
  };

  if (isBokr) {
    result.resource = 'bokr';
    if (stage.boardThrough !== undefined) result.boardThrough = stage.boardThrough as number;
    if (stage.boardIndex !== undefined) result.boardIndex = stage.boardIndex as number;
  } else if (resource === 'hwang') {
    result.resource = 'hwang';
  }

  if (stage.allowGates !== undefined) {
    result.allowGates = stage.allowGates;
  }

  return result;
}

/**
 * 단계 배열을 검증합니다 (1~30단계).
 */
export function validateRedistributionStages(rawStages: unknown): RedistributionStage[] | null {
  if (!Array.isArray(rawStages) || rawStages.length === 0 || rawStages.length > 30) return null;
  const result: RedistributionStage[] = [];
  for (const item of rawStages) {
    const valid = validateRedistributionStage(item);
    if (!valid) return null;
    result.push(valid);
  }
  return result;
}

/**
 * 단계 목록을 표준 공유 형식 JSON 문자열로 직렬화합니다.
 */
export function exportRedistributionPreset(stages: RedistributionStage[]): string {
  const validated = validateRedistributionStages(stages);
  if (!validated) {
    throw new Error('내보낼 단계 설정이 유효하지 않습니다.');
  }

  const preset: RedistributionPreset = {
    type: PRESET_TYPE,
    version: PRESET_VERSION,
    stages: validated.map(s => {
      const stageObj: RedistributionStage = {
        allowBlocked: s.allowBlocked,
        targets: s.targets.map(t => ({ stat: t.stat, target: t.target })),
      };
      if (s.resource === 'bokr') {
        stageObj.resource = 'bokr';
        if (s.boardThrough !== undefined) stageObj.boardThrough = s.boardThrough;
        if (s.boardIndex !== undefined) stageObj.boardIndex = s.boardIndex;
      } else if (s.resource === 'hwang') {
        stageObj.resource = 'hwang';
      }
      if (s.allowGates !== undefined) {
        stageObj.allowGates = s.allowGates;
      }
      return stageObj;
    }),
  };

  return JSON.stringify(preset, null, 2);
}

/**
 * 임의의 JSON 문자열에서 단계 설정을 안전하게 파싱합니다.
 * 표준 형식(type: 'tcbe-redistribution-preset', version: 1)을 우선 확인하고,
 * 유저 편의를 위해 단계 배열이나 이전 형식도 유연하게 수용합니다.
 */
export function parseRedistributionPreset(raw: string): RedistributionStage[] | null {
  try {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    let candidateStages: unknown = null;

    if (Array.isArray(parsed)) {
      // 순수 배열 형식 [ { targets: [...] }, ... ]
      candidateStages = parsed;
    } else {
      const obj = parsed as Record<string, unknown>;
      // 표준 공유 형식 검사
      if (obj.type === PRESET_TYPE) {
        if (obj.version !== PRESET_VERSION) return null; // 미지원 버전 거부
        candidateStages = obj.stages;
      } else if (Array.isArray(obj.stages)) {
        // 기타 stages 래퍼 객체 허용
        candidateStages = obj.stages;
      }
    }

    if (!candidateStages) return null;
    return validateRedistributionStages(candidateStages);
  } catch {
    return null;
  }
}
