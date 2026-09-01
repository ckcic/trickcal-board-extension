import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const distDir = path.resolve('./dist');
const outZip = path.resolve('./trickcal-board-extension.zip');

if (!fs.existsSync(distDir)) {
  console.error('[TCBE Package] Error: dist directory does not exist. Run build first.');
  process.exit(1);
}

if (fs.existsSync(outZip)) {
  fs.unlinkSync(outZip);
}

// PowerShell의 Compress-Archive를 사용하여 dist 폴더를 zip으로 압축
try {
  execSync(`powershell Compress-Archive -Path "${distDir}/*" -DestinationPath "${outZip}" -Force`, { stdio: 'inherit' });
  console.log(`[TCBE Package] Successfully created distribution package: ${outZip}`);
} catch (err) {
  console.error('[TCBE Package] Failed to create zip package:', err);
}
