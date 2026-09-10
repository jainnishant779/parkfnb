#!/usr/bin/env node

/**
 * ParkBNB OTA Publishing Script
 *
 * Usage:
 *   node scripts/publish-ota.js --app consumer --version 1.0.1 --notes "Header & dropdown fixes"
 *   node scripts/publish-ota.js --app owner --version 1.0.1 --notes "Listing fixes"
 *
 * Options:
 *   --app <consumer|owner>     Target app (required)
 *   --version <string>         New bundle version string, e.g. 1.0.1 (required)
 *   --notes <string>           Release notes for this bundle (optional)
 *   --server <url>             Backend server URL (default: https://parkfnb.onrender.com)
 *   --secret <token>           OTA secret key (default: parkbnb-ota-secret-key-2026)
 *   --mandatory                Mark this update as mandatory (optional)
 *   --dry-run                  Bundle only, do not upload (optional)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Parse CLI arguments
const args = process.argv.slice(2);
const parseArgs = () => {
  const result = {
    app: null,
    version: null,
    notes: 'Bug fixes and performance improvements',
    server: process.env.OTA_SERVER_URL || 'https://parkfnb.onrender.com',
    secret: process.env.OTA_SECRET || 'parkbnb-ota-secret-key-2026',
    mandatory: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--app' && args[i + 1]) {
      result.app = args[++i];
    } else if (arg === '--version' && args[i + 1]) {
      result.version = args[++i];
    } else if (arg === '--notes' && args[i + 1]) {
      result.notes = args[++i];
    } else if (arg === '--server' && args[i + 1]) {
      result.server = args[++i];
    } else if (arg === '--secret' && args[i + 1]) {
      result.secret = args[++i];
    } else if (arg === '--mandatory') {
      result.mandatory = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (!result.app && ['consumer', 'owner'].includes(arg)) {
      result.app = arg;
    } else if (!result.version && /^\d+\.\d+/.test(arg)) {
      result.version = arg;
    } else if (i === 2 && !arg.startsWith('--')) {
      result.notes = arg;
    }
  }
  return result;
};

const config = parseArgs();

if (!config.app || !['consumer', 'owner'].includes(config.app)) {
  console.error('\x1b[31mError: --app <consumer|owner> is required.\x1b[0m');
  console.log('Example: node scripts/publish-ota.js --app consumer --version 1.0.1 --notes "UI fixes"');
  process.exit(1);
}

if (!config.version) {
  console.error('\x1b[31mError: --version <semver> is required.\x1b[0m');
  console.log('Example: node scripts/publish-ota.js --app consumer --version 1.0.1');
  process.exit(1);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT_DIR, 'apps', config.app);
const TEMP_DIR = path.join(ROOT_DIR, 'scripts', '.temp_bundle');
const OUTPUT_BUNDLE = path.join(TEMP_DIR, 'index.android.bundle');
const OUTPUT_RES = path.join(TEMP_DIR, 'res');

if (!fs.existsSync(APP_DIR)) {
  console.error(`\x1b[31mError: App directory not found at ${APP_DIR}\x1b[0m`);
  process.exit(1);
}

console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════');
console.log('\x1b[36m%s\x1b[0m', '            ParkBNB OTA Bundle Publisher                   ');
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════');
console.log(`• Target App:    \x1b[32m${config.app.toUpperCase()}\x1b[0m`);
console.log(`• Bundle Version:\x1b[32m${config.version}\x1b[0m`);
console.log(`• Server URL:    \x1b[34m${config.server}\x1b[0m`);
console.log(`• Release Notes: "${config.notes}"`);
console.log(`• Mandatory:     ${config.mandatory ? 'YES' : 'NO'}`);
console.log('───────────────────────────────────────────────────────────');

// 1. Prepare temp directory
if (fs.existsSync(TEMP_DIR)) {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_RES, { recursive: true });

// 2. Run Metro bundle command
console.log('\n[1/3] 📦 Generating React Native JS Bundle with Metro...');
const entryFile = 'index.js';

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const bundleArgs = [
  'react-native',
  'bundle',
  '--platform', 'android',
  '--dev', 'false',
  '--entry-file', entryFile,
  '--bundle-output', OUTPUT_BUNDLE,
  '--assets-dest', OUTPUT_RES,
  '--reset-cache',
];

console.log(`Running: npx ${bundleArgs.join(' ')}`);
const bundleProcess = spawnSync(npxCmd, bundleArgs, {
  cwd: APP_DIR,
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: true,
  env: { ...process.env, CI: 'true', NODE_ENV: 'production' },
});

if (bundleProcess.status !== 0 || !fs.existsSync(OUTPUT_BUNDLE)) {
  console.error('\x1b[31mBundle generation failed. Exiting.\x1b[0m');
  process.exit(1);
}

let bundleStats = fs.statSync(OUTPUT_BUNDLE);
console.log(`\x1b[32m✓ Metro bundle created successfully (${(bundleStats.size / 1024 / 1024).toFixed(2)} MB)\x1b[0m`);

// 3. Optional: Hermes Bytecode Compilation
console.log('\n[2/3] ⚡ Checking for Hermes compiler (hermesc)...');
const hermescPaths = [
  path.join(APP_DIR, 'node_modules', 'react-native', 'sdks', 'hermesc', process.platform === 'win32' ? 'win64-bin' : 'linux64-bin', process.platform === 'win32' ? 'hermesc.exe' : 'hermesc'),
  path.join(ROOT_DIR, 'apps', 'consumer', 'node_modules', 'react-native', 'sdks', 'hermesc', process.platform === 'win32' ? 'win64-bin' : 'linux64-bin', process.platform === 'win32' ? 'hermesc.exe' : 'hermesc'),
];

let hermescBin = hermescPaths.find((p) => fs.existsSync(p));
let finalBundlePath = OUTPUT_BUNDLE;

if (hermescBin) {
  console.log(`Found hermesc at: ${hermescBin}`);
  const hbcPath = path.join(TEMP_DIR, 'index.android.bundle.hbc');
  const hermesArgs = ['-emit-binary', '-out', hbcPath, OUTPUT_BUNDLE];
  const hermesProcess = spawnSync(hermescBin, hermesArgs, { stdio: 'inherit' });

  if (hermesProcess.status === 0 && fs.existsSync(hbcPath)) {
    finalBundlePath = hbcPath;
    bundleStats = fs.statSync(hbcPath);
    console.log(`\x1b[32m✓ Compiled with Hermes bytecode (${(bundleStats.size / 1024 / 1024).toFixed(2)} MB)\x1b[0m`);
  } else {
    console.log('Hermes compilation skipped, using raw JS bundle.');
  }
} else {
  console.log('hermesc binary not found, using raw JS bundle.');
}

// 4. Upload to Backend
if (config.dryRun) {
  console.log('\n[3/3] 🚀 Dry run complete! Bundle verified. (Skipping upload)');
  console.log(`Bundle ready at: ${finalBundlePath}`);
  process.exit(0);
}

console.log('\n[3/3] 🚀 Uploading OTA release to backend...');

(async () => {
  try {
    const fileBlob = await fs.openAsBlob(finalBundlePath);

    const formData = new FormData();
    formData.append('app', config.app);
    formData.append('version', config.version);
    formData.append('releaseNotes', config.notes);
    formData.append('mandatory', String(config.mandatory));
    formData.append('bundle', fileBlob, 'index.android.bundle');

    const uploadUrl = `${config.server.replace(/\/+$/, '')}/api/v1/ota/publish`;
    console.log(`Posting to: ${uploadUrl}`);

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'x-ota-secret': config.secret,
      },
      body: formData,
    });

    const responseData = await res.json();

    if (!res.ok || !responseData.success) {
      console.error('\x1b[31mUpload failed:\x1b[0m', responseData);
      process.exit(1);
    }

    console.log('\n\x1b[32m═══════════════════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[32m🎉 OTA UPDATE PUBLISHED SUCCESSFULLY!\x1b[0m');
    console.log('\x1b[32m═══════════════════════════════════════════════════════════\x1b[0m');
    console.log(`• App:         ${config.app}`);
    console.log(`• Version:     ${responseData.release?.version}`);
    console.log(`• Bundle URL:  ${responseData.release?.bundleUrl}`);
    console.log(`• SHA-256:     ${responseData.release?.checksum}`);
    console.log(`• Size:        ${(responseData.release?.size / 1024).toFixed(1)} KB`);
    console.log(`• Released At: ${responseData.release?.releasedAt}`);
    console.log('\nUsers will receive this update automatically when they open the app!\n');

    // Clean up
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch (err) {
    console.error('\x1b[31mError during upload:\x1b[0m', err);
    process.exit(1);
  }
})();
