from pathlib import Path

script = Path(__file__).with_name('apply-canon-consistency-fix.py')
text = script.read_text(encoding='utf-8')
old = '''regex_once(
    chain,
    r"事实权威顺序：\\\\\\n1\\. 已保存正文、明确锁定状态、mustObeyRules/forbiddenWriting 是最高权威。\\\\\\n2\\. 当前章的具体到达时间、人物行动、场景与伏笔，以【详细大纲】为本章权威。\\\\\\n3\\. 自动扩展的世界档案/简介只作支持材料；若它与详细大纲对同一事实说法冲突，写入 sourceConflicts，不得要求正文同时满足两套说法，也不得把遵循详细大纲判成正文错误。\\\\\\n\\\\\\n必须严格按顺序执行：\\\\",
    "${STORY_FACT_PRIORITY}\\\\\\n\\\\\\n正文验收补充：世界观不可作为自动修复目标；已接受历史与未来计划冲突且未触碰世界观/确认故事核心时，保留历史并修未来计划；其它资料源冲突按修改范围最小、下游依赖最少的原则选择局部修复点。\\\\\\n\\\\\\n必须严格按顺序执行：\\\\",
    'remove conflicting body hierarchy',
)'''
new = '''regex_once(
    chain,
    r"事实权威顺序：.*?必须严格按顺序执行：",
    "${STORY_FACT_PRIORITY}\\n\\n正文验收补充：世界观不可作为自动修复目标；已接受历史与未来计划冲突且未触碰世界观/确认故事核心时，保留历史并修未来计划；其它资料源冲突按修改范围最小、下游依赖最少的原则选择局部修复点。\\n\\n必须严格按顺序执行：",
    'remove conflicting body hierarchy',
)'''
if old not in text:
    raise RuntimeError('expected narrow hierarchy matcher was not found in patch script')
patched = text.replace(old, new, 1)
exec(compile(patched, str(script), 'exec'), {'__file__': str(script), '__name__': '__main__'})
