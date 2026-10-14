/** 소수점 한 자리로 반올림하고 불필요한 소수부 없이 한국어 숫자로 표시한다. */
export function formatNumber(value: number): string {
  return Number(value.toFixed(1)).toLocaleString('ko-KR');
}

/** 골드를 트릭컬 노트의 k 단위로 표시한다. */
export function formatGold(gold: number): string {
  if (!gold || gold === 0) return '0k';
  if (gold >= 1000) {
    const kVal = gold / 1000;
    const formatted = Number.isInteger(kVal)
      ? kVal.toLocaleString()
      : kVal.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return `${formatted}k`;
  }
  return `${gold.toLocaleString()}`;
}
