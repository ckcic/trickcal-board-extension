/**
 * 단계별 우선순위 설정 내보내기/가져오기 모달 UI
 */
import type { RedistributionStage } from '../domain/hwangRedistribution.ts';
import { exportRedistributionPreset, parseRedistributionPreset } from '../domain/redistributionPreset.ts';
import { escapeHtml } from './html.ts';

/**
 * 단계 설정 내보내기 모달을 엽니다.
 */
export function openExportPresetModal(parentDialog: HTMLElement, stages: RedistributionStage[]): void {
  const jsonText = exportRedistributionPreset(stages);
  const overlay = document.createElement('div');
  overlay.className = 'tcbe-rd-modal-overlay';
  overlay.innerHTML = `
    <div class="tcbe-rd-modal" role="dialog" aria-modal="true" aria-labelledby="tcbe-rd-export-title">
      <div class="tcbe-rd-modal-header">
        <h3 id="tcbe-rd-export-title">📋 단계별 우선순위 설정 내보내기</h3>
        <button type="button" class="tcbe-rd-modal-close" data-modal-close aria-label="닫기">×</button>
      </div>
      <div class="tcbe-rd-modal-body">
        <p class="tcbe-rd-modal-desc">현재 설정된 <strong>${stages.length}개 단계</strong>를 다른 사람과 공유할 수 있는 JSON 텍스트입니다. 개인 재화 보유량은 제외되며 목표 단계만 포함됩니다.</p>
        <div class="tcbe-rd-modal-tools">
          <button type="button" class="tcbe-rd-modal-tool-btn" data-download-preset>💾 JSON 파일로 다운로드</button>
        </div>
        <textarea class="tcbe-rd-json-area" readonly aria-label="단계 설정 JSON" rows="12">${escapeHtml(jsonText)}</textarea>
        <div class="tcbe-rd-modal-status" data-status aria-live="polite"></div>
      </div>
      <div class="tcbe-rd-modal-footer">
        <button type="button" class="tcbe-rd-modal-btn tcbe-rd-btn-primary" data-copy-preset>📋 클립보드에 복사</button>
        <button type="button" class="tcbe-rd-modal-btn" data-modal-close>닫기</button>
      </div>
    </div>
  `;

  const textarea = overlay.querySelector<HTMLTextAreaElement>('textarea')!;
  const statusEl = overlay.querySelector<HTMLElement>('[data-status]')!;
  const copyBtn = overlay.querySelector<HTMLButtonElement>('[data-copy-preset]')!;
  const downloadBtn = overlay.querySelector<HTMLButtonElement>('[data-download-preset]')!;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });

  overlay.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', close);
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      statusEl.textContent = '✓ 클립보드에 복사되었습니다! 원하는 곳에 붙여넣어 공유하세요.';
      statusEl.className = 'tcbe-rd-modal-status tcbe-rd-status-success';
      const originalText = copyBtn.textContent;
      copyBtn.textContent = '✓ 복사 완료';
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    } catch {
      textarea.select();
      statusEl.textContent = '클립보드 접근이 차단되었습니다. 텍스트가 전체 선택되었으니 Ctrl+C를 눌러 복사하세요.';
      statusEl.className = 'tcbe-rd-modal-status tcbe-rd-status-warning';
    }
  });

  downloadBtn.addEventListener('click', () => {
    try {
      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = `tcbe_preset_${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
      statusEl.textContent = '✓ JSON 파일이 다운로드되었습니다.';
      statusEl.className = 'tcbe-rd-modal-status tcbe-rd-status-success';
    } catch {
      statusEl.textContent = '파일 다운로드에 실패했습니다. 위의 텍스트를 직접 복사하세요.';
      statusEl.className = 'tcbe-rd-modal-status tcbe-rd-status-error';
    }
  });

  textarea.addEventListener('focus', () => {
    textarea.select();
  });

  parentDialog.appendChild(overlay);
  setTimeout(() => textarea.focus(), 50);
}

/**
 * 단계 설정 가져오기 모달을 엽니다.
 */
export function openImportPresetModal(
  parentDialog: HTMLElement,
  onImport: (stages: RedistributionStage[]) => void
): void {
  const overlay = document.createElement('div');
  overlay.className = 'tcbe-rd-modal-overlay';
  overlay.innerHTML = `
    <div class="tcbe-rd-modal" role="dialog" aria-modal="true" aria-labelledby="tcbe-rd-import-title">
      <div class="tcbe-rd-modal-header">
        <h3 id="tcbe-rd-import-title">📥 단계별 우선순위 설정 가져오기</h3>
        <button type="button" class="tcbe-rd-modal-close" data-modal-close aria-label="닫기">×</button>
      </div>
      <div class="tcbe-rd-modal-body">
        <p class="tcbe-rd-modal-desc">공유받은 JSON 텍스트를 붙여넣거나 파일을 선택한 뒤 [적용하기]를 누르면 현재 단계 목록이 교체됩니다.<br><small style="color:#64748b;">(소지 골드, 물뿌리개, 미사용 황크/보크 등 개인 재화는 그대로 유지됩니다.)</small></p>
        <div class="tcbe-rd-modal-tools">
          <button type="button" class="tcbe-rd-modal-tool-btn" data-paste-clipboard>📋 클립보드에서 붙여넣기</button>
          <button type="button" class="tcbe-rd-modal-tool-btn" data-select-file>📁 JSON 파일 열기</button>
          <input type="file" data-file-input accept=".json,application/json" style="display:none" aria-hidden="true">
        </div>
        <textarea class="tcbe-rd-json-area" placeholder="여기에 공유받은 JSON 코드를 붙여넣거나 .json 파일을 끌어다 놓으세요..." aria-label="단계 설정 JSON 입력" rows="11"></textarea>
        <div class="tcbe-rd-modal-status" data-status aria-live="polite"></div>
      </div>
      <div class="tcbe-rd-modal-footer">
        <button type="button" class="tcbe-rd-modal-btn tcbe-rd-btn-primary" data-apply-preset>적용하기</button>
        <button type="button" class="tcbe-rd-modal-btn" data-modal-close>취소</button>
      </div>
    </div>
  `;

  const textarea = overlay.querySelector<HTMLTextAreaElement>('textarea')!;
  const statusEl = overlay.querySelector<HTMLElement>('[data-status]')!;
  const pasteBtn = overlay.querySelector<HTMLButtonElement>('[data-paste-clipboard]')!;
  const selectFileBtn = overlay.querySelector<HTMLButtonElement>('[data-select-file]')!;
  const fileInput = overlay.querySelector<HTMLInputElement>('[data-file-input]')!;
  const applyBtn = overlay.querySelector<HTMLButtonElement>('[data-apply-preset]')!;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });

  overlay.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', close);
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        textarea.value = text;
        validateInput();
      } else {
        statusEl.textContent = '클립보드가 비어 있습니다.';
        statusEl.className = 'tcbe-rd-modal-status tcbe-rd-status-warning';
      }
    } catch {
      statusEl.textContent = '클립보드 읽기 권한이 없습니다. 텍스트 상자에 직접 Ctrl+V로 붙여넣으세요.';
      statusEl.className = 'tcbe-rd-modal-status tcbe-rd-status-warning';
      textarea.focus();
    }
  });

  const loadFileContent = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        textarea.value = reader.result;
        validateInput();
      }
    };
    reader.onerror = () => {
      statusEl.textContent = '파일을 읽는 도중 오류가 발생했습니다.';
      statusEl.className = 'tcbe-rd-modal-status tcbe-rd-status-error';
    };
    reader.readAsText(file);
  };

  selectFileBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      loadFileContent(file);
      fileInput.value = '';
    }
  });

  // 드래그 앤 드롭 파일 로드 지원
  textarea.addEventListener('dragover', event => {
    event.preventDefault();
    textarea.classList.add('tcbe-rd-drag-over');
  });

  textarea.addEventListener('dragleave', () => {
    textarea.classList.remove('tcbe-rd-drag-over');
  });

  textarea.addEventListener('drop', event => {
    event.preventDefault();
    textarea.classList.remove('tcbe-rd-drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      loadFileContent(file);
    }
  });

  const validateInput = (): RedistributionStage[] | null => {
    const raw = textarea.value.trim();
    if (!raw) {
      statusEl.textContent = '';
      statusEl.className = 'tcbe-rd-modal-status';
      return null;
    }
    const stages = parseRedistributionPreset(raw);
    if (!stages) {
      statusEl.textContent = '⚠️ 올바른 단계 설정 JSON 형식이 아니거나 미지원 버전입니다.';
      statusEl.className = 'tcbe-rd-modal-status tcbe-rd-status-error';
      return null;
    }
    statusEl.textContent = `✓ 유효한 설정입니다. (총 ${stages.length}개 단계)`;
    statusEl.className = 'tcbe-rd-modal-status tcbe-rd-status-success';
    return stages;
  };

  textarea.addEventListener('input', validateInput);

  applyBtn.addEventListener('click', () => {
    const stages = validateInput();
    if (!stages) {
      if (!textarea.value.trim()) {
        statusEl.textContent = 'JSON 텍스트를 입력하거나 파일을 선택해 주세요.';
        statusEl.className = 'tcbe-rd-modal-status tcbe-rd-status-error';
      }
      textarea.focus();
      return;
    }
    onImport(stages);
    close();
  });

  parentDialog.appendChild(overlay);
  setTimeout(() => textarea.focus(), 50);
}
