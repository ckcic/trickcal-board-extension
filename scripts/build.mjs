/**
 * @file build.mjs
 * @description esbuild를 이용한 Chrome 확장 프로그램 빌드 및 정적 에셋 복사 스크립트
 */

import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

// CLI 플래그 파싱
const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

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
  for (const file of ['popup.html', 'popup.css']) {
    fs.copyFileSync(path.join(rootDir, 'src', file), path.join(distDir, file));
  }
  // 1. manifest.json
  const manifestSrc = path.join(rootDir, 'manifest.json');
  const manifestDest = path.join(distDir, 'manifest.json');
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, manifestDest);
    console.log('[TCBE Build] Copied manifest.json to dist');
  }

  // 2. icons 디렉터리
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

  // 3. webp 디렉터리 (스프라이트 이미지)
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
  // esbuild의 번들 생성 전에 TypeScript 타입 검사를 실행한다.
  execFileSync(process.execPath, [path.join(rootDir, 'node_modules/typescript/bin/tsc'), '--noEmit'], { cwd: rootDir, stdio: 'inherit' });
  ensureDistDir();
  copyStaticFiles();

  const modeLabel = isProd ? 'production' : 'development';
  console.log(`[TCBE Build] Mode: ${modeLabel}`);

  // JS 번들 공통 옵션 (프로덕션/개발 모드 분리)
  const commonJsOptions = {
    bundle: true,
    minify: isProd,
    sourcemap: !isProd,
    target: ['chrome110'],
    format: 'iife',
    drop: isProd ? ['console', 'debugger'] : [],
    legalComments: isProd ? 'none' : 'inline',
  };

  // CSS 번들 옵션 (chrome-extension:// URL은 런타임에 해석되므로 외부 경로로 처리)
  const cssOptions = {
    entryPoints: [path.join(rootDir, 'src', 'ui', 'styles.css')],
    outfile: path.join(distDir, 'styles.css'),
    bundle: true,
    minify: isProd,
    sourcemap: !isProd,
    target: ['chrome110'],
    legalComments: isProd ? 'none' : 'inline',
    external: ['chrome-extension://*'],
  };

  const contexts = await Promise.all([
    esbuild.context({
      ...commonJsOptions,
      entryPoints: [path.join(rootDir, 'src', 'popup.ts')],
      outfile: path.join(distDir, 'popup.js'),
    }),
    // 1. MAIN world 인터셉터
    esbuild.context({
      ...commonJsOptions,
      entryPoints: [path.join(rootDir, 'src', 'bridge', 'interceptor.ts')],
      outfile: path.join(distDir, 'interceptor.js'),
    }),
    // 2. ISOLATED world 콘텐츠 스크립트
    esbuild.context({
      ...commonJsOptions,
      entryPoints: [path.join(rootDir, 'src', 'content.ts')],
      outfile: path.join(distDir, 'content.js'),
    }),
    // 3. CSS 번들링
    esbuild.context(cssOptions),
  ]);

  if (isWatch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[TCBE Build] Watching for changes...');
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
    verifySecurityIntegrity();

    // 프로덕션 빌드 시 결과물 크기 리포트
    if (isProd) {
      const files = ['content.js', 'interceptor.js', 'styles.css'];
      console.log('\n[TCBE Build] Bundle sizes:');
      for (const f of files) {
        const fp = path.join(distDir, f);
        if (fs.existsSync(fp)) {
          const size = fs.statSync(fp).size;
          const kb = (size / 1024).toFixed(1);
          console.log(`  ${f}: ${kb} KB`);
        }
      }
    }

    console.log('[TCBE Build] Build finished successfully.');
  }
}

build().catch((err) => {
  console.error('[TCBE Build] Build failed:', err);
  process.exit(1);
});
