/** 회수 설정 화면의 체크 매트릭스와 안내 문구 */
import type { RecoveryResource } from '../../domain/boardRecovery.ts';
import { getRecoveryStatOptions, type RecoverySettings } from './boardRecoverySettings.ts';

const resourceName = (resource: RecoveryResource) => resource === 'hwang' ? '황크' : '보크';

function renderRecoveryBoardRow(resource: RecoveryResource, board: number, savedSettings: RecoverySettings): string {
  return `<div class="tcbe-rc-check-row"><strong>${board + 1}차</strong><button type="button" data-all="${resource}:${board}">이 차수 전체 선택</button><div>${getRecoveryStatOptions(resource).map(meta =>
            `<label><input type="checkbox" data-pick="${resource}:${board}:${meta.key}" ${savedSettings.picks.includes(`${resource}:${board}:${meta.key}`) ? 'checked' : ''}>${meta.nameKo}</label>`).join('')}</div></div>`;
}

function renderRecoveryGrid(resource: RecoveryResource, savedSettings: RecoverySettings): string {
  return `<fieldset data-grid="${resource}" ${resource === 'bokr' ? 'hidden' : ''}><legend>${resourceName(resource)} 제거 대상</legend>
          ${[0, 1, 2].map(board => renderRecoveryBoardRow(resource, board, savedSettings)).join('')}
          <button type="button" data-clear="${resource}">${resourceName(resource)} 전체 해제</button></fieldset>`;
}

export function renderRecoveryTemplate(savedSettings: RecoverySettings): string {
  return `
      <p data-selection-summary aria-live="polite"></p><p data-status role="status"></p>
      <section id="tcbe-rc-settings" role="tabpanel" aria-labelledby="tcbe-recovery-dialog-tab-settings">
        <p>회수하고 싶은 칸을 체크하세요. 현재 목록 필터와 관계없이 보유 사도 전체를 계산합니다.</p>
        <p class="tcbe-rc-notice">선택하지 않은 황크·보크는 복구하고, 일반칸은 연결에 필요한 만큼 칠합니다. 게임·노트 데이터에는 적용하지 않습니다.</p>
        <div class="tcbe-rc-toolbar" aria-label="편집할 칸 종류"><button type="button" data-resource="hwang" aria-pressed="true">황크 선택</button><button type="button" data-resource="bokr" aria-pressed="false">보크 선택</button></div>
        ${(['hwang', 'bokr'] as const).map(resource => renderRecoveryGrid(resource, savedSettings)).join('')}
        <p>황크·보크 선택은 함께 적용됩니다. 보크를 회수하려면 해당 보크도 제거 대상으로 체크하세요.</p>
        <label><input type="checkbox" data-flowering ${savedSettings.compareFlowering ? 'checked' : ''}> 닫힌 꽃잎을 여는 만개 우회안도 비교</label>
        <p>만개안은 보크를 아끼는 대신 황크·물뿌리개가 더 필요할 수 있습니다. 이미 열린 꽃잎은 물뿌리개 비용을 다시 더하지 않습니다.</p>
        <div class="tcbe-rc-toolbar"><button type="button" data-calculate>회수량·초기화 순위 계산</button><button type="button" data-cancel hidden>계산 취소</button></div>
      </section>
      <section id="tcbe-rc-results" role="tabpanel" aria-labelledby="tcbe-recovery-dialog-tab-results" hidden>
        <p data-empty>설정 탭에서 제거 대상을 선택하고 계산하세요.</p><div data-output></div>
      </section>
    `;
}
