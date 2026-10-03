#!/usr/bin/env node
const { execSync } = require('child_process');

const MODULES_TO_PROBE = ['better-sqlite3'];

function probeModules() {
  const mismatched = [];
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.close();
  } catch (err) {
    const msg = String(err?.message || '');
    if (err?.code === 'ERR_DLOPEN_FAILED' || /NODE_MODULE_VERSION/.test(msg)) {
      mismatched.push('better-sqlite3');
    } else {
      console.warn('[ensure-test-native] Warning: error loading better-sqlite3:', err.message);
    }
  }
  return mismatched;
}


const mismatched = probeModules();
if (mismatched.length > 0) {
  console.log(`[ensure-test-native] Native modules (${mismatched.join(', ')}) were compiled for a different ABI (e.g. Electron). Rebuilding for Node ${process.version}...`);
  try {
    execSync(`npm rebuild ${mismatched.join(' ')}`, { stdio: 'inherit' });
    console.log('[ensure-test-native] Rebuild complete.');
  } catch (error) {
    console.error('[ensure-test-native] Failed to rebuild native modules for Node:', error);
    process.exit(1);
  }
}
