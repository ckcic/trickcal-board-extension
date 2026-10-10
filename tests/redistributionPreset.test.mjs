import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRedistributionStage,
  validateRedistributionStages,
  exportRedistributionPreset,
  parseRedistributionPreset,
  PRESET_TYPE,
  PRESET_VERSION,
} from '../src/domain/redistributionPreset.ts';
import { createExampleRedistributionStages } from '../src/domain/hwangRedistribution.ts';

test('단일 단계 유효성 검증 (validateRedistributionStage)', () => {
  // 1. 유효한 황크 단계
  const validHwang = validateRedistributionStage({
    resource: 'hwang',
    allowBlocked: false,
    allowGates: true,
    targets: [
      { stat: 'attack', target: 500 },
      { stat: 'hp', target: null },
    ],
  });
  assert.ok(validHwang);
  assert.equal(validHwang.resource, 'hwang');
  assert.equal(validHwang.allowBlocked, false);
  assert.equal(validHwang.allowGates, true);
  assert.equal(validHwang.targets.length, 2);

  // 2. 유효한 보크 단계
  const validBokr = validateRedistributionStage({
    resource: 'bokr',
    boardThrough: 1,
    allowBlocked: true,
    targets: [
      { stat: 'atk_phys', target: 20 },
      { stat: 'def_mag', target: null },
    ],
  });
  assert.ok(validBokr);
  assert.equal(validBokr.resource, 'bokr');
  assert.equal(validBokr.boardThrough, 1);
  assert.equal(validBokr.allowBlocked, true);

  // 3. 잘못된 스탯 (황크에 atk_phys 직접 지정 등) 거부
  const invalidStatInHwang = validateRedistributionStage({
    resource: 'hwang',
    allowBlocked: false,
    targets: [{ stat: 'atk_phys', target: 100 }],
  });
  assert.equal(invalidStatInHwang, null);

  // 4. 한 단계 내 중복 스탯 거부
  const duplicateStat = validateRedistributionStage({
    allowBlocked: false,
    targets: [
      { stat: 'attack', target: 500 },
      { stat: 'attack', target: 300 },
    ],
  });
  assert.equal(duplicateStat, null);

  // 5. 보크 단계에서 소수점 칸 수 거부
  const floatBokrTarget = validateRedistributionStage({
    resource: 'bokr',
    allowBlocked: false,
    targets: [{ stat: 'atk_phys', target: 15.5 }],
  });
  assert.equal(floatBokrTarget, null);

  // 6. 황크 단계에 보크 차수 필드 지정 시 거부
  const hwangWithBoardThrough = validateRedistributionStage({
    resource: 'hwang',
    boardThrough: 1,
    allowBlocked: false,
    targets: [{ stat: 'attack', target: 500 }],
  });
  assert.equal(hwangWithBoardThrough, null);

  // 7. allowBlocked 누락 거부
  const missingAllowBlocked = validateRedistributionStage({
    targets: [{ stat: 'attack', target: 500 }],
  });
  assert.equal(missingAllowBlocked, null);
});

test('단계 목록 검증 (validateRedistributionStages)', () => {
  // 빈 배열 거부
  assert.equal(validateRedistributionStages([]), null);

  // 30개 초과 거부
  const tooMany = Array.from({ length: 31 }, () => ({
    allowBlocked: false,
    targets: [{ stat: 'attack', target: 100 }],
  }));
  assert.equal(validateRedistributionStages(tooMany), null);

  // 기본 예시 단계(7단계) 통과
  const examples = createExampleRedistributionStages();
  const validated = validateRedistributionStages(examples);
  assert.ok(validated);
  assert.equal(validated.length, 7);
});

test('프리셋 내보내기 및 가져오기 라운드트립 (exportRedistributionPreset & parseRedistributionPreset)', () => {
  const originalStages = [
    { allowBlocked: false, targets: [{ stat: 'attack', target: null }] },
    {
      resource: 'bokr',
      boardThrough: 0,
      allowBlocked: true,
      allowGates: true,
      targets: [{ stat: 'atk_phys', target: 10 }, { stat: 'crit', target: 5 }],
    },
  ];

  const exportedJson = exportRedistributionPreset(originalStages);
  assert.ok(typeof exportedJson === 'string');

  const parsedRaw = JSON.parse(exportedJson);
  assert.equal(parsedRaw.type, PRESET_TYPE);
  assert.equal(parsedRaw.version, PRESET_VERSION);
  assert.ok(Array.isArray(parsedRaw.stages));
  assert.equal(parsedRaw.stages.length, 2);

  // 개인 설정(재화 등)이 포함되지 않음을 검증
  assert.equal(parsedRaw.owned, undefined);
  assert.equal(parsedRaw.reset, undefined);
  assert.equal(parsedRaw.searchMode, undefined);

  // parseRedistributionPreset으로 복원 검증
  const imported = parseRedistributionPreset(exportedJson);
  assert.ok(imported);
  assert.equal(imported.length, 2);
  assert.equal(imported[0].allowBlocked, false);
  assert.equal(imported[0].targets[0].stat, 'attack');
  assert.equal(imported[0].targets[0].target, null);

  assert.equal(imported[1].resource, 'bokr');
  assert.equal(imported[1].boardThrough, 0);
  assert.equal(imported[1].allowGates, true);
  assert.equal(imported[1].targets[0].stat, 'atk_phys');
  assert.equal(imported[1].targets[0].target, 10);
});

test('잘못되거나 조작된 프리셋 JSON 거부 및 알려진 필드만 수용', () => {
  // 1. 유효하지 않은 JSON 문자열
  assert.equal(parseRedistributionPreset('{ invalid json }'), null);
  assert.equal(parseRedistributionPreset(''), null);

  // 2. 미지원 버전 거부
  assert.equal(
    parseRedistributionPreset(JSON.stringify({
      type: PRESET_TYPE,
      version: 999,
      stages: [{ allowBlocked: false, targets: [{ stat: 'attack', target: 100 }] }],
    })),
    null
  );

  // 3. 잘못된 스탯이 섞인 단계 거부
  assert.equal(
    parseRedistributionPreset(JSON.stringify({
      type: PRESET_TYPE,
      version: 1,
      stages: [{ allowBlocked: false, targets: [{ stat: 'invalid_stat', target: 100 }] }],
    })),
    null
  );

  // 4. 불필요한 임의 필드가 포함된 경우 알려진 필드만 추출
  const withExtraProps = JSON.stringify({
    type: PRESET_TYPE,
    version: 1,
    stages: [{
      allowBlocked: false,
      maliciousField: 'ignore_me',
      targets: [{ stat: 'attack', target: 500, extra: 123 }],
    }],
  });
  const parsed = parseRedistributionPreset(withExtraProps);
  assert.ok(parsed);
  assert.equal(parsed[0].maliciousField, undefined);
  assert.equal(parsed[0].targets[0].extra, undefined);
});

test('순수 stages 배열 형태의 입력도 유연하게 파싱', () => {
  const arrayJson = JSON.stringify([
    { allowBlocked: true, targets: [{ stat: 'crit', target: 500 }] },
  ]);
  const parsed = parseRedistributionPreset(arrayJson);
  assert.ok(parsed);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].targets[0].stat, 'crit');
});
