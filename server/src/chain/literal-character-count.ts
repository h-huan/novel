/** Only direct, exact narrative claims about a complete, purely Han quotation. */
export function literalCharacterCountMismatches(content: string) {
  const findings: Array<{start:number;end:number;quote:string;declared:number;actual:number;evidence:string}> = [];
  const digits: Record<string,number> = {零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  const number = (value:string):number => {
    if (/^\d{1,2}$/.test(value)) return Number(value);
    if (value in digits) return digits[value];
    if (/^[一二三四五六七八九]?十[一二三四五六七八九]?$/.test(value)) {
      const [tens,units]=value.split('十');return (tens?digits[tens]:1)*10+(units?digits[units]:0);
    }
    return NaN;
  };
  // Do not score mixed scripts, punctuation, ellipses, prefixes or vague/range counts.
  const expression=/([“「『])([\u3400-\u4dbf\u4e00-\u9fff]{1,80})([”」』])\s*(?:这|那)?([零〇一二两三四五六七八九十\d]{1,3})个字/g;
  const pairs:Record<string,string>={'“':'”','「':'」','『':'』'};
  for(const match of content.matchAll(expression)) {
    if(pairs[match[1]]!==match[3]) continue;
    const start=match.index!,prefix=content.slice(0,start),near=prefix.slice(-8);
    if(/(?:不是|并非|不止|不只|至少|最多|所谓|不到|不足|超过|大约|约为)\s*$/.test(near))continue;
    if(/^[？?]/.test(content.slice(start+match[0].length)))continue;
    // A character's quoted or nested speech is not a verified narrator assertion.
    const stack:string[]=[];
    for(let index=0;index<prefix.length;index++){
      const char=prefix[index];
      if(char==='\\'){index++;continue;}
      if(char==='"'){if(stack.at(-1)==='"')stack.pop();else stack.push('"');}
      else if(pairs[char])stack.push(pairs[char]);else if(stack.at(-1)===char)stack.pop();
    }
    if(stack.length)continue;
    const declared=number(match[4]),actual=Array.from(match[2]).length;
    if(!Number.isFinite(declared)||declared===actual)continue;
    findings.push({start,end:start+match[0].length,quote:match[2],declared,actual,evidence:match[0]});
  }
  return findings;
}
