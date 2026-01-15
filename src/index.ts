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
import path from 'path';
import { debugStart, debugStop, debugRead, debugClear, debugStatus } from './tools';

// ============================================================
// SKILL LOADER
// Loads SKILL.md files from src/skill/ directory
// ============================================================

interface SkillFrontmatter {
  name: string;
  description: string;
}

interface ParsedSkill {
  name: string;
  description: string;
  content: string;
}

/**
 * Parse YAML frontmatter from a skill file
 */
function parseSkillFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: { name: '', description: '' }, body: content.trim() };
  }

  const [, yamlContent, body] = match;
  const frontmatter: SkillFrontmatter = { name: '', description: '' };

  for (const line of yamlContent.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key === 'name') frontmatter.name = value;
    if (key === 'description') frontmatter.description = value;
  }

  return { frontmatter, body: body.trim() };
}

/**
 * Load all skill files from the skill directory
 */
async function loadSkills(): Promise<ParsedSkill[]> {
  const skills: ParsedSkill[] = [];
  const skillDir = path.join(import.meta.dir, 'skill');
  const glob = new Bun.Glob('**/SKILL.md');

  try {
    for await (const file of glob.scan({ cwd: skillDir, absolute: true })) {
      const content = await Bun.file(file).text();
      const { frontmatter, body } = parseSkillFrontmatter(content);

      if (frontmatter.name) {
        skills.push({
          name: frontmatter.name,
          description: frontmatter.description,
          content: body,
        });
      }
    }
  } catch {
    // Skill directory may not exist yet
  }

  return skills;
}

/**
 * Load agent definition from markdown file
 */
async function loadAgentPrompt(): Promise<string> {
  try {
    const agentFile = path.join(import.meta.dir, 'agent', 'debug.md');
    const content = await Bun.file(agentFile).text();

    // Extract body after frontmatter
    const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return match ? match[1].trim() : content;
  } catch {
    return 'You are a debugging specialist.';
  }
}

export const DebugAgentPlugin: Plugin = async () => {
  // Load skills at initialization
  const skills = await loadSkills();
  const agentPrompt = await loadAgentPrompt();

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
        prompt: agentPrompt,
      };

      // Inject skills (using type assertion as skill may not be in Config type yet)
      const configWithSkill = config as typeof config & {
        skill?: Record<string, { name: string; description: string; content: string }>;
      };
      configWithSkill.skill = configWithSkill.skill ?? {};
      for (const skill of skills) {
        configWithSkill.skill[skill.name] = {
          name: skill.name,
          description: skill.description,
          content: skill.content,
        };
      }
    },
  };
};

// Default export for compatibility
export default DebugAgentPlugin;
