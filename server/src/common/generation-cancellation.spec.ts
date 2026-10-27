import {describe,expect,it} from 'vitest';
import {GenerationTasks,GenerationCancelledError,assertGenerationActive,currentGenerationSignal} from './generation-cancellation';

describe('discovery cancellation propagates to the actual running model task',()=>{
 it('stops the exact discovery request, preserves other scopes and releases the slot',async()=>{
  const tasks=new GenerationTasks();
  let signalReady!:()=>void;
  const ready=new Promise<void>(resolve=>{signalReady=resolve;});
  const active=tasks.run('discovery','idea-123','',async()=>{
   const signal=currentGenerationSignal();
   expect(signal).toBeDefined();
   return new Promise<never>((_resolve,reject)=>{
    signal!.addEventListener('abort',()=>{
     try{assertGenerationActive();reject(Error('Cancellation signal failed to prevent generation'));}
     catch(error){reject(error);}
    },{once:true});
    signalReady();
   });
  });
  await ready;
  expect(tasks.cancel('discovery','idea-other').cancelled).toBe(false);
  expect(tasks.cancel('creation','idea-123').cancelled).toBe(false);
  expect(tasks.cancel('discovery','idea-123').cancelled).toBe(true);
  await expect(active).rejects.toBeInstanceOf(GenerationCancelledError);
  expect(tasks.cancel('discovery','idea-123').cancelled).toBe(false);
  await expect(tasks.run('discovery','idea-123','',async()=>{
   assertGenerationActive();return 'clean next discovery';
  })).resolves.toBe('clean next discovery');
 });
});
