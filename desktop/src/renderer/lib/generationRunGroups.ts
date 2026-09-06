type Run = { id: string; scenario?: string; project_id?: string | null; status: string; error?: string; started_at: string; standards?: { modules?: Array<{ key: string; version?: number; baseline?: number }> }; [key: string]: any };

/** Only identical failures in the supplied window are grouped; evidence and raw records remain intact. */
export function groupGenerationRuns(runs: Run[]) {
  const groups = new Map<string, { run: Run; records: Run[]; firstAt: string; lastAt: string }>();
  for (const run of runs) {
    const key = run.status === 'failed'
      ? JSON.stringify([run.project_id ?? null, run.scenario ?? run.label, run.status, run.error, run.standards ?? null])
      : run.id;
    const group = groups.get(key);
    if (group) {
      group.records.push(run);
      if (run.started_at < group.firstAt) group.firstAt = run.started_at;
      if (run.started_at > group.lastAt) group.lastAt = run.started_at;
    } else groups.set(key, { run, records: [run], firstAt: run.started_at, lastAt: run.started_at });
  }
  return [...groups.values()];
}
