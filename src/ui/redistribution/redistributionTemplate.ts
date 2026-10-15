import { formatNumber } from '../common/format.ts';
import { renderResourceIcon as resourceIcon } from '../common/resources.ts';
import type { HwangStatLimits } from '../../domain/hwangStatLimits.ts';
import { renderHwangStatLimits } from './redistributionStageEditor.ts';

/** 현재 계정의 예산·범위를 표시하는 재분배 모달 본문을 생성한다. */
export function renderRedistributionTemplate(spentCrayons: number, spentBokr: number, ownedCount: number,
  limits: HwangStatLimits, bokrLimits: HwangStatLimits): string {
  return `
    <div class="tcbe-rd-panels">
      <section role="tabpanel" id="tcbe-panel-settings" aria-labelledby="tcbe-redistribution-dialog-tab-settings" class="tcbe-rd-panel">
        <div class="tcbe-rd-settings-view">
          <p>현재 필터와 관계없이 보유 사도 전체를 계산합니다. 게임이나 노트의 데이터를 변경하지 않습니다.</p>
          <p class="tcbe-rd-notice">초기화해도 열린 관문·꽃잎과 기본 색칠된 1차 시작 칸은 유지됩니다. 지워지는 칸에서 사용한 크레파스 4종·골드만 돌려받으며 물뿌리개는 반환되지 않습니다.</p>
          <form>
            <div class="tcbe-rd-budget-overview">${(['hwang','bokr'] as const).map(resource => `<div>${resourceIcon(resource)} <span>이미 사용 <strong>${formatNumber(resource === 'hwang' ? spentCrayons : spentBokr)}개</strong></span><span>+ 미사용 보유 = 총 <output ${resource === 'hwang' ? 'data-total' : 'data-total-bokr'} aria-live="polite">${formatNumber(resource === 'hwang' ? spentCrayons : spentBokr)}개</output></span></div>`).join('')}</div>
            <div class="tcbe-rd-inputs"><label>${resourceIcon('hwang')} 추가 보유 (미사용) <input aria-label="추가 보유 황크 (미사용)" name="owned" type="number" min="0" max="1000000" step="1" value="0" required></label><label>${resourceIcon('bokr')} 추가 보유 (미사용) <input aria-label="추가 보유 보크 (미사용)" name="bokr" type="number" min="0" max="1000000" step="1" value="0" required></label><label>초기화 인원 상한 <input name="reset" type="number" min="0" max="${ownedCount}" step="1" value="0" required></label></div>
            <div class="tcbe-rd-inputs tcbe-rd-optional-inputs"><label><span class="tcbe-rd-resource-icon icon-gold" aria-hidden="true"></span> 소지 골드 <input name="gold" type="number" min="0" max="2000000000" step="1" placeholder="선택 (생략 가능)"></label><label><span class="tcbe-rd-resource-icon watering-can" aria-hidden="true"></span> 소지 물뿌리개 <input name="watering-can" type="number" min="0" max="100000" step="1" placeholder="선택 (개수)"></label><label><span class="tcbe-rd-resource-icon sunshine-cloud" aria-hidden="true"></span> 소지 햇살구름 <input name="clouds" type="number" min="0" max="1000000" step="1" placeholder="10개 = 1물뿌리개"></label></div>
            <p>황크·보크는 추가 보유량과 초기화 환급분 안에서 사용합니다. 소지 골드와 물뿌리개/햇살구름(10개당 물뿌리개 1개 환산)을 입력하면 차감 후 잔여/부족분을 계산하며, 미입력 시 순수 필요량만 표시합니다.</p>
            ${renderHwangStatLimits(limits)}${renderHwangStatLimits(bokrLimits, 'bokr')}
            <details open data-settings><summary>목표·경로 설정</summary>
            <div class="tcbe-rd-tabs" role="tablist" aria-label="목표 설정 메뉴"><button type="button" role="tab" id="rd-edit-tab" data-settings-tab="edit" aria-controls="rd-edit-panel" aria-selected="true">단계별 우선순위</button><button type="button" role="tab" id="rd-help-tab" data-settings-tab="help" aria-controls="rd-help-panel" aria-selected="false" tabindex="-1">목표·경로 도움말</button></div>
            <section role="tabpanel" id="rd-edit-panel" aria-labelledby="rd-edit-tab"><p>단계 순서대로 목표를 채웁니다. <small style="color:#64748b;">(⠿ 드래그 또는 번호 드롭다운으로 순서 직접 변경)</small></p>
            <div data-targets></div><div class="tcbe-rd-stage-tools"><button type="button" data-add-stage>${resourceIcon('hwang')} 단계 추가</button><button type="button" data-add-bokr-stage>${resourceIcon('bokr')} 단계 추가</button><button type="button" data-examples>예시 7단계로 되돌리기</button><button type="button" data-export-preset class="tcbe-rd-preset-btn" title="현재 단계 목록을 JSON 텍스트로 내보내고 복사합니다">📋 설정 내보내기</button><button type="button" data-import-preset class="tcbe-rd-preset-btn" title="공유받은 단계 설정 JSON을 붙여넣어 가져옵니다">📥 설정 가져오기</button></div></section>
            <section role="tabpanel" id="rd-help-panel" aria-labelledby="rd-help-tab" hidden><h4>목표와 누적 범위</h4><p>황크 공격력은 물공·마공 각각 6%, 나머지는 8% 단위입니다. 보크는 물공·마공을 구분합니다. 1~2차 목표 20칸은 두 차수를 합쳐 20칸이며, 1차 목표와 중복해서 더하지 않습니다.</p><h4>막힌 경로와 관문은 별개입니다</h4><p>막힌 경로는 <strong>황크 방어력(물방·마방)·치저</strong> 칸을 통과해야 하는 경로입니다. 포함을 끄면 색칠 여부와 무관하게 그 황크를 통과하지 않습니다. <strong>보크 방어력·치저는 통과할 수 있습니다.</strong> 기존 칠한 칸을 자동으로 지우지는 않으며 초기화 시 일반칸 복구 경로는 별도로 유지합니다.</p><p>‘관문 개방 포함’을 켜면 잠긴 보드도 경로를 연결해 계산합니다. 필요한 관문의 골드·크레파스와 증명서 등 전용 재화를 결과에 표시합니다. 전용 재화의 보유량과 게임 내 개방 조건은 별도로 확인해야 합니다. 끈 단계는 처음 열려 있던 보드 범위만 목표로 삼습니다.</p><h4>공격력 전부의 계산 범위</h4><div data-availability-container><p style="color:#64748b;font-size:13px;margin:8px 0;">도움말 탭을 열면 공격력 계산 범위를 분석합니다...</p></div><p>모두 보유 사도와 꽃잎 개방을 포함한 경로 기준이며, 예산 적용 전입니다. ‘전체 최대’와 현재 관문에서 가능한 ‘전부’는 다를 수 있습니다.</p></section></details>
            <div class="tcbe-rd-search-mode"><label>계산 방식 <select name="search-mode"><option value="fast">빠른 탐색</option><option value="thorough">상세 탐색 (느림)</option></select></label><small>빠른 탐색은 초기화 조합 비교를 줄입니다. 상세 탐색은 더 좋은 조합을 찾을 수 있지만 오래 걸립니다.</small></div>
            <div class="tcbe-rd-sticky-bar">
              <button type="submit" class="tcbe-btn tcbe-active">추천안 계산</button>
              <button type="button" data-cancel-calculation hidden>계산 취소</button>
              <span data-status role="status" aria-live="polite"></span>
            </div>
          </form>
        </div>
      </section>
      <section role="tabpanel" id="tcbe-panel-result" aria-labelledby="tcbe-tab-result" class="tcbe-rd-panel" hidden>
        <div class="tcbe-rd-result-container">
          <div class="tcbe-rd-result-content" data-result aria-label="재분배 계산 결과">
            <div class="tcbe-rd-empty-placeholder"><p>👈 <strong>[목표·예산 설정]</strong> 탭에서 예산과 목표를 확인한 후<br><strong>[추천안 계산]</strong>을 누르면 여기에 상세 작업 순서와 사도별 보드 지도가 표시됩니다.</p></div>
          </div>
          <nav class="tcbe-rd-toc" aria-label="빠른 이동 목차" data-toc-container hidden>
            <div class="tcbe-rd-toc-header"><strong>빠른 이동 목차</strong></div>
            <div class="tcbe-rd-toc-section">
              <span class="tcbe-rd-toc-category">주요 섹션</span>
              <button type="button" class="tcbe-rd-toc-item" data-toc-target="tcbe-sec-summary">📊 계산 요약 &amp; 재화</button>
              <button type="button" class="tcbe-rd-toc-item" data-toc-target="tcbe-sec-stages">🎯 목표 달성 요약</button>
              <button type="button" class="tcbe-rd-toc-item" data-toc-target="tcbe-sec-orders">🔢 3. 작업 순서</button>
              <button type="button" class="tcbe-rd-toc-item" data-toc-target="tcbe-sec-maps">🗺️ 사도별 지도 전체</button>
            </div>
            <div class="tcbe-rd-toc-section" data-toc-apostles-section>
              <div class="tcbe-rd-toc-category"><span>사도별 바로가기</span><span class="tcbe-rd-toc-count" data-toc-count></span></div>
              <input type="search" class="tcbe-rd-toc-search" data-toc-search placeholder="사도 이름 검색 (초성 지원)" aria-label="사도 이름 검색">
              <div class="tcbe-rd-toc-apostles" data-toc-apostles></div>
            </div>
            <div class="tcbe-rd-toc-footer">
              <button type="button" class="tcbe-rd-toc-top" data-toc-top>↑ 맨 위로</button>
            </div>
          </nav>
        </div>
        <div class="tcbe-rd-mobile-top" data-mobile-top-container hidden>
          <button type="button" class="tcbe-rd-toc-top" data-mobile-top>↑ 맨 위로</button>
        </div>
      </section>
      <section role="tabpanel" id="tcbe-panel-curve" aria-labelledby="tcbe-tab-curve" class="tcbe-rd-panel" hidden>
        <div class="tcbe-rd-curve-preview">
          <h3>초기화 인원별 스탯 미리 계산</h3>
          <p>추천안을 먼저 계산할 필요 없이 현재 예산·목표로 0명부터 전체 인원을 비교합니다. 그래프를 확인한 뒤 초기화 인원 상한을 정하고 추천안을 계산하세요.</p>
          <div class="tcbe-rd-curve-controls"><button type="button" data-curve>인원별 그래프 계산</button><span data-curve-status role="status" aria-live="polite"></span></div>
          <div data-curve-result></div>
        </div>
      </section>
    </div>`;
}
