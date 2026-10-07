import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { getNodeStatCategories, STAT_META_LIST } from '../src/domain/boardProgress.ts';

// 개인 진행도는 사용하지 않고 보드·사도·텍스트 마스터만 집계한다.
const input = process.argv[2];
const output = process.argv[3] || 'BOARD_NODES.md';
if (!input) throw new Error('사용법: node scripts/analyze-board-templates.mjs <로컬 데이터 파일> [출력 문서]');
const payload = JSON.parse(await readFile(input, 'utf8'));
const { board, heroInfo, text } = payload?.data?.data || {};
if (!board || !heroInfo || !text) throw new Error('보드·사도·텍스트 마스터가 필요합니다.');
const tribeNames = ['요정', '수인', '엘프', '정령', '유령', '용족', '마녀', '미스틱'];
const statOrder = STAT_META_LIST.map(stat => stat.key);
const range = values => {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  return unique.length === 1 ? String(unique[0]) : unique.join('/');
};
const tally = nodes => Array.from({ length: 8 }, (_, type) => nodes.filter(node => node.nodeType === type).length);
const shape = node => [node.nodeType, node.grid?.x ?? null, node.grid?.y ?? null];
const stats = node => node.stats?.length
  ? node.stats.map(stat => [stat.statType, stat.statValue]).sort((a, b) => a[0] - b[0])
  : (node.displayStat || []).filter(value => value !== 0).map(value => [value, null]).sort((a, b) => a[0] - b[0]);
const costs = node => [node.requireGold || 0, (node.requireItems || []).map(item => [item.item, item.value]).sort((a, b) => a[0] - b[0])];
const signature = (nodes, mode) => JSON.stringify(nodes.map(node => mode === 'shape' ? shape(node) : [...shape(node), stats(node), costs(node)]).map(value => JSON.stringify(value)).sort());
const heroes = Object.entries(board).map(([id, levels]) => {
  const hero = heroInfo[id];
  if (!hero) throw new Error('보드에 대응하는 사도 메타가 없습니다.');
  const boards = Object.entries(levels).sort(([a], [b]) => Number(a) - Number(b)).map(([level, nodes]) => {
    if (!Array.isArray(nodes)) throw new Error('차수별 보드는 노드 배열이어야 합니다.');
    if (nodes.some(node => !Number.isInteger(node.nodeType) || node.nodeType < 0 || node.nodeType > 7)) throw new Error('미등록 노드 타입을 확인해야 합니다.');
    return { level: Number(level) + 1, nodes, counts: tally(nodes), shape: signature(nodes, 'shape'), full: signature(nodes, 'full') };
  });
  return { name: text[hero.name] || hero.name, tribe: hero.tribe, grade: hero.gradeDefault, attack: hero.attackType, boards };
});
const groups = new Map();
for (const hero of heroes) {
  if (!groups.has(hero.tribe)) groups.set(hero.tribe, []);
  groups.get(hero.tribe).push(hero);
}
const sortedGroups = [...groups].sort(([a], [b]) => a - b);
const lines = [
  '# 종족·차수별 보드 노드 구성', '',
  `> 로컬 입력 \`${basename(input)}\`의 마스터 보드 기준입니다. 계정의 보유 여부·성급·칠함 기록·재화 보유량은 사용하지 않았습니다. 신규 패치의 실시간 데이터까지 보장하지 않습니다.`, '',
  `분석 대상: 사도 ${heroes.length}명, 보드 ${heroes.reduce((sum, hero) => sum + hero.boards.length, 0)}개.`, '',
  '## 노드 타입과 판별', '',
  '| nodeType | 종류 | 의미 및 주의 |', '|---:|---|---|',
  '| 0 | 빈칸 | 표시·경로에서 제외하는 슬롯 |',
  '| 1 | 관문 | 다음 차수 해금. requireGold와 관문 조건 재화를 확인 |',
  '| 2 | 시작 | 경로 출발점. 후속 차수 진입에는 앞 관문 해금 필요 |',
  '| 3 | 일반 | 하급·중급 크레파스를 사용하는 일반 스탯 칸 |',
  '| 4 | 보크 | 상급 크레파스 610003. stats의 실제 증가량 사용 |',
  '| 5 | 황크 | 최상급 크레파스 610004를 사용하는 기존 황크 |',
  '| 6 | 확장 황크 | 10/01 추가 황크. 610004로 판별하며 연결 필드도 존재 |',
  '| 7 | 꽃잎 | 만개 물뿌리개 610005. 좌표가 (-1,-1)인 별도 연결 슬롯 포함 |', '',
  '표의 개수는 원본 nodeType 기준입니다. 기능에서는 requireItems의 610003/610004도 대조하므로 nodeType 하나만으로 보크·황크를 확정하지 않습니다. 빈칸과 좌표 없는 꽃잎까지 포함한 API 노드 수는 화면에 놓인 칸 수와 다릅니다.', '',
  '## 종족·차수별 칸 수', '',
  '숫자 하나면 해당 종족 전체에서 동일합니다. `a/b`는 서로 다른 사도의 실제 개수입니다. 종족 이름은 tribe 0~7 순서(요정·수인·엘프·정령·유령·용족·마녀·미스틱)로 표기합니다.', '',
  '| 종족(ID) | 사도 수 | 차수 | 빈칸 | 관문 | 시작 | 일반 | 보크 | 황크 | 확장 황크 | 꽃잎 | 전체 노드 | 배치·타입 종류 | 배치·타입·스탯·비용 종류 |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
];
const summaries = [];
for (const [tribe, members] of sortedGroups) {
  for (const level of [1, 2, 3]) {
    const boards = members.map(hero => hero.boards.find(entry => entry.level === level)).filter(Boolean);
    const shapeCount = new Set(boards.map(entry => entry.shape)).size;
    const fullCount = new Set(boards.map(entry => entry.full)).size;
    lines.push(`| ${tribeNames[tribe] || '미확인'}(${tribe}) | ${boards.length} | ${level} | ${Array.from({ length: 8 }, (_, type) => range(boards.map(entry => entry.counts[type]))).join(' | ')} | ${range(boards.map(entry => entry.nodes.length))} | ${shapeCount} | ${fullCount} |`);
    summaries.push({ tribe, level, shapeCount, fullCount });
  }
}
lines.push('', '배치 비교는 노드 ID와 배열 순서를 제외하고 `(nodeType, x, y)`를 비교합니다. 상세 비교는 여기에 스탯 종류·수치, 골드·아이템 비용을 추가합니다. prevId/nextId 연결의 동일성은 이 비교에 포함하지 않습니다.', '', '## 보드가 같다고 볼 수 있는 범위', '');
const uniformShapes = summaries.filter(entry => entry.shapeCount === 1);
lines.push(`- 종족·차수 ${summaries.length}개 묶음 중 배치와 타입이 동일한 묶음: ${uniformShapes.length}개.`,
  `- 스탯과 비용까지 동일한 묶음: ${summaries.filter(entry => entry.fullCount === 1).length}개.`,
  '- 같은 칸 수라도 위치·스탯·비용은 다를 수 있습니다. 종족만으로 클릭한 노드나 필요 재화를 추정하면 안 됩니다.',
  '- 실제 클릭·경로 계산은 계속 사도 ID + 차수 + 노드 ID + 해당 사도의 마스터 노드를 사용합니다.', '',
  '## 태생 성급별 공통 칸 수', '',
  '현재 스냅샷에서는 종족에 관계없이 태생 성급 그룹별 칸 개수가 같습니다. 2성과 3성은 같은 개수이며, 1성은 별도 구성입니다.', '',
  '| 태생 성급 | 사도 수 | 차수 | 일반 | 보크 | 황크 | 확장 황크 | 꽃잎 | 관문 | 시작 |',
  '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const grade of [1, 2, 3]) {
  const members = heroes.filter(hero => hero.grade === grade);
  for (const level of [1, 2, 3]) {
    const boards = members.map(hero => hero.boards.find(entry => entry.level === level)).filter(Boolean);
    lines.push(`| ${grade} | ${members.length} | ${level} | ${[3, 4, 5, 6, 7, 1, 2].map(type => range(boards.map(entry => entry.counts[type]))).join(' | ')} |`);
  }
}
lines.push('', '## 종족과 태생 성급을 함께 비교한 배치 예외', '',
  '같은 종족·같은 태생 성급 내에서 1~3차 배치 묶음이 몇 종류인지 확인한 표입니다. 칸 수가 같아도 배치는 다를 수 있습니다.', '',
  '| 종족 | 태생 성급 | 사도 수 | 배치 묶음 수 | 배치별 대표 사도(인원) |',
  '|---|---:|---:|---:|---|');
for (const [tribe, members] of sortedGroups) for (const grade of [1, 2, 3]) {
  const matching = members.filter(hero => hero.grade === grade);
  if (!matching.length) continue;
  const variants = new Map();
  for (const hero of matching) {
    const key = JSON.stringify(hero.boards.map(entry => entry.shape));
    if (!variants.has(key)) variants.set(key, []);
    variants.get(key).push(hero.name);
  }
  lines.push(`| ${tribeNames[tribe]} | ${grade} | ${matching.length} | ${variants.size} | ${[...variants.values()].map(names => `${names[0]}(${names.length}명)`).join(', ')} |`);
}
lines.push('', '## 사도별 차수 구성과 공유 배치', '',
  '배치 번호는 이 문서 안에서만 사용하는 비교 번호입니다. 같은 번호면 차수와 배치·타입이 같으며, 스탯·비용까지 같다는 뜻은 아닙니다.', '',
  '| 종족 | 사도 | 태생 성급 | 공격 타입(원본 값) | 1차 배치 | 2차 배치 | 3차 배치 |',
  '|---|---|---:|---:|---|---|---|');
const templates = new Map();
for (const hero of heroes) for (const entry of hero.boards) {
  const key = `${entry.level}:${entry.shape}`;
  if (!templates.has(key)) templates.set(key, `B${templates.size + 1}`);
}
for (const [tribe, members] of sortedGroups) for (const hero of members) lines.push(`| ${tribeNames[tribe]} | ${hero.name} | ${hero.grade} | ${hero.attack} | ${[1, 2, 3].map(level => { const entry = hero.boards.find(board => board.level === level); return entry ? templates.get(`${level}:${entry.shape}`) : '없음'; }).join(' | ')} |`);
lines.push('', '## 배치별 스탯 칸 구성', '',
  '보크·황크는 칸 개수로 집계합니다. 한 노드가 여러 스탯을 주면 각 스탯 열에 각각 1칸으로 집계하므로 스탯 열 합계가 노드 수보다 클 수 있습니다. 확장 황크(6)는 황크에 포함합니다. 스탯 수치가 서로 같은지는 이 표에서 보장하지 않습니다.', '',
  `| 배치 | 예시 사도 | 차수 | 종류 | ${STAT_META_LIST.map(stat => stat.nameKo).join(' | ')} |`,
  `|---|---|---:|---|${statOrder.map(() => '---:').join('|')}|`);
// 배치가 같아도 스탯 칸 구성이 다른 경우를 별도 행으로 남긴다.
const seenStats = new Set();
for (const hero of heroes) for (const entry of hero.boards) for (const [kind, types] of [['일반', [3]], ['보크', [4]], ['황크(5+6)', [5, 6]]]) {
  const counts = statOrder.map(key => entry.nodes.filter(node => types.includes(node.nodeType) && getNodeStatCategories(node).includes(key)).length);
  const template = templates.get(`${entry.level}:${entry.shape}`);
  const fingerprint = JSON.stringify([template, kind, counts]);
  if (seenStats.has(fingerprint)) continue;
  seenStats.add(fingerprint);
  lines.push(`| ${template} | ${hero.name} | ${entry.level} | ${kind} | ${counts.join(' | ')} |`);
}
lines.push('', '## 다시 생성하기', '', '```powershell', `node scripts/analyze-board-templates.mjs ${input} ${output}`, '```', '', '원본 개인 데이터 파일은 Git에 추가하지 않습니다. 출력 문서는 게임 마스터의 구성과 공개 사도 이름만 포함합니다.', '');
await writeFile(output, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ heroes: heroes.length, boards: heroes.reduce((sum, hero) => sum + hero.boards.length, 0), nodes: heroes.reduce((sum, hero) => sum + hero.boards.reduce((count, entry) => count + entry.nodes.length, 0), 0), templates: templates.size, uniformShapes: uniformShapes.length, uniformFull: summaries.filter(entry => entry.fullCount === 1).length, output }));
