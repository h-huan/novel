from pathlib import Path

path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')
start_marker = "  /**\n   * extractCharacterStatesFromContent"
end_marker = "  /** 构建「人物状态」上下文"
if text.count(start_marker) != 1:
    raise SystemExit(f'extractor start: expected 1 occurrence, found {text.count(start_marker)}')
if text.count(end_marker) != 1:
    raise SystemExit(f'next marker: expected 1 occurrence, found {text.count(end_marker)}')
start = text.index(start_marker)
end = text.index(end_marker, start)
if end <= start:
    raise SystemExit('invalid extractor block range')
text = text[:start] + text[end:]
path.write_text(text, encoding='utf-8')
