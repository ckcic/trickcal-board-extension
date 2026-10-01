import type { StatCategory } from './types.ts';

interface NormalStatUnitValues {
  readonly small: number;
  readonly large: number;
}

type StatUnitTable = Readonly<Record<StatCategory, NormalStatUnitValues>>;

/** 사용자 제공 일반칸 상세 표 기준. 태생 2·3성은 같은 값을 쓰며 보드 차수와 무관하다. */
const TWO_THREE_STAR_VALUES: StatUnitTable = {
  hp: { small: 306, large: 995 },
  atk_phys: { small: 15, large: 50 },
  atk_mag: { small: 15, large: 50 },
  def_phys: { small: 31, large: 99 },
  def_mag: { small: 31, large: 133 },
  crit: { small: 23, large: 99 },
  crit_dmg: { small: 23, large: 99 },
  crit_res: { small: 27, large: 99 },
  crit_dmg_res: { small: 27, large: 99 },
};

/** 일반칸 상승량은 이 표에서만 관리한다. 보크 상승량 표와 분리한다. */
export const NORMAL_STAT_UNIT_VALUES: Readonly<Record<1 | 2 | 3, StatUnitTable>> = {
  1: {
    hp: { small: 536, large: 1989 },
    atk_phys: { small: 27, large: 99 },
    atk_mag: { small: 27, large: 99 },
    def_phys: { small: 71, large: 199 },
    def_mag: { small: 71, large: 199 },
    crit: { small: 54, large: 149 },
    crit_dmg: { small: 54, large: 298 },
    crit_res: { small: 54, large: 298 },
    crit_dmg_res: { small: 54, large: 298 },
  },
  2: TWO_THREE_STAR_VALUES,
  3: TWO_THREE_STAR_VALUES,
};

/** 미지원 성급은 추측하지 않고 수치 미상으로 남긴다. */
export function getNormalStatUnitValue(gradeDefault: number, category: StatCategory, isLarge: boolean): number | null {
  if (gradeDefault !== 1 && gradeDefault !== 2 && gradeDefault !== 3) return null;
  const values = NORMAL_STAT_UNIT_VALUES[gradeDefault][category];
  return isLarge ? values.large : values.small;
}
