import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWatch = process.argv.includes('--watch');
const outDir = path.resolve(__dirname, 'dist');

function copyPublicAssets() {
  const publicDir = path.resolve(__dirname, 'public');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  if (fs.existsSync(publicDir)) {
    const files = fs.readdirSync(publicDir);
    for (const file of files) {
      const srcPath = path.join(publicDir, file);
      const destPath = path.join(outDir, file);
      const stat = fs.statSync(srcPath);
      if (stat.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      } else if (stat.isDirectory()) {
        fs.cpSync(srcPath, destPath, { recursive: true });
      }
    }
    console.log('[build] Copied public assets to dist/');
  }
}

async function build() {
  copyPublicAssets();

  const commonOptions = {
    bundle: true,
    sourcemap: true,
    target: ['chrome110'],
    logLevel: 'info',
  };

  const builds = [
    // Content script must be IIFE so it doesn't leak or conflict with host page
    esbuild.build({
      ...commonOptions,
      entryPoints: [path.resolve(__dirname, 'src/content/index.ts')],
      outfile: path.resolve(outDir, 'content.js'),
      format: 'iife',
    }),
    // Background service worker
    esbuild.build({
      ...commonOptions,
      entryPoints: [path.resolve(__dirname, 'src/background/index.ts')],
      outfile: path.resolve(outDir, 'background.js'),
      format: 'esm',
    }),
    // Popup script
    esbuild.build({
      ...commonOptions,
      entryPoints: [path.resolve(__dirname, 'src/popup/index.ts')],
      outfile: path.resolve(outDir, 'popup.js'),
      format: 'esm',
    }),
  ];

  await Promise.all(builds);
  console.log('[build] Extension build complete -> dist/');

  if (isWatch) {
    console.log('[build] Watching for changes...');
    fs.watch(path.resolve(__dirname, 'src'), { recursive: true }, async () => {
      console.log('[build] Source change detected, rebuilding...');
      await build();
    });
    fs.watch(path.resolve(__dirname, 'public'), { recursive: true }, () => {
      console.log('[build] Public assets changed, copying...');
      copyPublicAssets();
    });
  }
}

build().catch((err) => {
  console.error('[build] Build failed:', err);
  process.exit(1);
});
