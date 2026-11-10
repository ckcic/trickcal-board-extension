import test from 'node:test';
import assert from 'node:assert/strict';
import { takeOverApostleSearch } from '../src/ui/board/integratedSearch.ts';

class SearchInput {
  constructor(value = '') { this._value = value; this.attrs = new Map(); this.events = []; this.handler = () => {}; }
  get value() { return this._value; }
  set value(value) { this._value = value; }
  setAttribute(key, value) { this.attrs.set(key, value); }
  cloneNode() { const clone = new SearchInput(this.value); clone.attrs = new Map(this.attrs); return clone; }
  dispatchEvent(event) { this.events.push(event); this.handler(this.value); }
  replaceWith(next) { this.replacedBy = next; }
}

test('통합 검색은 원본 필터를 비우고 독립 입력으로 초성·혼합 검색을 전달하며 원본을 복원한다', () => {
  const previous = globalThis.HTMLInputElement;
  globalThis.HTMLInputElement = SearchInput;
  try {
    let nativeQuery = '가명';
    const original = new SearchInput(nativeQuery);
    original.setAttribute('placeholder', '사도 이름 검색');
    original.handler = value => { nativeQuery = value; };
    const { input, restore } = takeOverApostleSearch(original);
    assert.equal(nativeQuery, '');
    assert.equal(original.events.length, 1);
    assert.equal(original.events[0].bubbles, true);
    assert.equal(input.value, '가명');
    assert.equal(input.attrs.get('placeholder'), '사도 이름 검색');
    assert.equal(input.attrs.has('data-tcbe-search'), true);
    assert.equal(original.replacedBy, input);
    for (const query of ['ㄱㅁ', '가ㅁ', '없는사도', '']) {
      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      assert.equal(nativeQuery, '');
    }
    restore();
    assert.equal(input.replacedBy, original);
    assert.equal(original.value, '');
  } finally {
    if (previous === undefined) delete globalThis.HTMLInputElement;
    else globalThis.HTMLInputElement = previous;
  }
});
