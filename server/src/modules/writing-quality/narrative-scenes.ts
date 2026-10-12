/** 空行只分段；明确分场标记才形成可确定的结构边界。
 * 未标记的场景变化不能由词面证明，仍由全文语义验收确认，不能据此声称同一场景。
 */
export function splitNarrativeSceneWindows(content: string): string[] {
  return content.split(/(?:^|\n)[ \t]*(?:\*{3,}|-{3,}|—{3,})[ \t]*(?:\n|$)/).filter(s => s.trim());
}
