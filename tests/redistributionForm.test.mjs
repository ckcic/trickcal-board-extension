import assert from 'node:assert/strict';
import test from 'node:test';
import { readFormOptions, restoreFormOptions } from '../src/ui/redistribution/redistributionForm.ts';

function setup(values = {}) {
  const fields = new Map(Object.entries({ owned: '10', bokr: '20', reset: '2', 'search-mode': 'thorough',
    gold: '', 'watering-can': '3', clouds: '25', ...values }).map(([name, initial]) => [name, {
      value: initial, get valueAsNumber() { return this.value.trim() ? Number(this.value) : NaN; },
    }]));
  const selectors = { '[data-resource]:checked': { value: 'bokr' }, '[data-board-through]': { value: '1' },
    '[data-blocked]': { checked: false }, '[data-gates]': { checked: true } };
  const target = { querySelector: selector => ({ '[data-stat]': { value: 'hp' }, '[data-mode]': { value: 'all' },
    '[data-value]': { valueAsNumber: 9 } })[selector] ?? null };
  const stage = { querySelector: selector => selectors[selector] ?? null, querySelectorAll: () => [target] };
  const dialog = { querySelector: selector => selector === '[data-targets]' ? { querySelectorAll: () => [stage] }
    : fields.get(selector.slice(6, -1)) ?? null };
  return { dialog, fields };
}

test('폼 읽기는 예산·선택 재화·탐색 방식·누적 보크 전부 단계를 함께 반환한다', () => {
  const { dialog } = setup();
  assert.deepEqual(readFormOptions(dialog), {
    searchMode: 'thorough', ownedCrayons: 10, ownedBokr: 20, maxReset: 2,
    ownedGold: undefined, ownedWateringCan: 3, ownedClouds: 25,
    stages: [{ resource: 'bokr', boardThrough: 1, allowBlocked: false, allowGates: true,
      targets: [{ stat: 'hp', target: null }] }],
  });
});

test('선택 재화는 빈 값·음수·소수를 생략하고 0은 보존한다', () => {
  for (const value of ['', ' ', '-1', '1.5', '잘못된값']) {
    assert.equal(readFormOptions(setup({ gold: value }).dialog).ownedGold, undefined);
  }
  assert.equal(readFormOptions(setup({ gold: '0' }).dialog).ownedGold, 0);
});

test('필수 입력이나 단계 컨테이너 누락·잘못된 탐색 방식은 계산 옵션으로 읽지 않는다', () => {
  for (const name of ['owned', 'bokr', 'reset', 'search-mode']) {
    const { dialog, fields } = setup(); fields.delete(name);
    assert.equal(readFormOptions(dialog), null);
  }
  assert.equal(readFormOptions({ querySelector: () => null }), null);
  assert.equal(readFormOptions(setup({ 'search-mode': '알수없음' }).dialog), null);
});

test('설정 복원은 초기화 상한을 현재 보유 인원에 맞추고 선택 입력 누락에도 안전하다', () => {
  const { dialog, fields } = setup();
  fields.delete('clouds');
  restoreFormOptions(dialog, { owned: 30, bokr: 40, reset: 20, gold: 0, wateringCan: 7,
    clouds: 15, searchMode: 'fast', stages: [] }, 5);
  const options = readFormOptions(dialog);
  assert.equal(options.maxReset, 5);
  assert.equal(options.ownedCrayons, 30);
  assert.equal(options.ownedBokr, 40);
  assert.equal(options.ownedGold, 0);
  assert.equal(options.ownedWateringCan, 7);
  assert.equal(options.ownedClouds, undefined);
  assert.equal(options.searchMode, 'fast');
});
