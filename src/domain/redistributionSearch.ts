/**
 * 결정론적 부분집합 빔 탐색 (Deterministic subset beam search).
 * 소규모 후보군(8명 이하)은 모든 부분집합을 전수 조사하고,
 * 대규모 후보군은 빔 폭(beam width) 기반으로 유망 후보를 유지하며 탐색합니다.
 *
 * 대규모 탐색은 "레인(lane)" 단위로 진행합니다.
 * - 빠른 레인: 정적 순위 상위 FAST_SINGLETONS명만 1인 평가하고 이후 인원마다 FAST_PROPOSALS개 조합을 평가
 * - 넓은 레인: 모든 1인 후보를 평가하고 이후 인원마다 THOROUGH_PROPOSALS개 조합을 평가
 * 빠른 탐색은 빠른 레인만, 상세 탐색은 두 레인을 함께 돌린다. 따라서 상세 탐색 결과는 항상 빠른 탐색 이상이다.
 * (빔 탐색은 경로 의존적이라 넓은 레인 단독으로는 빠른 탐색보다 나쁜 조합에 갇힐 수 있다.)
 * 각 레인은 1인 평가 후 실제 1인 점수 순으로 후보를 재정렬해 이후 조합 확장 순서로 사용한다.
 */
/** 빠른 레인: 1인 단계에서 실제 평가할 후보 수 */
export const FAST_SINGLETONS = 8;
/** 빠른 레인: 2인 이상 단계에서 평가할 조합 수 */
export const FAST_PROPOSALS = 4;
/** 넓은 레인: 2인 이상 단계에서 평가할 최대 조합 수 */
export const THOROUGH_PROPOSALS = 24;
/** 레인별로 다음 인원 단계에 넘길 부모 조합 수 (빔 폭) */
const BEAM_WIDTH = 3;

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
  const root: Scored = { ids: [], value: baseline, score: bestScore };
  const exact = ids.length <= 8;
  type Lane = { order: number[]; frontier: Scored[]; cap: (limit: number) => number };
  const lanes: Lane[] = exact
    ? [{ order: [...ids], frontier: [root], cap: () => Infinity }]
    : [
      { order: [...ids], frontier: [root], cap: limit => limit === 1 ? FAST_SINGLETONS : FAST_PROPOSALS },
      ...(fast ? [] : [{ order: [...ids], frontier: [root], cap: (limit: number) => limit === 1 ? Infinity : THOROUGH_PROPOSALS }]),
    ];
  const byScore = (a: Scored, b: Scored) => a.score === null ? (b.score === null ? 0 : 1) : b.score === null ? -1 : -compare(a.score, b.score);
  for (let limit = 0; limit <= maxSize; limit++) {
    if (limit > 0 && limit <= ids.length) {
      // 같은 인원 단계에서 여러 레인이 같은 조합을 제안하면 한 번만 평가한다.
      const evaluatedByKey = new Map<string, Scored>();
      const laneProposals = lanes.map(lane => {
        const cap = lane.cap(limit);
        const proposals = new Map<string, number[]>();
        const add = (set: number[]) => {
          if (proposals.size >= cap) return;
          const sorted = [...set].sort((a, b) => a - b);
          proposals.set(sorted.join(','), sorted);
        };
        // 빔 가지치기로 부모를 잃더라도 현재 순위의 접두사 후보를 보존한다.
        add(lane.order.slice(0, limit));
        // 순위가 높은 후보부터 여러 부모 노드에 붙여 작업 한도 내에서 확장한다.
        for (const id of lane.order) {
          for (const parent of lane.frontier) if (!parent.ids.includes(id)) add([...parent.ids, id]);
          if (proposals.size >= cap) break;
        }
        return proposals;
      });
      for (const proposals of laneProposals) {
        for (const [key, set] of proposals) {
          if (evaluatedByKey.has(key)) continue;
          const value = evaluate(new Set(set));
          const valueScore = value ? score(value) : null;
          evaluatedByKey.set(key, { ids: set, value, score: valueScore });
          if (value && valueScore && compare(valueScore, bestScore) > 0) { best = value; bestScore = valueScore; }
          if (checkpoints) yield { limit, best, pending: true };
        }
      }
      lanes.forEach((lane, index) => {
        const evaluated = [...laneProposals[index]!.keys()].map(key => evaluatedByKey.get(key)!).sort(byScore);
        if (limit === 1 && !exact) {
          // 1인 평가 점수 순으로 재정렬한다. 평가하지 못한 후보는 기존 순위를 유지한 채 뒤에 둔다.
          const rank = new Map(evaluated.map((item, position) => [item.ids[0]!, item.score === null ? evaluated.length + position : position]));
          lane.order = [...lane.order].sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER));
        }
        // 실행 불가능했던 부분집합도 추가 환급을 통해 실행 가능해질 수 있으므로 유지한다.
        lane.frontier = exact ? evaluated : evaluated.slice(0, BEAM_WIDTH);
      });
    }
    yield { limit, best };
  }
}
