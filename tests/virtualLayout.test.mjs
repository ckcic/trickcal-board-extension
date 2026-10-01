import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFilterToCards, applyBoardLevelVisibility } from '../src/ui/boardEnhancer.ts';
import { calculateAllApostlesProgress } from '../src/domain/boardProgress.ts';
import { parseTrickcalApiPayload } from '../src/domain/dataParser.ts';

test('가상 목록은 브리지 입력을 따르며 렌더된 카드에 높이 0 숨김이나 CSS 정렬을 적용하지 않는다', () => {
  const progress = calculateAllApostlesProgress(parseTrickcalApiPayload({
    apostles: [{ apostleId: 1, boardSteps: [] }], board: { 1: { 0: [] } },
    heroInfo: { 1: { name: 'A', personality: 0, gradeDefault: 3 } }, text: { A: '가명사도' },
  }));
  const classes = new Set(['tcbe-card-hidden']);
  const card = {
    style: { order: '10000' },
    closest: selector => selector === '.virtuoso-grid-item' ? {} : null,
    getAttribute: key => key === 'data-tcbe-apostle-name' ? '가명사도' : 'all',
    classList: { remove: name => classes.delete(name) },
    querySelectorAll: () => { throw new Error('가상 카드의 보드 레이아웃을 지연 변경함'); },
    setAttribute: () => { throw new Error('가상 카드의 표시 캐시를 변경함'); },
  };
  const filter = { status: 'all', boardLevel: 'all', statCategory: 'all', personality: 1,
    grade: 'all', unlockedTier: 'all', sortBy: 'name_desc' };
  applyBoardLevelVisibility(card, '2');
  assert.deepEqual(applyFilterToCards(filter, progress, [card]), { total: 1, visible: 1 });
  assert.equal(classes.has('tcbe-card-hidden'), false);
  assert.equal(card.style.order, '');
});
