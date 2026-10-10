/** Deterministic subset beam search. Small candidate sets enumerate every subset. */
export function* searchResetSets<T>(ids: number[], maxSize: number,
  evaluate: (ids: Set<number>) => T | null, score: (value: T) => number[],
  compare: (a: number[], b: number[]) => number, checkpoints = false, fast = false): Generator<{ limit: number; best: T; pending?: boolean }> {
  const baseline = evaluate(new Set());
  if (!baseline) throw new Error('현재 보드에서 계산할 수 없습니다.');
  let best = baseline;
  // 목적함수 점수는 후보당 한 번만 계산해 비교·정렬에 재사용한다.
  let bestScore = score(baseline);
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
      // Preserve the old prefix as a candidate, even if beam pruning lost its parent.
      add(ids.slice(0, limit));
      // Round-robin expansion keeps several parents alive under the work limit.
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
      // Infeasible partial sets can become feasible after another refund; retain them too.
      frontier = exact ? evaluated : evaluated.slice(0, 3);
    }
    yield { limit, best };
  }
}
