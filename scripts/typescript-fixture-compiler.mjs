import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cache = new Map();

export function compileTypescriptFixture(sourcePath) {
  const sourceAbsolute = path.resolve(sourcePath);
  const sourceRoot = path.resolve('src');
  const relativeSource = path.relative(sourceRoot, sourceAbsolute);
  if (relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
    throw new Error(`Fixture source must stay under src/: ${sourcePath}`);
  }
  if (cache.has(sourceAbsolute)) return cache.get(sourceAbsolute);

  const outputRoot = mkdtempSync(path.join(tmpdir(), 'tutop-tsc-fixture-'));
  try {
    const tscEntry = path.resolve('node_modules/typescript/bin/tsc');
    const result = spawnSync(process.execPath, [
      tscEntry, '--ignoreConfig', sourceAbsolute,
      '--module', 'commonjs', '--target', 'es2020', '--jsx', 'react-jsx',
      '--rootDir', sourceRoot, '--outDir', outputRoot,
      '--noEmitOnError', 'false', '--skipLibCheck', '--esModuleInterop',
    ], { encoding: 'utf8', windowsHide: true });
    const relativeOutput = relativeSource.replace(/\.(?:tsx?|mts|cts)$/u, '.js');
    const outputPath = path.join(outputRoot, relativeOutput);
    if (result.status !== 0 && !existsSync(outputPath)) {
      throw new Error(`TypeScript fixture compile failed for ${sourcePath}:\n${result.stdout}${result.stderr}`);
    }

    const output = readFileSync(outputPath, 'utf8');
    cache.set(sourceAbsolute, output);
    return output;
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}
