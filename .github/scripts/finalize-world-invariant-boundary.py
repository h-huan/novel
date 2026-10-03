from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8-sig')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, got {count} in {path}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {label}: {path}')


def replace_between(path: str, start: str, end: str, replacement: str, label: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8-sig')
    start_count = text.count(start)
    end_count = text.count(end)
    if start_count != 1 or end_count != 1:
        raise RuntimeError(f'{label}: expected unique markers, got start={start_count}, end={end_count} in {path}')
    start_at = text.index(start)
    end_at = text.index(end, start_at)
    file.write_text(text[:start_at] + replacement + text[end_at:], encoding='utf-8')
    print(f'patched {label}: {path}')


# -----------------------------------------------------------------------------
# World freeze starts at the first persisted world, not at a project status.
# An existing active/imported project with no world may establish its first world;
# once a row exists, every create/update/delete/constraint/profile mutation is blocked.
# -----------------------------------------------------------------------------
world_service = 'server/src/modules/world-setting/world-setting.service.ts'
replace_between(
    world_service,
    '  /**\n   * 世界观只允许在项目创建阶段建立一次。第一条世界观记录写入后即视为定稿并冻结；',
    '\n\n  create(projectId: string, dto: CreateWorldSettingDto): WorldSettingResponse {',
    "  /**\n   * 世界观冻结点是【第一条正式世界观记录写入】而不是 project.status。\n   * 没有世界观的项目允许首次建立；一旦存在，任何状态下都不得 create/update/remove/改约束/改 profile。\n   */\n  private assertWorldMutable(projectId: string, operation: string, initialCreate = false): void {\n    const project = this.databaseService.getDb().prepare('SELECT id,status FROM projects WHERE id=? LIMIT 1').get(projectId) as any;\n    if (!project) throw new NotFoundException('Project not found');\n    const existing = this.repo.findByProjectId(projectId) || [];\n    if (!initialCreate || existing.length > 0) {\n      throw new ConflictException(`世界观已冻结，不能执行“${operation}”。世界观是小说地基；请在章纲、未来计划、状态、伏笔或未接受正文中选择最小代价修复点，禁止通过修改世界观来消除冲突。`);\n    }\n  }",
    'freeze world after first persisted record independent of project status',
)

world_spec = 'server/src/modules/world-setting/world-setting.service.spec.ts'
replace_once(
    world_spec,
    "  it('rejects every world mutation entry once the project is active', () => {\n    const activeDb = projectDb('active');\n    service = new WorldSettingService(repo, { getDb: () => activeDb } as any);\n    (repo.findById as any).mockReturnValue(mockRow);",
    "  it('rejects every world mutation entry once a world already exists, regardless of project status', () => {\n    const activeDb = projectDb('active');\n    service = new WorldSettingService(repo, { getDb: () => activeDb } as any);\n    (repo.findById as any).mockReturnValue(mockRow);\n    (repo.findByProjectId as any).mockReturnValue([mockRow]);",
    'world service test freezes by existence not status',
)

# -----------------------------------------------------------------------------
# Failed-generation recovery must not delete a frozen world. Whole-project
# rebuild is therefore rejected once a world exists; recovery must resume/rebuild
# lower layers from that world instead of changing the novel identity.
# -----------------------------------------------------------------------------
recovery = 'server/src/chain/generation-recovery.service.ts'
replace_once(
    recovery,
    "  async clearFailedGeneratedAssets(projectId: string): Promise<void> {\n    const audit = await this.audit(projectId);\n    if (!['generation_failed', 'creating'].includes(audit.status)) {\n      throw new ConflictException('只有创建失败或创建中的项目可以恢复。');\n    }\n    if (audit.protectedHumanWork) {\n      throw new ConflictException(`检测到受保护资料：${audit.protectionReasons.join('；')}。已停止自动覆盖。`);\n    }\n\n    await this.clearGeneratedAssets(projectId);\n  }",
    "  async clearFailedGeneratedAssets(projectId: string): Promise<void> {\n    const audit = await this.audit(projectId);\n    if (!['generation_failed', 'creating'].includes(audit.status)) {\n      throw new ConflictException('只有创建失败或创建中的项目可以恢复。');\n    }\n    if (audit.protectedHumanWork) {\n      throw new ConflictException(`检测到受保护资料：${audit.protectionReasons.join('；')}。已停止自动覆盖。`);\n    }\n    const frozenWorld = this.database.getDb().prepare('SELECT id FROM world_settings WHERE project_id=? LIMIT 1').get(projectId);\n    if (frozenWorld) {\n      throw new ConflictException('世界观已冻结，自动恢复禁止删除或重建世界观。请保留现有世界观，从角色、章纲、状态、伏笔、时间线等下游资料继续恢复。');\n    }\n\n    await this.clearGeneratedAssets(projectId);\n  }",
    'failed recovery never deletes frozen world',
)

recovery_spec = 'server/src/chain/generation-recovery.service.spec.ts'
replace_between(
    recovery_spec,
    "  it('restores the previous generated assets and vectors when a recovery attempt fails', async () => {",
    "  it('rejects invalid short-story target totals during recovery audit', async () => {",
    "  it('blocks whole-project failed-generation cleanup once the world has been established', async () => {\n    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();\n    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();\n    db.prepare(`INSERT INTO characters VALUES ('char1','p1')`).run();\n    db.prepare(`INSERT INTO world_settings VALUES ('w1','p1')`).run();\n    db.prepare(`INSERT INTO world_system_profiles VALUES ('wp1','p1','w1','旧世界规则')`).run();\n\n    await expect(service.clearFailedGeneratedAssets('p1')).rejects.toThrow('世界观已冻结');\n    expect((db.prepare('SELECT id FROM world_settings WHERE project_id=?').get('p1') as any).id).toBe('w1');\n    expect((db.prepare('SELECT rules FROM world_system_profiles WHERE project_id=?').get('p1') as any).rules).toBe('旧世界规则');\n    expect((db.prepare('SELECT id FROM outlines WHERE project_id=?').get('p1') as any).id).toBe('o1');\n  });\n\n  it('restores non-world generated assets and vectors when a pre-world recovery attempt fails', async () => {\n    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();\n    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();\n    db.prepare(`INSERT INTO characters VALUES ('char1','p1')`).run();\n    db.prepare(`INSERT INTO character_extended_profiles VALUES ('cp1','p1','char1','旧人物档案')`).run();\n    db.prepare(`INSERT INTO character_relationships VALUES ('cr1','p1','char1','char1')`).run();\n    vectors[VectorIndexService.COLLECTIONS.CHARACTERS].push({\n      id: 'char1', metadata: { projectId: 'p1', text: 'original character' }, vector: [0.1, 0.2],\n    } as any);\n\n    const snapshot = await service.captureSnapshot('p1');\n    await service.clearFailedGeneratedAssets('p1');\n    expect((db.prepare('SELECT COUNT(*) count FROM character_extended_profiles').get() as any).count).toBe(0);\n    expect((db.prepare('SELECT COUNT(*) count FROM character_relationships').get() as any).count).toBe(0);\n    db.prepare(`INSERT INTO characters VALUES ('bad-char','p1')`).run();\n    await service.restoreSnapshot(snapshot);\n\n    expect((db.prepare('SELECT id FROM characters WHERE project_id=?').all('p1') as any[]).map(row => row.id)).toEqual(['char1']);\n    expect((db.prepare('SELECT id FROM outlines WHERE project_id=?').all('p1') as any[]).map(row => row.id)).toEqual(['o1']);\n    expect((db.prepare('SELECT id FROM chapters WHERE project_id=?').all('p1') as any[]).map(row => row.id)).toEqual(['c1']);\n    expect((db.prepare('SELECT details FROM character_extended_profiles WHERE project_id=?').get('p1') as any).details).toBe('旧人物档案');\n    expect((db.prepare('SELECT COUNT(*) count FROM character_relationships WHERE project_id=?').get('p1') as any).count).toBe(1);\n    expect((db.prepare('SELECT status FROM projects WHERE id=?').get('p1') as any).status).toBe('generation_failed');\n    expect(vectors[VectorIndexService.COLLECTIONS.CHARACTERS]).toEqual(expect.arrayContaining([\n      expect.objectContaining({ id: 'char1', vector: [0.1, 0.2] }),\n    ]));\n  });\n\n",
    'recovery tests preserve frozen world',
)

print('world invariant boundary replacements applied')
