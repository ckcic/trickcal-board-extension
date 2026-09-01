/**
 * @file sanitizedData.mjs
 * @description テスト用のサニタイズされたモックデータ
 */

export const mockHeroInfo = {
  '10001': {
    name: 'KEY_A_NAME',
    gradeDefault: 3,
    personality: 0, // 순수
  },
  '10002': {
    name: 'KEY_B_NAME',
    gradeDefault: 2,
    personality: 1, // 냉정
  },
  '10003': {
    name: 'KEY_C_NAME',
    gradeDefault: 1,
    personality: 3, // 활발
  },
};

export const mockText = {
  KEY_A_NAME: '테스트사도A',
  KEY_B_NAME: '테스트사도B',
  KEY_C_NAME: '테스트사도C',
};

// 10001: 3차까지 열림, 1차(보크2), 2차(보크4), 3차(보크6)
// 10002: 2차까지 열림
// 10003: 1차만 열림, 보크 모두 획득 (완료 사도)
export const mockMasterBoard = {
  '10001': {
    '0': [
      { id: 1, nodeType: 1, requireItems: [] },
      { id: 2, nodeType: 4, requireItems: [{ item: 610003, value: 3 }] }, // 보크
      { id: 3, nodeType: 4, requireItems: [{ item: 610003, value: 3 }] }, // 보크
      { id: 4, nodeType: 5, requireItems: [{ item: 610004, value: 2 }] }, // 황크
    ],
    '1': [
      { id: 5, nodeType: 4, requireItems: [{ item: 610003, value: 6 }] }, // 보크
      { id: 6, nodeType: 4, requireItems: [{ item: 610003, value: 6 }] }, // 보크
      { id: 7, nodeType: 4, requireItems: [{ item: 610003, value: 6 }] }, // 보크
      { id: 8, nodeType: 4, requireItems: [{ item: 610003, value: 6 }] }, // 보크
    ],
    '2': [
      { id: 9, nodeType: 4, requireItems: [{ item: 610003, value: 9 }] }, // 보크
      { id: 10, nodeType: 4, requireItems: [{ item: 610003, value: 9 }] }, // 보크
      { id: 11, nodeType: 4, requireItems: [{ item: 610003, value: 9 }] }, // 보크
    ],
  },
  '10002': {
    '0': [
      { id: 21, nodeType: 4, requireItems: [{ item: 610003, value: 3 }] },
      { id: 22, nodeType: 4, requireItems: [{ item: 610003, value: 3 }] },
    ],
    '1': [
      { id: 23, nodeType: 4, requireItems: [{ item: 610003, value: 6 }] },
      { id: 24, nodeType: 4, requireItems: [{ item: 610003, value: 6 }] },
    ],
    '2': [
      { id: 25, nodeType: 4, requireItems: [{ item: 610003, value: 9 }] },
    ],
  },
  '10003': {
    '0': [
      { id: 31, nodeType: 4, requireItems: [{ item: 610003, value: 3 }] },
      { id: 32, nodeType: 4, requireItems: [{ item: 610003, value: 3 }] },
    ],
    '1': [
      { id: 33, nodeType: 4, requireItems: [{ item: 610003, value: 6 }] },
    ],
    '2': [
      { id: 34, nodeType: 4, requireItems: [{ item: 610003, value: 9 }] },
    ],
  },
};

export const mockUserApostles = [
  // 10001: 3차까지 열림, step 문자열이 짧은 케이스 (1차: "110", 2차: "10", 3차: "1")
  {
    apostleId: 10001,
    boardSteps: [
      { step: '110' }, // node0(1), node1(1-보크), node2(0-보크), node3(황크-범위밖) -> 보크 1/2
      { step: '10' },  // node0(1-보크), node1(0-보크), node2,3 범위밖 -> 보크 1/4
      { step: '1' },   // node0(1-보크), node1,2 범위밖 -> 보크 1/3
    ],
  },
  // 10002: 2차까지 열림 (3차는 미해금)
  {
    apostleId: 10002,
    boardSteps: [
      { step: '11' }, // 1차 보크 2/2
      { step: '01' }, // 2차 보크 1/2
    ],
  },
  // 10003: 1차만 열림, 보크 모두 획득 (완료)
  {
    apostleId: 10003,
    boardSteps: [
      { step: '11' }, // 1차 보크 2/2 (해금 기준 완료)
    ],
  },
];
