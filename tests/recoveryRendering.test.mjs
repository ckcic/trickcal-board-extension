import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateApostleRecovery } from '../src/domain/boardRecovery.ts';
import { createEmptyCostSummary } from '../src/domain/boardProgress.ts';
import { renderRecoveryTemplate } from '../src/ui/recovery/recoveryTemplate.ts';
import { getRecoveryDisplayAlternatives, renderRecoveryResults } from '../src/ui/recovery/recoveryResult.ts';

const yellow = (id, x, type) => ({ id, nodeType: 5, grid: { x, y: 0 },
  stats: [{ statType: type, statValue: 80 }], requireItems: [{ item: 610004, value: 2 }] });
const apostle = { apostleId: 7, name: '<가명사도>', isOwned: true,
  boards: [{ unlocked: true, stepStr: '111', masterNodes: [
    { id: 1, nodeType: 2, grid: { x: 0, y: 0 } }, yellow(2, 1, 95), yellow(3, 2, 88),
  ] }] };
const view = (allOrdered = []) => ({ allOrdered, limit: allOrdered.length, priority: 'bokr',
  searchQuery: '"><script>', onlyPositive: true,
  portraits: new Map([[7, 'https://cdn.note.trickcal.com/HeroIcons/test.webp']]),
  planFor: result => getRecoveryDisplayAlternatives(result)[0],
  net: createEmptyCostSummary(), extra: createEmptyCostSummary() });

test('회수 설정 렌더링은 차수별 체크·황크 공격력 통합·만개 옵션과 저장값을 유지한다', () => {
  const settings = { picks: ['hwang:0:atk_phys', 'bokr:2:crit_res'], compareFlowering: true };
  const snapshot = structuredClone(settings);
  const html = renderRecoveryTemplate(settings);
  assert.equal((html.match(/data-pick=/g) || []).length, 51);
  assert.match(html, /data-pick="hwang:0:atk_phys" checked/);
  assert.match(html, /data-pick="bokr:2:crit_res" checked/);
  assert.ok(!html.includes('data-pick="hwang:0:atk_mag"'));
  assert.match(html, /data-grid="bokr" hidden/);
  assert.match(html, /data-flowering checked/);
  assert.match(html, /data-all="hwang:2"/);
  assert.match(html, /data-clear="bokr"/);
  assert.deepEqual(settings, snapshot);
});

test('회수 결과는 선택 경로·누적 도구·지도 슬롯·복구 순서를 표시하고 이름과 검색을 이스케이프한다', () => {
  const result = calculateApostleRecovery(apostle, [{ resource: 'hwang', stat: 'hp', boardIndex: 0 }]);
  const html = renderRecoveryResults(view([result]));
  assert.match(html, /value="bokr" selected/);
  assert.match(html, /data-limit min="0" max="1" value="1"/);
  assert.match(html, /상위 1명 작업 순서 복사/);
  assert.match(html, /data-alternative="7"/);
  assert.match(html, /data-apostle-name="&lt;가명사도&gt;"/);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /HeroIcons\/test\.webp/);
  assert.match(html, /data-map/);
  assert.match(html, /data-copy-apostle="7"/);
  assert.match(html, /1차 #2 복구/);
  assert.match(html, /1차 #3 복구/);
});

test('회수 결과는 대상 없음과 사도별 계산 오류를 구분하여 표시한다', () => {
  assert.match(renderRecoveryResults(view()), /현재 칠한 제거 대상이 없습니다/);
  const result = { apostle, nodes: [], targets: new Set(), alternatives: [], error: '<오류 안내>' };
  const html = renderRecoveryResults(view([result]));
  assert.match(html, /계산 확인 필요/);
  assert.match(html, /&lt;오류 안내&gt;/);
  assert.ok(!html.includes('<오류 안내>'));
  assert.ok(!html.includes('data-alternative="7"'));
});
