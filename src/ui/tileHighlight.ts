/**
 * @file tileHighlight.ts
 * @description 사도 카드 내부의 보드 타일에 스탯 필터 하이라이트 테두리를 적용/해제하는 모듈
 */

import type { ApostleProgress, FilterState, StatCategory } from '../domain/types.ts';

/**
 * 트릭컬 노트 BoardTile.webp 스프라이트의 스탯별 bg-position 매핑
 * (치피: 63.6364%/59.0909%, 치저: 72.7273%/68.1818%)
 */
export const STAT_TO_POSITIONS: Record<StatCategory, { active: string[]; inactive: string[] }> = {
  hp: {
    active: ['9.0909%'],
    inactive: ['4.5455%'],
  },
  atk_phys: {
    active: ['18.1818%'],
    inactive: ['13.6364%'],
  },
  atk_mag: {
    active: ['27.2727%'],
    inactive: ['22.7273%'],
  },
  def_phys: {
    active: ['36.3636%'],
    inactive: ['31.8182%'],
  },
  def_mag: {
    active: ['45.4545%'],
    inactive: ['40.9091%'],
  },
  crit: {
    active: ['54.5455%'],
    inactive: ['50%'],
  },
  crit_dmg: {
    active: ['63.6364%'],
    inactive: ['59.0909%'],
  },
  crit_res: {
    active: ['72.7273%'],
    inactive: ['68.1818%'],
  },
  crit_dmg_res: {
    active: ['81.8182%'],
    inactive: ['77.2727%'],
  },
};

/**
 * 클래스 문자열 내에 특정 bg-position-[pos_0] 클래스가 존재하는지 정확히 검사
 */
function hasTilePosition(className: string, pos: string): boolean {
  return className.includes(`bg-position-[${pos}_0]`) || className.includes(`bg-position-[${pos}]`);
}

/**
 * 사도 카드 내부의 보드 타일에 스탯 필터 하이라이트 테두리 적용/해제 (캐시 기반 고속화)
 * (보크 타일만 대상, 황크/일반 노드/게이트 완전 제외)
 */
export function updateBoardTileHighlights(
  card: HTMLElement,
  _progress: ApostleProgress,
  activeFilter?: FilterState
) {
  const targetStat = activeFilter?.statCategory || 'all';
  const currentStat = card.getAttribute('data-tcbe-highlight-stat') || 'all';

  // 캐시 확인: 이미 동일한 하이라이트 상태가 적용되어 있다면 수천 개 타일 DOM 순회 생략
  if (currentStat === targetStat) {
    return;
  }
  card.setAttribute('data-tcbe-highlight-stat', targetStat);

  // 1. 기존에 적용된 하이라이트 요소 초기화
  const existingHighlighted = card.querySelectorAll<HTMLElement>(
    '.tcbe-tile-highlight-rem, .tcbe-tile-highlight-done, [data-tcbe-tile-highlight]'
  );
  existingHighlighted.forEach((el) => {
    el.classList.remove('tcbe-tile-highlight-rem', 'tcbe-tile-highlight-done');
    el.removeAttribute('data-tcbe-tile-highlight');
  });

  if (targetStat === 'all') {
    return;
  }

  const statPositions = STAT_TO_POSITIONS[targetStat];
  if (!statPositions) return;

  // 2. 카드 내의 모든 보드 타일 내부 이미지 요소 탐색
  const tileImages = Array.from(
    card.querySelectorAll<HTMLElement>('div[class*="--img-board-tile"]')
  );

  tileImages.forEach((imgEl) => {
    const cls = imgEl.className;
    // imgEl의 부모인 rect 요소 (.bg-(image:--img-board-rect))
    const rectEl = (imgEl.closest('div[class*="--img-board-rect"]') as HTMLElement) || imgEl.parentElement;
    if (!rectEl) return;

    const rectCls = rectEl.className;

    // ★ 황크 타일 완전 제외 (33.3333% = 활성 황크, 66.6667% = 비활성 황크)
    if (rectCls.includes('33.3333%') || rectCls.includes('66.6667%')) {
      return;
    }

    // ★ 일반 노드 완전 제외 (0% = 활성 일반, 16.6667% = 비활성 일반)
    if (rectCls.includes('bg-position-[0%_0]') || rectCls.includes('16.6667%')) {
      return;
    }

    // ★ 게이트나 시작 타일 제외
    if (cls.includes('86.3636%') || cls.includes('bg-position-[0%_0]')) {
      return;
    }

    // 보크 타일의 활성화 / 비활성화 매칭
    const isActiveMatch = statPositions.active.some((p) => hasTilePosition(cls, p));
    const isInactiveMatch = statPositions.inactive.some((p) => hasTilePosition(cls, p));

    if (isActiveMatch || isInactiveMatch) {
      rectEl.setAttribute('data-tcbe-tile-highlight', targetStat);

      if (isActiveMatch) {
        rectEl.classList.add('tcbe-tile-highlight-done');
      } else {
        rectEl.classList.add('tcbe-tile-highlight-rem');
      }
    }
  });
}
