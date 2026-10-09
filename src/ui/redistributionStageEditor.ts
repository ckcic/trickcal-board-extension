import { redistributionResourceIcon } from './redistributionResource.ts';
/** 단계별 목표 편집 UI. 같은 스탯은 서로 다른 단계에서 반복할 수 있다. */
import { STAT_META_LIST } from '../domain/boardProgress.ts';
import type { RedistributionStage, RedistributionStat } from '../domain/hwangRedistribution.ts';
import { getRedistributionStatUnit, roundRedistributionTarget, type HwangStatLimits } from '../domain/hwangStatLimits.ts';

const stats: Array<[RedistributionStat, string]> = [
  ['attack', '공격력 (물공·마공)'],
  ...STAT_META_LIST.filter(meta => !['atk_phys', 'atk_mag'].includes(meta.key)).map(meta => [meta.key, meta.nameKo] as [RedistributionStat, string]),
];
export const getRedistributionStageStats = (stage: RedistributionStage): Array<[RedistributionStat, string]> =>
  stage.resource === 'bokr' ? STAT_META_LIST.map(meta => [meta.key, meta.nameKo]) : stats;

export function renderStageTargetHint(stat: RedistributionStat, bokr: boolean, limits?: HwangStatLimits, boardThrough?: number): string {
  return `${bokr ? `1칸당 +${STAT_META_LIST.find(meta => meta.key === stat)?.valuePerNode ?? 0}` : `${getRedistributionStatUnit(stat)}%씩`}${limits ? boardThrough === undefined ? ` · 최대 ${limits[stat].total}칸 · 해금 ${limits[stat].unlocked}칸` : ` · 선택 범위 최대 ${limits[stat].byBoard.slice(0, boardThrough + 1).reduce((a, b) => a + b, 0)}칸` : ''}`;
}

export function renderHwangStatLimits(limits: HwangStatLimits, resource: 'hwang' | 'bokr' = 'hwang'): string {
  return `<details class="tcbe-rd-limits"><summary>스탯별 최대 ${resource === 'bokr' ? '보크' : '황크'} 칸 수</summary>
    <p>보유 사도 기준입니다. 전체 최대에는 잠긴 보드·꽃잎도 포함하며, 현재 해금 범위는 열린 보드·꽃잎 기준입니다. 경로·예산 제한을 적용하기 전 칸 수입니다.</p>
    <div class="tcbe-rd-table-wrap"><table><thead><tr><th>스탯</th><th>1차</th><th>2차</th><th>3차</th><th>전체 최대</th><th>현재 해금 범위</th></tr></thead><tbody>${getRedistributionStageStats({ resource, targets: [], allowBlocked: true }).map(([stat, name]) => {
      const limit = limits[stat];
      return `<tr><th>${name}</th>${[0, 1, 2].map(index => `<td>${limit.byBoard[index] || 0}칸</td>`).join('')}<td>${limit.total}칸</td><td>${limit.unlocked}칸</td></tr>`;
    }).join('')}</tbody></table></div></details>`;
}

export function renderRedistributionStageEditor(stages: RedistributionStage[], limits?: HwangStatLimits, bokrLimits?: HwangStatLimits, allGoal?: (stage: RedistributionStage, stat: RedistributionStat) => number): string {
  return stages.map((stage, index) => {
    const bokr = stage.resource === 'bokr', choices = getRedistributionStageStats(stage), scope = bokr ? bokrLimits : limits;
    return `<fieldset class="tcbe-rd-stage" data-stage="${index}">
    <legend>${index + 1}단계</legend>
    <div class="tcbe-rd-stage-actions">
      <button type="button" data-stage-action="up" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="${index + 1}단계 위로">↑</button>
      <button type="button" data-stage-action="down" data-index="${index}" ${index === stages.length - 1 ? 'disabled' : ''} aria-label="${index + 1}단계 아래로">↓</button>
      <button type="button" data-stage-action="delete" data-index="${index}" ${stages.length === 1 ? 'disabled' : ''} aria-label="${index + 1}단계 삭제">단계 삭제</button>
    </div>
    <div class="tcbe-rd-stage-options"><div class="tcbe-rd-resource-choice" role="group" aria-label="${index + 1}단계 재화">${(['hwang', 'bokr'] as const).map(resource => `<label title="${resource === 'hwang' ? '황크' : '보크'}"><input type="radio" data-resource name="stage-resource-${index}" value="${resource}" ${(stage.resource || 'hwang') === resource ? 'checked' : ''} aria-label="${index + 1}단계 ${resource === 'hwang' ? '황크' : '보크'}">${redistributionResourceIcon(resource)}</label>`).join('')}</div>
      ${bokr ? `<label>대상 보드 <select data-board-through aria-label="${index + 1}단계 대상 보드">${[0, 1, 2].map(board => `<option value="${board}" ${board === (stage.boardThrough ?? stage.boardIndex ?? 0) ? 'selected' : ''}>${board === 0 ? '1차' : `1~${board + 1}차`}</option>`).join('')}</select></label><small>선택한 차수까지 누적한 칸 수</small>` : '<small>연결에 필요한 보크만 사용</small>'}</div>
    ${stage.targets.map((target, targetIndex) => `<div class="tcbe-rd-target" data-target="${targetIndex}">
      <select data-stat aria-label="${index + 1}단계 ${targetIndex + 1}번 스탯">${choices.map(([stat, name]) => `<option value="${stat}" ${stat === target.stat ? 'selected' : ''}>${name}</option>`).join('')}</select>
      <select data-mode aria-label="${index + 1}단계 ${targetIndex + 1}번 목표 방식"><option value="percent" ${target.target !== null ? 'selected' : ''}>${bokr ? '목표 칸 수' : '목표 %'}</option><option value="all" ${target.target === null ? 'selected' : ''}>전부</option></select>
      <input data-value type="number" min="0" max="${bokr ? 100000 : Math.floor(100000 / getRedistributionStatUnit(target.stat)) * getRedistributionStatUnit(target.stat)}" step="${bokr ? 1 : getRedistributionStatUnit(target.stat)}" value="${target.target === null ? (allGoal?.(stage, target.stat) ?? 0) : Number.isFinite(target.target) ? bokr ? Math.ceil(target.target) : roundRedistributionTarget(target.target, target.stat) : ''}" ${target.target === null ? 'disabled' : 'required'} aria-label="${index + 1}단계 ${targetIndex + 1}번 목표 ${bokr ? '칸 수' : '백분율'}">
      <span>${bokr ? '칸' : '%'}</span><small data-limit>${renderStageTargetHint(target.stat, bokr, scope, bokr ? stage.boardThrough ?? stage.boardIndex ?? 0 : undefined)}${bokr ? ` · 목표 +${((target.target ?? allGoal?.(stage, target.stat) ?? 0) * (STAT_META_LIST.find(meta => meta.key === target.stat)?.valuePerNode ?? 0)).toLocaleString('ko-KR')} (기본 수치)` : ''}</small>
      <button type="button" data-stage-action="remove-target" data-index="${index}" data-target-index="${targetIndex}" ${stage.targets.length === 1 ? 'disabled' : ''} aria-label="${index + 1}단계 ${targetIndex + 1}번 스탯 삭제">삭제</button>
    </div>`).join('')}
    <div class="tcbe-rd-stage-footer"><button type="button" data-stage-action="add-target" data-index="${index}" ${stage.targets.length >= choices.length ? 'disabled' : ''}>스탯 추가</button>
      <label><input data-blocked type="checkbox" ${stage.allowBlocked ? 'checked' : ''}> 막힌 경로 포함 (황크 방어력·치저)</label>
      <label><input data-gates type="checkbox" ${stage.allowGates ? 'checked' : ''}> 관문 개방 포함</label></div>
  </fieldset>`;
  }).join('');
}

export function readRedistributionStages(container: HTMLElement): RedistributionStage[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-stage]')).map(stage => ({
    resource: stage.querySelector<HTMLInputElement>('[data-resource]:checked')!.value as 'hwang' | 'bokr',
    boardThrough: stage.querySelector<HTMLSelectElement>('[data-board-through]') ? Number(stage.querySelector<HTMLSelectElement>('[data-board-through]')!.value) : undefined,
    allowBlocked: stage.querySelector<HTMLInputElement>('[data-blocked]')!.checked,
    allowGates: stage.querySelector<HTMLInputElement>('[data-gates]')!.checked,
    targets: Array.from(stage.querySelectorAll<HTMLElement>('[data-target]')).map(target => ({
      stat: target.querySelector<HTMLSelectElement>('[data-stat]')!.value as RedistributionStat,
      target: target.querySelector<HTMLSelectElement>('[data-mode]')!.value === 'all' ? null : target.querySelector<HTMLInputElement>('[data-value]')!.valueAsNumber,
    })),
  }));
}
