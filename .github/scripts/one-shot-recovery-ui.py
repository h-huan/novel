from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('desktop/src/renderer/pages/ProjectListPage.tsx')
text = path.read_text(encoding='utf-8')

text = once(
    text,
    "import { getGenerationRecovery, startFailedProjectRecovery } from '../lib/generationRecovery';",
    "import { getGenerationRecovery, generationRecoveryUiState, startFailedProjectRecovery, type GenerationRecoveryAudit } from '../lib/generationRecovery';",
    'recovery import',
)

text = once(
    text,
    "  recoveryRunning?: boolean;\n  retryMessage?: string;",
    "  recoveryAudit?: GenerationRecoveryAudit | null;\n  retryMessage?: string;",
    'card recovery prop',
)

text = once(
    text,
    "  recoveryRunning = false,\n  retryMessage,",
    "  recoveryAudit = null,\n  retryMessage,",
    'card recovery destructure',
)

text = once(
    text,
    "  const failed = project.status === 'generation_failed';\n  const statusLabel = recoveryRunning ? '正在重新生成 · 查看进度' : USER_STATUS_LABELS[project.status] || project.status;\n  const statusBgColor = STATUS_COLORS[project.status] || 'rgba(108,108,128,0.2)';\n  const statusTextColor = STATUS_TEXT_COLORS[project.status] || 'var(--color-text-muted)';",
    "  const failed = project.status === 'generation_failed';\n  const recoveryState = generationRecoveryUiState(project.status, recoveryAudit);\n  const interruptedCreating = project.status === 'creating' && recoveryState.recoverable;\n  const recoveryAttention = failed || interruptedCreating;\n  const statusLabel = recoveryState.statusLabel || USER_STATUS_LABELS[project.status] || project.status;\n  const statusBgColor = recoveryAttention ? 'rgba(248, 113, 113, 0.16)' : (STATUS_COLORS[project.status] || 'rgba(108,108,128,0.2)');\n  const statusTextColor = recoveryAttention ? '#fca5a5' : (STATUS_TEXT_COLORS[project.status] || 'var(--color-text-muted)');",
    'card recovery state',
)

text = once(
    text,
    "      style={{ ...cardStyles.card, ...(failed ? cardStyles.failedCard : {}) }}",
    "      style={{ ...cardStyles.card, ...(recoveryAttention ? cardStyles.failedCard : {}) }}",
    'card attention style',
)

text = once(
    text,
    "        event.currentTarget.style.borderColor = failed ? 'rgba(248,113,113,0.55)' : 'var(--color-accent)';\n        event.currentTarget.style.transform = failed ? 'none' : 'translateY(-2px)';",
    "        event.currentTarget.style.borderColor = recoveryAttention ? 'rgba(248,113,113,0.55)' : 'var(--color-accent)';\n        event.currentTarget.style.transform = recoveryAttention ? 'none' : 'translateY(-2px)';",
    'card hover attention',
)

text = once(
    text,
    "        event.currentTarget.style.borderColor = failed ? 'rgba(148,163,184,0.28)' : 'var(--color-border)';",
    "        event.currentTarget.style.borderColor = recoveryAttention ? 'rgba(148,163,184,0.28)' : 'var(--color-border)';",
    'card leave attention',
)

text = once(
    text,
    "        <h3 style={{ ...cardStyles.title, ...(failed ? cardStyles.failedTitle : {}) }}>{project.title}</h3>",
    "        <h3 style={{ ...cardStyles.title, ...(recoveryAttention ? cardStyles.failedTitle : {}) }}>{project.title}</h3>",
    'card title attention',
)

text = once(
    text,
    "            style={{ ...cardStyles.deleteBtn, opacity: isHovered || failed ? 1 : 0, pointerEvents: isHovered || failed ? 'auto' : 'none' }}",
    "            style={{ ...cardStyles.deleteBtn, opacity: isHovered || recoveryAttention ? 1 : 0, pointerEvents: isHovered || recoveryAttention ? 'auto' : 'none' }}",
    'delete visibility',
)

old_actions = """      {failed && (\n        <div style={cardStyles.failedActions} onClick={(event) => event.stopPropagation()}>\n          <span style={cardStyles.failedHint}>{recoveryRunning ? '创作资料正在生成，可随时查看实时进度。' : '创建未完成；可查看诊断或重新生成。'}</span>\n          <button\n            type=\"button\"\n            style={{ ...cardStyles.retryBtn, opacity: retryDisabled ? 0.55 : 1 }}\n            disabled={retryDisabled && !recoveryRunning}\n            onClick={() => onRetry(project.id)}\n            aria-label={`${recoveryRunning ? '查看进度' : '重新生成'} ${project.title}`}\n          >\n            {recoveryRunning ? '查看进度' : retryBusy ? '正在启动…' : '重新生成'}\n          </button>\n          {retryMessage && <span role=\"alert\" style={cardStyles.retryMessage}>{retryMessage}</span>}\n        </div>\n      )}"""
new_actions = """      {recoveryState.tracked && (recoveryState.running || recoveryState.recoverable || recoveryState.blocked) && (\n        <div style={cardStyles.failedActions} onClick={(event) => event.stopPropagation()}>\n          <span style={cardStyles.failedHint}>\n            {recoveryState.running\n              ? '创作资料正在生成，可随时查看实时进度。'\n              : recoveryState.recoverable\n                ? '创建流程已中断；后端诊断允许从已确认题材继续恢复。'\n                : (recoveryAudit?.recommendedAction || '当前状态不允许自动恢复，请进入项目查看诊断。')}\n          </span>\n          {recoveryState.actionLabel && (\n            <button\n              type=\"button\"\n              style={{ ...cardStyles.retryBtn, opacity: retryDisabled && !recoveryState.running ? 0.55 : 1 }}\n              disabled={retryDisabled && !recoveryState.running}\n              onClick={() => onRetry(project.id)}\n              aria-label={`${recoveryState.actionLabel} ${project.title}`}\n            >\n              {recoveryState.running ? '查看进度' : retryBusy ? '正在启动…' : recoveryState.actionLabel}\n            </button>\n          )}\n          {retryMessage && <span role=\"alert\" style={cardStyles.retryMessage}>{retryMessage}</span>}\n        </div>\n      )}"""
text = once(text, old_actions, new_actions, 'recovery actions')

text = once(
    text,
    "  const [runningRecoveries, setRunningRecoveries] = useState<Record<string, boolean>>({});",
    "  const [recoveryAudits, setRecoveryAudits] = useState<Record<string, GenerationRecoveryAudit | null>>({});",
    'recovery audit state',
)

old_effect = """  useEffect(() => {\n    const failedIds = projects.filter((project) => project.status === 'generation_failed').map((project) => project.id);\n    let cancelled = false;\n    void Promise.all(failedIds.map(async (id) => {\n      try { return [id, Boolean((await getGenerationRecovery(id))?.running)] as const; }\n      catch { return [id, false] as const; }\n    })).then((entries) => {\n      if (!cancelled) setRunningRecoveries(Object.fromEntries(entries));\n    });\n    return () => { cancelled = true; };\n  }, [projects]);"""
new_effect = """  useEffect(() => {\n    // `creating` is not proof that a worker is still alive. A crashed background\n    // creation can remain in that status while the recovery audit already says\n    // running=false/canResume=true. Query both incomplete statuses so the existing\n    // recovery endpoint is visible from the project list instead of being hidden\n    // behind a misleading \"资料生成中\" badge.\n    const recoveryIds = projects\n      .filter((project) => project.status === 'generation_failed' || project.status === 'creating')\n      .map((project) => project.id);\n    let cancelled = false;\n    void Promise.all(recoveryIds.map(async (id) => {\n      try { return [id, await getGenerationRecovery(id)] as const; }\n      catch { return [id, null] as const; }\n    })).then((entries) => {\n      if (!cancelled) setRecoveryAudits(Object.fromEntries(entries));\n    });\n    return () => { cancelled = true; };\n  }, [projects]);"""
text = once(text, old_effect, new_effect, 'recovery audit effect')

old_select = """  const handleSelectProject = async (id: string) => {\n    if (runningRecoveries[id]) {\n      const project = projects.find((item) => item.id === id);\n      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });\n      return;\n    }"""
new_select = """  const handleSelectProject = async (id: string) => {\n    const project = projects.find((item) => item.id === id);\n    const recoveryState = generationRecoveryUiState(project?.status, recoveryAudits[id]);\n    if (recoveryState.running) {\n      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });\n      return;\n    }"""
text = once(text, old_select, new_select, 'select running recovery')

old_retry_head = """  const handleRetryProject = async (id: string) => {\n    const project = projects.find((item) => item.id === id);\n    if (runningRecoveries[id]) {\n      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });\n      return;\n    }\n    if (retryingProjectId) return;"""
new_retry_head = """  const handleRetryProject = async (id: string) => {\n    const project = projects.find((item) => item.id === id);\n    const recoveryState = generationRecoveryUiState(project?.status, recoveryAudits[id]);\n    if (recoveryState.running) {\n      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });\n      return;\n    }\n    if (!recoveryState.recoverable) {\n      setRetryMessages((current) => ({\n        ...current,\n        [id]: recoveryAudits[id]?.recommendedAction || '当前诊断不允许自动恢复，请进入项目查看原因。',\n      }));\n      return;\n    }\n    if (retryingProjectId) return;"""
text = once(text, old_retry_head, new_retry_head, 'retry guard')

text = once(
    text,
    "      setRunningRecoveries((current) => ({ ...current, [id]: true }));\n      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });",
    "      setRecoveryAudits((current) => ({\n        ...current,\n        [id]: current[id] ? { ...current[id]!, running: true, canResume: false } : current[id],\n      }));\n      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });",
    'retry success state',
)

text = once(
    text,
    "      if (audit?.running) {\n        setRunningRecoveries((current) => ({ ...current, [id]: true }));\n        navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });\n      } else {",
    "      setRecoveryAudits((current) => ({ ...current, [id]: audit }));\n      if (audit?.running) {\n        navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });\n      } else {",
    'retry catch audit',
)

text = once(
    text,
    "              recoveryRunning={Boolean(runningRecoveries[project.id])}\n              retryMessage={retryMessages[project.id]}",
    "              recoveryAudit={recoveryAudits[project.id]}\n              retryMessage={retryMessages[project.id]}",
    'card audit prop',
)

path.write_text(text, encoding='utf-8')
