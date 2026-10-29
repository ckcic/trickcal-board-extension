import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateApostleRecovery, getBestRecoveryAlternative, getRecoveryNodes, getRecoveryTargets } from '../src/domain/boardRecovery.ts';
import { getRecoveryDisplayAlternatives, renderRecoveryMap } from '../src/ui/recovery/boardRecovery.ts';

const start = () => ({ id: 1, nodeType: 2, grid: { x: 0, y: 0 } });
const normal = (id, x, y) => ({ id, nodeType: 3, grid: { x, y }, requireGold: 10, requireItems: [{ item: 610001, value: 1 }] });
const yellow = (id, x, y, statType = 95, cost = 2) => ({ id, nodeType: 5, grid: { x, y }, stats: [{ statType, statValue: 80 }], requireItems: [{ item: 610004, value: cost }] });
const bokr = (id, x, y, statType = 98) => ({ id, nodeType: 4, grid: { x, y }, stats: [{ statType, statValue: 15 }], requireItems: [{ item: 610003, value: 9 }] });
const apostle = (nodes, stepStr = '1'.repeat(nodes.length)) => ({ apostleId: 7, name: '테스트 사도', isOwned: true, boards: [{ unlocked: true, masterNodes: nodes, stepStr }] });
const pick = (resource = 'hwang', stat = 'hp', boardIndex = 0) => ({ resource, stat, boardIndex });
const best = (result, flowering = false, priority = 'hwang') => getBestRecoveryAlternative(result, priority, flowering);

test('곁가지 일반칸을 보존하지 않고 대상 황크를 회수한다', () => {
  const a = apostle([start(), yellow(2, 1, 0), normal(3, 2, 0)]);
  const result = calculateApostleRecovery(a, [pick()]);
  const plan = best(result);
  assert.equal(plan.net.ultraCrayon, 2);
  assert.equal(plan.paint.length, 0);
  assert.equal(plan.selected.has('0:2'), false);
});

test('미선택 보크로 가는 길목의 대상 황크는 다시 복구한다', () => {
  const result = calculateApostleRecovery(apostle([start(), yellow(2, 1, 0), bokr(3, 2, 0)]), [pick()]);
  const plan = best(result);
  assert.equal(plan.net.ultraCrayon, 0);
  assert.equal(plan.net.epicCrayon, 0);
  assert.deepEqual(plan.repaintedTargets, ['0:1']);
  assert.deepEqual(plan.paint.map(e => e.node.id), [2, 3]);
});

test('일반칸 우회로로 보존 황크를 연결하며 공유 경로를 한번만 칠한다', () => {
  const nodes = [start(), yellow(2, 1, 0), yellow(3, 2, 0, 88), normal(4, 0, 1), normal(5, 1, 1), normal(6, 2, 1), yellow(7, 2, 2, 88)];
  const plan = best(calculateApostleRecovery(apostle(nodes, '1110001'), [pick()]));
  assert.equal(plan.net.ultraCrayon, 2);
  assert.equal(plan.spend.basicCrayon, 3);
  assert.equal(new Set(plan.paint.map(e => e.key)).size, plan.paint.length);
});

function floweringApostle() {
  const petal = { id: 8, nodeType: 7, grid: { x: -1, y: -1 }, requireItems: [{ item: 610005, value: 3 }], nextId: 9 };
  const ext = { ...yellow(9, 1, 1, 99, 6), nodeType: 6, prevId: 8 };
  return apostle([start(), bokr(2, 1, 0), yellow(3, 2, 0, 88), normal(4, 0, 1), normal(5, 2, 1), petal, ext], '1110000');
}

test('만개안은 제거 보크 회수와 황크·물뿌리개 사용을 분리하고 꽃잎을 먼저 연다', () => {
  const result = calculateApostleRecovery(floweringApostle(), [pick('bokr', 'crit_res')]);
  const base = best(result), flower = best(result, true, 'bokr');
  assert.equal(base.net.epicCrayon, 0);
  assert.equal(flower.net.epicCrayon, 9);
  assert.equal(flower.net.ultraCrayon, -6);
  assert.equal(flower.spend.wateringCan, 3);
  assert.ok(flower.paint.findIndex(e => e.node.id === 8) < flower.paint.findIndex(e => e.node.id === 9));
  assert.equal(flower.hwangDelta.crit_res, 8);
  assert.equal(flower.bokrDelta.crit_res, -15);
});

test('열린 꽃잎 비용은 다시 사용하지 않으며 초기화 환급에도 포함하지 않는다', () => {
  const a = floweringApostle(); a.boards[0].stepStr = '1110010';
  const result = calculateApostleRecovery(a, [pick('bokr', 'crit_res')]);
  const plan = best(result, false, 'bokr');
  assert.equal(plan.net.epicCrayon, 9);
  assert.equal(plan.spend.wateringCan, 0);
  assert.equal(plan.refund.wateringCan, 0);
});

test('만개로 우회해도 미선택 보크는 자동으로 제거하지 않는다', () => {
  const a = floweringApostle();
  a.boards[0].masterNodes.push(yellow(10, 0, 2)); a.boards[0].stepStr += '1';
  const result = calculateApostleRecovery(a, [pick()]);
  for (const plan of result.alternatives) assert.equal(plan.selected.has('0:1'), true);
});

test('새 보크 없이 연결할 수 없을 때만 새 보크 대안을 허용한다', () => {
  const a = apostle([start(), bokr(2, 1, 0), yellow(3, 2, 0, 88), yellow(4, 0, 1)], '1011');
  const plan = best(calculateApostleRecovery(a, [pick()]));
  assert.equal(plan.usedNewBokr, true);
  assert.equal(plan.net.epicCrayon, -9);
});

test('새 보크 우회보다 기존 대상 황크 재복구를 우선한다', () => {
  const a = apostle([start(), yellow(2, 1, 0), yellow(3, 2, 0, 88), normal(4, 0, 1), bokr(5, 1, 1), normal(6, 2, 1)], '111000');
  const plan = best(calculateApostleRecovery(a, [pick()]));
  assert.equal(plan.usedNewBokr, false);
  assert.equal(plan.net.ultraCrayon, 0);
});

test('미해금 보드는 대상·환급에 포함하지 않는다', () => {
  const a = apostle([start(), yellow(2, 1, 0)]);
  a.boards.push({ unlocked: false, masterNodes: [yellow(7, 0, 0)], stepStr: '1' });
  const result = calculateApostleRecovery(a, [pick(), pick('hwang', 'hp', 1)]);
  assert.equal(result.targets.size, 1);
  assert.equal(best(result).refund.ultraCrayon, 2);
});

test('보존 대상 연결이 끊기면 환급 추천 대신 오류 상태를 반환한다', () => {
  const result = calculateApostleRecovery(apostle([start(), yellow(2, 1, 0), yellow(3, 5, 5, 88)]), [pick()]);
  assert.equal(result.alternatives.length, 0);
  assert.ok(result.error);
});

test('상위 관문이 열려 있어도 1차 연결 비용을 포함한다', () => {
  const a = apostle([start(), yellow(2, 1, 0), { id: 3, nodeType: 1, grid: { x: 2, y: 0 } }]);
  a.boards.push({ unlocked: true, masterNodes: [{ id: 4, nodeType: 2, grid: { x: 2, y: 0 } }, yellow(5, 3, 0, 88)], stepStr: '11' });
  const plan = best(calculateApostleRecovery(a, [pick()]));
  assert.equal(plan.net.ultraCrayon, 0);
  assert.equal(plan.repaintedTargets.length, 1);
});

test('제거 조건은 같은 스탯의 보크와 황크를 구분하고 여러 조건 중복을 합산하지 않는다', () => {
  const a = apostle([start(), yellow(2, 1, 0, 99), bokr(3, 0, 1)]);
  const nodes = getRecoveryNodes(a);
  assert.equal(getRecoveryTargets(nodes, [pick('hwang', 'crit_res'), pick('hwang', 'crit_res')]).size, 1);
  assert.equal(getRecoveryTargets(nodes, [pick('hwang', 'crit_res'), pick('bokr', 'crit_res')]).size, 2);
});

test('소형 연결망의 모든 부분집합 정확해와 회수량을 비교한다', () => {
  const nodes = [start(), yellow(2, 1, 0), yellow(3, 2, 0, 88), normal(4, 0, 1), normal(5, 1, 1), normal(6, 2, 1)];
  const a = apostle(nodes, '111000');
  let minimum = Infinity;
  for (let mask = 0; mask < (1 << nodes.length); mask++) {
    if (!(mask & 1) || !(mask & 4)) continue;
    const reached = new Set([0]);
    for (let changed = true; changed;) {
      changed = false;
      nodes.forEach((node, index) => {
        if (!(mask & (1 << index)) || reached.has(index)) return;
        if ([...reached].some(other => Math.abs(nodes[other].grid.x - node.grid.x) + Math.abs(nodes[other].grid.y - node.grid.y) === 1)) { reached.add(index); changed = true; }
      });
    }
    if (!reached.has(2)) continue;
    const cost = [...reached].reduce((sum, index) => sum + (nodes[index].requireItems || []).filter(i => i.item === 610004).reduce((s, i) => s + i.value, 0), 0);
    minimum = Math.min(minimum, cost);
  }
  assert.equal(best(calculateApostleRecovery(a, [pick()])).spend.ultraCrayon, minimum);
});

test('여러 보존 황크가 만개 경로를 공유해도 꽃잎·확장 황크는 한 번만 사용한다', () => {
  const a = floweringApostle();
  a.boards[0].masterNodes.push(yellow(10, 2, 2, 88)); a.boards[0].stepStr += '1';
  const result = calculateApostleRecovery(a, [pick('bokr', 'crit_res')]);
  const plan = best(result, true, 'bokr');
  assert.equal(plan.spend.wateringCan, 3);
  assert.equal(plan.paint.filter(e => e.node.id === 9).length, 1);
  assert.equal(plan.spend.ultraCrayon, 10);
});

test('지도는 전체 칸·미해금 보드·작업 순서·선택 보크 제거를 구분한다', () => {
  const a = floweringApostle();
  a.boards.push({ unlocked: false, masterNodes: [yellow(77, 0, 0)], stepStr: '1' });
  const result = calculateApostleRecovery(a, [pick('bokr', 'crit_res')]);
  const html = renderRecoveryMap(result, best(result, true, 'bokr'));
  assert.equal((html.match(/data-tile=/g) || []).length, 7);
  assert.ok(html.includes('tcbe-rc-remove'));
  assert.ok(html.includes('tcbe-rc-locked'));
  assert.ok(html.includes('작업'));
  assert.ok(html.includes('2차 · 미해금'));
  assert.ok(!html.includes('tcbe-rc-flower-mark'));
  assert.ok(html.includes('tcbe-map-flower-frame'));
  assert.ok(html.includes('tcbe-rd-state-mark'));
  assert.ok(html.includes('만개 확장 황크'));
});

test('정렬 기준과 무관하게 황크를 더 쓰는 보크 회수 만개 대안을 노출한다', () => {
  const result = calculateApostleRecovery(floweringApostle(), [pick('bokr', 'crit_res')]);
  const plans = getRecoveryDisplayAlternatives(result);
  assert.equal(plans.length, 2);
  assert.equal(plans[0].flowering, false);
  assert.equal(plans[1].net.epicCrayon, 9);
  assert.equal(plans[1].net.ultraCrayon, -6);
  assert.equal(plans[1].priority, 'bokr');
});

test('제거할 방어력 황크를 새 만개로 찍어 보크만 아끼는 대안은 제외한다', () => {
  const a = floweringApostle();
  a.boards[0].masterNodes[6].stats = [{ statType: 93, statValue: 80 }];
  const result = calculateApostleRecovery(a, [pick('bokr', 'crit_res'), pick('hwang', 'def_mag')]);
  assert.ok(result.alternatives.length > 0);
  for (const plan of result.alternatives) {
    assert.equal(plan.selected.has('0:6'), false);
    assert.equal(plan.spend.wateringCan, 0);
    assert.equal(plan.hwangDelta.def_mag, 0);
  }
});

test('보크 회수를 늘리기 위해 새 일반 황크로 우회하지 않는다', () => {
  const a = apostle([start(), bokr(2, 1, 0), yellow(3, 2, 0, 88), normal(4, 0, 1), yellow(5, 1, 1, 93), normal(6, 2, 1)], '111000');
  const result = calculateApostleRecovery(a, [pick('bokr', 'crit_res')]);
  for (const plan of result.alternatives) {
    assert.equal(plan.selected.has('0:4'), false);
    assert.equal(plan.selected.has('0:1'), true);
    assert.equal(plan.net.ultraCrayon, 0);
  }
});

test('제거 대상이 아닌 유효 만개 우회는 계속 비교한다', () => {
  const result = calculateApostleRecovery(floweringApostle(), [pick('bokr', 'crit_res'), pick('hwang', 'def_mag')]);
  const plan = best(result, true, 'bokr');
  assert.equal(plan.net.epicCrayon, 9);
  assert.equal(plan.selected.has('0:6'), true);
});

test('만개 허용 여부나 탐색 우선순위만 다르고 색칠 계획이 같으면 중복 카드를 합친다', () => {
  const result = calculateApostleRecovery(apostle([start(), yellow(2, 1, 0)]), [pick()]);
  assert.equal(result.alternatives.length, 4);
  assert.equal(getRecoveryDisplayAlternatives(result).length, 1);
});


test('사전 계산된 노드(precomputedNodes) 전달 시 동일 결과를 반환하고 닫힌 꽃잎이 없으면 만개안도 동일 계획을 생성한다', () => {
  const a = floweringApostle();
  const selections = [pick('bokr', 'crit_res')];
  const precomputed = getRecoveryNodes(a);
  const direct = calculateApostleRecovery(a, selections, true);
  const cached = calculateApostleRecovery(a, selections, true, precomputed);
  assert.deepEqual(cached, direct);

  // 닫힌 꽃잎이 없는 사도에서 compareFlowering=true 시 기본안과 만개안이 동일한 색칠 경로를 갖는지 검증
  const noClosedPetal = apostle([start(), yellow(2, 1, 0), bokr(3, 2, 0)]);
  const noPetalResult = calculateApostleRecovery(noClosedPetal, [pick()], true, getRecoveryNodes(noClosedPetal));
  const basePlan = best(noPetalResult, false, 'hwang');
  const flowerPlan = best(noPetalResult, true, 'hwang');
  assert.equal(flowerPlan.flowering, true);
  assert.deepEqual(flowerPlan.paint, basePlan.paint);
  assert.deepEqual(flowerPlan.net, basePlan.net);
});
