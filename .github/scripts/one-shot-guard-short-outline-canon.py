from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')

# Each persisted short-story chapter outline must be traceable to the actual
# detailed-outline model runs that produced it. Intermediate title/responsibility
# planning is already embedded into the detailed-outline prompt; do not create a
# second provenance graph for planning drafts.
text = once(
    text,
    "        let plannedChapterWords = 0;\n        const preparedChapters: Array<{\n",
    "        let plannedChapterWords = 0;\n        const shortOutlineSourceRunIds = new Set<string>();\n        const preparedChapters: Array<{\n",
    'short outline provenance set',
)

text = once(
    text,
    "          warnings.push(...chapterResult.warnings);\n          let chData = unwrapChapter(chapterResult.data, order + 1);\n",
    "          warnings.push(...chapterResult.warnings);\n          if (chapterResult.runId) shortOutlineSourceRunIds.add(String(chapterResult.runId));\n          let chData = unwrapChapter(chapterResult.data, order + 1);\n",
    'collect short outline draft run',
)

text = once(
    text,
    "            warnings.push(...repairResult.warnings);\n            repairRaw = repairResult.rawContent || repairRaw;\n",
    "            warnings.push(...repairResult.warnings);\n            if (repairResult.runId) shortOutlineSourceRunIds.add(String(repairResult.runId));\n            repairRaw = repairResult.rawContent || repairRaw;\n",
    'collect short outline repair run',
)

text = once(
    text,
    "              warnings.push(...salvageResult.warnings);\n              chData = unwrapChapter(salvageResult.data, order + 1);\n",
    "              warnings.push(...salvageResult.warnings);\n              if (salvageResult.runId) shortOutlineSourceRunIds.add(String(salvageResult.runId));\n              chData = unwrapChapter(salvageResult.data, order + 1);\n",
    'collect short outline salvage run',
)

# Restrict the persistence guard to the short/serial creation block. This exact
# anchor is immediately after the final chapter-function normalization and before
# the single transaction that writes book/volume + chapter outlines.
text = once(
    text,
    "        db.exec('BEGIN IMMEDIATE');\n        try {\n          db.prepare(`INSERT INTO outlines (id,project_id,level,parent_id,\"order\",title,content,chapter_function,goal_arc,target_words,actual_words,foreshadowing_ids,plot_points,status,character_ids,scenes,volumes,book_skeleton,created_at,updated_at)\n",
    "        if (preparedChapters.length > 0 && shortOutlineSourceRunIds.size === 0) {\n          throw new HttpException('短篇详细章纲缺少 generation run 凭证，已停止写入 Canon', 409);\n        }\n        for (const runId of shortOutlineSourceRunIds) {\n          this.generatedCanonGuard.assertStructuredCanCommit({\n            projectId,\n            runId,\n            expectedStages: ['outline'],\n            expectedScenarios: ['outline'],\n          });\n        }\n\n        db.exec('BEGIN IMMEDIATE');\n        try {\n          db.prepare(`INSERT INTO outlines (id,project_id,level,parent_id,\"order\",title,content,chapter_function,goal_arc,target_words,actual_words,foreshadowing_ids,plot_points,status,character_ids,scenes,volumes,book_skeleton,created_at,updated_at)\n",
    'guard short outline transaction',
)

path.write_text(text, encoding='utf-8')
