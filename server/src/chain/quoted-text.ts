/** 配对引号的表面文本目录；只标记引文，不判断说话人或对白语义。 */
export function quotedText(content: string): Array<{ text: string; quote: string; start: number }> {
  // 每类只与自身闭合；外层匹配消费嵌套引号，避免重复计数。
  const pattern = /“([^”]*)”|「([^」]*)」|『([^』]*)』|"((?:\\.|[^"\\])*)"/g;
  return [...content.matchAll(pattern)].map(m => ({
    text: m[1] ?? m[2] ?? m[3] ?? m[4] ?? '', quote: m[0], start: m.index!,
  }));
}
