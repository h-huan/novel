import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';

const launcher = readFileSync(path.resolve(process.cwd(), 'scripts/dev.js'), 'utf8');
const restart = readFileSync(path.resolve(process.cwd(), '../restart.ps1'), 'utf8');

async function launch(backendStatus: string) {
  const spawns: Array<{ exe: string; args: string[]; options: Record<string, unknown> }> = [];
  const messages: string[] = [];
  const child = { pid: 42, exitCode: null, signalCode: null, once: vi.fn(), kill: vi.fn() };
  const fakeProcess = {
    platform: 'linux', execPath: '/node', argv: ['/node', 'scripts/dev.js'],
    env: {}, exitCode: undefined as number | undefined, once: vi.fn(),
  };
  const mockRequire = Object.assign(
    (name: string) => {
      if (name === 'node:path') return path;
      if (name === 'node:child_process') return {
        spawn: (exe: string, args: string[], options: Record<string, unknown>) => {
          spawns.push({exe, args, options}); return child;
        },
        spawnSync: vi.fn(),
      };
      throw new Error('Unexpected require: ' + name);
    },
    { resolve: (name: string) => name === 'vite'
      ? '/node_modules/vite/package.json' : (() => { throw new Error('Unknown module'); })() },
  );
  runInNewContext(launcher, {
    __dirname: path.resolve(process.cwd(), 'scripts'),
    require: mockRequire,
    process: fakeProcess,
    console: { log: (value: string) => messages.push(value), error: (value: string) => messages.push(value) },
    fetch: async () => ({ ok: true, json: async () => ({ status: backendStatus }) }),
    AbortSignal,
  });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  return {spawns, messages, fakeProcess};
}

describe('isolated frontend development launcher', () => {
  it('starts exactly Vite when an independently managed backend is healthy', async () => {
    const result = await launch('ok');
    expect(result.spawns).toHaveLength(1);
    expect(result.spawns[0].args).toEqual(['--host', '0.0.0.0']);
    expect(result.spawns[0].exe).toMatch(/vite[/\\]bin[/\\]vite\.js$/);
    expect(result.spawns.some(x => x.args.includes('--watch'))).toBe(false);
    expect(result.messages.some(m => m.includes('backend healthy'))).toBe(true);
  });

  it('does not launch a competing Nest watcher when backend is unavailable', async () => {
    const result = await launch('down');
    expect(result.spawns).toEqual([]);
    expect(result.fakeProcess.exitCode).toBe(1);
    expect(result.messages.some(m => m.includes('Backend 3100 not healthy'))).toBe(true);
  });
});

describe('scoped restart ownership', () => {
  it('keeps backend/frontend state separately and does not start frontend after a failed backend check', () => {
    expect(restart).toContain("function Get-ProjectRootIds($Snapshot, $ChildrenMap, [int[]]$StateIds, [string]$Scope = 'all')");
    expect(restart).toContain('$stateIds = @(Read-DevState -Scope $Only)');
    expect(restart).toContain("if ($Scope -eq 'back' -and $name -eq 'frontend') { continue }");
    expect(restart).toContain("if ($Scope -eq 'front' -and $name -eq 'backend') { continue }");
    expect(restart).toContain('Get-PreservedDevState -Scope $Only');
    expect(restart).toContain("if ($Only -eq 'front') {");
    expect(restart).toContain('停止启动前端');
  });
});