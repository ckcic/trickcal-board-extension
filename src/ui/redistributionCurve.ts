import { redistributionBoardLabel } from './redistributionResource.ts';
import { STAT_META_LIST } from '../domain/boardProgress.ts';
import { getHwangTargetValue, type RedistributionStat } from '../domain/hwangRedistribution.ts';
import { readCurveValue, readBokrScopeValue, type RedistributionCurve } from '../domain/redistributionCurve.ts';

const format = (value: number) => Number(value.toFixed(1)).toLocaleString('ko-KR');
export function renderRedistributionCurve(curve: RedistributionCurve): string {
  const names = new Map<RedistributionStat, string>(STAT_META_LIST.map(meta => [meta.key, meta.nameKo])); names.set('attack', '공격력');
  const series = [...new Map(curve.stages.flatMap(stage => stage.targets.map(target => [`${stage.resource || 'hwang'}:${stage.boardThrough !== undefined ? 'through' + stage.boardThrough : stage.boardIndex ?? 'all'}:${target.stat}`, { resource: stage.resource || 'hwang', boardIndex: stage.boardIndex, boardThrough: stage.boardThrough, stat: target.stat } as const]))).values()];
  const last = curve.points.at(-1)!;
  return `<p class="tcbe-rd-caption">파란 선: 인원 상한별 추천 · 주황 점: 상한 없는 추천 (${last.resetCount}명 초기화) · 회색 점선: 현재·단계 목표. 초기화 조합·대체 경로를 탐색한 인원별 비교이며 전역 최적해는 보장하지 않습니다.</p>${series.map(({ resource, stat, boardIndex, boardThrough }) => {
    const unit = resource === 'bokr' ? '' : '%';
    const perNode = resource === 'bokr' ? STAT_META_LIST.find(meta => meta.key === stat)!.valuePerNode! : 1;
    const scopeName = resource === 'bokr' ? ` ${redistributionBoardLabel({ boardIndex, boardThrough }).replace('차만', '차')}` : '';
    const before = resource === 'bokr' ? readBokrScopeValue(curve.beforeBokrValues, stat, boardIndex, boardThrough) : getHwangTargetValue(curve.beforeHwang, stat);
    const goals = curve.stages.flatMap((stage, index) => (stage.resource === 'bokr') === (resource === 'bokr') && stage.boardIndex === boardIndex && stage.boardThrough === boardThrough ? stage.targets.filter(target => target.stat === stat).map(target => ({ value: target.target * perNode, label: `${index + 1}단계 ${format(target.target * perNode)}${unit}${resource === 'bokr' ? ` (${target.target}칸·기본 환산)` : ''}` })) : []);
    const guides = [{ value: before, label: `현재 ${format(before)}${unit}` }, ...goals];
    const values = curve.points.map(point => readCurveValue(point, resource, stat, boardIndex, boardThrough));
    const low = Math.min(before, ...values, ...goals.map(goal => goal.value)), high = Math.max(before, ...values, ...goals.map(goal => goal.value));
    const padding = Math.max(1, (high - low) * .12), min = Math.max(0, low - padding), max = high + padding;
    const x = (limit: number) => 58 + limit / Math.max(1, last.limit) * 670;
    const y = (value: number) => 180 - (value - min) / (max - min) * 145;
    const path = values.map((value, index) => `${index ? 'L' : 'M'}${x(curve.points[index]!.limit).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
    // 목표가 겹치면 라벨을 합쳐 같은 기준선을 한 번만 그린다.
    const grouped = [...new Set(guides.map(guide => guide.value))].map(value => ({ value, label: guides.filter(guide => guide.value === value).map(guide => guide.label).join(' / ') }));
    const labelYs: number[] = [];
    const lines = grouped.sort((a, b) => b.value - a.value).map(guide => {
      const actual = y(guide.value), labelY = Math.max(actual, (labelYs.at(-1) ?? -100) + 15); labelYs.push(labelY);
      return `<line x1="58" x2="728" y1="${actual}" y2="${actual}" stroke="#9ca3af" stroke-dasharray="5 5"/><text x="740" y="${labelY + 4}" font-size="10">${guide.label}</text>`;
    }).join('');
    const ticks = [0, .25, .5, .75, 1].map(part => { const limit = Math.round(last.limit * part); return `<text x="${x(limit)}" y="202" text-anchor="middle" font-size="11">${limit}</text>`; }).join('');
    return `<div class="tcbe-rd-chart"><svg viewBox="0 0 1000 228" role="img" aria-label="${resource === 'bokr' ? '보크' : '황크'} ${names.get(stat)}${scopeName} 초기화 인원별 ${unit}"><text x="58" y="18" font-weight="600">${resource === 'bokr' ? '보크' : '황크'} ${names.get(stat)}${scopeName} (${resource === 'bokr' ? '정수 스탯' : '%'})</text>${lines}<text x="50" y="44" text-anchor="end" font-size="11">${format(max)}</text><text x="50" y="180" text-anchor="end" font-size="11">${format(min)}</text><line x1="58" x2="728" y1="184" y2="184" stroke="#cbd5e1"/><path d="${path}" fill="none" stroke="#2d7ccb" stroke-width="2.5"/><circle cx="${x(last.limit)}" cy="${y(values.at(-1)!)}" r="5" fill="#ea7135"><title>상한 없음: ${format(values.at(-1)!)}${unit}, 초기화 ${last.resetCount}명</title></circle>${ticks}<text x="393" y="223" text-anchor="middle" font-size="11">초기화 인원 상한 (명)</text></svg></div>`;
  }).join('')}<details><summary>인원별 수치 표</summary><div class="tcbe-rd-table-wrap"><table><thead><tr><th>상한</th><th>실제 초기화</th>${series.map(({ resource, stat, boardIndex, boardThrough }) => `<th>${resource === 'bokr' ? '보크' : '황크'} ${names.get(stat)}${resource === 'bokr' ? ` ${redistributionBoardLabel({ boardIndex, boardThrough }).replace('차만', '차')}` : ''}</th>`).join('')}</tr></thead><tbody>${curve.points.map(point => `<tr><td>${point.limit}</td><td>${point.resetCount}</td>${series.map(({ resource, stat, boardIndex, boardThrough }) => `<td>${format(readCurveValue(point, resource, stat, boardIndex, boardThrough))}${resource === 'bokr' ? '' : '%'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
