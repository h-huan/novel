import * as fs from 'node:fs';
import * as path from 'node:path';

/** Each runtime source is compared to its own output, including incremental builds. */
export function findStaleBuildArtifact(serverRoot: string): { source: string; artifact: string; missing: boolean } | null {
  const distRoot = path.join(serverRoot, 'dist');
  if (!fs.existsSync(distRoot)) return null;
  const stack = [path.join(serverRoot, 'src'), path.join(serverRoot, 'shared', 'src')].filter(root => fs.existsSync(root));
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const source = path.join(current, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') stack.push(source); continue; }
      if (!entry.name.endsWith('.ts') || /(?:\.d|\.spec)\.ts$/.test(entry.name)) continue;
      const artifact = path.join(distRoot, path.relative(serverRoot, source).replace(/\.ts$/, '.js'));
      if (!fs.existsSync(artifact)) return { source, artifact, missing: true };
      if (fs.statSync(source).mtimeMs > fs.statSync(artifact).mtimeMs) return { source, artifact, missing: false };
    }
  }
  return null;
}
