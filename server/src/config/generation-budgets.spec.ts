import {afterEach,describe,it,expect} from 'vitest';
import * as fs from 'fs';import * as os from 'os';import * as path from 'path';
import {GENERATION_BUDGET_DEFAULTS,validateGenerationBudgets,readGenerationBudgets,saveGenerationBudgets,generationOutputBounds} from './generation-budgets';
const old=process.env.DATA_DIR;let directory:string|undefined;
afterEach(()=>{if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;if(directory){fs.rmSync(directory,{recursive:true,force:true});directory=undefined;}});
describe('persistent generation budget configuration',()=>{
 it('defaults to whole-material review and retains explicit manual compatibility',()=>{expect(validateGenerationBudgets({sourceBatchSize:3,presentationBatchSize:2}).reviewGroupingMode).toBe(0);expect(validateGenerationBudgets({reviewGroupingMode:1}).reviewGroupingMode).toBe(1);expect(()=>validateGenerationBudgets({reviewGroupingMode:2})).toThrow();});
 it('has room for initial review, correction and changed-card review',()=>{expect(GENERATION_BUDGET_DEFAULTS.presentationMaxPhysicalCalls).toBeGreaterThan(3);expect(GENERATION_BUDGET_DEFAULTS.sourceMaxPhysicalCalls).toBeGreaterThan(2);expect(GENERATION_BUDGET_DEFAULTS.structuredOutputTokens).toBeGreaterThan(32768);});
 it('rejects unknown, noninteger, negative and inconsistent limits',()=>{for(const value of [{wrong:4},{sourceBatchSize:0},{presentationMaxPhysicalCalls:2.2},{structuredOutputTokens:200000,structuredOutputCeiling:131072}])expect(()=>validateGenerationBudgets(value)).toThrow();});
 it('persists edits and partial updates without touching model credentials',()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'novel-budget-'));process.env.DATA_DIR=directory;expect(readGenerationBudgets()).toEqual(GENERATION_BUDGET_DEFAULTS);saveGenerationBudgets({presentationMaxPhysicalCalls:30});expect(readGenerationBudgets().presentationMaxPhysicalCalls).toBe(30);saveGenerationBudgets({sourceBatchSize:2});expect(readGenerationBudgets().presentationMaxPhysicalCalls).toBe(30);expect(readGenerationBudgets().sourceBatchSize).toBe(2);expect(fs.readdirSync(directory)).toEqual(['generation-budgets.json']);});
 it('honors the caller budget and enables the extended ceiling only for an explicitly large request',()=>{const settings={...GENERATION_BUDGET_DEFAULTS,structuredOutputTokens:196608,structuredOutputCeiling:393216};expect(generationOutputBounds('deepseek-flash',32768,settings)).toEqual({initial:32768,ceiling:32768});expect(generationOutputBounds('deepseek-flash',196608,settings)).toEqual({initial:196608,ceiling:393216});expect(generationOutputBounds('another-model',8192,settings)).toEqual({initial:8192,ceiling:32768});});
});


it('uses the saved first-round amount for inherited structured calls while preserving explicit and non-Flash budgets',()=>{
 const settings={...GENERATION_BUDGET_DEFAULTS,structuredOutputTokens:131072,structuredOutputCeiling:393216};
 expect(generationOutputBounds('deepseek-flash',32768,settings,true)).toEqual({initial:131072,ceiling:393216});
 expect(generationOutputBounds('deepseek-flash',196608,settings,true)).toEqual({initial:196608,ceiling:393216});
 expect(generationOutputBounds('deepseek-flash',4096,settings)).toEqual({initial:4096,ceiling:32768});
 expect(generationOutputBounds('another-model',4096,settings,true)).toEqual({initial:4096,ceiling:32768});
});
