import assert from 'node:assert/strict';
import test from 'node:test';
import { getSpentHwangCrayons, recommendHwangRedistribution, readHwangStats } from '../src/domain/hwangRedistribution.ts';
import { renderRedistributionResult } from '../src/ui/hwangRedistribution.ts';

const start = () => ({ id: 1, nodeType: 2, grid: { x: 0, y: 0 } });
const yellow = (id, x, y, statType = 88, cost = 2) => ({ id, nodeType: 5, grid: { x, y }, requireItems: [{ item: 610004, value: cost }], stats: [{ statType, statValue: 60 }] });
const apostle = (id, nodes, step = '') => ({ apostleId: id, name: `가상사도${id}`, isOwned: true, boards: [{ unlocked: true, masterNodes: nodes, stepStr: step }] });
const options = (overrides = {}) => ({ ownedCrayons: 0, maxReset: 0, priorities: [{ stat: 'atk_phys', target: 6 }], ...overrides });
const mapFor = (...items) => new Map(items.flatMap(item => [[String(item.apostleId), item], [item.name, item]]));

test('총 황크 기본값은 칠한 칸의 실제 비용이며 별칭·미보유·잠긴 차수는 더하지 않는다', () => {
  const a = apostle(1, [start(), yellow(2, 1, 0, 88, 2), yellow(3, 2, 0, 95, 4), yellow(4, 3, 0, 99, 6)], '1110');
  a.boards.push({ unlocked: false, masterNodes: [yellow(2, 1, 0, 88, 6)], stepStr: '1' });
  const b = { ...apostle(2, [yellow(2, 1, 0)], '1'), isOwned: false };
  assert.equal(getSpentHwangCrayons(mapFor(a, b)), 6);
  assert.equal(getSpentHwangCrayons(new Map()), 0);
  const plan = recommendHwangRedistribution(mapFor(a), options());
  assert.equal(plan.spend.ultraCrayon, 0);
  assert.equal(plan.remaining, 0);
});

test('백분율 코드를 0.1% 단위로 계산하고 정수 스탯과 누락된 수치는 거부한다', () => {
  const node = yellow(2, 1, 0);
  node.stats.push({ statType: 89, statValue: 60 });
  const stats = readHwangStats(node);
  assert.equal(stats.atk_phys, 6); assert.equal(stats.atk_mag, 6);
  assert.throws(() => readHwangStats({ ...node, stats: [] }), /누락/);
  assert.throws(() => readHwangStats({ ...node, stats: [{ statType: 86, statValue: 60 }] }), /형식/);
});

test('별칭·미보유·잠긴 보드를 제외하고 황크 예산을 넘기지 않는다', () => {
  const a = apostle(1, [start(), yellow(2, 1, 0), yellow(3, 2, 0)], '100');
  const b = { ...apostle(2, [start(), yellow(2, 1, 0)], '11'), isOwned: false };
  a.boards.push({ unlocked: false, masterNodes: [start(), yellow(2, 1, 0)], stepStr: '11' });
  const snapshot = JSON.stringify(a);
  const plan = recommendHwangRedistribution(mapFor(a, b), options({ ownedCrayons: 3, priorities: [{ stat: 'atk_phys', target: 100 }] }));
  assert.equal(plan.before.atk_phys, 0); assert.equal(plan.after.atk_phys, 6);
  assert.equal(plan.spend.ultraCrayon, 2); assert.equal(plan.remaining, 1);
  assert.equal(plan.nodes.length, 3); assert.equal(JSON.stringify(a), snapshot);
});

test('열린 꽃잎만 확장 황크 후보로 사용하며 꽃잎·관문 재화는 환급하지 않는다', () => {
  const petal = { id: 141, nodeType: 7, grid: { x: -1, y: -1 }, nextId: 42, requireItems: [{ item: 610005, value: 2 }] };
  const ext = { ...yellow(142, 1, 0), nodeType: 6, prevId: 41 };
  const a = apostle(1, [start(), petal, ext], '100');
  let plan = recommendHwangRedistribution(mapFor(a), options({ ownedCrayons: 2 }));
  assert.equal(plan.after.atk_phys, 0);
  a.boards[0].stepStr = '110';
  plan = recommendHwangRedistribution(mapFor(a), options({ ownedCrayons: 2 }));
  assert.equal(plan.after.atk_phys, 6); assert.equal(plan.spend.wateringCan, 0);
  assert.equal(plan.refund.wateringCan, 0);
});

test('황크를 재분배하면서 일반칸·보크를 경로 순서대로 복구하고 다른 재화도 환급한다', () => {
  const normal = { id: 2, nodeType: 3, grid: { x: 1, y: 0 }, requireGold: 10, requireItems: [{ item: 610001, value: 3 }] };
  const bokr = { id: 3, nodeType: 4, grid: { x: 2, y: 0 }, requireItems: [{ item: 610003, value: 4 }] };
  const gate = { id: 5, nodeType: 1, grid: { x: 0, y: 1 }, requireGold: 50 };
  const a = apostle(1, [start(), normal, bokr, yellow(4, 3, 0, 99), gate], '11111');
  const b = apostle(2, [start(), yellow(2, 1, 0)], '10');
  const plan = recommendHwangRedistribution(mapFor(a, b), options({ maxReset: 1 }));
  assert.equal(plan.resetCount, 1); assert.equal(plan.after.atk_phys, 6); assert.equal(plan.after.crit_res, 0);
  assert.equal(plan.refund.ultraCrayon, 2); assert.equal(plan.refund.basicCrayon, 3);
  assert.equal(plan.refund.epicCrayon, 4); assert.equal(plan.refund.gold, 10);
  assert.equal(plan.spend.basicCrayon, 3); assert.equal(plan.spend.epicCrayon, 4);
  assert.ok(plan.selected.has('1:0:1')); assert.ok(plan.selected.has('1:0:2')); assert.ok(plan.selected.has('1:0:4'));
  assert.equal(plan.remaining, 0); assert.ok(plan.actions.every(action => action.balance >= 0));
  assert.deepEqual(plan.actions.find(action => action.apostle.apostleId === 1).paint.map(entry => entry.node.id), [2, 3]);
});

test('일반칸 복구에 필수인 황크는 지우지 않고 더 나쁘거나 동점인 초기화안은 채택하지 않는다', () => {
  const normal = { id: 3, nodeType: 3, grid: { x: 2, y: 0 }, requireItems: [{ item: 610001, value: 3 }] };
  const a = apostle(1, [start(), yellow(2, 1, 0, 99), normal], '111');
  const b = apostle(2, [start(), yellow(2, 1, 0)], '10');
  const plan = recommendHwangRedistribution(mapFor(a, b), options({ maxReset: 1 }));
  assert.equal(plan.resetCount, 0); assert.equal(plan.after.atk_phys, 0);
  assert.equal(plan.after.crit_res, 6); assert.ok(plan.selected.has('1:0:2'));
});

test('이미 칠한 황크와 공유 경로를 중복 청구하지 않고 차수가 같은 ID도 구분한다', () => {
  const a = apostle(1, [start(), yellow(2, 1, 0), yellow(3, 2, 0)], '110');
  a.boards.push({ unlocked: true, masterNodes: [start(), yellow(2, 1, 0)], stepStr: '10' });
  const plan = recommendHwangRedistribution(mapFor(a), options({ ownedCrayons: 4, priorities: [{ stat: 'atk_phys', target: 18 }] }));
  assert.equal(plan.before.atk_phys, 6); assert.equal(plan.after.atk_phys, 18);
  assert.equal(plan.spend.ultraCrayon, 4); assert.equal(plan.remaining, 0);
});

test('스탯 우선순위가 바뀌면 같은 예산의 배분도 바뀐다', () => {
  const a = apostle(1, [start(), yellow(2, 1, 0), yellow(3, 0, 1, 95)], '100');
  const priorities = [{ stat: 'hp', target: 6 }, { stat: 'atk_phys', target: 6 }];
  const plan = recommendHwangRedistribution(mapFor(a), options({ ownedCrayons: 2, priorities }));
  assert.equal(plan.after.hp, 6); assert.equal(plan.after.atk_phys, 0);
});

test('음수·소수 황크와 중복 스탯 입력을 거부한다', () => {
  const map = mapFor(apostle(1, [start(), yellow(2, 1, 0)], '10'));
  for (const value of [-1, 1.5, NaN, Infinity]) assert.throws(() => recommendHwangRedistribution(map, options({ ownedCrayons: value })), /입력/);
  assert.throws(() => recommendHwangRedistribution(map, options({ priorities: [{ stat: 'hp', target: 1 }, { stat: 'hp', target: 2 }] })), /입력/);
});

test('후속 보드에 시작 칸이 없어도 열린 앞 관문과 연결하고 닫힌 관문은 통과하지 않는다', () => {
  const a = apostle(1, [start(), { id: 2, nodeType: 1, grid: { x: 0, y: 1 } }], '11');
  a.boards.push({ unlocked: true, masterNodes: [
    { id: 1, nodeType: 3, grid: { x: 0, y: 0 }, requireItems: [{ item: 610001, value: 3 }] },
    yellow(2, 0, 1),
  ], stepStr: '00' });
  const plan = recommendHwangRedistribution(mapFor(a), options({ ownedCrayons: 2 }));
  assert.equal(plan.after.atk_phys, 6);
  assert.deepEqual(plan.actions[0].paint.map(entry => [entry.boardIndex, entry.node.id]), [[1, 1], [1, 2]]);
  a.boards[0].stepStr = '10';
  const blocked = recommendHwangRedistribution(mapFor(a), options({ ownedCrayons: 2 }));
  assert.equal(blocked.after.atk_phys, 0);
});

test('다양한 가명 보드에서 일반칸 복구·황크 잔고·환급 합계 불변식을 유지한다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const items = Array.from({ length: 4 }, (_, index) => {
      const nodes = [start()];
      for (let n = 1; n <= 9; n++) nodes.push(n % 3 === 0
        ? { id: n + 1, nodeType: 3, grid: { x: n % 3, y: Math.floor(n / 3) }, requireItems: [{ item: 610001, value: 3 }] }
        : yellow(n + 1, n % 3, Math.floor(n / 3), [88, 95, 99][(n + seed + index) % 3], 2));
      return apostle(index + 1, nodes, '1'.repeat(1 + (seed + index) % 9).padEnd(10, '0'));
    });
    const input = options({ ownedCrayons: seed % 5, maxReset: seed % 4,
      priorities: [{ stat: 'atk_phys', target: 50 }, { stat: 'hp', target: 30 }] });
    const plan = recommendHwangRedistribution(mapFor(...items), input);
    assert.ok(plan.resetCount <= input.maxReset);
    assert.ok(plan.remaining >= 0);
    assert.equal(plan.remaining, input.ownedCrayons + plan.refund.ultraCrayon - plan.spend.ultraCrayon);
    assert.ok(plan.actions.every(action => action.balance >= 0));
    for (const entry of plan.nodes.filter(node => node.picked && node.node.nodeType === 3)) assert.ok(plan.selected.has(entry.key));
    for (const stat of ['atk_phys', 'hp', 'crit_res']) {
      const expected = plan.nodes.filter(node => plan.selected.has(node.key)).reduce((total, node) => total + node.stats[stat], 0);
      assert.equal(plan.after[stat], expected);
    }
  }
});

test('결과 화면은 이름을 이스케이프하고 초기화 순서·부족량·베타 한계를 표시한다', () => {
  const a = apostle(1, [start(), yellow(2, 1, 0)], '10'); a.name = '<img src=x onerror=alert(1)>';
  const input = options({ ownedCrayons: 2 });
  const html = renderRedistributionResult(recommendHwangRedistribution(mapFor(a), input), input);
  assert.doesNotMatch(html, /<img/); assert.match(html, /&lt;img/);
  assert.match(html, /목표 부족/); assert.match(html, /최적해나 최소 초기화 인원은 보장하지/);
  assert.match(html, /칠할 칸 순서/); assert.match(html, /환급 외 준비 재화/);
});
