/** 보크 모달과 재분배 지도에서 같은 노드 스프라이트와 꽃잎 상태를 사용한다. */
import { findLinkedPetalNode } from '../../domain/boardPathfinder.ts';
import { getNodeStatCategories, isBokrNode, isHwangNode, NODE_TYPE, STAT_META_LIST } from '../../domain/boardProgress.ts';
import type { BoardProgress, MasterBoardNode } from '../../domain/types.ts';
import { STAT_TO_POSITIONS } from './tileHighlight.ts';

export function getBoardNodeVisual(board: BoardProgress, node: MasterBoardNode, picked: boolean) {
  const categories = getNodeStatCategories(node);
  const key = categories[0];
  const meta = STAT_META_LIST.find(stat => stat.key === key);
  const combinedAttack = categories.includes('atk_phys') && categories.includes('atk_mag');
  const combinedDefense = categories.includes('def_phys') && categories.includes('def_mag');
  const statName = combinedAttack ? '물마공' : combinedDefense ? '물마방' : meta?.nameKo;
  const petal = findLinkedPetalNode(board.masterNodes || [], node);
  const petalIndex = petal ? board.masterNodes!.indexOf(petal) : -1;
  const petalOpen = petal && board.unlocked !== false && board.stepStr?.[petalIndex] === '1';
  const flowering = node.nodeType === NODE_TYPE.HWANG_EXT;
  // 시작 칸과 관문은 원본의 고정 테두리를 사용하며 색칠 기록을 변경하지 않는다.
  const frame = node.nodeType === NODE_TYPE.START ? '0%'
    : node.nodeType === NODE_TYPE.GATE ? '50%'
    : isBokrNode(node) ? (picked ? '83.3333%' : '100%')
    : isHwangNode(node) ? (picked ? '33.3333%' : '66.6667%')
    : (picked ? '0%' : '16.6667%');
  const kind = node.nodeType === NODE_TYPE.GATE ? '관문' : node.nodeType === NODE_TYPE.START ? '시작 칸'
    : isBokrNode(node) ? '보크' : isHwangNode(node) ? '황크' : '일반칸';
  const position = node.nodeType === NODE_TYPE.START ? '0%'
    : node.nodeType === NODE_TYPE.GATE ? '86.3636%'
    : combinedAttack ? (picked ? '100%' : '95.4545%')
    : combinedDefense ? (picked ? '90.9091%' : '86.3636%')
    : key ? STAT_TO_POSITIONS[key][picked ? 'active' : 'inactive'][0] : '0%';
  const icon = `<span class="tcbe-map-icon${isHwangNode(node) && !picked ? ' tcbe-map-hwang-inactive' : ''}" style="background-position:${position} 0"></span>`;
  const contents = flowering ? `<span class="tcbe-map-flower-frame" style="background-position:${frame} 0">${icon}</span>` : icon;
  return { frame, kind, statName, flowering, petalState: petal ? petalOpen ? '열림' : '닫힘' : '상태 미확인',
    classes: flowering ? ` tcbe-map-flower tcbe-map-flower-${petalOpen ? 'open' : 'closed'}` : '',
    background: flowering ? 'center' : frame, contents };
}

/**
 * 보드 지도 그리드 좌표 계산용 인터페이스
 */
export interface BoardGridLayout {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  columns: number;
  columnOffset: number;
  rowCount: number;
}

/**
 * 주어진 노드 좌표 목록으로부터 일관된 CSS 그리드 배치 정보(열 수, 오프셋, 행 수 등)를 산출합니다.
 */
export function computeBoardGridLayout(points: Array<{ x: number; y: number }>, minColumns = 7): BoardGridLayout | null {
  if (!points.length) return null;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX - minX > 30 || maxY - minY > 50) return null;
  const columns = Math.max(minColumns, maxX - minX + 1);
  const columnOffset = Math.floor((columns - (maxX - minX + 1)) / 2);
  const rowCount = maxY - minY + 1;
  return { minX, maxX, minY, maxY, columns, columnOffset, rowCount };
}

/**
 * 개별 노드의 그리드 인라인 스타일을 생성합니다.
 */
export function getTileGridStyle(x: number, y: number, layout: BoardGridLayout): string {
  return `grid-column:${layout.maxX - x + 1 + layout.columnOffset};grid-row:${layout.maxY - y + 1};`;
}

