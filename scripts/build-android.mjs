#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');
const artifacts = join(root, '.artifacts');
const variant = process.argv.includes('--release') ? 'release' : 'debug';
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const task = variant === 'release' ? ':app:assembleRelease' : ':app:assembleDebug';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: android,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32'
    });
    child.on('error', reject);
    child.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`${command} a échoué avec le code ${code}`)));
  });
}

try {
  await run(gradle, ['--no-daemon', '--stacktrace', task]);
  const source = join(android, 'app', 'build', 'outputs', 'apk', variant,
    `app-${variant}${variant === 'release' ? '-unsigned' : ''}.apk`);
  await access(source);
  const packageInfo = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const suffix = variant === 'release' ? 'release-unsigned' : 'debug';
  const filename = `Yallah-Viral-Studio-v${packageInfo.version}-${suffix}.apk`;
  const destination = join(artifacts, filename);
  await mkdir(artifacts, { recursive: true });
  await copyFile(source, destination);
  const digest = createHash('sha256').update(await readFile(destination)).digest('hex');
  await writeFile(`${destination}.sha256`, `${digest}  ${filename}\n`);
  console.log(`\n✅ APK ${variant} : ${destination}`);
  console.log(`🔐 SHA-256 : ${digest}`);
  if (variant === 'release') {
    console.log('ℹ️  Cet APK release reste à signer avec la clé durable de publication.');
  }
} catch (error) {
  console.error(`\n❌ Build Android impossible : ${error.message}`);
  console.error('Prérequis : JDK 17 et Android SDK 36 (ANDROID_HOME ou ANDROID_SDK_ROOT).');
  process.exitCode = 1;
}
