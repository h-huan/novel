import type { DatabaseSync } from 'node:sqlite';

/**
 * 取本书人物姓名/称谓白名单（主角 → 主要角色 → 其他为序，顺序稳定、按名去重）。
 *
 * 【防复发 · 勿再内联这条 SQL】此前同一份查询在本仓库有三处、口径互不相同：
 *   ① `chain.controller.getProjectCharacterNames` —— 带角色排序 + 去重（最完整）；
 *   ② `generation-metrics.service` —— 裸 `SELECT name FROM characters WHERE project_id=?`，不排序、不去重；
 *   ③ 写作质量质检侧 —— 【根本没有】这份白名单。
 * 后果：同一段正文在「生成链」与「质检链」拿到内容与顺序都不同的白名单，硬红线规则 32
 * （人名/称谓独占一行，其判据就是这份白名单）与二次生成的故事身份守护因此在两条链路上得到
 * 两套结论 —— 作者侧表现即「同一条规则 Gate 时过时不过」「改了还是不过」。
 * 本文件取代上面三处；任何模块需要本书人物名，一律调用 `loadCharacterNames`。
 *
 * 零 LLM、可复算：纯 SQL + 去重。不引入缓存 —— 作者改人名/加角色后必须立刻生效。
 * 不 catch、不返回空数组兜底：读库失败必须显式抛出，由调用方按其事务语义处理
 * （静默返回空数组会把「读不到白名单」伪装成「本书没有人物」，规则 32 会因此悄悄失效）。
 */
export function loadCharacterNames(db: DatabaseSync, projectId: string): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM characters WHERE project_id=? AND name IS NOT NULL AND trim(name)<>'' ORDER BY CASE WHEN role='protagonist' THEN 0 WHEN role='main' THEN 1 ELSE 2 END, rowid",
    )
    .all(projectId) as Array<{ name: string }>;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const n = String(r.name || '').trim();
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}