#!/usr/bin/env node
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');
const required = [
  'gradlew',
  'gradle/wrapper/gradle-wrapper.jar',
  'gradle/wrapper/gradle-wrapper.properties',
  'app/build.gradle',
  'app/src/main/AndroidManifest.xml',
  'app/src/main/java/ma/yallahservices/viralstudio/MainActivity.java',
  'app/src/main/res/xml/network_security_config.xml',
  'app/src/debug/res/xml/network_security_config.xml'
];
await Promise.all(required.map(path => access(join(android, path))));

const manifest = await readFile(join(android, 'app/src/main/AndroidManifest.xml'), 'utf8');
const activity = await readFile(join(android,
  'app/src/main/java/ma/yallahservices/viralstudio/MainActivity.java'), 'utf8');
const releaseNetwork = await readFile(join(android,
  'app/src/main/res/xml/network_security_config.xml'), 'utf8');
const debugNetwork = await readFile(join(android,
  'app/src/debug/res/xml/network_security_config.xml'), 'utf8');
const wrapper = await readFile(join(android,
  'gradle/wrapper/gradle-wrapper.properties'), 'utf8');

assert.match(manifest, /android\.permission\.INTERNET/);
assert.match(manifest, /android:allowBackup="false"/);
assert.match(manifest, /android:networkSecurityConfig=/);
assert.match(releaseNetwork, /cleartextTrafficPermitted="false"/);
assert.match(debugNetwork, /cleartextTrafficPermitted="true"/);
assert.match(activity, /setAcceptThirdPartyCookies\(webView, false\)/);
assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
assert.match(activity, /handler\.cancel\(\)/);
assert.match(activity, /isTrusted\(destination\)/);
assert.match(activity, /addJavascriptInterface\(new DownloadBridge\(\), "YallahAndroid"\)/);
assert.doesNotMatch(activity, /proceed\(\)/, 'Un certificat TLS invalide ne doit jamais être accepté');
assert.doesNotMatch(activity, /setAllowUniversalAccessFromFileURLs\(true\)/);
assert.match(wrapper, /distributionSha256Sum=[a-f0-9]{64}/);
assert.doesNotMatch(wrapper, /-all\.zip/);

console.log(`✓ Projet Android vérifié (${required.length} fichiers critiques, politique HTTPS et WebView restreinte).`);
