import { getUniqueApostles } from '../../domain/apostleProgress.ts';
import { findProgressByName } from '../../domain/apostleLookup.ts';
import type { ProgressMap } from '../../domain/types.ts';
import { escapeHtml } from './html.ts';

/**
 * 진행도 데이터 및 DOM 카드에서 사도 얼굴 초상화 URL 수집
 */
export function collectApostlePortraits(progressMap?: ProgressMap): Map<number | string, string> {
  const map = new Map<number | string, string>();

  // 1. progressMap의 모든 사도에 대해 HeroIcons CDN 기본 초상화 등록
  if (progressMap) {
    getUniqueApostles(progressMap).forEach(progress => {
      if (progress.icon) {
        const cdnUrl = `https://cdn.note.trickcal.com/HeroIcons/${progress.icon}.webp`;
        map.set(progress.apostleId, cdnUrl);
        map.set(progress.name, cdnUrl);
      }
    });
  }

  if (typeof document === 'undefined') return map;

  // 2. DOM에 렌더링된 사도 카드가 있으면 실제 렌더링된 이미지(스킨 등)로 덮어쓰기
  document.querySelectorAll<HTMLElement>('[data-tcbe-apostle-id]').forEach(card => {
    const id = Number(card.getAttribute('data-tcbe-apostle-id'));
    const name = card.getAttribute('data-tcbe-apostle-name');
    const img = card.querySelector<HTMLImageElement>('img[alt]') || card.querySelector<HTMLImageElement>('img');
    if (img?.src) {
      if (id) map.set(id, img.src);
      if (name) map.set(name, img.src);
    }
  });

  if (progressMap) {
    document.querySelectorAll<HTMLImageElement>('img[alt]').forEach(img => {
      const alt = img.alt?.trim();
      if (!alt || !img.src) return;
      const progress = findProgressByName(progressMap, alt);
      if (progress) {
        map.set(progress.apostleId, img.src);
        map.set(progress.name, img.src);
      }
    });
  }

  document.querySelectorAll<HTMLImageElement>('img[alt]').forEach(img => {
    const alt = img.alt?.trim();
    if (alt && img.src && !map.has(alt) && /^https:\/\/(cdn\.)?note\.trickcal\.com\//.test(img.src)) {
      map.set(alt, img.src);
    }
  });

  return map;
}

/**
 * 사도 미니 아바타 렌더링
 */
export function renderApostleAvatar(apostleId: number | string, name: string, portraitMap?: Map<number | string, string>): string {
  if (!portraitMap) return '';
  const url = portraitMap.get(apostleId) || portraitMap.get(name);
  if (!url) return '';
  return `<img class="tcbe-rd-avatar" src="${escapeHtml(url)}" alt="" aria-hidden="true" loading="lazy" onerror="this.style.display='none'">`;
}
