import { expect,it } from 'vitest';
import { discoveryPovChoices,toggleDiscoveryPov,discoveryPovMatches,discoveryPovForIdea } from '@novel/shared';
it('keeps legacy single choices and multiple choices when toggling',()=>{
 let value=toggleDiscoveryPov('第一人称','第三人称限知');
 expect(discoveryPovChoices(value)).toEqual(['第一人称','第三人称限知']);
 value=toggleDiscoveryPov(value,'第一人称');expect(value).toBe('第三人称限知');
 expect(toggleDiscoveryPov(value,'第三人称限知')).toBe('');
 expect(discoveryPovChoices('自定义视角')).toEqual(['自定义视角']);
});
it('never turns a candidate list into a fixed novel POV or accepts a different selection',()=>{
 const value=JSON.stringify(['第一人称','第三人称限知']);
 expect(discoveryPovMatches(value,'第三人称限知')).toBe(true);
 expect(discoveryPovMatches(value,'第二人称')).toBe(false);
 expect(discoveryPovForIdea(value,'第二人称')).toBe('');
 expect(discoveryPovForIdea('', '第三人称限知')).toBe('第三人称限知');
});
