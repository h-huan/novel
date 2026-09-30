import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const chainDir = path.resolve(__dirname);
const read = (name: string) => fs.readFileSync(path.join(chainDir, name), 'utf8');

describe('chain HTTP architecture', () => {
  it('keeps the legacy orchestrator out of Nest controller registration', () => {
    const moduleSource = read('chain.module.ts');
    const controllersBlock = moduleSource.match(/controllers\s*:\s*\[([\s\S]*?)\]\s*,\s*providers\s*:/)?.[1] ?? '';
    const providersBlock = moduleSource.match(/providers\s*:\s*\[([\s\S]*?)\]\s*,\s*exports\s*:/)?.[1] ?? '';

    expect(controllersBlock).toContain('ChainPlanningController');
    expect(controllersBlock).toContain('ChainWritingController');
    expect(controllersBlock).toContain('ChainUtilityController');
    expect(controllersBlock).not.toMatch(/\bChainController\b/);
    expect(providersBlock).toMatch(/\bChainController\b/);
  });

  it('keeps focused route adapters under the existing /chain contract', () => {
    for (const file of [
      'chain-planning.controller.ts',
      'chain-writing.controller.ts',
      'chain-utility.controller.ts',
    ]) {
      const source = read(file);
      expect(source).toContain("@Controller('chain')");
      expect(source).toContain("from './chain.controller'");
    }
  });

  it('keeps broad premise search as a non-blocking target before full idea cards', () => {
    const source = read('chain.controller.ts');

    expect(source).toContain('normalizePremiseSelectionPayload');
    expect(source).toContain('premisePoolTargetMet');
    expect(source).toContain('pool 以 ${premisePoolSize} 项为广搜目标，不是整批成功的硬门槛');
    expect(source).toContain('selectedPremises 必须恰好 ${requestedCount} 项');
    expect(source).not.toContain('创建前题材筛选未形成至少');
    expect(source).not.toContain('selectedPremiseIds');
    expect(source).not.toContain('pool.length < premisePoolSize || malformed');
  });
});
