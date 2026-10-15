import type { RedistributionStage } from './redistributionTypes.ts';

/** 참고 이미지의 순서는 수정 가능한 예시이며, 전부 목표는 계정 보드로 계산한다. */
export function createExampleRedistributionStages(): RedistributionStage[] {
  return [
    { allowBlocked: false, targets: [{ stat: 'attack', target: null }] },
    { allowBlocked: false, targets: [{ stat: 'crit', target: 500 }, { stat: 'crit_dmg', target: 500 }, { stat: 'crit_dmg_res', target: 500 }] },
    { allowBlocked: false, targets: [{ stat: 'hp', target: 1500 }] },
    { allowBlocked: false, targets: [{ stat: 'crit', target: 700 }, { stat: 'crit_dmg', target: 700 }] },
    { allowBlocked: true, targets: [{ stat: 'attack', target: null }] },
    { allowBlocked: false, targets: [{ stat: 'hp', target: 2000 }, { stat: 'crit', target: 900 }, { stat: 'crit_dmg', target: 900 }] },
    { allowBlocked: true, targets: [{ stat: 'hp', target: 2000 }, { stat: 'crit', target: 900 }, { stat: 'crit_dmg', target: 900 }, { stat: 'crit_dmg_res', target: 500 }] },
  ];
}
