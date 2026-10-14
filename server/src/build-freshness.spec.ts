import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findStaleBuildArtifact } from './build-freshness';
const roots: string[] = [];
afterEach(()=>{ for(const root of roots.splice(0)) rmSync(root,{recursive:true,force:true}); });
function fixture() {
 const root=mkdtempSync(join(tmpdir(),'novel-build-'));roots.push(root);
 for(const folder of ['src','shared/src','dist/src','dist/shared/src']) mkdirSync(join(root,folder),{recursive:true});
 const file=(name:string,time:number)=>{const p=join(root,name);writeFileSync(p,'');utimesSync(p,time,time);};
 return {root,file};
}
describe('runtime artifact freshness',()=>{
 it('catches missing emitted middleware before Nest loads AppModule',()=>{
  const {root,file}=fixture();
  mkdirSync(join(root,'src/common'),{recursive:true});
  file('src/app.module.ts',100);file('dist/src/app.module.js',110);
  file('src/common/creation-context.middleware.ts',100);
  const failure=findStaleBuildArtifact(root);
  expect(failure?.missing).toBe(true);
  expect(failure?.artifact).toBe(join(root,'dist/src/common/creation-context.middleware.js'));
 });
 it('uses a clean compiled-server entry on regular start, retaining watch as explicit dev mode',()=>{
  const scripts=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).scripts;
  expect(scripts.start).toContain('npm run build');
  expect(scripts.start).toContain('dist/src/main.js');
  expect(scripts.start).not.toContain('nest.js start');
  expect(scripts.postbuild).toContain('verify-runtime-build.cjs');
  expect(scripts['start:dev']).toContain('--watch');
 });

 it('accepts incremental outputs alongside unchanged older modules',()=>{
  const {root,file}=fixture();file('src/old.ts',100);file('dist/src/old.js',110);file('src/new.ts',200);file('dist/src/new.js',210);
  expect(findStaleBuildArtifact(root)).toBeNull();
 });
 it('blocks the actual stale corresponding output',()=>{
  const {root,file}=fixture();file('src/new.ts',200);file('dist/src/new.js',110);
  expect(findStaleBuildArtifact(root)?.source).toBe(join(root,'src/new.ts'));
 });
 it('blocks missing shared runtime outputs',()=>{
  const {root,file}=fixture();file('shared/src/enum.ts',200);
  expect(findStaleBuildArtifact(root)?.missing).toBe(true);
 });
 it('ignores non-emitted tests and declarations',()=>{
  const {root,file}=fixture();file('src/new.spec.ts',300);file('src/ambient.d.ts',300);
  expect(findStaleBuildArtifact(root)).toBeNull();
 });
});
