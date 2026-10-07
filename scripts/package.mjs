import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const outZip = path.join(rootDir, 'trickcal-board-extension.zip');
const temporaryZip = path.join(rootDir, 'trickcal-board-extension.tmp.zip');

if (!fs.existsSync(distDir)) {
  console.error('[TCBE Package] Error: dist directory does not exist. Run build first.');
  process.exit(1);
}

// 압축 모듈 자동 로딩에 의존하지 않고 .NET으로 ZIP을 생성한다.
// 새 압축에 성공한 뒤 교체하여 실패 시 기존 배포 파일을 보존한다.
try {
  fs.rmSync(temporaryZip, { force: true });
  const quotePath = value => `'${value.replaceAll("'", "''")}'`;
  const command = `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quotePath(distDir)}, ${quotePath(temporaryZip)})`;
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'inherit' });
  fs.renameSync(temporaryZip, outZip);
  console.log(`[TCBE Package] Successfully created distribution package: ${outZip}`);
} catch (err) {
  fs.rmSync(temporaryZip, { force: true });
  console.error('[TCBE Package] Failed to create zip package:', err);
  process.exit(1);
}
