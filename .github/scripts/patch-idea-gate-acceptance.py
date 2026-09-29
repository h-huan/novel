from pathlib import Path

# One-shot: acceptance constructs ChainController without Nest, so inject the same Gate provider explicitly.
path = Path('server/src/acceptance/generation-diagnostics.acceptance.spec.ts')
text = path.read_text(encoding='utf-8')


def replace_exact(old: str, new: str, expected: int, label: str):
    global text
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{label}: expected {expected} matches, got {count}')
    text = text.replace(old, new)


replace_exact(
    "import { ChainController } from '../chain/chain.controller';\n",
    "import { ChainController } from '../chain/chain.controller';\nimport { IdeaAppealGateService } from '../chain/idea-appeal-gate.service';\n",
    1,
    'idea appeal import',
)
replace_exact(
    "Object.assign(controller, { realLLM: llm, logger: { log: vi.fn(), error: vi.fn() } });",
    "Object.assign(controller, { realLLM: llm, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });",
    1,
    'model-config fixture dependency',
)
replace_exact(
    "Object.assign(controller, { realLLM, db: { getDb: () => db }, logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });",
    "Object.assign(controller, { realLLM, db: { getDb: () => db }, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });",
    2,
    'db-backed discovery fixture dependencies',
)
replace_exact(
    "Object.assign(controller, { realLLM, db: database, logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });",
    "Object.assign(controller, { realLLM, db: database, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });",
    1,
    'execution-standard fixture dependency',
)
path.write_text(text, encoding='utf-8')
