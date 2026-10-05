import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function productionSources(dir:string):string[] {
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const path=join(dir,entry.name);
    return entry.isDirectory()?productionSources(path):entry.name.endsWith('.ts')&&!entry.name.endsWith('.spec.ts')?[path]:[];
  });
}

it('生产入口不得恢复已退役的写作规则副本和整章修复回退',()=>{
  const retired=[/buildOutlineAdherenceContract/,/buildNarrativeQualityContract/,/buildAlignmentRepairPrompt/,
    /每1000字必须有钩子或爽点/,/至少每3组问答插入/,/每章至少3处不完美细节/,
    /增加具体的动作细节和五感描写/,/主角至少覆盖热血与牺牲之一/,
    /每章采用八拍结构/,/const shortStoryPrompt/,
    /转场机械词 ≥ 3 次/,
    /只补判确定性扫描覆盖不到的两项/];
  const violations=productionSources(join(process.cwd(),'src')).flatMap(path=>{
    const source=readFileSync(path,'utf8');
    return retired.filter(pattern=>pattern.test(source)).map(pattern=>({path,pattern:pattern.source}));
  });
  expect(violations).toEqual([]);
});
