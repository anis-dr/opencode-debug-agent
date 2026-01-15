---
name: debug
description: Runtime debugging - start a debug server, instrument code with fetch() calls, capture and analyze execution data
---

## CRITICAL: Port Handling
- `debug_start` returns a `snippet` with the correct port - ALWAYS use it
- Never hardcode ports in fetch() calls
- Call `debug_status` to get current port if needed later
- Server persists port to `.opencode/debug.port` so existing instrumentations keep working

## Workflow

1. `debug_start` - Returns {port, url, snippet}
2. Insert the returned `snippet` at strategic code locations:
   - Replace `LABEL_HERE` with descriptive label (e.g., "before-api", "after-parse")
   - Replace `YOUR_DATA` with variables to capture (e.g., `{userId, response}`)
3. Ask user to reproduce the issue
4. `debug_read` - Analyze captured logs (returns parsed JSON array)
5. `debug_stop` - Stop server when done
6. Remove all fetch() instrumentation calls from the code

## Before Starting - Check for Existing Instrumentations
1. Call `debug_status` - check if server already running or port persisted
2. Use grep to search for `localhost:\d+/log` patterns in codebase
3. If found, ensure server starts on same port to avoid breaking existing code

## Tools Reference

| Tool | Args | Returns |
|------|------|---------|
| `debug_start` | `port?` | `{port, url, snippet, message}` |
| `debug_stop` | - | confirmation message |
| `debug_read` | `tail?` | `{entries: [{timestamp, label, data}, ...], count}` |
| `debug_clear` | - | confirmation message |
| `debug_status` | - | `{active, port?, url?, persistedPort?, hint?}` |

## Example Session

```
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
```
