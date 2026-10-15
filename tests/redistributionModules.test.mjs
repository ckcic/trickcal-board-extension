import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../src/domain/hwangRedistribution.ts';
import * as model from '../src/domain/redistributionModel.ts';
import * as paths from '../src/domain/redistributionPaths.ts';
import { createExampleRedistributionStages } from '../src/domain/redistributionStages.ts';

test('기존 재분배 공개 경로는 분리 모듈의 같은 함수를 제공한다', () => {
  for (const name of ['getHwangTargetValue', 'getSpentHwangCrayons', 'getSpentBokrCrayons', 'readHwangStats', 'readBokrValues']) {
    assert.strictEqual(api[name], model[name], name);
  }
  for (const name of ['createRedistributionGoalPreview', 'getAttackPathAvailability']) {
    assert.strictEqual(api[name], paths[name], name);
  }
  assert.strictEqual(api.createExampleRedistributionStages, createExampleRedistributionStages);
});

test('예시 단계는 호출마다 새 배열·단계·목표를 제공하여 편집이 다른 모달에 전파되지 않는다', () => {
  const original = createExampleRedistributionStages();
  const edited = api.createExampleRedistributionStages();
  edited[0].allowBlocked = true;
  edited[1].targets[0].target = 1;
  edited[2].targets.push({ stat: 'attack', target: 6 });
  edited.reverse();
  assert.deepEqual(createExampleRedistributionStages(), original);
  assert.equal(original.length, 7);
  assert.equal(original[0].targets[0].target, null);
  assert.equal(original[1].targets[0].target, 500);
});
