/**
 * @file build.mjs
 * @description esbuild를 이용한 Chrome 확장 프로그램 빌드 및 정적 에셋 복사 스크립트
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

// 인자 확인 (--watch)
const isWatch = process.argv.includes('--watch');

/**
 * dist 디렉터리 초기화
 */
function ensureDistDir() {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
}

/**
 * 정적 파일 복사 처리
 */
function copyStaticFiles() {
  // 1. manifest.json
  const manifestSrc = path.join(rootDir, 'manifest.json');
  const manifestDest = path.join(distDir, 'manifest.json');
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, manifestDest);
    console.log('[TCBE Build] Copied manifest.json to dist');
  }

  // 2. styles.css
  const styleSrc = path.join(rootDir, 'src', 'ui', 'styles.css');
  const styleDest = path.join(distDir, 'styles.css');
  if (fs.existsSync(styleSrc)) {
    fs.copyFileSync(styleSrc, styleDest);
    console.log('[TCBE Build] Copied styles.css to dist');
  }

  // 3. icons 디렉터리
  const iconsSrcDir = path.join(rootDir, 'icons');
  const iconsDestDir = path.join(distDir, 'icons');
  if (fs.existsSync(iconsSrcDir)) {
    if (!fs.existsSync(iconsDestDir)) {
      fs.mkdirSync(iconsDestDir, { recursive: true });
    }
    const iconFiles = fs.readdirSync(iconsSrcDir);
    for (const file of iconFiles) {
      fs.copyFileSync(path.join(iconsSrcDir, file), path.join(iconsDestDir, file));
    }
    console.log(`[TCBE Build] Copied ${iconFiles.length} icon files to dist/icons`);
  }

  // 4. webp 디렉터리 (스프라이트 이미지)
  const webpSrcDir = path.join(rootDir, 'webp');
  const webpDestDir = path.join(distDir, 'webp');
  if (fs.existsSync(webpSrcDir)) {
    if (!fs.existsSync(webpDestDir)) {
      fs.mkdirSync(webpDestDir, { recursive: true });
    }
    const webpFiles = fs.readdirSync(webpSrcDir);
    for (const file of webpFiles) {
      fs.copyFileSync(path.join(webpSrcDir, file), path.join(webpDestDir, file));
    }
    console.log(`[TCBE Build] Copied ${webpFiles.length} webp sprite files to dist/webp`);
  }
}

/**
 * 빌드 결과물에 개인/유저 데이터(data.json)가 포함되지 않았는지 보안 검증
 */
function verifySecurityIntegrity() {
  const forbiddenFiles = ['data.json'];
  for (const forbidden of forbiddenFiles) {
    const target = path.join(distDir, forbidden);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      throw new Error(`[CRITICAL SECURITY ALERT] ${forbidden} was detected in dist and has been removed!`);
    }
  }
  console.log('[TCBE Build] Security check passed: No fixture/user data in dist.');
}

async function build() {
  ensureDistDir();
  copyStaticFiles();

  const commonOptions = {
    bundle: true,
    minify: false,
    sourcemap: true,
    target: ['chrome110'],
    format: 'iife',
  };

  const contexts = await Promise.all([
    // 1. MAIN world 인터셉터
    esbuild.context({
      ...commonOptions,
      entryPoints: [path.join(rootDir, 'src', 'bridge', 'interceptor.ts')],
      outfile: path.join(distDir, 'interceptor.js'),
    }),
    // 2. ISOLATED world 콘텐츠 스크립트
    esbuild.context({
      ...commonOptions,
      entryPoints: [path.join(rootDir, 'src', 'content.ts')],
      outfile: path.join(distDir, 'content.js'),
    }),
  ]);

  if (isWatch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[TCBE Build] Watching for changes...');
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
    verifySecurityIntegrity();
    console.log('[TCBE Build] Build finished successfully.');
  }
}

build().catch((err) => {
  console.error('[TCBE Build] Build failed:', err);
  process.exit(1);
});
