import { formatNumber } from '../common/format.ts';
import { renderResourceIcon } from '../common/resources.ts';
import { redistributionBoardLabel } from './redistributionResource.ts';
/** 단계는 묶어서, 최종 배치는 스탯당 한 줄로 보여준다. */
import { STAT_META_LIST } from '../../domain/boardProgress.ts';
import { getHwangTargetValue, readBokrValues, type RedistributionNode, type RedistributionPlan, type RedistributionStageResult, type RedistributionStat } from '../../domain/hwangRedistribution.ts';
import { getRedistributionStatUnit } from '../../domain/hwangStatLimits.ts';

const names = new Map<RedistributionStat, string>(STAT_META_LIST.map(meta => [meta.key, meta.nameKo]));
names.set('attack', '공격력');
const resourceIcon = (bokr: boolean) => renderResourceIcon(bokr ? 'bokr' : 'hwang');

const HWANG_CHOICES: RedistributionStat[] = [
  'attack',
  ...STAT_META_LIST.filter(meta => !['atk_phys', 'atk_mag'].includes(meta.key)).map(meta => meta.key),
];
const BOKR_CHOICES: RedistributionStat[] = STAT_META_LIST.map(meta => meta.key);

export function renderRedistributionSummary(plan: RedistributionPlan, stages: RedistributionStageResult[]): string {
  const stageRows = stages.map((stage, index) => {
    const bokr = stage.resource === 'bokr', unit = bokr ? '칸' : '%';
    const lines = (value: (target: RedistributionStageResult['targets'][number]) => string) =>
      stage.targets.map(target => `<div class="tcbe-rd-line">${names.get(target.stat)} ${value(target)}</div>`).join('');
    const order = `${bokr ? `${redistributionBoardLabel(stage)} · ` : ''}${stage.allowBlocked ? '막힌 경로 포함' : '막힌 경로 제외'} (황크 방어력·치저) · ${stage.allowGates ? '관문 개방 포함' : '현재 관문'}`;
    return `<tr><th>${index + 1}단계<small>${resourceIcon(bokr)}</small></th><td>${order}</td><td>${lines(target => `${target.all ? '전부 · ' : ''}${formatNumber(target.target)}${unit}`)}</td><td>${lines(target => `${formatNumber(target.before)}${unit}`)}</td><td>${lines(target => `${formatNumber(target.after)}${unit}`)}</td></tr>`;
  }).join('');

  // 전체 노드를 1회만 순회하여 재화·스탯별 엔트리 목록을 사전 인덱싱한다.
  const hwangByStat = new Map<RedistributionStat, RedistributionNode[]>(HWANG_CHOICES.map(s => [s, []]));
  const bokrByStat = new Map<RedistributionStat, RedistributionNode[]>(BOKR_CHOICES.map(s => [s, []]));
  for (const entry of plan.nodes) {
    for (const stat of HWANG_CHOICES) {
      if (getHwangTargetValue(entry.stats, stat) > 0) hwangByStat.get(stat)!.push(entry);
    }
    for (const stat of BOKR_CHOICES) {
      if (getHwangTargetValue(entry.bokrStats, stat) > 0) bokrByStat.get(stat)!.push(entry);
    }
  }

  const statRows = (['hwang', 'bokr'] as const).map(resource => {
    const bokr = resource === 'bokr';
    const choices = bokr ? BOKR_CHOICES : HWANG_CHOICES;
    const byStat = bokr ? bokrByStat : hwangByStat;
    const resourceStages = stages.filter(stage => (stage.resource === 'bokr') === bokr);
    return choices.map(stat => {
      const entries = byStat.get(stat) || [];
      let originalCount = 0;
      const selected: RedistributionNode[] = [];
      const entriesByBoard = [0, 0, 0];
      const selectedByBoard = [0, 0, 0];
      for (const entry of entries) {
        if (entry.picked) originalCount++;
        entriesByBoard[entry.boardIndex] = (entriesByBoard[entry.boardIndex] || 0) + 1;
        if (plan.selected.has(entry.key)) {
          selected.push(entry);
          selectedByBoard[entry.boardIndex] = (selectedByBoard[entry.boardIndex] || 0) + 1;
        }
      }
      const scopedGoals = resourceStages.flatMap(stage => stage.targets.filter(target => target.stat === stat).map(target => ({ board: stage.boardIndex, through: stage.boardThrough, value: target.target })));
      const goals = scopedGoals.map(goal => goal.value);
      if (!goals.length && !originalCount && !selected.length) return '';
      const boardGoals = [0, 1, 2].map(board => Math.max(0, ...scopedGoals.filter(goal => goal.board === board).map(goal => goal.value)));
      const cumulativeGoals = [0, 1, 2].map(board => Math.max(0, ...scopedGoals.filter(goal => goal.through === board || (board === 2 && goal.through === undefined && goal.board === undefined)).map(goal => goal.value)));
      let target = 0, missing = 0, cumulativeCount = 0;
      for (let board = 0; board < 3; board++) {
        const count = selectedByBoard[board]!;
        cumulativeCount += count;
        target = Math.max(target + boardGoals[board]!, cumulativeGoals[board]!);
        missing = Math.max(missing + Math.max(0, boardGoals[board]! - count), cumulativeGoals[board]! - cumulativeCount);
      }
      const value = bokr ? selected.length : getHwangTargetValue(plan.after, stat);
      const before = bokr ? originalCount : getHwangTargetValue(plan.before, stat);
      if (!bokr) missing = Math.ceil(Math.max(0, target - value) / getRedistributionStatUnit(stat));
      // 전체 합계에는 특정 단계의 관문·막힌 경로 범위 밖 노드가 포함될 수 있으므로 단계별 부족량도 함께 반영한다.
      missing = Math.max(missing, ...resourceStages.flatMap(stage =>
        stage.targets.filter(goal => goal.stat === stat).map(goal => Math.ceil(Math.max(0, goal.target - goal.after) / (bokr ? 1 : getRedistributionStatUnit(stat))))));
      const byBoard = [0, 1, 2].map(board => `<td>${selectedByBoard[board]} / ${entriesByBoard[board]}</td>`).join('');
      const cost = selected.reduce((sum, entry) => sum + (bokr ? entry.cost.epicCrayon : entry.cost.ultraCrayon), 0);
      const actual = bokr ? selected.reduce((sum, entry) => sum + getHwangTargetValue(readBokrValues(entry.node), stat), 0) : 0;
      return `<tr><th>${resourceIcon(bokr)} ${names.get(stat)}</th><td>${goals.length ? `${Math.ceil(target / (bokr ? 1 : getRedistributionStatUnit(stat)))}칸` : '—'}${bokr ? [...boardGoals.map((goal, board) => goal ? `<small>${board + 1}차만 ${goal}칸</small>` : ''), ...cumulativeGoals.map((goal, board) => goal ? `<small>${redistributionBoardLabel({ boardThrough: board })} ${goal}칸</small>` : '')].join('') : ''}</td>${byBoard}<td>${bokr ? `+${formatNumber(actual)} <small>(${value}칸)</small>` : `${formatNumber(value)}%`}${missing ? ` <small class="tcbe-rd-short">(${missing}칸 부족)</small>` : ''}</td><td class="${value < before ? 'tcbe-rd-short' : 'tcbe-rd-positive'}">${value >= before ? '+' : ''}${selected.length - originalCount}칸</td><td>${resourceIcon(bokr)}${formatNumber(cost)}</td></tr>`;
    }).join('');
  }).join('');
  return `<h3 id="tcbe-sec-stages">1. 단계별 목표 요약</h3><div class="tcbe-rd-table-wrap"><table class="tcbe-rd-stage-summary"><thead><tr><th>단계</th><th>대상 보드·경로</th><th>목표</th><th>현재</th><th>추천</th></tr></thead><tbody>${stageRows}</tbody></table></div>
    <h3 id="tcbe-sec-distribution">2. 스탯별 배치</h3><p class="tcbe-rd-caption">차수별 추천 칸 / 계산에 포함된 보드의 전체 칸. 미개방 꽃잎도 포함합니다. 같은 범위의 목표는 최댓값이며, 1차와 1~2차처럼 겹치는 누적 목표는 중복 합산하지 않습니다. 부족량은 단계별 관문·막힌 경로 범위도 반영합니다. 보크 결과는 원본 노드의 정수 스탯 합계이며 황크 백분율과 별개입니다.</p>
    <div class="tcbe-rd-table-wrap"><table><thead><tr><th>재화·스탯</th><th>목표</th><th>1차</th><th>2차</th><th>3차</th><th>배치 결과 · 목표 부족</th><th>지금 대비</th><th>배치 재화</th></tr></thead><tbody>${statRows}</tbody></table></div>`;
}
