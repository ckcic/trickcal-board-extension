import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

// 표준 ZIP 포맷용 CRC-32 룩업 테이블 생성
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { dosDate, dosTime };
}

function collectFiles(baseDir, currentDir = baseDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(baseDir, fullPath));
    } else if (entry.isFile()) {
      // Chrome 확장 로더(UnpackedExtensions) 및 ZIP 표준(APPNOTE 4.4.17.1) 호환을 위해 항상 '/' 구분자를 사용한다.
      const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      files.push({ fullPath, relPath });
    }
  }
  return files;
}

/**
 * 지정한 디렉터리의 모든 파일을 POSIX 슬래시('/') 엔트리 경로를 갖는 표준 ZIP 버퍼로 생성한다.
 */
export function buildZipBufferFromDirectory(sourceDir) {
  const files = collectFiles(sourceDir);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { fullPath, relPath } of files) {
    const rawData = fs.readFileSync(fullPath);
    const stat = fs.statSync(fullPath);
    const { dosDate, dosTime } = toDosDateTime(stat.mtime);
    const nameBuf = Buffer.from(relPath, 'utf8');
    const crc = crc32(rawData);
    const deflated = zlib.deflateRawSync(rawData, { level: 9 });
    const useDeflate = deflated.length < rawData.length;
    const compressedData = useDeflate ? deflated : rawData;
    const method = useDeflate ? 8 : 0;
    // UTF-8 파일명 플래그 (Bit 11)
    const flags = 0x0800;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressedData);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedData.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressedData.length;
  }

  const centralDirSize = centralParts.reduce((sum, buf) => sum + buf.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const rootDir = path.resolve(path.dirname(currentFile), '..');
  const distDir = path.join(rootDir, 'dist');
  const outZip = path.join(rootDir, 'trickcal-board-extension.zip');
  const temporaryZip = path.join(rootDir, 'trickcal-board-extension.tmp.zip');

  if (!fs.existsSync(distDir)) {
    console.error('[TCBE Package] Error: dist directory does not exist. Run build first.');
    process.exit(1);
  }

  // 새 압축에 성공한 뒤 교체하여 실패 시 기존 배포 파일을 보존한다.
  try {
    fs.rmSync(temporaryZip, { force: true });
    const zipBuffer = buildZipBufferFromDirectory(distDir);
    fs.writeFileSync(temporaryZip, zipBuffer);
    fs.renameSync(temporaryZip, outZip);
    console.log(`[TCBE Package] Successfully created distribution package: ${outZip}`);
  } catch (err) {
    fs.rmSync(temporaryZip, { force: true });
    console.error('[TCBE Package] Failed to create zip package:', err);
    process.exit(1);
  }
}
