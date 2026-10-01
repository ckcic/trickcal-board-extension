import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTrickcalApiPayload } from '../src/domain/dataParser.ts';
import { calculateAllApostlesProgress } from '../src/domain/boardProgress.ts';
import { selectApostleIds } from '../src/domain/listSelection.ts';
import { VirtualGridAdapter, findVirtualGridSystem } from '../src/bridge/virtualGrid.ts';

const filter = { status: 'all', boardLevel: 'all', statCategory: 'all', personality: 'all', grade: 'all', unlockedTier: 'all', sortBy: 'name_asc' };
const payload = () => ({
  apostles: [{ apostleId: 1, boardSteps: [{ step: '101' }] }],
  heroInfo: { 1: { name: 'A', gradeDefault: 2, personality: 0 }, 2: { name: 'B', gradeDefault: 3, personality: 1 } },
  text: { A: '가상사도A', B: '가상사도B' },
  board: { 1: { 0: [
    { id: 1, nodeType: 3, displayStat: [1, 0], requireItems: [{ item: 610001, value: 3 }] },
    { id: 2, nodeType: 3, displayStat: [8, 0], requireItems: [{ item: 610002, value: 3 }] },
    { id: 3, nodeType: 3, displayStat: [9, 9, 0], requireItems: [] },
  ] }, 2: { 0: [] } },
});

test('새 displayStat 형식은 칸 수/치피/치저를 집계하고 태생 성급별 일반칸 수치를 복원한다', () => {
  const progress = calculateAllApostlesProgress(parseTrickcalApiPayload(parseTrickcalApiPayload(payload()))).get('1');
  assert.deepEqual([progress.normal.totalNodes, progress.normal.pickedNodes], [3, 2]);
  assert.equal(progress.normal.stats.hp.smallPicked, 1);
  assert.equal(progress.normal.stats.hp.valuesKnown, true);
  assert.equal(progress.normal.stats.hp.picked, 306);
  assert.equal(progress.normal.stats.crit_dmg.remaining, 99);
  assert.equal(progress.normal.stats.crit_res.picked, 27);
  assert.equal(progress.normal.stats.crit_dmg.largeTotal, 1);
  assert.equal(progress.normal.stats.crit_res.smallTotal, 1);
  assert.equal(progress.normal.stats.crit_res.smallPicked, 1);
});

test('잘못된 displayStat은 거부하고 stats와 displayStat이 공존하면 실제 stats를 우선한다', () => {
  for (const displayStat of ['1', [null], [1, '0']]) {
    const p = payload(); p.board[1][0][0].displayStat = displayStat;
    assert.equal(parseTrickcalApiPayload(p), null);
  }
  const p = payload(); p.board[1][0][0].stats = [{ statType: 1, statValue: 300 }];
  const a = calculateAllApostlesProgress(parseTrickcalApiPayload(p)).get('1');
  assert.equal(a.normal.stats.hp.total, 300);
  assert.equal(a.normal.stats.hp.smallTotal, 1);
  assert.equal(a.normal.stats.hp.valuesKnown, true);
});

test('표시 ID는 이름/ID 별칭을 중복 집계하지 않고 전체 사도를 필터·정렬한다', () => {
  const map = calculateAllApostlesProgress(parseTrickcalApiPayload(payload()));
  assert.deepEqual(selectApostleIds(map, filter), [1, 2]);
  assert.deepEqual(selectApostleIds(map, { ...filter, sortBy: 'name_desc' }), [2, 1]);
  assert.deepEqual(selectApostleIds(map, { ...filter, grade: 3 }), [2]);
  assert.deepEqual(selectApostleIds(map, { ...filter, sortBy: 'grade_desc' }), [2, 1]);
});

function stream(initial) {
  let value = initial; const listeners = new Set();
  return (action, argument) => {
    if (action === 4) return value;
    if (action === 0) { value = argument; for (const listener of [...listeners]) listener(value); }
    if (action === 1) { listeners.add(argument); argument(value); return () => listeners.delete(argument); }
  };
}
const systemFor = data => ({ data: stream(data), totalCount: stream(data.length), propsReady: stream(true), gridState: stream({ items: [] }) });

test('가상 목록은 전체 입력을 필터·정렬하고 빈 슬롯 없이 개수를 갱신하며 검색·복원을 지원한다', async () => {
  const original = Array.from({ length: 135 }, (_, i) => [String(i + 1), [[]]]);
  const system = systemFor(original); const reports = [];
  const adapter = new VirtualGridAdapter(system, (...args) => reports.push(args));
  adapter.update({ active: true, ids: [100, 70, 40], key: 'filter' });
  assert.deepEqual(system.data(4).map(item => item[0]), ['100', '70', '40']);
  assert.equal(system.totalCount(4), 3);
  assert.deepEqual(reports.at(-1), [3, 135, 'filter']);
  assert.equal(original.length, 135);
  system.propsReady(0, false); system.data(0, original.slice(0, 80)); system.totalCount(0, 80); system.propsReady(0, true);
  await new Promise(resolve => queueMicrotask(resolve));
  assert.deepEqual(system.data(4).map(item => item[0]), ['70', '40']);
  assert.deepEqual(reports.at(-1), [2, 80, 'filter']);
  adapter.update({ active: true, ids: [], key: 'empty' });
  assert.equal(system.totalCount(4), 0);
  adapter.update({ active: false, ids: [], key: 'restore' });
  assert.equal(system.data(4).length, 80);
  adapter.update({ active: true, ids: [1], key: 'again' });
  system.data(0, original); await new Promise(resolve => queueMicrotask(resolve));
  adapter.dispose();
  assert.equal(system.data(4), original);
  assert.equal(system.totalCount(4), 135);
});

test('React 컨텍스트 탐색은 검증된 가상 목록에만 연결한다', () => {
  const system = systemFor([['1', [[]]]]);
  assert.equal(findVirtualGridSystem({ '__reactFiber$test': { return: { memoizedProps: { value: system } } } }), system);
  assert.equal(findVirtualGridSystem({ '__reactFiber$test': { memoizedProps: { value: { ...system, data: stream(['invalid']) } } } }), null);
});
