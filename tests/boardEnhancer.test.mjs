import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { applyBoardLevelVisibility } from '../src/ui/board/boardEnhancer.ts';
import { DEFAULT_FILTER_STATE } from '../src/domain/filters.ts';
import { calculateAllApostlesProgress } from '../src/domain/boardProgress.ts';
import { mockHeroInfo, mockMasterBoard, mockText, mockUserApostles } from './fixtures/sanitizedData.mjs';

function boardCard(missing = []) {
  const row12 = { style: { display: '' } }, row3 = { style: { display: '' } };
  const columns = [0, 1, 2].map(index => ({ style: { display: '' },
    parentElement: index === 2 ? row3 : row12, classList: { contains: () => true } }));
  const attrs = new Map();
  const card = {
    closest: () => null,
    getAttribute: key => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
    querySelectorAll: () => columns.flatMap((col, index) => missing.includes(index) ? []
      : [{ textContent: `${index + 1}차 보드`, parentElement: col }]),
  };
  return { card, columns, rows: [row12, row3] };
}

test('보드 표시 전환은 선택 차수와 1·2차 공유 행을 함께 갱신하고 같은 조건은 재탐색하지 않는다', () => {
  const { card, columns, rows } = boardCard();
  for (const [level, expected] of [
    ['1', ['', 'none', 'none', '', 'none']], ['2', ['none', '', 'none', '', 'none']],
    ['3', ['none', 'none', '', 'none', '']], ['all', ['', '', '', '', '']],
  ]) {
    applyBoardLevelVisibility(card, level);
    assert.deepEqual([...columns, ...rows].map(element => element.style.display), expected);
  }
  card.querySelectorAll = () => { throw new Error('같은 차수의 보드를 다시 탐색함'); };
  applyBoardLevelVisibility(card, 'all');
});

test('일부 보드 열이나 모든 열이 없어도 표시 전환이 안전하다', () => {
  const { card, columns, rows } = boardCard([0]);
  applyBoardLevelVisibility(card, '3');
  assert.equal(columns[1].style.display, 'none');
  assert.equal(rows[0].style.display, 'none');
  assert.equal(rows[1].style.display, '');
  applyBoardLevelVisibility(boardCard([0, 1, 2]).card, '1');
});

const bundled = await build({ entryPoints: ['src/ui/board/boardEnhancer.ts'], bundle: true,
  write: false, format: 'iife', globalName: 'enhancer', plugins: [{ name: '배지 렌더러 대역', setup(builder) {
    builder.onLoad({ filter: /badge\.ts$/ }, () => ({ contents: 'export function createBadgeElement(progress) { return { picked: progress.bokr.picked }; }' }));
    builder.onLoad({ filter: /normalStat\.ts$/ }, () => ({ contents: 'export function createNormalStatElement() { return {}; }' }));
  } }] });

for (const mode of ['텍스트', '이미지', '보조']) {
  for (const hasNextSibling of [false, true]) {
    test(`${mode} 탐색: 이름 뒤에 배지를 ${hasNextSibling ? '삽입' : '추가'}하고 같은 카드는 재사용한다`, () => {
      const progressMap = calculateAllApostlesProgress({ apostles: mockUserApostles, board: mockMasterBoard,
        heroInfo: mockHeroInfo, text: mockText });
      const apostle = progressMap.get('10001');
      let row;
      const parent = {
        appendChild(next) { row = next; },
        insertBefore(next, sibling) { assert.equal(sibling, name.nextSibling); row = next; },
      };
      const name = { children: [], textContent: apostle.name, parentNode: parent,
        nextSibling: hasNextSibling ? {} : null,
        closest: selector => selector === '[data-slot="card"]' ? card : null };
      const other = { children: [], textContent: progressMap.get('10002').name };
      const attrs = { 'data-tcbe-visible-level': 'all', 'data-tcbe-highlight-stat': 'all' };
      let textScans = 0;
      const card = {
        getAttribute: key => attrs[key] ?? null,
        setAttribute: (key, value) => { attrs[key] = value; },
        closest: () => null,
        querySelector: selector => selector === '.tcbe-badge-row' ? row ?? null
          : selector === 'img[alt]' && mode === '이미지' ? { getAttribute: () => apostle.name } : null,
        querySelectorAll() { textScans++; return mode === '이미지' ? [other, name] : [name]; },
      };
      let created = 0;
      const context = vm.createContext({ document: {
        querySelectorAll: selector => mode === '보조' ? selector === 'span, p, div, h2, h3, h4, strong, b' ? [name, name] : [] : [card],
        createElement: () => {
          created++;
          return { children: [], attrs: {},
            setAttribute(key, value) { this.attrs[key] = value; },
            getAttribute(key) { return this.attrs[key] ?? null; },
            appendChild(child) { this.children.push(child); },
            querySelector(selector) { return this.children[selector === '.tcbe-badge-container' ? 0 : 1]; },
          };
        },
      } });
      vm.runInContext(bundled.outputFiles[0].text, context);
      assert.equal(context.enhancer.enhanceApostleCards(progressMap, DEFAULT_FILTER_STATE), 1);
      assert.equal(row.children.length, 2);
      assert.equal(row.children[0].picked, apostle.bokr.picked);
      assert.equal(attrs['data-tcbe-apostle-name'], apostle.name);
      assert.equal(attrs['data-tcbe-apostle-id'], String(apostle.apostleId));
      assert.equal(attrs['data-tcbe-enhanced'], 'true');
      const first = row, scans = textScans;
      assert.equal(context.enhancer.enhanceApostleCards(progressMap, DEFAULT_FILTER_STATE), 1);
      assert.equal(row, first);
      assert.equal(created, 1);
      assert.equal(textScans, scans);
    });
  }
}
