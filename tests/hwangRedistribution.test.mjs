import assert from 'node:assert/strict';
import test from 'node:test';
import { getSpentHwangCrayons, recommendHwangRedistribution, readHwangStats } from '../src/domain/hwangRedistribution.ts';
import { renderRedistributionResult, renderRedistributionCost } from '../src/ui/hwangRedistribution.ts';

const start = () => ({ id: 1, nodeType: 2, grid: { x: 0, y: 0 } });
const yellow = (id, x, y, statType = 88, cost = 2) => ({ id, nodeType: 5, grid: { x, y }, requireItems: [{ item: 610004, value: cost }], stats: [{ statType, statValue: 60 }] });
const apostle = (id, nodes, step = '') => ({ apostleId: id, name: `가상사도${id}`, isOwned: true, boards: [{ unlocked: true, masterNodes: nodes, stepStr: step }] });
const options = (overrides = {}) => ({ ownedCrayons: 0, maxReset: 0, priorities: [{ stat: 'atk_phys', target: 6 }], ...overrides });
const mapFor = (...items) => new Map(items.flatMap(item => [[String(item.apostleId), item], [item.name, item]]));

for (const shortcutType of [4, 5]) test(`열린 2차 관문도 3차까지 연결하며 ${shortcutType === 4 ? '보크' : '황크'} 대신 일반칸으로 우회한다`, () => {
  const normal = (id, x, y) => ({ id, nodeType: 3, grid: { x, y }, requireGold: 10, requireItems: [{ item: 610001, value: 3 }] });
  const gate = (id, y) => ({ id, nodeType: 1, grid: { x: 0, y } });
  const shortcut = shortcutType === 5 ? yellow(2, 0, 1, 99) : { id: 2, nodeType: 4, grid: { x: 0, y: 1 }, requireItems: [{ item: 610003, value: 6 }] };
  const a = { apostleId: 1, name: '연결 테스트', isOwned: true, boards: [
    { unlocked: true, masterNodes: [start(), gate(2, 1)], stepStr: '11' },
    { unlocked: true, masterNodes: [normal(1, 0, 0), shortcut, normal(3, 1, 0), normal(4, 1, 1), normal(5, 1, 2), gate(6, 2)], stepStr: '100001' },
    { unlocked: true, masterNodes: [yellow(1, 0, 0)], stepStr: '0' },
  ] };
  const plan = recommendHwangRedistribution(mapFor(a), options({ ownedCrayons: 2, ownedBokr: 100 }));
  assert.deepEqual(plan.actions[0].paint.map(entry => [entry.boardIndex, entry.node.id]), [[1, 3], [1, 4], [1, 5], [2, 1]]);
  assert.equal(plan.spend.ultraCrayon, 2); assert.equal(plan.spend.epicCrayon, 0);
  assert.equal(plan.spend.basicCrayon, 9); assert.equal(plan.spend.gold, 30);
  assert.equal(plan.after.atk_phys, 6);
  const html = renderRedistributionResult(plan, options());
  for (const id of [3, 4, 5]) assert.match(html, new RegExp(`data-node="${id}"[^>]*title="[^"]*새로 칠함`));
});

test('연결 경로의 황크를 감당하지 못하면 열린 관문으로 건너뛰어 3차를 추천하지 않는다', () => {
  const a = { apostleId: 1, name: '예산 테스트', isOwned: true, boards: [
    { unlocked: true, masterNodes: [start(), { id: 2, nodeType: 1, grid: { x: 0, y: 1 } }], stepStr: '11' },
    { unlocked: true, masterNodes: [yellow(1, 0, 0, 99), { id: 2, nodeType: 1, grid: { x: 0, y: 1 } }], stepStr: '01' },
    { unlocked: true, masterNodes: [yellow(1, 0, 0)], stepStr: '0' },
  ] };
  const plan = recommendHwangRedistribution(mapFor(a), options({ ownedCrayons: 2 }));
  assert.equal(plan.after.atk_phys, 0); assert.equal(plan.spend.ultraCrayon, 0); assert.equal(plan.actions.length, 0);
});

test('공격력 목표는 한 칸의 물공·마공 각각 6%를 한 번만 평가하고 비용도 한 번만 청구한다', () => {
  const attack = yellow(2, 1, 0);
  attack.stats.push({ statType: 89, statValue: 60 });
  const a = apostle(1, [start(), attack], '10');
  const input = options({ ownedCrayons: 2, priorities: [{ stat: 'attack', target: 12 }] });
  const plan = recommendHwangRedistribution(mapFor(a), input);
  assert.equal(plan.after.atk_phys, 6);
  assert.equal(plan.after.atk_mag, 6);
  assert.equal(plan.spend.ultraCrayon, 2);
  assert.equal(plan.actions[0].paint.length, 1);
  const html = renderRedistributionResult(plan, input);
  assert.match(html, /공격력 12%/); assert.match(html, /공격력 0%/); assert.match(html, /공격력 6%/);
  assert.match(html, /공격력 \+6% \(물공·마공 각각\)/);
  assert.match(html, /1칸 부족/);
  assert.doesNotMatch(html, /<th>물공|<th>마공/);
});

test('초기화는 열린 관문·꽃잎·기본 시작 칸을 유지하고 크레파스와 골드만 환급한다', () => {
  const initial = { ...start(), requireGold: 999, requireItems: [{ item: 610001, value: 999 }] };
  const normal = { id: 2, nodeType: 3, grid: { x: 1, y: 0 }, requireGold: 10, requireItems: [{ item: 610001, value: 3 }] };
  const unused = yellow(3, 2, 0, 99);
  unused.requireItems.push({ item: 610005, value: 7 });
  const gate = { id: 4, nodeType: 1, grid: { x: 0, y: 1 }, requireGold: 1000000 };
  const petal = { id: 141, nodeType: 7, nextId: 42, requireGold: 500000, requireItems: [{ item: 610005, value: 1 }] };
  // 시작 칸의 기록이 0이어도 원래 색칠된 무료 시작점이다.
  const a = apostle(1, [initial, normal, unused, gate, petal], '01111');
  const b = apostle(2, [start(), yellow(2, 1, 0)], '00');
  const input = options({ maxReset: 1 });
  const plan = recommendHwangRedistribution(mapFor(a, b), input);
  assert.equal(plan.resetCount, 1);
  for (const key of ['1:0:0', '1:0:3', '1:0:4']) assert.ok(plan.selected.has(key));
  assert.equal(plan.nodes[0].picked, true);
  assert.equal(plan.refund.ultraCrayon, 2);
  assert.equal(plan.refund.basicCrayon, 3);
  assert.equal(plan.refund.gold, 10);
  assert.equal(plan.refund.wateringCan, 0);
  assert.equal(plan.actions.find(action => action.reset).refund.wateringCan, 0);
  assert.ok(plan.actions.every(action => action.paint.every(entry => ![1, 2, 7].includes(entry.node.nodeType))));
  const html = renderRedistributionResult(plan, input);
  assert.match(html, /#1 시작 칸 · 유지/);
  assert.doesNotMatch(html, /#1 시작 칸 · 새로 칠함/);
});

test('추천 지도는 보크 모달 스프라이트와 열린 꽃잎을 사용하고 변경 상태를 구분한다', () => {
  const petal = { id: 141, nodeType: 7, nextId: 42 };
  const ext = { ...yellow(142, 1, 0), nodeType: 6, prevId: 41 };
  ext.stats.push({ statType: 89, statValue: 60 });
  const a = apostle(1, [start(), petal, ext, yellow(143, 2, 0, 99)], '1100');
  const input = options({ ownedCrayons: 2 });
  const html = renderRedistributionResult(recommendHwangRedistribution(mapFor(a), input), input);
  assert.match(html, /tcbe-rd-add tcbe-map-flower tcbe-map-flower-open/);
  assert.match(html, /물마공 황크 · 꽃잎 열림 · 새로 칠함/);
  assert.match(html, /tcbe-map-flower-frame/);
  assert.match(html, /background-position:100% 0/);
  assert.match(html, /tcbe-rd-empty/);
  assert.match(html, /tcbe-map-hwang-inactive/);
  assert.match(html, /repeat\(7,32px\)/);
  assert.doesNotMatch(html, /data-node="141"/);
  assert.equal(a.boards[0].stepStr, '1100');
});

test('반환 재화는 크레파스 4종·물뿌리개·골드 아이콘을 수량과 대응하고 0은 생략한다', () => {
  const cost = { ultraCrayon: 2, epicCrayon: 3, averageCrayon: 4, basicCrayon: 5, wateringCan: 1, gold: 123456 };
  const html = renderRedistributionCost(cost);
  for (const icon of ['pastel-ultra', 'pastel-epic', 'pastel-average', 'pastel-basic', 'watering-can', 'icon-gold']) {
    assert.match(html, new RegExp(`tcbe-rd-resource-icon ${icon}`));
  }
  assert.match(html, /황크 2개/);
  assert.match(html, /골드 123,456/);
  assert.match(html, /title="황크"/);
  assert.match(html, /<span>2개<\/span>/);
  assert.match(html, /<span>123,456<\/span>/);
  assert.doesNotMatch(html, /<span>황크|<span>골드|<span>하급 크레파스/);
  assert.equal(renderRedistributionCost({ ultraCrayon: 0, epicCrayon: 0, averageCrayon: 0, basicCrayon: 0, gold: 0 }), '없음');
});

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

test('미개방 꽃잎은 물뿌리개로 먼저 열고 열린 꽃잎은 중복 청구하거나 환급하지 않는다', () => {
  const petal = { id: 141, nodeType: 7, grid: { x: -1, y: -1 }, nextId: 42, requireItems: [{ item: 610005, value: 2 }] };
  const ext = { ...yellow(142, 1, 0), nodeType: 6, prevId: 41 };
  const a = apostle(1, [start(), petal, ext], '100');
  let plan = recommendHwangRedistribution(mapFor(a), options({ ownedCrayons: 2 }));
  assert.equal(plan.after.atk_phys, 6); assert.equal(plan.spend.wateringCan, 2);
  assert.deepEqual(plan.actions[0].paint.map(entry => entry.node.id), [141, 142]);
  assert.match(renderRedistributionResult(plan, options()), /꽃잎 개방/);
  a.boards[0].stepStr = '110';
  plan = recommendHwangRedistribution(mapFor(a), options({ ownedCrayons: 2 }));
  assert.equal(plan.after.atk_phys, 6); assert.equal(plan.spend.wateringCan, 0);
  assert.equal(plan.refund.wateringCan, 0);
});

test('황크를 재분배하면서 일반칸을 복구하고 불필요한 보크는 환급분으로 남긴다', () => {
  const normal = { id: 2, nodeType: 3, grid: { x: 1, y: 0 }, requireGold: 10, requireItems: [{ item: 610001, value: 3 }] };
  const bokr = { id: 3, nodeType: 4, grid: { x: 2, y: 0 }, requireItems: [{ item: 610003, value: 4 }] };
  const gate = { id: 5, nodeType: 1, grid: { x: 0, y: 1 }, requireGold: 50 };
  const a = apostle(1, [start(), normal, bokr, yellow(4, 3, 0, 99), gate], '11111');
  const b = apostle(2, [start(), yellow(2, 1, 0)], '10');
  const plan = recommendHwangRedistribution(mapFor(a, b), options({ maxReset: 1, restoreNormal: true }));
  assert.equal(plan.resetCount, 1); assert.equal(plan.after.atk_phys, 6); assert.equal(plan.after.crit_res, 0);
  assert.equal(plan.refund.ultraCrayon, 2); assert.equal(plan.refund.basicCrayon, 3);
  assert.equal(plan.refund.epicCrayon, 4); assert.equal(plan.refund.gold, 10);
  assert.equal(plan.spend.basicCrayon, 3); assert.equal(plan.spend.epicCrayon, 0); assert.equal(plan.remainingBokr, 4);
  assert.ok(plan.selected.has('1:0:1')); assert.ok(!plan.selected.has('1:0:2')); assert.ok(plan.selected.has('1:0:4'));
  assert.equal(plan.remaining, 0); assert.ok(plan.actions.every(action => action.balance >= 0));
  assert.deepEqual(plan.actions.find(action => action.apostle.apostleId === 1).paint.map(entry => entry.node.id), [2]);
});

test('일반칸 복구에 필수인 황크는 지우지 않고 더 나쁘거나 동점인 초기화안은 채택하지 않는다', () => {
  const normal = { id: 3, nodeType: 3, grid: { x: 2, y: 0 }, requireItems: [{ item: 610001, value: 3 }] };
  const a = apostle(1, [start(), yellow(2, 1, 0, 99), normal], '111');
  const b = apostle(2, [start(), yellow(2, 1, 0)], '10');
  const plan = recommendHwangRedistribution(mapFor(a, b), options({ maxReset: 1, restoreNormal: true }));
  assert.equal(plan.resetCount, 0); assert.equal(plan.after.atk_phys, 0);
  assert.equal(plan.after.crit_res, 6); assert.ok(plan.selected.has('1:0:2'));
});

test('이미 칠한 황크와 공유 경로를 중복 청구하지 않고 차수가 같은 ID도 구분한다', () => {
  const a = apostle(1, [start(), yellow(2, 1, 0), yellow(3, 2, 0)], '110');
  a.boards[0].masterNodes.push({ id: 4, nodeType: 1, grid: { x: 0, y: 1 } });
  a.boards[0].stepStr += '1';
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
      priorities: [{ stat: 'atk_phys', target: 50 }, { stat: 'hp', target: 30 }], restoreNormal: true });
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
  assert.match(html, /data-copy-orders/);
  assert.match(html, /클린 슬레이트 최적화/);
  assert.match(html, /칠할 칸 순서/); assert.match(html, /환급 외 준비 재화/);
});
