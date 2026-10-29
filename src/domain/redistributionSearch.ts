/**
 * 결정론적 부분집합 빔 탐색 (Deterministic subset beam search).
 * 소규모 후보군(8명 이하)은 모든 부분집합을 전수 조사하고,
 * 대규모 후보군은 빔 폭(beam width) 기반으로 유망 후보를 유지하며 탐색합니다.
 */
export function* searchResetSets<T>(ids: number[], maxSize: number,
  evaluate: (ids: Set<number>) => T | null, score: (value: T) => number[],
  compare: (a: number[], b: number[]) => number, checkpoints = false, fast = false): Generator<{ limit: number; best: T; pending?: boolean }> {
  const baseline = evaluate(new Set());
  if (!baseline) throw new Error('현재 보드에서 계산할 수 없습니다.');
  let best = baseline;
  // 목적함수 점수는 후보당 한 번만 계산해 비교·정렬에 재사용한다.
  let bestScore = score(baseline);
  if (checkpoints) yield { limit: 0, best, pending: true };
  type Scored = { ids: number[]; value: T | null; score: number[] | null };
  let frontier: Scored[] = [{ ids: [], value: baseline, score: bestScore }];
  const exact = ids.length <= 8;
  for (let limit = 0; limit <= maxSize; limit++) {
    if (limit > 0 && limit <= ids.length) {
      const proposals = new Map<string, number[]>();
      const add = (set: number[]) => {
        if (!exact && fast && proposals.size >= 3) return;
        const sorted = [...set].sort((a, b) => a - b);
        proposals.set(sorted.join(','), sorted);
      };
      // 빔 가지치기로 부모를 잃더라도 기존 접두사 후보를 보존한다.
      add(ids.slice(0, limit));
      // 라운드로빈 방식으로 여러 부모 노드를 작업 한도 내에서 균등하게 확장한다.
      for (const id of ids) {
        for (const parent of frontier) if (!parent.ids.includes(id)) add([...parent.ids, id]);
        if (!exact && (fast ? proposals.size >= 3 : limit > 1 && proposals.size >= 24)) break;
      }
      const evaluated: Scored[] = [];
      for (const set of proposals.values()) {
        const value = evaluate(new Set(set));
        const valueScore = value ? score(value) : null;
        evaluated.push({ ids: set, value, score: valueScore });
        if (value && valueScore && compare(valueScore, bestScore) > 0) { best = value; bestScore = valueScore; }
        if (checkpoints) yield { limit, best, pending: true };
      }
      evaluated.sort((a, b) => a.score === null ? (b.score === null ? 0 : 1) : b.score === null ? -1 : -compare(a.score, b.score));
      // 실행 불가능했던 부분집합도 추가 환급을 통해 실행 가능해질 수 있으므로 유지한다.
      frontier = exact ? evaluated : evaluated.slice(0, 3);
    }
    yield { limit, best };
  }
}
