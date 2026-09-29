from pathlib import Path

path = Path('server/src/chain/chain-planning.controller.idea-appeal.spec.ts')
text = path.read_text(encoding='utf-8')
marker = "\n});\n"
if not text.endswith(marker):
    raise SystemExit('planning spec: unexpected file ending')
insert = r'''

  it('persists the latest idea batch before any project exists so local verification can diagnose discovery failure', async () => {
    const ideaDiscover = vi.fn().mockResolvedValue({
      success: false,
      ideas: [],
      totalIdeas: 0,
      error: '本轮候选均未达到展示标准，系统已按失败原因自动补生一次；未通过内容不会展示，请重新发现。',
      appealGate: { ...audit, qualified: 0, returned: 0, rejected: 7 },
    });
    const dualWrite = vi.fn().mockResolvedValue(undefined);
    const controller = new ChainPlanningController(
      { ideaDiscover } as any,
      { dualWrite } as any,
    );

    const result: any = await controller.ideaDiscover({ ...dto, count: 5 } as any);

    expect(result.success).toBe(false);
    expect(dualWrite).toHaveBeenCalledTimes(1);
    expect(dualWrite).toHaveBeenCalledWith(
      'latest_idea_discovery_audit',
      expect.objectContaining({
        schemaVersion: 1,
        success: false,
        totalIdeas: 0,
        request: expect.objectContaining({ storyType: 'short_story', platform: 'fanqie', requestedCount: 5 }),
        appealGate: expect.objectContaining({ mode: 'single_recoverable_reader_experience_gate', returned: 0 }),
      }),
    );
  });

  it('exposes the persisted pre-project idea audit for verify-local without requiring a project id', () => {
    const persisted = {
      schemaVersion: 1,
      generatedAt: '2026-09-29T09:00:00.000Z',
      success: false,
      totalIdeas: 0,
      appealGate: { ...audit, qualified: 0, returned: 0, rejected: 7 },
    };
    const database = {
      getDb: () => ({
        prepare: (sql: string) => ({
          get: (...args: any[]) => {
            if (sql.includes('sqlite_master')) return { name: 'dual_write_store' };
            if (sql.includes('dual_write_store')) {
              expect(args[0]).toBe('latest_idea_discovery_audit');
              return { data_value: JSON.stringify(persisted), updated_at: '2026-09-29T09:00:01.000Z' };
            }
            return undefined;
          },
        }),
      }),
    };
    const controller = new ChainPlanningController({} as any, database as any);

    const result: any = controller.getLatestIdeaDiscoveryDiagnostics();

    expect(result.available).toBe(true);
    expect(result.updatedAt).toBe('2026-09-29T09:00:01.000Z');
    expect(result.audit).toEqual(expect.objectContaining({ success: false, totalIdeas: 0 }));
    expect(result.audit.appealGate).toEqual(expect.objectContaining({ returned: 0, rejected: 7 }));
  });
'''
text = text[:-len(marker)] + insert + marker
path.write_text(text, encoding='utf-8')
