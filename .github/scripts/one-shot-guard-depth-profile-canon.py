from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')
text = once(
    text,
    """          const orgList = Array.isArray(orgResult.data?.orgs) ? orgResult.data.orgs : [];
          const byName = new Map(orgs.map(o => [String(o.name).trim(), o]));
""",
    """          const orgList = Array.isArray(orgResult.data?.orgs) ? orgResult.data.orgs : [];
          if (orgList.length > 0) {
            this.generatedCanonGuard.assertStructuredCanCommit({
              projectId,
              runId: orgResult.runId,
              expectedStages: ['outline'],
              expectedScenarios: ['organization_map'],
            });
          }
          const byName = new Map(orgs.map(o => [String(o.name).trim(), o]));
""",
    'organization depth provenance guard',
)
text = once(
    text,
    """          const mapList = Array.isArray(mapResult.data?.maps) ? mapResult.data.maps : [];
          const byName = new Map(maps.map(m => [String(m.name).trim(), m]));
""",
    """          const mapList = Array.isArray(mapResult.data?.maps) ? mapResult.data.maps : [];
          if (mapList.length > 0) {
            this.generatedCanonGuard.assertStructuredCanCommit({
              projectId,
              runId: mapResult.runId,
              expectedStages: ['outline'],
              expectedScenarios: ['organization_map'],
            });
          }
          const byName = new Map(maps.map(m => [String(m.name).trim(), m]));
""",
    'map depth provenance guard',
)
text = once(
    text,
    """          const fsList = Array.isArray(fsResult.data?.foreshadowings) ? fsResult.data.foreshadowings : [];
          const byId = new Map(fss.map(f => [f.id, f]));
""",
    """          const fsList = Array.isArray(fsResult.data?.foreshadowings) ? fsResult.data.foreshadowings : [];
          if (fsList.length > 0) {
            this.generatedCanonGuard.assertStructuredCanCommit({
              projectId,
              runId: fsResult.runId,
              expectedStages: ['outline'],
              expectedScenarios: ['foreshadowing'],
            });
          }
          const byId = new Map(fss.map(f => [f.id, f]));
""",
    'foreshadowing depth provenance guard',
)
path.write_text(text, encoding='utf-8')
