from pathlib import Path

path = Path('server/src/acceptance/generation-diagnostics.acceptance.spec.ts')
text = path.read_text(encoding='utf-8')

def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    text = text.replace(old, new, 1)

replace_once(
    "import { ChainController } from '../chain/chain.controller';\n",
    "import { ChainController } from '../chain/chain.controller';\nimport { IdeaAppealGateService } from '../chain/idea-appeal-gate.service';\n",
    'idea appeal import',
)
replace_once(
    "Object.assign(controller, { realLLM: llm, logger: { log: vi.fn(), error: vi.fn() } });",
    "Object.assign(controller, { realLLM: llm, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });",
    'model-config fixture dependency',
)
replace_once(
    "Object.assign(controller, { realLLM, db: { getDb: () => db }, logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });",
    "Object.assign(controller, { realLLM, db: { getDb: () => db }, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });",
    'batch fixture dependency',
)
path.write_text(text, encoding='utf-8')
