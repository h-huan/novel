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
  // Anaphoric counts ("这四个字", or a paragraph opening with "四个字") point
  // back to the nearest complete quotation. Direct quotes are owned by the
  // expression above. Ambiguous windows, quoted speech and mixed scripts are
  // skipped rather than guessed.
  const quotedExpression=/([“「『])([^“”「」『』]{1,80})([”」』])/g;
  const countPhrase=/(?:这|那)([零〇一二两三四五六七八九十\d]{1,3})个字/g;
  const paragraphOpeningCount=/^[ \t]*([零〇一二两三四五六七八九十\d]{1,3})个字/gm;
  const isInsideQuote=(index:number):boolean=>{
    const stack:string[]=[];
    const prefix=content.slice(0,index);
    for(let i=0;i<prefix.length;i++){
      const char=prefix[i];
      if(char==='\\'){i++;continue;}
      if(char==='"'){if(stack.at(-1)==='"')stack.pop();else stack.push('"');}
      else if(pairs[char])stack.push(pairs[char]);else if(stack.at(-1)===char)stack.pop();
    }
    return stack.length>0;
  };
  const antecedentAt=(index:number):{text:string;start:number;end:number}|null=>{
    const windowStart=Math.max(0,index-400);
    const window=content.slice(windowStart,index);
    const quotes=[...window.matchAll(quotedExpression)]
      .filter(row=>pairs[row[1]]===row[3])
      .map(row=>({text:row[2].replace(/[。！？；：，、…\s]+$/,''),start:windowStart+row.index!,end:windowStart+row.index!+row[0].length}))
      .filter(row=>row.text.length>=2&&/^[㐀-䶿一-鿿]+$/.test(row.text));
    if(quotes.length!==1)return null;
    const [quote]=quotes;
    // The immediate "quote + N个字" form belongs to the direct expression.
    // A paragraph break means the count is anaphoric, not adjacent.
    const between=content.slice(quote.end,index);
    if(index-quote.end<4&&!between.includes('\n')&&between.trim()==='')return null;
    return quote;
  };
  const inspectCount=(raw:string,phraseIndex:number,declaredText:string)=>{
    const start=phraseIndex;
    const end=start+raw.length;
    if(isInsideQuote(start))return;
    const near=content.slice(Math.max(0,start-8),start);
    if(/(?:不是|并非|不止|不只|至少|最多|所谓|不到|不足|超过|大约|约为)\s*$/.test(near))return;
    const antecedent=antecedentAt(start);
    if(!antecedent)return;
    const declared=number(declaredText),actual=Array.from(antecedent.text).length;
    if(!Number.isFinite(declared)||declared===actual)return;
    // An anaphoric count can point at a sub-phrase inside the quote ("这两个字"
    // referring to two words of a longer sentence). Only flag a close count
    // where the quote is at least as long as the claimed count; a shorter
    // quote is ambiguous and must not become a hardline false positive.
    if(actual<declared||Math.abs(actual-declared)>2)return;
    const evidence=`${antecedent.text}……${raw}`;
    findings.push({start,end,quote:antecedent.text,declared,actual,evidence});
  };
  for(const match of content.matchAll(countPhrase)) {
    inspectCount(match[0],match.index!,match[1]);
  }
  for(const match of content.matchAll(paragraphOpeningCount)) {
    inspectCount(match[1]+'个字',match.index!+match[0].indexOf(match[1]),match[1]);
  }
  return findings;
}
