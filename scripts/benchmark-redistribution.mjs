// Synthetic account only; never reads stored account data.
import { performance } from 'node:perf_hooks';
import { iterateHwangRedistribution } from '../src/domain/hwangRedistribution.ts';
const size = Number(process.argv[2] || 30);
const limit = Number(process.argv[3] || 3);
const progress = new Map(Array.from({ length: size }, (_, id) => [String(id), {
  apostleId: id, name: `가명${id}`, isOwned: true,
  boards: [{ unlocked: true, stepStr: '1111' + '0'.repeat(45), masterNodes: Array.from({ length: 49 }, (_, i) =>
    i === 0 ? { id: 1, nodeType: 2, grid: { x: 0, y: 0 } } : {
      id: i + 1, nodeType: 5, grid: { x: i % 7, y: Math.floor(i / 7) },
      requireItems: [{ item: 610004, value: 2 }], stats: [{ statType: [99, 95, 97, 88][(i + id) % 4], statValue: 80 }],
    }) }],
}]));
const start = performance.now();
let previous = start;
let maxSliceMs = 0;
for (const { limit: n, plan, pending } of iterateHwangRedistribution(progress, {
  ownedCrayons: 20, maxReset: limit, stages: [{ allowBlocked: true, targets: [{ stat: 'atk_phys', target: size * 40 }] }],
}, true)) {
  const now = performance.now();
  maxSliceMs = Math.max(maxSliceMs, now - previous);
  if (!pending) console.log(JSON.stringify({ size, limit: n, elapsedMs: Math.round(now - start), maxSliceMs: Math.round(maxSliceMs), attack: plan.after.atk_phys }));
  previous = now;
}
