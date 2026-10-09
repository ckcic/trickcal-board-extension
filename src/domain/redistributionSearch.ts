/** Deterministic subset beam search. Small candidate sets enumerate every subset. */
export function* searchResetSets<T>(ids: number[], maxSize: number,
  evaluate: (ids: Set<number>) => T | null, score: (value: T) => number[],
  compare: (a: number[], b: number[]) => number, checkpoints = false, fast = false): Generator<{ limit: number; best: T; pending?: boolean }> {
  const baseline = evaluate(new Set());
  if (!baseline) throw new Error('현재 보드에서 계산할 수 없습니다.');
  let best = baseline;
  let frontier: Array<{ ids: number[]; value: T | null }> = [{ ids: [], value: baseline }];
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
      const evaluated: Array<{ ids: number[]; value: T | null }> = [];
      for (const set of proposals.values()) {
        const value = evaluate(new Set(set));
        evaluated.push({ ids: set, value });
        if (value && compare(score(value), score(best)) > 0) best = value;
        if (checkpoints) yield { limit, best, pending: true };
      }
      evaluated.sort((a, b) => a.value === null ? (b.value === null ? 0 : 1) : b.value === null ? -1 : -compare(score(a.value), score(b.value)));
      // Infeasible partial sets can become feasible after another refund; retain them too.
      frontier = exact ? evaluated : evaluated.slice(0, 3);
    }
    yield { limit, best };
  }
}
