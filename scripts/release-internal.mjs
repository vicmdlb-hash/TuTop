import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { uploadInternalSharing } from './upload-internal-sharing.mjs';

const root = process.cwd();
const isWindows = process.platform === 'win32';
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const projectConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/project.json'), 'utf8'));
if (projectConfig.zeroInvestmentMode === true || projectConfig.billingAllowed !== true || projectConfig.productionPublishingAllowed !== true) {
  console.error('BLOQUEADO: TuTop sigue en modo cero inversión. Este release de Google Play no está autorizado.');
  process.exit(2);
}
const capacitor = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const variantRaw = String(process.env.TUTOP_INTERNAL_VARIANT || 'debug').trim().toLowerCase();
if (!['debug', 'release'].includes(variantRaw)) {
  console.error('TUTOP_INTERNAL_VARIANT solo puede ser debug o release.');
  process.exit(2);
}
const variant = variantRaw;
const variantCap = variant[0].toUpperCase() + variant.slice(1);

function run(command, args = [], { capture = false, cwd = root } = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: isWindows,
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = capture ? `\n${result.stdout || ''}${result.stderr || ''}` : '';
    throw new Error(`Falló: ${command} ${args.join(' ')}${detail}`);
  }
  return capture ? String(result.stdout || '').trim() : '';
}

function walk(dir, matches = []) {
  if (!fs.existsSync(dir)) return matches;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, matches);
    else if (entry.name.endsWith('.aab')) matches.push(full);
  }
  return matches;
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes = 0;
    do {
      bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes) hash.update(buffer.subarray(0, bytes));
    } while (bytes);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function gitValue(args, fallback = 'unknown') {
  try { return run('git', args, { capture: true }) || fallback; }
  catch { return fallback; }
}

function ensureCleanTree() {
  if (process.env.TUTOP_ALLOW_DIRTY === '1') return;
  const dirty = gitValue(['status', '--porcelain'], '');
  if (dirty) throw new Error('El working tree tiene cambios sin commit. Haz commit o usa TUTOP_ALLOW_DIRTY=1 de forma consciente.');
}

try {
  console.log(`TuTop Internal App Sharing — ${pkg.version} — ${variant}`);
  console.log('Este comando NO publica en Production/Open/Closed testing.');
  ensureCleanTree();

  run('npm', ['run', 'check']);
  run('npm', ['run', 'typecheck']);
  run('npm', ['run', 'build']);
  run('npm', ['run', 'functions:build']);

  if (!fs.existsSync(path.join(root, 'android'))) {
    throw new Error('Falta /android. Ejecuta primero npm run deps:mobile y npm run android:bootstrap con el packageName confirmado.');
  }

  run('npm', ['run', 'android:doctor']);
  run('npx', ['cap', 'sync', 'android']);

  const gradle = isWindows ? path.join(root, 'android', 'gradlew.bat') : path.join(root, 'android', 'gradlew');
  if (!fs.existsSync(gradle)) throw new Error('No existe Gradle wrapper dentro de /android.');
  if (!isWindows) fs.chmodSync(gradle, 0o755);
  const androidDir = path.join(root, 'android');
  run(gradle, [`lint${variantCap}`], { cwd: androidDir });
  run(gradle, [`test${variantCap}UnitTest`], { cwd: androidDir });
  run(gradle, [`bundle${variantCap}`], { cwd: androidDir });

  const bundleRoot = path.join(root, 'android', 'app', 'build', 'outputs', 'bundle', variant);
  const aabs = walk(bundleRoot).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!aabs.length) throw new Error(`Gradle terminó pero no encontré un .aab en ${path.relative(root, bundleRoot)}.`);

  const sourceAab = aabs[0];
  const releaseDir = path.join(root, 'release');
  fs.mkdirSync(releaseDir, { recursive: true });
  const safeVersion = pkg.version.replace(/[^0-9A-Za-z._-]+/g, '-');
  const copiedAab = path.join(releaseDir, `TuTop-${safeVersion}-${variant}.aab`);
  fs.copyFileSync(sourceAab, copiedAab);
  const localSha = sha256(copiedAab);
  const appGradleCandidates = [path.join(root, 'android/app/build.gradle'), path.join(root, 'android/app/build.gradle.kts')];
  const appGradle = appGradleCandidates.find((file) => fs.existsSync(file));
  const gradleText = appGradle ? fs.readFileSync(appGradle, 'utf8') : '';
  const versionCodeMatch = gradleText.match(/versionCode\s*(?:=\s*)?(\d+)/);
  const versionNameMatch = gradleText.match(/versionName\s*(?:=\s*)?["']([^"']+)["']/);
  const versionCode = versionCodeMatch ? Number(versionCodeMatch[1]) : null;
  const androidVersionName = versionNameMatch ? versionNameMatch[1] : null;
  const commit = gitValue(['rev-parse', 'HEAD']);
  const branch = gitValue(['branch', '--show-current']);
  const builtAt = new Date().toISOString();

  const manifest = {
    app: 'TuTop',
    version: pkg.version,
    packageName: capacitor.appId,
    variant,
    versionCode,
    androidVersionName,
    targetSdkRequired: 36,
    sourceAab: path.relative(root, sourceAab),
    artifactAab: path.relative(root, copiedAab),
    sha256: localSha,
    git: { commit, branch },
    builtAt,
  };
  fs.writeFileSync(path.join(releaseDir, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nAAB: ${copiedAab}`);
  console.log(`SHA256 local: ${localSha}`);

  if (process.env.TUTOP_SKIP_UPLOAD === '1') {
    console.log('\n✅ Build interno generado. Upload omitido por TUTOP_SKIP_UPLOAD=1.');
    process.exit(0);
  }

  if (process.env.GOOGLE_PLAY_PACKAGE_NAME && process.env.GOOGLE_PLAY_PACKAGE_NAME !== capacitor.appId) {
    throw new Error(`GOOGLE_PLAY_PACKAGE_NAME (${process.env.GOOGLE_PLAY_PACKAGE_NAME}) no coincide con capacitor.appId (${capacitor.appId}).`);
  }
  process.env.GOOGLE_PLAY_PACKAGE_NAME ||= capacitor.appId;

  const result = await uploadInternalSharing(copiedAab);
  const finalManifest = {
    ...manifest,
    googlePlay: {
      downloadUrl: result.downloadUrl,
      certificateFingerprint: result.certificateFingerprint || null,
      sha256: result.sha256 || null,
    },
  };
  fs.writeFileSync(path.join(releaseDir, 'build-manifest.json'), JSON.stringify(finalManifest, null, 2) + '\n');
  if (result.certificateFingerprint) {
    fs.writeFileSync(
      path.join(releaseDir, 'REGISTER_INTERNAL_CERTIFICATE.txt'),
      `Google Play Internal App Sharing certificate fingerprint:\n${result.certificateFingerprint}\n\nSi Firebase Phone Auth/App Check lo requiere, registra esta huella en el proyecto Firebase correspondiente al package ${capacitor.appId}.\n`,
    );
  }

  console.log('\n✅ TuTop beta subida correctamente a Internal App Sharing');
  console.log(`Version: ${pkg.version}`);
  console.log(`Package: ${capacitor.appId}`);
  console.log(`Variant: ${variant}`);
  console.log(`VersionCode: ${versionCode ?? 'n/d'}`);
  console.log(`SHA256 local: ${localSha}`);
  console.log(`Google Play: ${result.downloadUrl}`);
  console.log('\n✅ NO se publicó en producción.');
} catch (error) {
  console.error(`\n❌ Release detenido: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
