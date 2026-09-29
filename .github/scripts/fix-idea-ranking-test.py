from pathlib import Path

path = Path('.github/scripts/one-shot-idea-distinctiveness.py')
text = path.read_text(encoding='utf-8')
start_marker = "  it('ranks stronger accepted premises ahead of merely adequate ones instead of preserving model order', () => {\\n"
end_marker = "\\n\\n\"\"\"\ntext = once(text, insert_before"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit(f'ranking test boundaries not found: start={start}, end={end}')
replacement = """  it('ranks higher distinctiveness ahead of lower distinctiveness after both candidates have passed', () => {\n    const baseline = gate.assess(strongShort, 'short_story');\n    expect(baseline.passed).toBe(true);\n    const low = { ...baseline, signals: { ...baseline.signals, distinctivenessScore: 6 } };\n    const high = { ...baseline, signals: { ...baseline.signals, distinctivenessScore: 9 } };\n    const originalAssess = gate.assess.bind(gate);\n    gate.assess = ((idea: any, storyType: 'short_story' | 'long_novel') => {\n      if (idea?.title === '较弱合格题材') return low;\n      if (idea?.title === '更强合格题材') return high;\n      return originalAssess(idea, storyType);\n    }) as typeof gate.assess;\n    try {\n      const selection = gate.select([{ title: '较弱合格题材' }, { title: '更强合格题材' }], 'short_story', 2);\n      expect(selection.accepted).toHaveLength(2);\n      expect(selection.accepted.map((item) => item.title)).toEqual(['更强合格题材', '较弱合格题材']);\n    } finally {\n      gate.assess = originalAssess;\n    }\n  });"""
path.write_text(text[:start] + replacement.replace('\n', '\\n') + text[end:], encoding='utf-8')
