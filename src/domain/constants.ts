/** 보드 계산과 UI에서 공유하는 아이템·노드·스탯·성격 정의 */
import type { HighPersonalityMeta, PersonalityMeta, StatCategory, StatMeta, TribeMeta } from './types.ts';

/** 하급 크레파스 아이템 ID */
export const BASIC_CRAYON_ITEM_ID = 610001;

/** 중급 크레파스 아이템 ID */
export const MID_CRAYON_ITEM_ID = 610002;

/** 상급 크레파스 (보라 크레파스 / 보크) 아이템 ID */
export const BOKR_ITEM_ID = 610003;

/** 최상급 크레파스 (황금 크레파스 / 황크) 아이템 ID */
export const HWANG_ITEM_ID = 610004;

/** 만개 물뿌리개 (꽃잎 칸 해금용 전용 재화) 아이템 ID */
export const WATERING_CAN_ITEM_ID = 610005;

/** 보드 노드 타입 상수 */
export const NODE_TYPE = {
  GATE: 1,
  START: 2,
  NORMAL: 3,
  BOKR: 4,
  HWANG: 5,
  HWANG_EXT: 6, // 10/01 확장 황크 노드
  PETAL: 7,     // 10/01 만개 물뿌리개로 여는 꽃잎 칸
} as const;

/** 스탯 카테고리 정의 목록 */
export const STAT_CATEGORIES: StatCategory[] = [
  'hp',
  'atk_phys',
  'atk_mag',
  'def_phys',
  'def_mag',
  'crit',
  'crit_dmg',
  'crit_res',
  'crit_dmg_res',
];

/** 스탯 메타데이터 정의 (spriteIndex: Stat.webp의 0~8번에 대응, valuePerNode: 보크 1칸당 증가 수치) */
export const STAT_META_LIST: StatMeta[] = [
  { key: 'hp', nameKo: '체력', color: '#22c55e', spriteIndex: 0, valuePerNode: 199 },
  { key: 'atk_phys', nameKo: '물공', color: '#f97316', spriteIndex: 1, valuePerNode: 13 },
  { key: 'atk_mag', nameKo: '마공', color: '#38bdf8', spriteIndex: 2, valuePerNode: 13 },
  { key: 'def_phys', nameKo: '물방', color: '#fb923c', spriteIndex: 3, valuePerNode: 20 },
  { key: 'def_mag', nameKo: '마방', color: '#a855f7', spriteIndex: 4, valuePerNode: 20 },
  { key: 'crit', nameKo: '치명', color: '#f43f5e', spriteIndex: 5, valuePerNode: 15 },
  { key: 'crit_dmg', nameKo: '치피', color: '#ef4444', spriteIndex: 6, valuePerNode: 15 },
  { key: 'crit_res', nameKo: '치저', color: '#06b6d4', spriteIndex: 7, valuePerNode: 15 },
  { key: 'crit_dmg_res', nameKo: '치피저', color: '#ec4899', spriteIndex: 8, valuePerNode: 15 },
];

/** 성격(Personality) 메타데이터 정의 (spriteIndex: Common_UnitPersonality.webp의 0~5번에 대응) */
export const PERSONALITY_META_LIST: PersonalityMeta[] = [
  { id: 0, nameKo: '순수', spriteIndex: 0 },
  { id: 1, nameKo: '냉정', spriteIndex: 1 },
  { id: 2, nameKo: '광기', spriteIndex: 2 },
  { id: 3, nameKo: '활발', spriteIndex: 3 },
  { id: 4, nameKo: '우울', spriteIndex: 4 },
  { id: 5, nameKo: '공명', spriteIndex: 5 },
];

/**
 * 성격 승격(High Personality) 메타데이터 정의
 * - 광기(2) 승격 -> 용기 (id: 10112, spriteIndex: 11)
 * - 활발(3) 승격 -> 헌신 (id: 10124, spriteIndex: 12)
 */
export const HIGH_PERSONALITY_MAP: Record<number, HighPersonalityMeta> = {
  10112: { id: 10112, nameKo: '용기', basePersonality: 2, spriteIndex: 11 },
  10124: { id: 10124, nameKo: '헌신', basePersonality: 3, spriteIndex: 12 },
};

/** 종족(Tribe) 메타데이터 정의 (0: 요정, 1: 수인, 2: 엘프, 3: 정령, 4: 유령, 5: 용족, 6: 마녀, 7: 미스틱) */
export const TRIBE_META_LIST: TribeMeta[] = [
  { id: 0, nameKo: '요정' },
  { id: 1, nameKo: '수인' },
  { id: 2, nameKo: '엘프' },
  { id: 3, nameKo: '정령' },
  { id: 4, nameKo: '유령' },
  { id: 5, nameKo: '용족' },
  { id: 6, nameKo: '마녀' },
  { id: 7, nameKo: '미스틱' },
];

/** 기존 statType 분류를 그대로 유지하며 정의되지 않은 코드는 매핑하지 않는다. */
export const STAT_CATEGORY_BY_TYPE: Readonly<Partial<Record<number, StatCategory>>> = Object.freeze({
  1: 'hp', 94: 'hp', 95: 'hp',
  3: 'atk_phys', 86: 'atk_phys', 88: 'atk_phys',
  4: 'atk_mag', 87: 'atk_mag', 89: 'atk_mag',
  5: 'def_phys', 90: 'def_phys', 92: 'def_phys',
  6: 'def_mag', 91: 'def_mag', 93: 'def_mag',
  7: 'crit', 96: 'crit', 97: 'crit',
  8: 'crit_dmg', 100: 'crit_dmg', 101: 'crit_dmg',
  9: 'crit_res', 98: 'crit_res', 99: 'crit_res',
  10: 'crit_dmg_res', 102: 'crit_dmg_res', 103: 'crit_dmg_res',
});

/** 관문 개방 시 추가되는 고정 비용 (2: 1번 관문→2차 개방, 3: 2번 관문→3차 개방) */
export const GATE_OPEN_COSTS: Readonly<Record<2 | 3, { gold: number; proof: number }>> = Object.freeze({
  2: { gold: 500000, proof: 5 },
  3: { gold: 1000000, proof: 5 },
});

/** 성급 승급 단계별(★1→★2, ★2→★3, ★3→★4) 필요 증명서 및 골드 비용 */
export const PROMOTION_COSTS: Readonly<Record<1 | 2 | 3, { proof: number; gold: number }>> = Object.freeze({
  1: { proof: 12, gold: 30000 },
  2: { proof: 20, gold: 100000 },
  3: { proof: 25, gold: 200000 },
});

/** 증명서 종류별 표시 명칭 */
export const PROOF_LABELS = Object.freeze({
  commonProof: '★1 공동 교단 증명서',
  proof: '일반 사도 증명서',
  eldainProof: '엘다인 사도 증명서',
});

/** 재화 가치 환산 효율 모드에서 사용하는 기본 재화별 가중치 (골드는 10,000골드당 가치) */
export interface ResourceWeightConfig {
  ultraCrayon: number;
  epicCrayon: number;
  averageCrayon: number;
  basicCrayon: number;
  wateringCan: number;
  goldPer10k: number;
  commonProof: number;
  proof: number;
  eldainProof: number;
}

export const DEFAULT_RESOURCE_WEIGHTS: Readonly<ResourceWeightConfig> = Object.freeze({
  ultraCrayon: 400,
  epicCrayon: 150,
  averageCrayon: 1.6,
  basicCrayon: 1,
  wateringCan: 10,
  goldPer10k: 2.04,
  commonProof: 0.7635,
  proof: 76.35,
  eldainProof: 320.36,
});

/** 비율 배분 모드에서 사용하는 스탯별 기본 성장 비율 가중치 */
export const DEFAULT_GROWTH_RATIOS: Readonly<Record<StatCategory | 'attack', number>> = Object.freeze({
  attack: 1.5,
  atk_phys: 1.5,
  atk_mag: 1.5,
  hp: 1,
  def_phys: 1,
  def_mag: 1,
  crit: 0.5,
  crit_dmg: 0.5,
  crit_res: 0.5,
  crit_dmg_res: 0.5,
});

/** 재화별 엄격 우선순위(strict) 모드에서 순서를 지정할 수 있는 보조 재화 키 */
export type AuxiliaryResourceKey = 'wateringCan' | 'averageCrayon' | 'basicCrayon' | 'gold';

/** 보조 재화 기본 절약 우선순위 순서 (만개 물뿌리개 → 중급 크레파스 → 하급 크레파스 → 골드) */
export const DEFAULT_RESOURCE_PRIORITY: readonly AuxiliaryResourceKey[] = Object.freeze([
  'wateringCan',
  'averageCrayon',
  'basicCrayon',
  'gold',
]);

/** 보조 재화 표시 명칭 */
export const AUXILIARY_RESOURCE_LABELS: Readonly<Record<AuxiliaryResourceKey, string>> = Object.freeze({
  wateringCan: '만개 물뿌리개',
  averageCrayon: '중급 크레파스',
  basicCrayon: '하급 크레파스',
  gold: '골드',
});

/** 입력된 보조 재화 우선순위 배열을 검증·중복 제거하고 누락된 재화는 기본 순서대로 채워 반환한다. */
export function normalizeResourcePriority(priority?: readonly string[]): AuxiliaryResourceKey[] {
  const validSet = new Set<string>(DEFAULT_RESOURCE_PRIORITY);
  const result: AuxiliaryResourceKey[] = [];
  if (Array.isArray(priority)) {
    for (const key of priority) {
      if (validSet.has(key) && !result.includes(key as AuxiliaryResourceKey)) {
        result.push(key as AuxiliaryResourceKey);
      }
    }
  }
  for (const key of DEFAULT_RESOURCE_PRIORITY) {
    if (!result.includes(key)) result.push(key);
  }
  return result;
}


