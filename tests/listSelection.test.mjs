import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAllApostlesProgress } from '../src/domain/boardProgress.ts';
import { compareApostles, selectApostleIds } from '../src/domain/listSelection.ts';
import { applyFilterToCards } from '../src/ui/board/boardEnhancer.ts';
import { getUniqueApostles } from '../src/domain/apostleProgress.ts';

const filter = { status: 'all', boardLevel: 'all', statCategory: 'all', personality: 'all',
  grade: 'all', unlockedTier: 'all', sortBy: 'name_asc' };
const base = calculateAllApostlesProgress({ apostles: [], board: { 1: { 0: [] } },
  heroInfo: { 1: { name: 'A', gradeDefault: 1, personality: 0 } }, text: { A: '가명' } }).get('1');
const apostles = [
  { ...base, apostleId: 1, name: '다', unlockedBoardCount: 2, gradeDefault: 1, personality: 1 },
  { ...base, apostleId: 2, name: '가', unlockedBoardCount: 3, gradeDefault: 3, personality: 5 },
  { ...base, apostleId: 3, name: '나', unlockedBoardCount: 2, gradeDefault: 1, personality: 1 },
  { ...base, apostleId: 4, name: '라', unlockedBoardCount: 1, gradeDefault: 2, personality: 0 },
  { ...base, apostleId: 5, name: '마', unlockedBoardCount: 3, gradeDefault: 3, personality: 5 },
];
const progressMap = new Map(apostles.flatMap(p => [[String(p.apostleId), p], [p.name, p]]));

test('공통 사도 목록은 별칭을 중복 제거하고 참조 및 최초 등장 순서를 보존한다', () => {
  const unique = getUniqueApostles(progressMap);
  assert.deepEqual(unique, apostles);
  unique.forEach((apostle, index) => assert.equal(apostle, apostles[index]));
  unique.reverse();
  assert.deepEqual(getUniqueApostles(progressMap), apostles);
  const differentReference = { ...apostles[0] };
  assert.equal(getUniqueApostles(new Map([['원본', apostles[0]], ['다른객체', differentReference]])).length, 2);
  assert.deepEqual(getUniqueApostles(new Map()), []);
});
const expectedOrders = {
  name_asc: [2, 3, 1, 4, 5], name_desc: [5, 4, 1, 3, 2],
  unlocked_asc: [4, 3, 1, 2, 5], unlocked_desc: [2, 5, 3, 1, 4],
  grade_asc: [3, 1, 4, 2, 5], grade_desc: [2, 5, 4, 3, 1],
  personality_asc: [4, 3, 1, 2, 5], personality_desc: [2, 5, 3, 1, 4],
};

function makeCard(progress) {
  const classes = new Set();
  return {
    style: { order: '' },
    closest: () => null,
    getAttribute: key => key === 'data-tcbe-apostle-name' ? progress.name : 'all',
    querySelectorAll: () => [],
    classList: {
      contains: name => classes.has(name),
      add: name => classes.add(name),
      remove: name => classes.delete(name),
    },
  };
}

for (const [sortBy, expected] of Object.entries(expectedOrders)) {
  test(`${sortBy}: 일반 카드와 가상 목록은 같은 순위 및 가나다순 동점 처리를 사용한다`, () => {
    const options = { ...filter, sortBy };
    assert.deepEqual(selectApostleIds(progressMap, options), expected);
    const cards = apostles.map(makeCard);
    assert.deepEqual(applyFilterToCards(options, progressMap, cards), { total: 5, visible: 5 });
    assert.deepEqual(cards.map((card, index) => ({ id: apostles[index].apostleId, order: Number(card.style.order) }))
      .sort((a, b) => a.order - b.order).map(item => item.id), expected);
    assert.deepEqual(selectApostleIds(progressMap, { ...options, grade: 1 }), expected.filter(id => id === 1 || id === 3));
  });
}

test('부분 갱신도 전체 순위를 사용하고 필터에서 제외된 카드의 정렬과 숨김을 복원한다', () => {
  const card = makeCard(apostles[0]);
  applyFilterToCards(filter, progressMap, [card]);
  assert.equal(card.style.order, '2');
  assert.deepEqual(applyFilterToCards({ ...filter, grade: 3 }, progressMap, [card]), { total: 1, visible: 0 });
  assert.equal(card.style.order, '');
  assert.equal(card.classList.contains('tcbe-card-hidden'), true);
  applyFilterToCards(filter, progressMap, [card]);
  assert.equal(card.style.order, '2');
  assert.equal(card.classList.contains('tcbe-card-hidden'), false);
});

test('동일 순위의 사도와 빈 목록을 처리하며 입력 Map의 순서를 변경하지 않는다', () => {
  const entries = [...progressMap.entries()];
  for (const sortBy of Object.keys(expectedOrders)) {
    assert.equal(compareApostles(apostles[0], { ...apostles[0] }, sortBy), 0);
    selectApostleIds(progressMap, { ...filter, sortBy });
  }
  assert.deepEqual([...progressMap.entries()], entries);
  assert.deepEqual(selectApostleIds(new Map(), filter), []);
});
