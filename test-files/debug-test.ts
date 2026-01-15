/**
 * Debug Agent Test - Node.js/Bun
 * Run with: bun test-files/debug-test.ts
 */

const DEBUG_URL = 'http://localhost:61750/log';

async function sendDebug(label: string, data: unknown): Promise<void> {
  try {
    const res = await fetch(DEBUG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, data }),
    });
    const json = await res.json();
    console.log(`✓ [${label}] ${json.status}`);
  } catch (err) {
    console.error(`✗ [${label}] ${err instanceof Error ? err.message : err}`);
  }
}

async function runTests() {
  console.log('\n=== Debug Agent Test - Node.js/Bun ===\n');

  // Test 1: Basic log
  await sendDebug('node:basic', { message: 'Hello from Node/Bun!' });

  // Test 2: Environment data
  await sendDebug('node:env', {
    runtime: typeof Bun !== 'undefined' ? 'Bun' : 'Node.js',
    version: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    pid: process.pid,
  });

  // Test 3: Simulated async operation
  await sendDebug('node:async:start', { operation: 'fetchData' });
  await new Promise((r) => setTimeout(r, 100));
  await sendDebug('node:async:end', { operation: 'fetchData', duration: '100ms' });

  // Test 4: Error capture
  try {
    throw new Error('Simulated error in Node/Bun');
  } catch (err) {
    await sendDebug('node:error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  // Test 5: Complex data structure
  await sendDebug('node:complex', {
    nested: {
      array: [1, 2, 3],
      object: { a: 'b', c: 'd' },
      boolean: true,
      nullValue: null,
    },
    timestamp: new Date().toISOString(),
  });

  // Test 6: Loop test
  for (let i = 1; i <= 3; i++) {
    await sendDebug(`node:loop:${i}`, { iteration: i, total: 3 });
  }

  console.log('\n=== Tests Complete ===\n');
}

runTests();
