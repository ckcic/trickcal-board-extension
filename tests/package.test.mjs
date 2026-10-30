import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { buildZipBufferFromDirectory } from '../scripts/package.mjs';

function parseCentralDirectoryEntries(zipBuf) {
  const entries = [];
  let i = 0;
  while ((i = zipBuf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), i)) !== -1) {
    const method = zipBuf.readUInt16LE(i + 10);
    const compressedSize = zipBuf.readUInt32LE(i + 20);
    const uncompressedSize = zipBuf.readUInt32LE(i + 24);
    const nameLen = zipBuf.readUInt16LE(i + 28);
    const extraLen = zipBuf.readUInt16LE(i + 30);
    const commentLen = zipBuf.readUInt16LE(i + 32);
    const localOffset = zipBuf.readUInt32LE(i + 42);
    const name = zipBuf.subarray(i + 46, i + 46 + nameLen).toString('utf8');
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    i += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

test('ZIP 패키지는 하위 폴더 경로에 항상 슬래시(/)를 사용하여 Chrome 확장 로더와 호환된다', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcbe-zip-test-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'icons'), { recursive: true });
    const iconBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({ icons: { 16: 'icons/icon16.png' } }));
    fs.writeFileSync(path.join(tmpDir, 'icons', 'icon16.png'), iconBytes);

    const zipBuf = buildZipBufferFromDirectory(tmpDir);
    const entries = parseCentralDirectoryEntries(zipBuf);
    const names = entries.map(e => e.name);

    assert.deepEqual(names, ['icons/icon16.png', 'manifest.json']);
    for (const name of names) {
      assert.equal(name.includes('\\'), false, `백슬래시 경로가 포함됨: ${name}`);
    }

    const iconEntry = entries.find(e => e.name === 'icons/icon16.png');
    assert.ok(iconEntry);
    const localNameLen = zipBuf.readUInt16LE(iconEntry.localOffset + 26);
    const localExtraLen = zipBuf.readUInt16LE(iconEntry.localOffset + 28);
    const dataStart = iconEntry.localOffset + 30 + localNameLen + localExtraLen;
    const rawSlice = zipBuf.subarray(dataStart, dataStart + iconEntry.compressedSize);
    const restored = iconEntry.method === 8 ? zlib.inflateRawSync(rawSlice) : rawSlice;
    assert.deepEqual(restored, iconBytes);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
