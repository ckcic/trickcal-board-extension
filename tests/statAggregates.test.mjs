import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateBokrStats } from '../src/domain/statAggregates.ts';
import { DEFAULT_FILTER_STATE } from '../src/domain/filters.ts';
import { calculateAllApostlesProgress, STAT_CATEGORIES } from '../src/domain/boardProgress.ts';
import { mockHeroInfo, mockMasterBoard, mockText, mockUserApostles } from './fixtures/sanitizedData.mjs';

const statMap = (picked, total) => Object.fromEntries(STAT_CATEGORIES.map(key =>
  [key, key === 'hp' ? { picked, total, remaining: total - picked } : { picked: 0, total: 0, remaining: 0 }]));
const base = calculateAllApostlesProgress({ apostles: mockUserApostles, board: mockMasterBoard,
  heroInfo: mockHeroInfo, text: mockText }).get('10001');
const apostle = (id, grade, personality, tier, owned, stats, boards) => ({ ...base,
  apostleId: id, name: `가명${id}`, gradeDefault: grade, personality, unlockedBoardCount: tier, isOwned: owned,
  bokr: { ...base.bokr, byStat: statMap(...stats) },
  boards: boards.map(([picked, total], index) => ({ boardStepLevel: index + 1, unlocked: index < tier,
    bokr: { byStat: statMap(picked, total) } })),
});
const apostles = [
  apostle(1, 3, 0, 2, true, [5, 8], [[1, 2], [4, 6]]),
  apostle(2, 2, 1, 1, true, [1, 4], [[1, 3], [0, 1]]),
  apostle(3, 1, 3, 1, false, [0, 2], [[0, 2]]),
];
const progressMap = new Map(apostles.flatMap(a => [[String(a.apostleId), a], [a.name, a]]));

for (const [label, options, expected] of [
  ['전체 및 미보유 사도', {}, [6, 14, 8]],
  ['성급', { grade: 3 }, [5, 8, 3]],
  ['성격', { personality: 1 }, [1, 4, 3]],
  ['해금 관문', { unlockedTier: 2 }, [5, 8, 3]],
  ['복합 조건 불일치', { grade: 3, personality: 1 }, [0, 0, 0]],
  ['1차 보드', { boardLevel: '1' }, [2, 7, 5]],
  ['미해금 기록을 포함한 2차 보드', { boardLevel: '2' }, [4, 7, 3]],
  ['기록이 없는 3차 보드', { boardLevel: '3' }, [0, 0, 0]],
  ['상태·스탯·정렬과 독립', { status: 'complete', statCategory: 'crit', sortBy: 'name_desc' }, [6, 14, 8]],
]) {
  test(`보크 집계: ${label}`, () => {
    const result = aggregateBokrStats(progressMap, { ...DEFAULT_FILTER_STATE, ...options });
    assert.deepEqual(result.hp, { picked: expected[0], total: expected[1], remaining: expected[2] });
    assert.equal(Object.keys(result).length, STAT_CATEGORIES.length);
    assert.deepEqual(result.crit, { picked: 0, total: 0, remaining: 0 });
  });
}

test('보크 집계는 빈 목록·없는 스탯을 처리하고 결과 변경이 원본이나 다음 집계에 영향을 주지 않는다', () => {
  const snapshot = structuredClone([...progressMap]);
  const result = aggregateBokrStats(progressMap, DEFAULT_FILTER_STATE);
  result.hp.picked = 999;
  assert.equal(aggregateBokrStats(progressMap, DEFAULT_FILTER_STATE).hp.picked, 6);
  assert.deepEqual([...progressMap], snapshot);
  assert.deepEqual(aggregateBokrStats(new Map(), DEFAULT_FILTER_STATE).hp, { picked: 0, total: 0, remaining: 0 });
  const sparse = { ...apostles[0], bokr: { ...apostles[0].bokr, byStat: {} } };
  assert.deepEqual(aggregateBokrStats(new Map([['1', sparse]]), DEFAULT_FILTER_STATE).hp,
    { picked: 0, total: 0, remaining: 0 });
});
