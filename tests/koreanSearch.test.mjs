import test from 'node:test';
import assert from 'node:assert/strict';
import { makeKoreanSearchRegex, matchesKoreanSearch } from '../src/domain/koreanSearch.ts';

test('한글 초성으로 사도 이름을 검색할 수 있다', () => {
  // 1. 순수 초성 검색
  assert.equal(matchesKoreanSearch('에르핀', 'ㅇㄹㅍ'), true);
  assert.equal(matchesKoreanSearch('엘레나', 'ㅇㄹㅍ'), false);
  assert.equal(matchesKoreanSearch('코미(수영복)', 'ㅋㅁ'), true);
  assert.equal(matchesKoreanSearch('코미(수영복)', 'ㅅㅇㅂ'), true);
  assert.equal(matchesKoreanSearch('에피카', 'ㅇㅍㅋ'), true);
  assert.equal(matchesKoreanSearch('디아나', 'ㄷㅇㄴ'), true);
  assert.equal(matchesKoreanSearch('스피키', 'ㅅㅍㅋ'), true);

  // 2. 부분 초성 일치
  assert.equal(matchesKoreanSearch('에르핀', 'ㅇㄹ'), true);
  assert.equal(matchesKoreanSearch('에르핀', 'ㄹㅍ'), true);
  assert.equal(matchesKoreanSearch('에르핀', 'ㄹ'), true);

  // 3. 완성형 + 초성 혼합 검색
  assert.equal(matchesKoreanSearch('에르핀', '에ㄹ'), true);
  assert.equal(matchesKoreanSearch('코미(수영복)', '코ㅁ'), true);
  assert.equal(matchesKoreanSearch('코미(수영복)', '코미(ㅅㅇ'), true);

  // 4. 일반 완성형 텍스트 및 부분 검색
  assert.equal(matchesKoreanSearch('에르핀', '에르핀'), true);
  assert.equal(matchesKoreanSearch('코미(수영복)', '수영복'), true);
  assert.equal(matchesKoreanSearch('에르핀', '르핀'), true);
  assert.equal(matchesKoreanSearch('에르핀', '아사나'), false);

  // 5. 영문 및 특수문자
  assert.equal(matchesKoreanSearch('Vivi', 'vivi'), true);
  assert.equal(matchesKoreanSearch('Vivi', 'V'), true);
  assert.equal(matchesKoreanSearch('코미(수영복)', '('), true);

  // 6. 빈 검색어
  assert.equal(matchesKoreanSearch('에르핀', ''), true);
  assert.equal(matchesKoreanSearch('에르핀', '   '), true);
});
