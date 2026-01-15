/**
 * OpenCode Debug Agent Plugin
 *
 * Provides runtime debugging capabilities:
 * - Debug HTTP server for capturing execution data
 * - 5 tools: debug_start, debug_stop, debug_read, debug_clear, debug_status
 * - Debug agent (primary) for dedicated debugging sessions
 * - Debug skill for use with any agent
 */

import type { Plugin } from '@opencode-ai/plugin';
import { debugStart, debugStop, debugRead, debugClear, debugStatus } from './tools';

// ============================================================
// EMBEDDED CONTENT (to avoid file loading issues in npm packages)
// ============================================================

const AGENT_PROMPT = `You are a debugging specialist. Your purpose is to help users debug runtime issues by capturing and analyzing execution data.

## IMPORTANT: Port Handling
- \`debug_start\` returns a ready-to-use \`snippet\` with the correct port baked in
- ALWAYS use the snippet from the tool response - never hardcode ports
- If you need the current port later, call \`debug_status\`
- The server remembers its port across sessions, so existing instrumentations keep working

## Workflow

1. Call \`debug_start\` to start the debug server
2. Use the returned \`snippet\` to insert fetch() calls at strategic locations in the user's code
   - Replace \`LABEL_HERE\` with a descriptive label (e.g., "before-api-call", "user-input", "loop-iteration")
   - Replace \`YOUR_DATA\` with the variables you want to capture
3. Ask user to reproduce the issue
4. Call \`debug_read\` to analyze captured logs
5. Identify the problem from the runtime data
6. Call \`debug_stop\` when done
7. Remove all fetch() instrumentation calls from the code

## If Instrumentations Already Exist
- Call \`debug_status\` first to check for existing port
- Use \`grep\` to find existing \`localhost:\\d+/log\` patterns in codebase
- Start server on the same port to avoid breaking existing instrumentations

## Example Instrumentation

After calling \`debug_start\`, you'll get a snippet like:
\`\`\`javascript
fetch("http://localhost:54321/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "LABEL_HERE", data: {YOUR_DATA}})
})
\`\`\`

Insert this at strategic points:
\`\`\`javascript
// Before an API call
fetch("http://localhost:54321/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "pre-api", data: {userId, requestBody}})
})

// After receiving response
fetch("http://localhost:54321/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "post-api", data: {response, status}})
})
\`\`\`

## Tips
- Use descriptive labels to make logs easy to understand
- Capture relevant variables at each point
- Add instrumentation around suspected problem areas
- Compare expected vs actual values in the logs`;

const DEBUG_SKILL = {
  name: 'debug',
  description:
    'Runtime debugging - start a debug server, instrument code with fetch() calls, capture and analyze execution data',
  content: `## CRITICAL: Port Handling
- \`debug_start\` returns a \`snippet\` with the correct port - ALWAYS use it
- Never hardcode ports in fetch() calls
- Call \`debug_status\` to get current port if needed later
- Server persists port to \`.opencode/debug.port\` so existing instrumentations keep working

## Workflow

1. \`debug_start\` - Returns {port, url, snippet}
2. Insert the returned \`snippet\` at strategic code locations:
   - Replace \`LABEL_HERE\` with descriptive label (e.g., "before-api", "after-parse")
   - Replace \`YOUR_DATA\` with variables to capture (e.g., \`{userId, response}\`)
3. Ask user to reproduce the issue
4. \`debug_read\` - Analyze captured logs (returns parsed JSON array)
5. \`debug_stop\` - Stop server when done
6. Remove all fetch() instrumentation calls from the code

## Before Starting - Check for Existing Instrumentations
1. Call \`debug_status\` - check if server already running or port persisted
2. Use grep to search for \`localhost:\\d+/log\` patterns in codebase
3. If found, ensure server starts on same port to avoid breaking existing code

## Tools Reference

| Tool | Args | Returns |
|------|------|---------|
| \`debug_start\` | \`port?\` | \`{port, url, snippet, message}\` |
| \`debug_stop\` | - | confirmation message |
| \`debug_read\` | \`tail?\` | \`{entries: [{timestamp, label, data}, ...], count}\` |
| \`debug_clear\` | - | confirmation message |
| \`debug_status\` | - | \`{active, port?, url?, persistedPort?, hint?}\` |

## Example Session

\`\`\`
> debug_start
{port: 54321, url: "http://localhost:54321", snippet: "fetch(...)"}

> [Insert snippet at line 42 and 67 in user's code]

> [User reproduces the issue]

> debug_read
{entries: [
  {timestamp: "...", label: "before-api", data: {userId: 123}},
  {timestamp: "...", label: "after-api", data: {error: "timeout"}}
], count: 2}

> [Analyze: API call is timing out]

> debug_stop
{message: "Debug server stopped."}

> [Remove instrumentation from lines 42 and 67]
\`\`\``,
};

// ============================================================
// PLUGIN EXPORT
// ============================================================

// NOTE: Do NOT export functions from main index.ts!
// OpenCode treats ALL exports as plugin instances and calls them.
// Use default export only.

const DebugAgentPlugin: Plugin = async (ctx) => {
  // ctx contains { directory, client } - we can use directory for paths
  return {
    // Register debug tools
    tool: {
      debug_start: debugStart,
      debug_stop: debugStop,
      debug_read: debugRead,
      debug_clear: debugClear,
      debug_status: debugStatus,
    },

    // Config hook to inject agent and skills
    async config(config) {
      // Inject debug agent
      config.agent = config.agent ?? {};
      config.agent['debug'] = {
        description: 'Runtime debugging - capture and analyze execution data',
        mode: 'primary',
        prompt: AGENT_PROMPT,
      };

      // Inject skills (using type assertion as skill may not be in Config type yet)
      const configWithSkill = config as typeof config & {
        skill?: Record<string, { name: string; description: string; content: string }>;
      };
      configWithSkill.skill = configWithSkill.skill ?? {};
      configWithSkill.skill[DEBUG_SKILL.name] = DEBUG_SKILL;
    },
  };
};

export default DebugAgentPlugin;
