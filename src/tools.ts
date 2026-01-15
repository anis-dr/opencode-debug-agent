/**
 * Debug Tools - OpenCode tools for runtime debugging workflow
 */

import { tool } from '@opencode-ai/plugin';
import { debugServer } from './server';

/**
 * Generate the instrumentation snippet with the given URL
 */
function generateSnippet(url: string): string {
  return `fetch("${url}/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "LABEL_HERE", data: {YOUR_DATA}})
})`;
}

/**
 * Start debug server to capture runtime data
 * Returns port, URL, and ready-to-use code snippet
 */
export const debugStart = tool({
  description:
    'Start debug server to capture runtime data. Returns port, URL, and ready-to-use code snippet for instrumentation.',
  args: {
    port: tool.schema
      .number()
      .optional()
      .describe(
        'Specific port to use (optional). If not provided, reuses previous port or auto-selects.'
      ),
  },
  async execute(args) {
    const result = await debugServer.start(args.port);
    return JSON.stringify({
      port: result.port,
      url: result.url,
      snippet: generateSnippet(result.url),
      message: `Debug server running on port ${result.port}. Use the snippet to instrument code.`,
    });
  },
});

/**
 * Stop the debug server and flush remaining logs
 */
export const debugStop = tool({
  description: 'Stop the debug server and flush remaining logs to disk.',
  args: {},
  async execute() {
    if (!debugServer.isRunning()) {
      return JSON.stringify({ message: 'Debug server is not running.' });
    }
    await debugServer.stop();
    return JSON.stringify({
      message: 'Debug server stopped. Logs preserved in .opencode/debug.log',
    });
  },
});

/**
 * Read captured debug logs
 */
export const debugRead = tool({
  description: 'Read captured debug logs. Returns parsed JSON array of log entries.',
  args: {
    tail: tool.schema
      .number()
      .optional()
      .describe('Return only the last N entries. If not provided, returns all entries.'),
  },
  async execute(args) {
    const entries = await debugServer.readLogs(args.tail);
    if (entries.length === 0) {
      return JSON.stringify({
        entries: [],
        message:
          'No log entries found. Make sure the debug server is running and code is instrumented.',
      });
    }
    return JSON.stringify({
      entries,
      count: entries.length,
    });
  },
});

/**
 * Clear the debug log file
 */
export const debugClear = tool({
  description: 'Clear the debug log file.',
  args: {},
  async execute() {
    await debugServer.clearLogs();
    return JSON.stringify({ message: 'Debug log cleared.' });
  },
});

/**
 * Check debug server status and get current port/URL
 */
export const debugStatus = tool({
  description:
    'Check if debug server is running and get current port/URL. Also shows persisted port from previous sessions.',
  args: {},
  async execute() {
    const info = debugServer.getInfo();

    if (info.active && info.url) {
      return JSON.stringify({
        active: true,
        port: info.port,
        url: info.url,
        snippet: generateSnippet(info.url),
      });
    }

    // Server not running - check for persisted port
    const persistedPort = await debugServer.getPersistedPort();

    return JSON.stringify({
      active: false,
      persistedPort,
      hint: persistedPort
        ? `Previous session used port ${persistedPort}. Call debug_start to reuse it.`
        : 'No debug server configured. Call debug_start to begin.',
    });
  },
});
