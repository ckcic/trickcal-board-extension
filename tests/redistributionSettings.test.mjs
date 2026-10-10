import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRedistributionSettings, saveRedistributionSettings, parseRedistributionSettings } from '../src/ui/redistributionSettings.ts';

test('재분배 예산과 단계 설정을 저장하고 다시 읽는다', () => {
  const data = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value),
  } });
  try {
    const settings = { owned: 123, bokr: 456, reset: 3, gold: 50000000, wateringCan: 12, clouds: 35, searchMode: 'thorough', stages: [
      { resource: 'bokr', boardThrough: 2, allowBlocked: false, allowGates: true, targets: [{ stat: 'atk_mag', target: null }] },
      { allowBlocked: true, targets: [{ stat: 'attack', target: 600 }] },
    ] };
    saveRedistributionSettings(settings);
    assert.deepEqual(loadRedistributionSettings(), settings);
    saveRedistributionSettings({ ...settings, owned: NaN });
    assert.deepEqual(loadRedistributionSettings(), settings);
    saveRedistributionSettings({ ...settings, gold: -100 });
    assert.deepEqual(loadRedistributionSettings(), settings);
    for (const target of [NaN, Infinity, -Infinity]) {
      saveRedistributionSettings({ ...settings, stages: [{ allowBlocked: false, targets: [{ stat: 'attack', target }] }] });
      assert.deepEqual(loadRedistributionSettings(), settings, '미입력 목표로 기존 설정을 덮어쓰지 않는다');
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('중복 스탯과 모순된 보드 범위 및 소수 보크 목표를 거부한다', () => {
  const base = { owned: 0, bokr: 0, reset: 0, searchMode: 'fast' };
  const bokr = { resource: 'bokr', allowBlocked: false, targets: [{ stat: 'atk_phys', target: 1 }] };
  for (const stage of [
    { ...bokr, targets: [bokr.targets[0], bokr.targets[0]] },
    { ...bokr, boardIndex: 0, boardThrough: 1 },
    { allowBlocked: false, boardThrough: 1, targets: [{ stat: 'attack', target: 6 }] },
    { ...bokr, targets: [{ stat: 'atk_phys', target: 1.5 }] },
  ]) assert.equal(parseRedistributionSettings(JSON.stringify({ ...base, stages: [stage] })), null);
});

test('손상되거나 지원하지 않는 설정은 무시한다', () => {
  for (const raw of [null, '{', '{}', 'null', JSON.stringify({ owned: 0, bokr: 0, reset: 0, searchMode: 'fast', stages: [{ allowBlocked: false, targets: [{ stat: '<script>', target: 1 }] }] })]) {
    assert.equal(parseRedistributionSettings(raw), null);
  }
});

import { renderApostleAvatar, collectApostlePortraits } from '../src/ui/hwangRedistribution.ts';

test('사도 초상화 아바타를 렌더링하고 비-DOM 환경에서 안전하게 동작한다', () => {
  const map = new Map([
    [1001, 'https://cdn.note.trickcal.com/hero/erpin.webp'],
    ['네르', 'https://cdn.note.trickcal.com/hero/ner.webp'],
  ]);

  // ID 매칭
  const erpinHtml = renderApostleAvatar(1001, '에르핀', map);
  assert.match(erpinHtml, /<img class="tcbe-rd-avatar"/);
  assert.match(erpinHtml, /src="https:\/\/cdn\.note\.trickcal\.com\/hero\/erpin\.webp"/);

  // 이름 매칭 (ID가 없을 때 fallback)
  const nerHtml = renderApostleAvatar(9999, '네르', map);
  assert.match(nerHtml, /src="https:\/\/cdn\.note\.trickcal\.com\/hero\/ner\.webp"/);

  // 없는 사도 또는 portraitMap 미제공 시 빈 문자열
  assert.equal(renderApostleAvatar(1234, '미등록사도', map), '');
  assert.equal(renderApostleAvatar(1001, '에르핀'), '');

  // 비-DOM 환경에서 collectApostlePortraits 호출 시 에러 없이 동작
  const collectedEmpty = collectApostlePortraits();
  assert.equal(collectedEmpty.size, 0);

  // progressMap의 icon 속성이 있으면 HeroIcons CDN 주소를 자동 등록
  const progressMap = new Map([
    ['10005', { apostleId: 10005, name: '나이아', icon: 'aB25knSa6i3TS5IK_RJuwJrVNRbe5Vou8' }],
    ['10110', { apostleId: 10110, name: '뮤트', icon: 'aNz9_GNGPaw1abue6UE35UYCDkmJ90Zw0' }],
  ]);
  const collectedIcons = collectApostlePortraits(progressMap);
  assert.equal(collectedIcons.get(10005), 'https://cdn.note.trickcal.com/HeroIcons/aB25knSa6i3TS5IK_RJuwJrVNRbe5Vou8.webp');
  assert.equal(collectedIcons.get('뮤트'), 'https://cdn.note.trickcal.com/HeroIcons/aNz9_GNGPaw1abue6UE35UYCDkmJ90Zw0.webp');
});


