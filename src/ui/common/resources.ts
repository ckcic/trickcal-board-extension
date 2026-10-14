import type { ResourceCostSummary } from '../../domain/types.ts';
import { formatNumber } from './format.ts';

export const renderResourceIcon = (resource: 'hwang' | 'bokr' | 'gold' | 'watering-can'): string => {
  const map: Record<string, [string, string]> = {
    hwang: ['pastel-ultra', '황크'],
    bokr: ['pastel-epic', '보크'],
    gold: ['icon-gold', '골드'],
    'watering-can': ['watering-can', '만개 물뿌리개'],
  };
  const [cls, name] = map[resource] ?? ['pastel-ultra', '황크'];
  return `<span class="tcbe-rd-resource-icon ${cls}" role="img" aria-label="${name}" title="${name}"></span>`;
};

/**
 * 합계·사도별 환급·칸별 비용에 같은 재화 아이콘을 대응하여 HTML로 렌더링
 */
export function renderResourceCost(cost: ResourceCostSummary): string {
  const items: Array<[number, string, string]> = [
    [cost.ultraCrayon, 'pastel-ultra', '황크'],
    [cost.epicCrayon, 'pastel-epic', '보크'],
    [cost.averageCrayon, 'pastel-average', '중급 크레파스'],
    [cost.basicCrayon, 'pastel-basic', '하급 크레파스'],
    [cost.wateringCan || 0, 'watering-can', '만개 물뿌리개'],
    [cost.gold, 'icon-gold', '골드'],
  ];
  return items.filter(([value]) => value > 0).map(([value, icon, name]) =>
    `<span class="tcbe-rd-resource" title="${name}" aria-label="${name} ${formatNumber(value)}${icon === 'icon-gold' ? '' : '개'}"><span class="tcbe-rd-resource-icon ${icon}" aria-hidden="true"></span><span>${formatNumber(value)}${icon === 'icon-gold' ? '' : '개'}</span></span>`
  ).join(' ') || '없음';
}
