import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { findProgressByName } from '../src/domain/apostleLookup.ts';

test('공통 이름 조회는 공백·스킨 접미사·ID를 지원하고 완전 일치하는 별도 사도를 우선한다', () => {
  const base = { apostleId: 1, name: '가명 사도' };
  const variant = { apostleId: 2, name: '가명 사도(여름)' };
  const map = new Map([['가명 사도', base], ['가명사도', base], ['1', base], ['가명 사도(여름)', variant]]);
  assert.equal(findProgressByName(map, ' 가명 사도 '), base);
  assert.equal(findProgressByName(map, '가명사도'), base);
  assert.equal(findProgressByName(map, '가명 사도(겨울)'), base);
  assert.equal(findProgressByName(map, '가명 사도(여름)'), variant);
  assert.equal(findProgressByName(map, '1'), base);
  assert.equal(findProgressByName(map, ''), undefined);
  assert.equal(findProgressByName(map, '미등록'), undefined);
});

test('공통 초상화 수집은 진행도 아이콘을 먼저 확보하고 DOM의 착용 스킨으로 보완한다', async () => {
  const bundled = await build({ entryPoints: ['src/ui/common/apostlePortraits.ts'], bundle: true,
    write: false, format: 'iife', globalName: 'portraits' });
  const skin = 'https://cdn.note.trickcal.com/HeroIcons/test-skin.webp';
  const card = { getAttribute: key => key === 'data-tcbe-apostle-id' ? '1' : '가명',
    querySelector: () => ({ src: skin }) };
  const context = vm.createContext({ document: { querySelectorAll: selector =>
    selector === '[data-tcbe-apostle-id]' ? [card] : [{ alt: '가명(스킨)', src: skin }] } });
  vm.runInContext(bundled.outputFiles[0].text, context);
  const result = context.portraits.collectApostlePortraits(new Map([
    ['가명', { apostleId: 1, name: '가명', icon: 'test-default' }],
    ['다른가명', { apostleId: 2, name: '다른가명', icon: 'test-other' }],
  ]));
  assert.equal(result.get(1), skin);
  assert.equal(result.get('가명'), skin);
  assert.equal(result.get(2), 'https://cdn.note.trickcal.com/HeroIcons/test-other.webp');
  assert.match(context.portraits.renderApostleAvatar(1, '가명', result), /test-skin\.webp/);
});
