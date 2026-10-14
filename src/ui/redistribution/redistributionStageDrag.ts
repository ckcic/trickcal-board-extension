/** 단계 드래그와 가장자리 자동 스크롤의 이벤트·프레임 수명을 관리한다. */
export function setupRedistributionStageDrag(targetList: HTMLElement, settingsPanel: HTMLElement | null,
  moveStage: (sourceIndex: number, targetIndex: number, after: boolean) => void): () => void {
  const cleanups: Array<() => void> = [];
  function on<K extends keyof HTMLElementEventMap>(target: HTMLElement | null, type: K,
    handler: (event: HTMLElementEventMap[K]) => void) {
    target?.addEventListener(type, handler);
    cleanups.push(() => target?.removeEventListener(type, handler));
  }
  // 우선순위 단계 드래그 앤 드롭 순서 변경 및 가장자리 자동 스크롤(Auto Scroll)
  let dragSourceIndex: number | null = null;
  let autoScrollRafId: number | null = null;
  let autoScrollSpeed = 0;


  const stopAutoScroll = () => {
    if (autoScrollRafId !== null) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }
    autoScrollSpeed = 0;
  };

  const autoScrollLoop = () => {
    if (autoScrollSpeed !== 0 && settingsPanel) {
      settingsPanel.scrollTop += autoScrollSpeed;
      autoScrollRafId = requestAnimationFrame(autoScrollLoop);
    } else {
      stopAutoScroll();
    }
  };

  const updateAutoScroll = (clientY: number) => {
    if (!settingsPanel || dragSourceIndex === null) {
      stopAutoScroll();
      return;
    }
    const rect = settingsPanel.getBoundingClientRect();
    const edgeThreshold = 80;
    const maxSpeed = 16;

    if (clientY < rect.top + edgeThreshold && clientY >= rect.top - 60) {
      const distance = Math.max(0, clientY - rect.top);
      const factor = (edgeThreshold - distance) / edgeThreshold;
      autoScrollSpeed = -Math.max(3, Math.round(Math.min(1, factor) * maxSpeed));
    } else if (clientY > rect.bottom - edgeThreshold && clientY <= rect.bottom + 60) {
      const distance = Math.max(0, rect.bottom - clientY);
      const factor = (edgeThreshold - distance) / edgeThreshold;
      autoScrollSpeed = Math.max(3, Math.round(Math.min(1, factor) * maxSpeed));
    } else {
      autoScrollSpeed = 0;
    }

    if (autoScrollSpeed !== 0 && autoScrollRafId === null) {
      autoScrollRafId = requestAnimationFrame(autoScrollLoop);
    } else if (autoScrollSpeed === 0 && autoScrollRafId !== null) {
      stopAutoScroll();
    }
  };

  on(settingsPanel, 'dragover', event => {
    if (dragSourceIndex !== null) {
      event.preventDefault();
      updateAutoScroll(event.clientY);
    }
  });

  on(targetList, 'dragstart', event => {
    const stage = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-stage]') : null;
    if (!stage) return;
    dragSourceIndex = Number(stage.dataset.stage);
    stage.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(dragSourceIndex));
    }
  });
  on(targetList, 'dragover', event => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    updateAutoScroll(event.clientY);
    const targetStage = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-stage]') : null;
    if (!targetStage || dragSourceIndex === null) return;
    const rect = targetStage.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    targetList.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
      if (el !== targetStage) el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    if (event.clientY < midY) {
      targetStage.classList.add('drag-over-top');
      targetStage.classList.remove('drag-over-bottom');
    } else {
      targetStage.classList.add('drag-over-bottom');
      targetStage.classList.remove('drag-over-top');
    }
  });
  on(targetList, 'dragleave', event => {
    const targetStage = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-stage]') : null;
    if (targetStage && !targetStage.contains(event.relatedTarget as Node)) {
      targetStage.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  });
  on(targetList, 'drop', event => {
    event.preventDefault();
    stopAutoScroll();
    const targetStage = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-stage]') : null;
    targetList.querySelectorAll('.drag-over-top, .drag-over-bottom, .dragging').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
    const sourceIndex = dragSourceIndex;
    dragSourceIndex = null;
    if (!targetStage || sourceIndex === null) return;
    const targetIndex = Number(targetStage.dataset.stage);
    if (sourceIndex === targetIndex || !Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) return;
    const rect = targetStage.getBoundingClientRect();
    moveStage(sourceIndex, targetIndex, event.clientY > rect.top + rect.height / 2);
    dragSourceIndex = null;
  });
  on(targetList, 'dragend', () => {
    stopAutoScroll();
    targetList.querySelectorAll('.drag-over-top, .drag-over-bottom, .dragging').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
    dragSourceIndex = null;
  });

  return () => {
    stopAutoScroll();
    dragSourceIndex = null;
    cleanups.forEach(cleanup => cleanup());
  };
}
