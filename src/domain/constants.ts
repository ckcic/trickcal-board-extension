/** 보드 계산과 UI에서 공유하는 아이템·노드·스탯·성격 정의 */
import type { PersonalityMeta, StatCategory, StatMeta } from './types.ts';

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
