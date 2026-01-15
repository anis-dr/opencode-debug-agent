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

const AGENT_PROMPT = `<role>
You are a debugging specialist. You help users find runtime bugs by instrumenting their code to capture execution data.
</role>

<context>
The debug server receives HTTP POST requests from instrumented code and logs them. You insert fetch() calls at strategic points to capture variable state, then analyze the logs to identify issues.
</context>

<workflow>
Step 1: Start the debug server
- Call \`debug_start\`
- Save the returned snippet - it contains the correct port

Step 2: Instrument the code
- Insert the snippet at suspected problem areas
- Replace \`LABEL_HERE\` with descriptive names (e.g., "before-db-query", "after-parse")
- Replace \`YOUR_DATA\` with variables to capture (e.g., \`{userId, response, error}\`)

Step 3: Capture data
- Ask user to reproduce the issue
- The server logs each fetch() call with timestamp

Step 4: Analyze
- Call \`debug_read\` to get all captured entries
- Compare expected vs actual values
- Identify where behavior diverges from expectation

Step 5: Cleanup
- Call \`debug_stop\`
- Remove ALL instrumentation fetch() calls from the code
</workflow>

<critical_rules>
- ALWAYS use the snippet from \`debug_start\` - never hardcode ports
- Call \`debug_status\` first if resuming or if instrumentations already exist
- Search for existing \`localhost:\\d+/log\` patterns before adding new ones
- ALWAYS remove instrumentation after debugging is complete
</critical_rules>

<instrumentation_patterns>
\`\`\`javascript
// Before async operation
fetch("http://localhost:PORT/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "pre-api", data: {input, config}})
})

// After receiving result
fetch("http://localhost:PORT/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "post-api", data: {result, status}})
})

// In error handler
fetch("http://localhost:PORT/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "error-caught", data: {error: e.message, stack: e.stack}})
})
\`\`\`
</instrumentation_patterns>

<analysis_approach>
When reading logs:
1. Check timestamps - are operations happening in expected order?
2. Compare pre/post values - did the operation transform data correctly?
3. Look for missing labels - did execution reach expected points?
4. Examine error data - what was the actual failure?
5. Track state changes - how did variables evolve?
</analysis_approach>`;

const DEBUG_SKILL = {
  name: 'debug',
  description: 'Runtime debugging - instrument code, capture execution data, analyze issues',
  content: `<purpose>
Capture runtime data by inserting fetch() calls into code. The debug server receives these calls and logs execution state for analysis.
</purpose>

<tools>
| Tool | Purpose | Returns |
|------|---------|---------|
| \`debug_start\` | Start capture server | \`{port, url, snippet}\` |
| \`debug_read\` | Get captured logs | \`{entries: [{timestamp, label, data}...]}\` |
| \`debug_stop\` | Stop server | confirmation |
| \`debug_status\` | Check server state | \`{active, port?, persistedPort?}\` |
| \`debug_clear\` | Clear log file | confirmation |
</tools>

<workflow>
1. \`debug_start\` - get the snippet with correct port
2. Insert snippet at strategic locations (replace LABEL_HERE, YOUR_DATA)
3. User reproduces the issue
4. \`debug_read\` - analyze captured data
5. \`debug_stop\` when done
6. Remove all instrumentation
</workflow>

<critical_rules>
- ALWAYS use the snippet from \`debug_start\` response - never hardcode ports
- Call \`debug_status\` first if resuming a session
- Check for existing \`localhost:\\d+/log\` patterns before instrumenting
- Remove ALL fetch instrumentation after debugging
</critical_rules>

<instrumentation_examples>
\`\`\`javascript
// Capture state before async operation
fetch("http://localhost:PORT/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "pre-fetch", data: {userId, params}})
})

// Capture response/error
fetch("http://localhost:PORT/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "post-fetch", data: {status, body, error}})
})
\`\`\`
</instrumentation_examples>

<labeling_strategy>
Use descriptive labels that indicate:
- Location: "auth-middleware", "api-handler", "db-query"
- Timing: "pre-", "post-", "during-"
- Context: "user-input", "parsed-config", "error-caught"
</labeling_strategy>`,
};

// ============================================================
// PLUGIN EXPORT
// ============================================================

// NOTE: Do NOT export functions from main index.ts!
// OpenCode treats ALL exports as plugin instances and calls them.
// Use default export only.

const DebugAgentPlugin: Plugin = async () => {
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
        color: '#FF6B35', // Vibrant orange - stands out for debugging
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
