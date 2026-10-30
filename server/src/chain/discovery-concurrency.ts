import { availableParallelism, freemem } from 'node:os';
import { IDEA_CARD_GENERATION_CONCURRENCY } from '../../shared/src/system-workflow-rules.registry';

/** Remote LLM concurrency must not assume this machine is the only workload.
 * Read live host headroom at each independent phase. This changes only
 * scheduling, never the per-request physical-call allowance or quality Gates.
 * It does not make intrinsically serial model dependencies parallel.
 */
export function adaptiveDiscoveryConcurrency(
 workItems: number,
 snapshot: { logicalCores: number; freeBytes: number } = {
  logicalCores: availableParallelism(), freeBytes: freemem(),
 },
): number {
 if (!Number.isInteger(workItems) || workItems < 1) throw Error('并发任务数量必须为正整数');
 const cores=Number.isFinite(snapshot.logicalCores)&&snapshot.logicalCores>0?snapshot.logicalCores:1;
 const free=Number.isFinite(snapshot.freeBytes)&&snapshot.freeBytes>0?snapshot.freeBytes:0;
 // Reserve at least 35% of usable logical processors for GUI, system and
 // editing. Protect at least 512 MiB and 35% of current free memory.
 const cpuSlots=Math.max(1,Math.floor(cores*0.65));
 const reserved=Math.max(512*1024**2,free*0.35);
 const memorySlots=Math.max(1,Math.floor(Math.max(0,free-reserved)/(256*1024**2)));
 return Math.max(1,Math.min(workItems,IDEA_CARD_GENERATION_CONCURRENCY,cpuSlots,memorySlots));
}
