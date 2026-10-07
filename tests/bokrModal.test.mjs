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

test('미색칠 황크만 원본의 검은 아이콘 처리를 적용하고 색칠된 황크와 보크는 유지한다', () => {
  const nodes = [
    { id: 1, nodeType: 5, grid: { x: 1, y: 1 }, requireItems: [{ item: 610004, value: 2 }] },
    { id: 2, nodeType: 6, grid: { x: 2, y: 1 }, requireItems: [{ item: 610004, value: 2 }] },
    { id: 3, nodeType: 5, grid: { x: 3, y: 1 }, requireItems: [{ item: 610004, value: 2 }] },
    { id: 4, nodeType: 4, grid: { x: 4, y: 1 }, requireItems: [{ item: 610003, value: 3 }] },
  ];
  const html = renderBokrBoard({ progress: { boards: [{ masterNodes: nodes, stepStr: '0010' }] }, boardIndex: 0, targetNode: nodes[3], pathResult: {} });
  assert.equal((html.match(/tcbe-map-hwang-inactive/g) || []).length, 2);
  const coloredHwang = html.split('data-node="3"')[1].split('</div>')[0];
  const bokr = html.split('data-node="4"')[1].split('</div>')[0];
  assert.doesNotMatch(coloredHwang, /tcbe-map-hwang-inactive/);
  assert.doesNotMatch(bokr, /tcbe-map-hwang-inactive/);
});

test('꽃잎 장식은 확장 황크에만 표시하고 황크 칠함과 별개로 꽃잎 해금 상태를 사용한다', () => {
  const nodes = [
    { id: 141, nodeType: 7, grid: { x: -1, y: -1 }, nextId: 42 },
    { id: 142, nodeType: 6, grid: { x: 1, y: 1 }, prevId: 41, requireItems: [{ item: 610004, value: 2 }], stats: [{ statType: 88, statValue: 60 }, { statType: 89, statValue: 60 }] },
    { id: 143, nodeType: 5, grid: { x: 2, y: 1 } },
  ];
  const progress = { boards: [{ masterNodes: nodes, stepStr: '000' }] };
  const options = { progress, boardIndex: 0, targetNode: nodes[1], pathResult: {} };
  assert.match(renderBokrBoard(options), /tcbe-map-flower-closed/);
  progress.boards[0].stepStr = '100';
  const opened = renderBokrBoard(options);
  assert.match(opened, /tcbe-map-flower-open/);
  assert.match(opened, /꽃잎 열림/);
  assert.match(opened, /물마공 황크/);
  assert.match(opened, /background-position:95.4545% 0/);
  assert.equal((opened.match(/tcbe-map-flower-frame/g) || []).length, 1);
  assert.equal((opened.match(/role="img"/g) || []).length, 2);
  progress.boards[0].unlocked = false;
  assert.match(renderBokrBoard(options), /tcbe-map-flower-closed/);
});
