import { it, expect } from 'vitest';
import { adaptiveDiscoveryConcurrency } from './discovery-concurrency';

const gib=1024**3;
it('adapts to host processors without saturating the machine or hardcoding a laptop',()=>{
 expect(adaptiveDiscoveryConcurrency(20,{logicalCores:2,freeBytes:16*gib})).toBe(1);
 expect(adaptiveDiscoveryConcurrency(20,{logicalCores:4,freeBytes:16*gib})).toBe(2);
 expect(adaptiveDiscoveryConcurrency(20,{logicalCores:8,freeBytes:16*gib})).toBe(5);
 expect(adaptiveDiscoveryConcurrency(20,{logicalCores:12,freeBytes:16*gib})).toBe(7);
 expect(adaptiveDiscoveryConcurrency(20,{logicalCores:32,freeBytes:16*gib})).toBe(8);
});
it('reserves memory and never expands beyond actual demand or remote task ceiling',()=>{
 expect(adaptiveDiscoveryConcurrency(20,{logicalCores:16,freeBytes:256*1024**2})).toBe(1);
 expect(adaptiveDiscoveryConcurrency(20,{logicalCores:16,freeBytes:1024**3})).toBe(2);
 expect(adaptiveDiscoveryConcurrency(3,{logicalCores:16,freeBytes:16*gib})).toBe(3);
 expect(adaptiveDiscoveryConcurrency(1,{logicalCores:16,freeBytes:16*gib})).toBe(1);
 expect(adaptiveDiscoveryConcurrency(0,{logicalCores:8,freeBytes:16*gib})).toBe(1);
 expect(()=>adaptiveDiscoveryConcurrency(-1,{logicalCores:8,freeBytes:16*gib})).toThrow();
});
