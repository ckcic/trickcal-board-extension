import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBokrBoard, renderBokrPathCost } from '../src/ui/bokrModal.ts';
import { findApostlePathToBokr, getApostleBoardLayout } from '../src/domain/boardPathfinder.ts';

const progress = { boards: [
  { masterNodes: [
    { id: 1, nodeType: 2, grid: { x: 1, y: 1 } },
    { id: 2, nodeType: 1, grid: { x: 1, y: 2 } },
  ], stepStr: '11' },
  { masterNodes: [
    { id: 1, nodeType: 3, grid: { x: 1, y: 1 }, displayStat: [1, 0] },
    { id: 2, nodeType: 4, grid: { x: 1, y: 2 }, stats: [{ statType: 1, statValue: 199 }] },
    { id: 3, nodeType: 0, grid: { x: 5, y: 5 } },
    { id: 4, nodeType: 7, grid: { x: -1, y: -1 } },
  ], stepStr: '' },
] };

test('위치 보드는 좌표와 차수로 선택 칸을 하나만 표시하고 빈칸과 숨긴 꽃잎을 제외한다', () => {
  const targetNode = progress.boards[1].masterNodes[1];
  const pathResult = findApostlePathToBokr(progress, 1, 2);
  const html = renderBokrBoard({ progress, boardIndex: 1, targetNode, pathResult });
  assert.equal((html.match(/tcbe-map-selected/g) || []).length, 1);
  assert.equal((html.match(/role="img"/g) || []).length, 2);
  assert.doesNotMatch(html, /data-board="1"/);
  assert.match(html, /tcbe-map-selected tcbe-map-path" data-board="2" data-node="2"/);
  assert.match(html, /grid-row:1/);
  assert.match(html, /aspect-ratio:7\/2/);
  assert.match(html, /2차 체력 보크 · 선택한 칸/);
});

test('경로 재화는 관문 안내와 0개인 황크·보크·골드도 표시한다', () => {
  const html = renderBokrPathCost({
    pathCost: { basicCrayon: 0, averageCrayon: 0, epicCrayon: 0, ultraCrayon: 0, gold: 0 },
    gateRequirements: [{ boardLevel: 2, items: [{ item: 310002, value: 5 }] }],
  });
  assert.match(html, /tcbe-cost-gate/);
  assert.match(html, /2번 관문 오픈 필요/);
  assert.match(html, /최상급 크레파스 0개 필요/);
  assert.match(html, /상급 크레파스 0개 필요/);
  assert.match(html, /골드 0k 필요/);
  assert.ok(html.indexOf('관문 오픈 필요') < html.indexOf('상급 크레파스'));
});

test('0부터 시작하는 좌표도 차수 경계에서 겹치지 않고 경로와 같은 위치를 사용한다', () => {
  const zeroBased = { boards: [
    { masterNodes: [{ id: 1, nodeType: 2, grid: { x: 0, y: 0 } }], stepStr: '1' },
    { masterNodes: [{ id: 2, nodeType: 4, grid: { x: 0, y: 0 } }], stepStr: '' },
  ] };
  assert.deepEqual(getApostleBoardLayout(zeroBased).map(entry => entry.y), [0, 1]);
  assert.deepEqual(findApostlePathToBokr(zeroBased, 1, 2).pathNodeIds, [1, 2]);
});

test('위치 보드는 원본처럼 오른쪽에서 왼쪽으로 X 좌표를 배치하고 7열에 맞춘다', () => {
  const targetNode = { id: 2, nodeType: 4, grid: { x: 3, y: 1 } };
  const progress = { boards: [{ masterNodes: [
    { id: 1, nodeType: 2, grid: { x: 1, y: 1 } }, targetNode,
  ], stepStr: '' }] };
  const html = renderBokrBoard({ progress, boardIndex: 0, targetNode, pathResult: {} });
  assert.match(html, /data-node="1" style="grid-column:5;/);
  assert.match(html, /data-node="2" style="grid-column:3;/);
  assert.match(html, /width:224px;aspect-ratio:7\/1/);
});
