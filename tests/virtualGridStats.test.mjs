import assert from 'node:assert/strict';
import test from 'node:test';
import { listenForVirtualGridStats, parseVirtualGridStats } from '../src/bridge/virtualGridStats.ts';

const message = (overrides = {}) => ({ type: 'TCBE_GRID_STATS', source: 'tcbe-main-interceptor',
  visible: 2, total: 3, key: '현재선택', ...overrides });

test('가상 목록 통계는 현재 키에 해당하는 안전한 정수만 추출하고 추가 필드는 보관하지 않는다', () => {
  assert.deepEqual(parseVirtualGridStats(message({ extra: '미보관' }), '현재선택'), { visible: 2, total: 3, key: '현재선택' });
  assert.deepEqual(parseVirtualGridStats(message({ visible: 0, total: 0 }), '현재선택'), { visible: 0, total: 0, key: '현재선택' });
  for (const data of [null, undefined, false, '문자열', [], {},
    message({ type: '다른메시지' }), message({ source: '다른출처' }), message({ key: '지난선택' }),
    ...[-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2', null].flatMap(value =>
      [message({ visible: value }), message({ total: value })]), message({ visible: 4 }),
  ]) assert.equal(parseVirtualGridStats(data, '현재선택'), null);
});

test('통계 구독은 윈도우·출처·변경된 선택 키를 검증하고 동일 핸들러를 해제한다', () => {
  let listener;
  const host = { location: { origin: 'https://note.trickcal.com' },
    addEventListener(type, callback) { assert.equal(type, 'message'); listener = callback; },
    removeEventListener(type, callback) { assert.equal(type, 'message'); assert.equal(listener, callback); listener = null; },
  };
  let selectionKey = '현재선택';
  const received = [];
  const stop = listenForVirtualGridStats(() => selectionKey, stats => received.push(stats), host);
  const emit = overrides => listener({ source: host, origin: host.location.origin, data: message(), ...overrides });
  emit({ source: {} }); emit({ origin: 'https://example.invalid' });
  assert.equal(received.length, 0);
  emit();
  selectionKey = '새선택'; emit();
  assert.equal(received.length, 1);
  emit({ data: message({ key: '새선택' }) });
  assert.equal(received.length, 2);
  stop(); assert.equal(listener, null);
});
