export const redistributionResourceIcon = (resource: 'hwang' | 'bokr' | 'gold' | 'watering-can'): string => {
  const map: Record<string, [string, string]> = {
    hwang: ['pastel-ultra', '황크'],
    bokr: ['pastel-epic', '보크'],
    gold: ['icon-gold', '골드'],
    'watering-can': ['watering-can', '만개 물뿌리개'],
  };
  const [cls, name] = map[resource] ?? ['pastel-ultra', '황크'];
  return `<span class="tcbe-rd-resource-icon ${cls}" role="img" aria-label="${name}" title="${name}"></span>`;
};

export const redistributionBoardLabel = (scope: { boardIndex?: number; boardThrough?: number }): string =>
  scope.boardThrough !== undefined ? scope.boardThrough === 0 ? '1차' : `1~${scope.boardThrough + 1}차` :
    scope.boardIndex === undefined ? '전체 차수' : `${scope.boardIndex + 1}차만`;
