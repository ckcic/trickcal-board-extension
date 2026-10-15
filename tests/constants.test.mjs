import assert from 'node:assert/strict';
import test from 'node:test';
import * as constants from '../src/domain/constants.ts';
import * as progress from '../src/domain/boardProgress.ts';

test('보드 상수의 기존 import 경로는 분리 모듈과 같은 값·객체를 제공한다', () => {
  for (const name of ['BASIC_CRAYON_ITEM_ID', 'MID_CRAYON_ITEM_ID', 'BOKR_ITEM_ID', 'HWANG_ITEM_ID',
    'WATERING_CAN_ITEM_ID', 'NODE_TYPE', 'STAT_CATEGORIES', 'STAT_META_LIST', 'PERSONALITY_META_LIST']) {
    assert.strictEqual(progress[name], constants[name], name);
  }
});

test('스탯 타입 조회 테이블은 기존의 27개 코드와 미정의 코드의 분류를 유지한다', () => {
  const categories = [
    ['hp', [1, 94, 95]], ['atk_phys', [3, 86, 88]], ['atk_mag', [4, 87, 89]],
    ['def_phys', [5, 90, 92]], ['def_mag', [6, 91, 93]], ['crit', [7, 96, 97]],
    ['crit_dmg', [8, 100, 101]], ['crit_res', [9, 98, 99]], ['crit_dmg_res', [10, 102, 103]],
  ];
  const expected = new Map(categories.flatMap(([category, codes]) => codes.map(code => [code, category])));
  assert.equal(expected.size, 27);
  for (let code = -1; code <= 104; code++) {
    assert.equal(progress.getStatCategoryFromStatType(code), expected.get(code) ?? null, `statType=${code}`);
  }
  assert.equal(Object.keys(constants.STAT_CATEGORY_BY_TYPE).length, 27);
});

test('조회 테이블은 숫자 문자열·객체·소수·비정상 숫자를 기존처럼 거부한다', () => {
  for (const value of ['1', '100', 'toString', 'constructor', null, undefined, true, 1n,
    NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER, {}, [1], new Number(1)]) {
    assert.equal(progress.getStatCategoryFromStatType(value), null);
  }
});
