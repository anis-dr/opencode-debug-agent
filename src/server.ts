/**
 * Debug Server - Hono-based HTTP server for capturing runtime debug data
 *
 * Features:
 * - CORS enabled for browser instrumentation
 * - Port persistence across sessions
 * - NDJSON log format
 * - Auto-flush with configurable interval
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

interface LogEntry {
  timestamp: string;
  label: string;
  data: unknown;
}

interface StartResult {
  port: number;
  url: string;
}

interface ServerInfo {
  active: boolean;
  port?: number;
  url?: string;
}

class DebugServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private writer: ReturnType<(typeof Bun.file)['prototype']['writer']> | null = null;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  private portFile = '.opencode/debug.port';
  private logFile = '.opencode/debug.log';

  /**
   * Start the debug server
   * Port priority: 1) User-specified → 2) Persisted port → 3) Auto-select
   */
  async start(port?: number): Promise<StartResult> {
    // If already running, return existing info
    if (this.server) {
      const existingPort = this.server.port ?? 0;
      return {
        port: existingPort,
        url: `http://localhost:${existingPort}`,
      };
    }

    // Determine target port
    const targetPort = port ?? (await this.loadPersistedPort()) ?? 0;

    // Create Hono app
    const app = new Hono();

    // Enable CORS for browser instrumentation
    app.use(
      '/*',
      cors({
        origin: '*',
        allowMethods: ['POST', 'GET', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
      })
    );

    // POST /log - receive debug data
    app.post('/log', async (c) => {
      try {
        const body = await c.req.json();
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          label: body.label ?? 'unknown',
          data: body.data ?? body,
        };
        await this.appendLog(entry);
        return c.json({ success: true });
      } catch {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
    });

    // GET /health - health check
    app.get('/health', (c) => c.text('OK'));

    // Ensure .opencode directory exists
    await mkdir(dirname(this.logFile), { recursive: true });

    // Initialize log file writer
    const file = Bun.file(this.logFile);
    this.writer = file.writer({ highWaterMark: 1024 * 8 });

    // Start server
    this.server = Bun.serve({
      fetch: app.fetch,
      port: targetPort,
    });

    // Get the actual port (Bun may have assigned one if we requested 0)
    const actualPort = this.server.port ?? 0;

    // Persist the port for future sessions
    await this.persistPort(actualPort);

    // Auto-flush every 5 seconds
    this.flushInterval = setInterval(() => {
      this.writer?.flush();
    }, 5000);

    return {
      port: actualPort,
      url: `http://localhost:${actualPort}`,
    };
  }

  /**
   * Stop the debug server
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    if (this.writer) {
      await this.writer.flush();
      await this.writer.end();
      this.writer = null;
    }

    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Get current server info
   */
  getInfo(): ServerInfo {
    if (!this.server) {
      return { active: false };
    }
    return {
      active: true,
      port: this.server.port,
      url: `http://localhost:${this.server.port}`,
    };
  }

  /**
   * Get persisted port (for when server is not running)
   */
  async getPersistedPort(): Promise<number | null> {
    return this.loadPersistedPort();
  }

  /**
   * Read log entries
   */
  async readLogs(tail?: number): Promise<LogEntry[]> {
    try {
      // Flush before reading to ensure all data is written
      await this.writer?.flush();

      const file = Bun.file(this.logFile);
      if (!(await file.exists())) {
        return [];
      }

      const content = await file.text();
      const lines = content.trim().split('\n').filter(Boolean);

      const entries: LogEntry[] = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip malformed lines
        }
      }

      if (tail && tail > 0) {
        return entries.slice(-tail);
      }

      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Clear log file
   */
  async clearLogs(): Promise<void> {
    // Stop current writer if exists
    if (this.writer) {
      await this.writer.flush();
      await this.writer.end();
    }

    // Truncate the file
    await Bun.write(this.logFile, '');

    // Restart writer if server is running
    if (this.server) {
      const file = Bun.file(this.logFile);
      this.writer = file.writer({ highWaterMark: 1024 * 8 });
    }
  }

  /**
   * Append a log entry
   */
  private async appendLog(entry: LogEntry): Promise<void> {
    if (!this.writer) {
      // Server not running, append directly to file
      await mkdir(dirname(this.logFile), { recursive: true });
      const file = Bun.file(this.logFile);
      const existing = (await file.exists()) ? await file.text() : '';
      await Bun.write(this.logFile, existing + JSON.stringify(entry) + '\n');
      return;
    }

    this.writer.write(JSON.stringify(entry) + '\n');
  }

  /**
   * Load persisted port from file
   */
  private async loadPersistedPort(): Promise<number | null> {
    try {
      const file = Bun.file(this.portFile);
      if (!(await file.exists())) {
        return null;
      }
      const content = await file.text();
      const port = parseInt(content.trim(), 10);
      return isNaN(port) ? null : port;
    } catch {
      return null;
    }
  }

  /**
   * Persist port to file
   */
  private async persistPort(port: number): Promise<void> {
    await mkdir(dirname(this.portFile), { recursive: true });
    await Bun.write(this.portFile, String(port));
  }
}

// Singleton instance
export const debugServer = new DebugServer();
