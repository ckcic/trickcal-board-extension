import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateApostleProgress } from '../src/domain/boardProgress.ts';
import { getNormalStatUnitValue, NORMAL_STAT_UNIT_VALUES } from '../src/domain/normalStatValues.ts';

// 각 행: 스탯, statType, 기본 총/획득, 강화 총/획득, 이미지의 획득/잔여/총 수치.
const cases = [
  [3, [
    ['hp', 1, 7, 5, 4, 1, 2525, 3597, 6122],
    ['atk_mag', 4, 7, 2, 4, 1, 80, 225, 305],
    ['def_phys', 5, 7, 3, 4, 1, 192, 421, 613],
    ['def_mag', 6, 7, 2, 3, 1, 195, 421, 616],
    ['crit', 7, 7, 2, 3, 1, 145, 313, 458],
    ['crit_dmg', 8, 7, 3, 3, 1, 168, 290, 458],
    ['crit_res', 9, 6, 2, 3, 0, 54, 405, 459],
    ['crit_dmg_res', 10, 6, 3, 3, 0, 81, 378, 459],
  ]],
  [2, [
    ['hp', 1, 7, 5, 4, 2, 3520, 2602, 6122],
    ['atk_mag', 4, 7, 6, 4, 3, 240, 65, 305],
    ['def_phys', 5, 7, 5, 4, 3, 452, 161, 613],
    ['def_mag', 6, 7, 5, 3, 2, 421, 195, 616],
    ['crit', 7, 7, 7, 3, 1, 260, 198, 458],
    ['crit_dmg', 8, 7, 4, 3, 2, 290, 168, 458],
    ['crit_res', 9, 6, 5, 3, 2, 333, 126, 459],
    ['crit_dmg_res', 10, 6, 5, 3, 3, 432, 27, 459],
  ]],
  [1, [
    ['hp', 1, 4, 2, 2, 1, 3061, 3061, 6122],
    ['atk_phys', 3, 4, 2, 2, 1, 153, 153, 306],
    ['def_phys', 5, 3, 3, 2, 1, 412, 199, 611],
    ['def_mag', 6, 3, 3, 2, 1, 412, 199, 611],
    ['crit', 7, 3, 1, 2, 0, 54, 406, 460],
    ['crit_dmg', 8, 3, 2, 1, 0, 108, 352, 460],
    ['crit_res', 9, 3, 1, 1, 0, 54, 406, 460],
    ['crit_dmg_res', 10, 3, 2, 1, 0, 108, 352, 460],
  ]],
];

for (const [grade, rows] of cases) {
  test(`태생 ${grade}성 이미지의 8개 스탯 획득·잔여·총 수치를 재현한다`, () => {
    const nodes = [], picked = [];
    for (const [, statType, smallTotal, smallPicked, largeTotal, largePicked] of rows) {
      for (const [total, count, item] of [[smallTotal, smallPicked, 610001], [largeTotal, largePicked, 610002]]) {
        for (let i = 0; i < total; i++) {
          nodes.push({ id: nodes.length + 1, nodeType: 3, displayStat: [statType, 0], requireItems: [{ item, value: 3 }] });
          picked.push(i < count ? '1' : '0');
        }
      }
    }
    const progress = calculateApostleProgress({ apostleId: 1, boardSteps: [{ step: picked.join('') }] },
      { 1: { 0: nodes } }, { 1: { name: 'A', gradeDefault: grade, personality: 0 } }, { A: '검증사도' });
    for (const [category, , , , , , acquired, remaining, total] of rows) {
      const result = progress.normal.stats[category];
      assert.equal(result.valuesKnown, true);
      assert.deepEqual([result.picked, result.remaining, result.total], [acquired, remaining, total], category);
    }
  });
}

test('같은 태생 성급의 1·2·3차 보드에 동일한 기본·강화 상승량을 적용한다', () => {
  assert.equal(NORMAL_STAT_UNIT_VALUES[2], NORMAL_STAT_UNIT_VALUES[3]);
  for (const grade of [1, 2, 3]) {
    const nodes = [
      { id: 1, nodeType: 1 },
      { id: 2, nodeType: 3, displayStat: [1, 0], requireItems: [{ item: 610001, value: 3 }] },
      { id: 3, nodeType: 3, displayStat: [1, 0], requireItems: [{ item: 610002, value: 3 }] },
    ];
    const progress = calculateApostleProgress({ apostleId: 1, boardSteps: [{ step: '110' }, { step: '110' }, { step: '110' }] },
      { 1: [nodes, nodes, nodes] }, { 1: { name: 'A', gradeDefault: grade, personality: 0 } }, { A: '검증사도' });
    for (const board of progress.boards) {
      const hp = board.normal.stats.hp;
      assert.equal(hp.picked, grade === 1 ? 536 : 306);
      assert.equal(hp.remaining, grade === 1 ? 1989 : 995);
    }
  }
});

test('API 실제 수치를 정의표보다 우선하며 미지원 성급은 미상으로 남긴다', () => {
  const node = { id: 1, nodeType: 3, displayStat: [1, 0], stats: [{ statType: 1, statValue: 1234 }] };
  const calculate = (grade, data) => calculateApostleProgress({ apostleId: 1, boardSteps: [{ step: '1' }] },
    { 1: [[data]] }, { 1: { name: 'A', gradeDefault: grade, personality: 0 } }, { A: '검증사도' });
  assert.equal(calculate(1, node).normal.stats.hp.picked, 1234);
  assert.equal(getNormalStatUnitValue(4, 'hp', false), null);
  assert.equal(calculate(4, { ...node, stats: [] }).normal.stats.hp.valuesKnown, false);
});
