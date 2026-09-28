from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')

old = """      if (batchChapters.length !== batchNos.length) {
        throw new HttpException(`滚动补纲应返回${batchNos.length}章，实际返回${batchChapters.length}章，已停止以避免章序错乱`, 502);
      }

      for (let idx = 0; idx < batchChapters.length; idx++) {
"""
new = """      if (batchChapters.length !== batchNos.length) {
        throw new HttpException(`滚动补纲应返回${batchNos.length}章，实际返回${batchChapters.length}章，已停止以避免章序错乱`, 502);
      }
      this.generatedCanonGuard.assertStructuredCanCommit({
        projectId,
        runId: result.runId,
        expectedStages: ['outline'],
        expectedScenarios: ['outline'],
      });

      for (let idx = 0; idx < batchChapters.length; idx++) {
"""
text = once(text, old, new, 'guard rollout outline source run')

path.write_text(text, encoding='utf-8')
