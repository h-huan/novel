import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd(), '..');
const activeRoots = [
  path.join(repoRoot, 'server', 'src'),
  path.join(repoRoot, 'desktop', 'src'),
];

const SKIP_SEGMENTS = [
  `${path.sep}database${path.sep}migrations${path.sep}`,
  `${path.sep}node_modules${path.sep}`,
];

// schema-reconciler is the one allowed cleanup boundary for retired database
// tables. Mentioning a retired table there means "drop it from old databases",
// not "keep the retired runtime alive". No other active source gets this waiver.
const LEGACY_CLEANUP_FILES = new Set([
  path.join('server', 'src', 'database', 'schema-reconciler.ts'),
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (SKIP_SEGMENTS.some(segment => file.includes(segment))) continue;
      if (entry.isDirectory()) walk(file);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.spec.tsx')) out.push(file);
    }
  };
  walk(root);
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('active runtime contains no retired creation or Canon-write flows', () => {
  it('does not reintroduce retired IdeaLab, editable PromptChain, or legacy AI-save surfaces', () => {
    const forbidden = [
      'idea-lab',
      'IdeaLabPage',
      'useIdeaLabStore',
      'PromptChainPage',
      '/prompt-chains',
      'templates/save',
      'templates/duplicate',
      'templates/validate',
      'templates/execute/',
      'chapter-save',
      "source: 'ai_generated'",
      'source: "ai_generated"',
      'standard_summarization_runs',
      'module_standard_versions',
      'module_standards',
      'idea_drafts',
    ];

    const violations: string[] = [];
    for (const root of activeRoots) {
      for (const file of sourceFiles(root)) {
        const relative = path.relative(repoRoot, file);
        if (LEGACY_CLEANUP_FILES.has(relative)) continue;
        const text = stripComments(fs.readFileSync(file, 'utf8'));
        for (const token of forbidden) {
          if (text.includes(token)) violations.push(`${relative} -> ${token}`);
        }
      }
    }

    expect(violations, `retired runtime surfaces must stay deleted:\n${violations.join('\n')}`).toEqual([]);
  });

  it('keeps the repository normative-document surface singular', () => {
    const rootDocs = fs.readdirSync(repoRoot).filter(name => name.toLowerCase().endsWith('.md'));
    const forbiddenDocs = rootDocs.filter(name =>
      /(?:standard|rules|progress|handoff|system_work)/i.test(name)
      && name !== 'QUALITY_EXECUTION.md',
    );
    expect(forbiddenDocs).toEqual([]);
    expect(rootDocs).toContain('README.md');
    expect(rootDocs).toContain('QUALITY_EXECUTION.md');
  });
});
