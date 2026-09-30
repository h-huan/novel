from pathlib import Path
import re

path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "import { ideaCardStructuringDirective, ideaHookRequirement, ideaPremiseSelectionDirective } from './idea-discovery-contract';",
    "import { ideaCardStructuringDirective, ideaHookRequirement, ideaPremiseSelectionDirective, normalizePremiseSelectionPayload } from './idea-discovery-contract';",
    'idea discovery contract import',
)

schema_pattern = re.compile(
    r"        const premiseSchema = \{\n          pool: \[\{.*?\n          selectedPremiseIds: \['P1'\],\n        \};",
    re.S,
)
schema_replacement = """        const premiseSchema = {
          pool: [{
            premiseId: 'P1',
            workingTitle: '4-16字暂名',
            storyCore: '一句到两句核心故事骨架：人物处境 + 起始事件 + 核心冲突方向',
          }],
          selectedPremises: [{
            premiseId: 'P1',
            protagonistSituation: '主角当前生活处境、想守住/得到/改变什么',
            openingEvent: '真正改变主角命运的起始事件',
            coreConflict: '目标与主动对手/现实阻力如何对撞',
            activeChoice: '主角必须亲自做出的关键选择/行动',
            escalation: '选择之后如何连续升级并产生不可逆后果',
            reversalEffect: '反转如何改变目标、关系、胜负条件或代价',
            payoff: '中后段/终局准备兑现的核心阅读承诺',
            irreplaceableCarrier: '为什么这个职业/生活载体/关系不可替换',
            secondOrderConsequence: '机制启动后谁额外受益/受损，关系或目标如何被迫改变',
            readerQuestion: '读者看完起始事件后必须追问的具体问题',
            differentiation: '相对历史题材和常见套路真正不同在哪里',
          }],
        };"""
text, count = schema_pattern.subn(schema_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'premise schema: expected exactly 1 anchor, found {count}')

replace_once(
    "pool 必须至少 ${premisePoolSize} 项，premiseId 必须唯一；selectedPremiseIds 必须恰好 ${requestedCount} 项、互不重复，并且每个 ID 都必须来自 pool。",
    "pool 以 ${premisePoolSize} 项为广搜目标，不是整批成功的硬门槛；每个有效 pool 项只需 premiseId、workingTitle、storyCore。若已经充分比较并能选出 ${requestedCount} 个成熟题材，可以少于目标，禁止为了凑数填弱项。selectedPremises 必须恰好 ${requestedCount} 项、premiseId 互不重复且来自 pool，并补齐创建完整题材卡前所需的筛选证据。",
    'premise output rule',
)

validation_pattern = re.compile(
    r"        const pool = Array\.isArray\(parsed\?\.pool\) \? parsed\.pool : \[\];\n"
    r"        const selectedIds = Array\.isArray\(parsed\?\.selectedPremiseIds\).*?"
    r"        return \{ pool, selected \};",
    re.S,
)
validation_replacement = """        const normalizedSelection = normalizePremiseSelectionPayload(
          parsed,
          requestedCount,
          premisePoolSize,
        );
        if (!normalizedSelection.poolTargetMet) {
          this.logger.warn(
            `idea-discover: 创建前广搜有效轻量胚子 ${normalizedSelection.pool.length}/${premisePoolSize}，但已明确选出 ${normalizedSelection.selected.length}/${requestedCount} 个成熟题材；继续结构化，不用弱题材凑池。`,
          );
        }
        return normalizedSelection;"""
text, count = validation_pattern.subn(validation_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'premise runtime validation: expected exactly 1 anchor, found {count}')

replace_once(
    "        premisePoolSize: premiseDiscovery.pool.length,\n        premiseSelected: selectedPremises.length,",
    "        premisePoolSize: premiseDiscovery.pool.length,\n        premisePoolTarget: premisePoolSize,\n        premisePoolTargetMet: premiseDiscovery.poolTargetMet,\n        premiseSelected: selectedPremises.length,",
    'premise audit fields',
)

for obsolete in (
    '创建前题材筛选未形成至少',
    'selectedPremiseIds',
):
    if obsolete in text:
        raise SystemExit(f'obsolete runtime marker remains: {obsolete}')

for required in (
    'normalizePremiseSelectionPayload',
    'premisePoolTargetMet',
    'selectedPremises',
):
    if required not in text:
        raise SystemExit(f'required runtime marker missing: {required}')

path.write_text(text, encoding='utf-8')
