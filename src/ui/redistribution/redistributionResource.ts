export const redistributionBoardLabel = (scope: { boardIndex?: number; boardThrough?: number }): string =>
  scope.boardThrough !== undefined ? scope.boardThrough === 0 ? '1차' : `1~${scope.boardThrough + 1}차` :
    scope.boardIndex === undefined ? '전체 차수' : `${scope.boardIndex + 1}차만`;
