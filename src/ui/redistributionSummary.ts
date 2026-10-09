import { redistributionResourceIcon, redistributionBoardLabel } from './redistributionResource.ts';
/** 단계는 묶어서, 최종 배치는 스탯당 한 줄로 보여준다. */
import { STAT_META_LIST, NODE_TYPE } from '../domain/boardProgress.ts';
import { getHwangTargetValue, readBokrValues, type RedistributionPlan, type RedistributionStageResult, type RedistributionStat } from '../domain/hwangRedistribution.ts';
import { getRedistributionStatUnit } from '../domain/hwangStatLimits.ts';

const format = (value: number) => Number(value.toFixed(1)).toLocaleString('ko-KR');
const names = new Map<RedistributionStat, string>(STAT_META_LIST.map(meta => [meta.key, meta.nameKo]));
names.set('attack', '공격력');
const resourceIcon = (bokr: boolean) => redistributionResourceIcon(bokr ? 'bokr' : 'hwang');

export function renderRedistributionSummary(plan: RedistributionPlan, stages: RedistributionStageResult[]): string {
  const stageRows = stages.map((stage, index) => {
    const bokr = stage.resource === 'bokr', unit = bokr ? '칸' : '%';
    const lines = (value: (target: RedistributionStageResult['targets'][number]) => string) =>
      stage.targets.map(target => `<div class="tcbe-rd-line">${names.get(target.stat)} ${value(target)}</div>`).join('');
    const order = `${bokr ? `${redistributionBoardLabel(stage)} · ` : ''}${stage.allowBlocked ? '막힌 경로 포함' : '막힌 경로 제외'} (황크 방어력·치저) · ${stage.allowGates ? '관문 개방 포함' : '현재 관문'}`;
    return `<tr><th>${index + 1}단계<small>${resourceIcon(bokr)}</small></th><td>${order}</td><td>${lines(target => `${target.all ? '전부 · ' : ''}${format(target.target)}${unit}`)}</td><td>${lines(target => `${format(target.before)}${unit}`)}</td><td>${lines(target => `${format(target.after)}${unit}`)}</td></tr>`;
  }).join('');
  const statRows = (['hwang', 'bokr'] as const).map(resource => {
    const bokr = resource === 'bokr';
    const choices: RedistributionStat[] = bokr ? STAT_META_LIST.map(meta => meta.key) : ['attack', ...STAT_META_LIST.filter(meta => !['atk_phys', 'atk_mag'].includes(meta.key)).map(meta => meta.key)];
    return choices.map(stat => {
      const entries = plan.nodes.filter(entry => getHwangTargetValue(bokr ? entry.bokrStats : entry.stats, stat) > 0);
      const original = entries.filter(entry => entry.picked), selected = entries.filter(entry => plan.selected.has(entry.key));
      const scopedGoals = stages.filter(stage => (stage.resource === 'bokr') === bokr).flatMap(stage => stage.targets.filter(target => target.stat === stat).map(target => ({ board: stage.boardIndex, through: stage.boardThrough, value: target.target })));
      const goals = scopedGoals.map(goal => goal.value);
      if (!goals.length && !original.length && !selected.length) return '';
      const boardGoals = [0, 1, 2].map(board => Math.max(0, ...scopedGoals.filter(goal => goal.board === board).map(goal => goal.value)));
      const cumulativeGoals = [0, 1, 2].map(board => Math.max(0, ...scopedGoals.filter(goal => goal.through === board || (board === 2 && goal.through === undefined && goal.board === undefined)).map(goal => goal.value)));
      let target = 0, missing = 0, cumulativeCount = 0;
      for (let board = 0; board < 3; board++) {
        const count = selected.filter(entry => entry.boardIndex === board).length;
        cumulativeCount += count;
        target = Math.max(target + boardGoals[board]!, cumulativeGoals[board]!);
        missing = Math.max(missing + Math.max(0, boardGoals[board]! - count), cumulativeGoals[board]! - cumulativeCount);
      }
      const value = bokr ? selected.length : getHwangTargetValue(plan.after, stat);
      const before = bokr ? original.length : getHwangTargetValue(plan.before, stat);
      if (!bokr) missing = Math.ceil(Math.max(0, target - value) / getRedistributionStatUnit(stat));
      // Global totals can include nodes outside a stage's gate/blocked-path scope.
      missing = Math.max(missing, ...stages.filter(stage => (stage.resource === 'bokr') === bokr).flatMap(stage =>
        stage.targets.filter(goal => goal.stat === stat).map(goal => Math.ceil(Math.max(0, goal.target - goal.after) / (bokr ? 1 : getRedistributionStatUnit(stat))))));
      const byBoard = [0, 1, 2].map(board => `<td>${selected.filter(entry => entry.boardIndex === board).length} / ${entries.filter(entry => entry.boardIndex === board).length}</td>`).join('');
      const cost = selected.reduce((sum, entry) => sum + (bokr ? entry.cost.epicCrayon : entry.cost.ultraCrayon), 0);
      const actual = bokr ? selected.reduce((sum, entry) => sum + getHwangTargetValue(readBokrValues(entry.node), stat), 0) : 0;
      return `<tr><th>${resourceIcon(bokr)} ${names.get(stat)}</th><td>${goals.length ? `${Math.ceil(target / (bokr ? 1 : getRedistributionStatUnit(stat)))}칸` : '—'}${bokr ? [...boardGoals.map((goal, board) => goal ? `<small>${board + 1}차만 ${goal}칸</small>` : ''), ...cumulativeGoals.map((goal, board) => goal ? `<small>${redistributionBoardLabel({ boardThrough: board })} ${goal}칸</small>` : '')].join('') : ''}</td>${byBoard}<td>${bokr ? `+${format(actual)} <small>(${value}칸)</small>` : `${format(value)}%`}${missing ? ` <small class="tcbe-rd-short">(${missing}칸 부족)</small>` : ''}</td><td class="${value < before ? 'tcbe-rd-short' : 'tcbe-rd-positive'}">${value >= before ? '+' : ''}${selected.length - original.length}칸</td><td>${resourceIcon(bokr)}${format(cost)}</td></tr>`;
    }).join('');
  }).join('');
  return `<h3>1. 단계별 목표 요약</h3><div class="tcbe-rd-table-wrap"><table class="tcbe-rd-stage-summary"><thead><tr><th>단계</th><th>대상 보드·경로</th><th>목표</th><th>현재</th><th>추천</th></tr></thead><tbody>${stageRows}</tbody></table></div>
    <h3>2. 스탯별 배치</h3><p class="tcbe-rd-caption">차수별 추천 칸 / 계산에 포함된 보드의 전체 칸. 미개방 꽃잎도 포함합니다. 같은 범위의 목표는 최댓값이며, 1차와 1~2차처럼 겹치는 누적 목표는 중복 합산하지 않습니다. 부족량은 단계별 관문·막힌 경로 범위도 반영합니다. 보크 결과는 원본 노드의 정수 스탯 합계이며 황크 백분율과 별개입니다.</p>
    <div class="tcbe-rd-table-wrap"><table><thead><tr><th>재화·스탯</th><th>목표</th><th>1차</th><th>2차</th><th>3차</th><th>배치 결과 · 목표 부족</th><th>지금 대비</th><th>배치 재화</th></tr></thead><tbody>${statRows}</tbody></table></div>`;
}
