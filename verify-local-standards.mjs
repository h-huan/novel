// Compare the active module standards against the ONE machine-readable Registry.
// In particular, the Registry projection is not an outdated database code_seed row.
export function analyzeExecutionStandards(standards, codeSeedVersion, endpointOk) {
  const rows = Array.isArray(standards) ? standards : [];
  const mismatches = rows.filter((s) => {
    const seed = Number(s.seedBaselineVersion ?? s.seed_baseline_version);
    const version = Number(s.version);
    const source = String(s.source || '');
    return source !== 'system_workflow_rule_registry'
      || !Number.isFinite(seed) || codeSeedVersion === null || seed !== codeSeedVersion
      || !Number.isFinite(version) || version !== codeSeedVersion;
  }).map((s) => ({
    moduleKey: s.moduleKey ?? s.module_key ?? null,
    version: s.version ?? null,
    seedBaselineVersion: s.seedBaselineVersion ?? s.seed_baseline_version ?? null,
    source: s.source ?? null,
  }));
  return {
    codeSeedVersion, activeCount: rows.length,
    consistent: endpointOk === true && codeSeedVersion !== null && rows.length > 0 && mismatches.length === 0,
    mismatches,
    error: endpointOk !== true ? 'module_standards_unavailable'
      : rows.length === 0 ? 'module_standards_empty'
      : codeSeedVersion === null ? 'registry_version_unavailable' : null,
  };
}
