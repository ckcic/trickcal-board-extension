import assert from 'node:assert/strict';
import test from 'node:test';
import { getHwangStatLimits, getRedistributionStatUnit, roundRedistributionTarget } from '../src/domain/hwangStatLimits.ts';
import { renderHwangStatLimits, renderRedistributionStageEditor } from '../src/ui/redistributionStageEditor.ts';

const attack = { id: 1, nodeType: 5, stats: [{ statType: 88, statValue: 60 }, { statType: 89, statValue: 60 }] };
const hp = { id: 142, nodeType: 6, prevId: 41, requireItems: [{ item: 610004, value: 2 }], stats: [{ statType: 95, statValue: 80 }] };
const petal = { id: 141, nodeType: 7, nextId: 42 };

test('공격력은 물공·마공을 합쳐 한 칸으로 세고 별칭·미보유 사도는 중복하지 않는다', () => {
  const a = { apostleId: 1, isOwned: true, boards: [{ unlocked: true, masterNodes: [attack] }] };
  const other = { ...a, apostleId: 2, isOwned: false };
  const limits = getHwangStatLimits(new Map([['1', a], ['별칭', a], ['2', other]]));
  for (const stat of ['attack', 'atk_phys', 'atk_mag']) assert.deepEqual(limits[stat], { byBoard: [1, 0, 0], total: 1, unlocked: 1 });
  assert.equal(limits.hp.total, 0);
});

test('전체 최대는 잠긴 보드·꽃잎을 포함하고 현재 해금 범위는 각각 제외한다', () => {
  const a = { apostleId: 1, boards: [
    { unlocked: true, masterNodes: [petal, hp], stepStr: '00' },
    { unlocked: false, masterNodes: [attack], stepStr: '1' },
    { unlocked: true, masterNodes: [petal, hp], stepStr: '10' },
  ] };
  const limits = getHwangStatLimits(new Map([['1', a]]));
  assert.deepEqual(limits.hp, { byBoard: [1, 0, 1], total: 2, unlocked: 1 });
  assert.deepEqual(limits.attack, { byBoard: [0, 1, 0], total: 1, unlocked: 0 });
  const html = renderHwangStatLimits(limits);
  assert.match(html, /스탯별 최대 황크 칸 수/); assert.match(html, /현재 해금 범위/);
  assert.match(html, /공격력 \(물공·마공\)<\/th><td>0칸<\/td><td>1칸/);
});

test('목표 입력은 공격력 6·나머지 8 단위로 증감하고 예시 수치를 도달 가능한 값으로 올림한다', () => {
  assert.equal(getRedistributionStatUnit('attack'), 6); assert.equal(getRedistributionStatUnit('hp'), 8);
  for (const [value, rounded] of [[500, 504], [1500, 1504], [700, 704], [900, 904], [2000, 2000]]) assert.equal(roundRedistributionTarget(value, 'hp'), rounded);
  assert.equal(roundRedistributionTarget(7, 'attack'), 12); assert.equal(roundRedistributionTarget(0, 'hp'), 0);
  assert.ok(Number.isNaN(roundRedistributionTarget(NaN, 'hp')));
  const html = renderRedistributionStageEditor([{ allowBlocked: false, targets: [{ stat: 'attack', target: 500 }, { stat: 'hp', target: 1500 }] }]);
  assert.match(html, /step="6" value="504"/); assert.match(html, /step="8" value="1504"/);
});
