#!/usr/bin/env node

/**
 * sync-harness.mjs
 * HARNESS.md(정본)를 각 AI 코딩 도구가 인식하는 파일명으로 동기화합니다.
 *
 * 사용법: npm run sync-harness (또는 node scripts/sync-harness.mjs)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(rootDir, 'HARNESS.md');

// 동기화 대상 목록: [출력 파일 경로, 상단 주석]
const targets = [
  ['GEMINI.md',   '<!-- ⚠️ 이 파일은 HARNESS.md에서 자동 생성됩니다. 직접 수정하지 마세요. npm run sync-harness -->'],
  ['AGENTS.md',   '<!-- ⚠️ 이 파일은 HARNESS.md에서 자동 생성됩니다. 직접 수정하지 마세요. npm run sync-harness -->'],
  ['CLAUDE.md',   '<!-- ⚠️ 이 파일은 HARNESS.md에서 자동 생성됩니다. 직접 수정하지 마세요. npm run sync-harness -->'],
];

try {
  const source = readFileSync(sourcePath, 'utf-8');
  console.log(`[sync-harness] 정본 로드: HARNESS.md (${source.length} bytes)`);

  for (const [file, header] of targets) {
    const outPath = path.join(rootDir, file);

    // 디렉토리가 필요한 경우 생성 (예: .github/copilot-instructions.md)
    mkdirSync(path.dirname(outPath), { recursive: true });

    const content = `${header}\n\n${source}`;
    writeFileSync(outPath, content, 'utf-8');
    console.log(`  ✅ ${file}`);
  }

  console.log(`[sync-harness] ${targets.length}개 파일 동기화 완료.`);
} catch (err) {
  console.error(`[sync-harness] ❌ 오류:`, err.message);
  process.exit(1);
}
