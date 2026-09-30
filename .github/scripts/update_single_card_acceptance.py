from pathlib import Path

path = Path('server/src/acceptance/generation-diagnostics.acceptance.spec.ts')
source = path.read_text(encoding='utf-8')

old_generate = '''      if (generationCall === 1) {
        return { content: JSON.stringify(makePremiseSelectionFixture(5)) };
      }
      return { content: JSON.stringify({ ideas: [1, 2, 3, 4, 5].map(makeIdea) }) };'''
new_generate = '''      if (generationCall === 1) {
        return { content: JSON.stringify(makePremiseSelectionFixture(5)) };
      }
      const cardIndex = generationCall - 1;
      if (cardIndex >= 1 && cardIndex <= 5) {
        return { content: JSON.stringify({ ideas: [makeIdea(cardIndex)] }) };
      }
      throw new Error(`unexpected idea generation call: ${generationCall}`);'''
if source.count(old_generate) != 1:
    raise SystemExit(f'success fixture generation anchor count={source.count(old_generate)}')
source = source.replace(old_generate, new_generate, 1)

old_expectations = '''  expect(duplicate).toEqual(first);
  expect(realLLM.generate).toHaveBeenCalledTimes(2);
  expect(realLLM.generate).toHaveBeenNthCalledWith(1, expect.objectContaining({
    scenario: 'idea_generate', responseFormat: 'json_object', maxEmptyRetries: 1,
  }));
  expect(realLLM.generate).toHaveBeenNthCalledWith(2, expect.objectContaining({
    scenario: 'idea_generate', responseFormat: 'json_object', maxEmptyRetries: 1,
  }));'''
new_expectations = '''  expect(duplicate).toEqual(first);
  // 同一请求只执行一条共享主链：1 次创建前筛选 + 5 个不同 premise 各 1 次完整卡结构化。
  expect(realLLM.generate).toHaveBeenCalledTimes(6);
  for (let call = 1; call <= 6; call += 1) {
    expect(realLLM.generate).toHaveBeenNthCalledWith(call, expect.objectContaining({
      scenario: 'idea_generate', responseFormat: 'json_object', maxEmptyRetries: 1,
    }));
  }
  expect(first.appealGate).toMatchObject({
    structuringProtocol: 'one_selected_premise_per_call_server_owned_identity',
    generated: 5,
    returned: 5,
  });'''
if source.count(old_expectations) != 1:
    raise SystemExit(f'success fixture expectation anchor count={source.count(old_expectations)}')
source = source.replace(old_expectations, new_expectations, 1)

old_error = "  expect(String(result.error)).toContain('完整题材卡结构化应与创建前筛选出的 5 个题材一一对应');"
new_error = "  expect(String(result.error)).toContain('第 1/5 个已选题材结构化失败');\n  expect(String(result.error)).toContain('返回 0 张，期望恰好 1 张');"
if source.count(old_error) != 1:
    raise SystemExit(f'custom platform error anchor count={source.count(old_error)}')
source = source.replace(old_error, new_error, 1)

old_comment = '// 自定义平台标准应贯穿创建前筛选与完整卡结构化；这里故意让第二阶段返回空卡，验证失败点已经越过筛选阶段。'
new_comment = '// 自定义平台标准应贯穿创建前筛选与单题材完整卡结构化；这里故意让第一个已选题材返回空卡，验证失败点已经越过筛选阶段。'
if source.count(old_comment) != 1:
    raise SystemExit(f'custom platform comment anchor count={source.count(old_comment)}')
source = source.replace(old_comment, new_comment, 1)

# 锁住旧批量夹具不能回来。
if '[1, 2, 3, 4, 5].map(makeIdea)' in source:
    raise SystemExit('old five-card batch fixture still present')

path.write_text(source, encoding='utf-8')
