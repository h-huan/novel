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


# 1) Ordinary failed-generation recovery preserves the frozen world and clears only downstream Canon.
recovery = 'server/src/chain/generation-recovery.service.ts'
replace_once(
    recovery,
    """    const frozenWorld = this.database.getDb().prepare('SELECT id FROM world_settings WHERE project_id=? LIMIT 1').get(projectId);
    if (frozenWorld) {
      throw new ConflictException('世界观已冻结，自动恢复禁止删除或重建世界观。请保留现有世界观，从角色、章纲、状态、伏笔、时间线等下游资料继续恢复。');
    }

    await this.clearGeneratedAssets(projectId);""",
    """    const preserveWorld = Boolean(
      this.database.getDb().prepare('SELECT id FROM world_settings WHERE project_id=? LIMIT 1').get(projectId),
    );
    // 普通恢复永远保留已经建立的世界观，只清理可再生的下游资料。
    // “按题材重建”仍走 clearForExplicitSourceRebuild，并在存在世界观时明确拒绝。
    await this.clearGeneratedAssets(projectId, { preserveWorld });""",
    'preserve frozen world during ordinary recovery',
)
replace_once(
    recovery,
    """  private async clearGeneratedAssets(projectId: string): Promise<void> {
    await this.deleteProjectVectors(projectId);
    const db = this.database.getDb();
    db.exec('BEGIN IMMEDIATE');
    try {
      this.deleteProjectRows(projectId);""",
    """  private async clearGeneratedAssets(
    projectId: string,
    options: { preserveWorld?: boolean } = {},
  ): Promise<void> {
    await this.deleteProjectVectors(projectId);
    const db = this.database.getDb();
    db.exec('BEGIN IMMEDIATE');
    try {
      this.deleteProjectRows(projectId, options);""",
    'pass preserve-world cleanup option',
)
replace_once(
    recovery,
    """  private deleteProjectRows(projectId: string): void {
    const db = this.database.getDb();
    for (const table of RECOVERY_PROFILE_TABLES) {
      if (db.prepare(\"SELECT 1 FROM sqlite_master WHERE type='table' AND name=?\").get(table)) {
        db.prepare(`DELETE FROM ${table} WHERE project_id=?`).run(projectId);
      }
    }""",
    """  private deleteProjectRows(projectId: string, options: { preserveWorld?: boolean } = {}): void {
    const db = this.database.getDb();
    for (const table of RECOVERY_PROFILE_TABLES) {
      if (options.preserveWorld && table === 'world_system_profiles') continue;
      if (db.prepare(\"SELECT 1 FROM sqlite_master WHERE type='table' AND name=?\").get(table)) {
        db.prepare(`DELETE FROM ${table} WHERE project_id=?`).run(projectId);
      }
    }""",
    'preserve world profile during downstream cleanup',
)
replace_once(
    recovery,
    """    db.prepare('DELETE FROM characters WHERE project_id=?').run(projectId);
    db.prepare('DELETE FROM world_settings WHERE project_id=?').run(projectId);""",
    """    db.prepare('DELETE FROM characters WHERE project_id=?').run(projectId);
    if (!options.preserveWorld) {
      db.prepare('DELETE FROM world_settings WHERE project_id=?').run(projectId);
    }""",
    'preserve world main row during downstream cleanup',
)

# 2) Reuse the first node of the existing fixed foundation chain; do not duplicate its prompt or register a second production chain.
template = 'server/src/chain/chain-template.service.ts'
replace_once(
    template,
    """  private assertFixed(id: string): void {""",
    """  /**
   * Recovery helper for a project whose world Canon already exists. It reuses
   * node_1_skeleton from the one fixed foundation chain and deliberately does
   * not execute node_2_worldview. No second prompt/template source is created.
   */
  async executeLongNovelFoundationSkeleton(
    userInput: Record<string, unknown>,
    onProgress?: (nodeIndex: number, nodeId: string, status: 'started' | 'completed' | 'failed', result?: any) => void,
  ): Promise<any> {
    const template = this.getDetail('long-novel-init-foundation');
    const chain: PromptChain = {
      id: template.id,
      name: template.name,
      version: template.version,
      description: template.description,
      nodes: [template.nodes[0]],
      variables: template.variables,
      executionMode: 'sequential',
      config: template.config,
    };
    return this.chainEngine.execute(chain, userInput, onProgress);
  }

  private assertFixed(id: string): void {""",
    'reuse existing skeleton node for frozen-world recovery',
)

# 3) Long creation/recovery reads any existing frozen world and passes it into the same planning function.
controller = 'server/src/chain/chain.controller.ts'
replace_once(
    controller,
    """      if (!isShort) {
        // 这里曾让一个模型请求同时生成主线骨架与世界规则，后果是世界规则无法依赖已验收主线。
        emit('skeleton', 10, '生成主线与结局骨架，验收通过后再生成世界规则...');
        this.logger.log(`create-project-async: 长篇模式 project=${projectId}`);""",
    """      if (!isShort) {
        // 这里曾让一个模型请求同时生成主线骨架与世界规则，后果是世界规则无法依赖已验收主线。
        const existingFrozenWorld = db.prepare('SELECT * FROM world_settings WHERE project_id=? LIMIT 1').get(projectId) as any;
        const existingFrozenProfile = existingFrozenWorld
          ? db.prepare('SELECT * FROM world_system_profiles WHERE project_id=? AND world_setting_id=? LIMIT 1')
              .get(projectId, existingFrozenWorld.id) as any
          : null;
        const frozenWorldConstraints = existingFrozenWorld
          ? this.safeExtractJson<Record<string, any>>(String(existingFrozenWorld.constraints || '{}'), {})
          : {};
        const frozenLongWorldview = existingFrozenWorld ? {
          era: String(existingFrozenWorld.era || existingFrozenProfile?.era || ''),
          geography: this.safeExtractJson<any[]>(String(existingFrozenWorld.geography || '[]'), []),
          factions: this.safeExtractJson<any[]>(String(existingFrozenWorld.factions || '[]'), []),
          rules: String(existingFrozenProfile?.rules || this.safeExtractJson<any[]>(String(existingFrozenWorld.rules || '[]'), []).join('\\n')),
          atmosphere: String(existingFrozenWorld.atmosphere || existingFrozenProfile?.atmosphere_tone || ''),
          socialStructure: String(existingFrozenProfile?.social_structure || frozenWorldConstraints.socialStructure || ''),
          powerSystem: String(existingFrozenProfile?.tech_supernatural || frozenWorldConstraints.powerSystem || ''),
          economy: String(existingFrozenProfile?.economy_system || frozenWorldConstraints.economy || ''),
          culture: String(existingFrozenProfile?.culture_customs || frozenWorldConstraints.culture || ''),
          history: String(existingFrozenProfile?.era || frozenWorldConstraints.history || existingFrozenWorld.era || ''),
          endingDirection: String(existingFrozenProfile?.ending || ''),
          storyPremise: String(existingFrozenWorld.story_premise || existingFrozenProfile?.synopsis || dto.title),
          __frozenWorldId: String(existingFrozenWorld.id),
        } : undefined;
        emit('skeleton', 10, frozenLongWorldview
          ? '世界观已冻结：复用现有世界观，只重建主线骨架与下游资料...'
          : '生成主线与结局骨架，验收通过后再生成世界规则...');
        this.logger.log(`create-project-async: 长篇模式 project=${projectId}${frozenLongWorldview ? '（复用冻结世界观）' : ''}`);""",
    'load frozen world for long recovery',
)
replace_once(
    controller,
    """            chapterWordMin: CHAPTER_WORD_RANGE.min,
            chapterWordMax: CHAPTER_WORD_RANGE.max,
            onProgress: (step, message) => {""",
    """            chapterWordMin: CHAPTER_WORD_RANGE.min,
            chapterWordMax: CHAPTER_WORD_RANGE.max,
            frozenWorldview: frozenLongWorldview,
            onProgress: (step, message) => {""",
    'pass frozen world into long planner',
)
replace_once(
    controller,
    """            const worldSetting = data.worldSetting || data.worldview || data.world || {};
            const provenance = data.provenance || {};
            const creationBatchOutlineRunIds""",
    """            const worldSetting = data.worldSetting || data.worldview || data.world || {};
            const provenance = data.provenance || {};
            const reusingFrozenWorld = Boolean(existingFrozenWorld);
            const creationBatchOutlineRunIds""",
    'mark frozen-world reuse in long persistence',
)
replace_once(
    controller,
    """            if (data.coreSetting || Object.keys(worldSetting).length > 0) {
              this.generatedCanonGuard.assertStructuredCanCommit({
                projectId, runId: provenance.worldRunId, expectedStages: ['world'], expectedScenarios: ['world_building'],
              });
            }""",
    """            if (!reusingFrozenWorld && (data.coreSetting || Object.keys(worldSetting).length > 0)) {
              this.generatedCanonGuard.assertStructuredCanCommit({
                projectId, runId: provenance.worldRunId, expectedStages: ['world'], expectedScenarios: ['world_building'],
              });
            }""",
    'skip world run proof when reusing frozen world',
)
replace_once(
    controller,
    """            let outlineWriteCount = 0, volumeWriteCount = 0, charCount = 0, fsCount = 0, wsCount = 0, orgCount = 0, mpCount = 0, timelineCount = 0;""",
    """            let outlineWriteCount = 0, volumeWriteCount = 0, charCount = 0, fsCount = 0, wsCount = reusingFrozenWorld ? 1 : 0, orgCount = 0, mpCount = 0, timelineCount = 0;""",
    'count reused world as existing canon',
)
replace_once(
    controller,
    """            if (Object.keys(worldSetting).length > 0) {
              const wid = uuid();""",
    """            if (!reusingFrozenWorld && Object.keys(worldSetting).length > 0) {
              const wid = uuid();""",
    'never insert a second long world during recovery',
)

# 4) Same long planner can use a frozen worldview while re-running only the existing skeleton node.
replace_once(
    controller,
    """    chapterWordMin: number;
    chapterWordMax: number;
    onProgress?: (step: 'skeleton' | 'world' | 'characters' | 'outline' | 'foreshadowing', message: string) => void;""",
    """    chapterWordMin: number;
    chapterWordMax: number;
    frozenWorldview?: Record<string, unknown>;
    onProgress?: (step: 'skeleton' | 'world' | 'characters' | 'outline' | 'foreshadowing', message: string) => void;""",
    'allow frozen world input in long planner',
)
old_foundation = """    const foundationResult = await this.chainTemplate.executeChain('long-novel-init-foundation', {
      projectId: input.projectId,
      story_setting: (platformDirective ? platformDirective + '\\n\\n' : '') + input.storySetting,
      targetWords: input.targetWanZi,
      genre: input.genre,
    }, (_nodeIndex, nodeId, status, result) => {
      if (nodeId === 'node_1_skeleton' && status === 'completed') {
        const skeleton = result?.output;
        if (!skeleton?.coreSetting || !Array.isArray(skeleton.skeletonVolumes) || skeleton.skeletonVolumes.length === 0
          || skeleton.skeletonVolumes.some((volume: any) => !Number.isInteger(Number(volume?.estimatedChapters))
            || Number(volume.estimatedChapters) <= 0 || !String(volume?.chapterCountReason || '').trim())) {
          throw new Error('长篇主线骨架缺少完整核心设定或有效分卷章数；世界规则未开始生成。');
        }
        const plannedChapters = skeleton.skeletonVolumes.reduce((total: number, volume: any) => total + Number(volume.estimatedChapters), 0);
        if (plannedChapters * input.chapterWordMin > input.targetWords
          || plannedChapters * input.chapterWordMax < input.targetWords) {
          throw new Error(`长篇主线骨架规划${plannedChapters}章，无法按每章${input.chapterWordMin}-${input.chapterWordMax}字承载目标${input.targetWords}字；世界规则未开始生成。`);
        }
        input.onProgress?.('world', '主线与结局骨架已通过验收，开始生成世界规则');
      }
    });
    const outputs: any = foundationResult?.outputs || {};
    const skeleton = outputs.node_1_skeleton;
    const worldOutput = outputs.node_2_worldview;
    const generatedWorldview = worldOutput?.worldview;"""
new_foundation = """    const foundationInput = {
      projectId: input.projectId,
      story_setting: (platformDirective ? platformDirective + '\\n\\n' : '') + input.storySetting,
      targetWords: input.targetWanZi,
      genre: input.genre,
    };
    const foundationProgress = (_nodeIndex: number, nodeId: string, status: 'started' | 'completed' | 'failed', result?: any) => {
      if (nodeId === 'node_1_skeleton' && status === 'completed') {
        const skeleton = result?.output;
        if (!skeleton?.coreSetting || !Array.isArray(skeleton.skeletonVolumes) || skeleton.skeletonVolumes.length === 0
          || skeleton.skeletonVolumes.some((volume: any) => !Number.isInteger(Number(volume?.estimatedChapters))
            || Number(volume.estimatedChapters) <= 0 || !String(volume?.chapterCountReason || '').trim())) {
          throw new Error('长篇主线骨架缺少完整核心设定或有效分卷章数；后续资料未开始生成。');
        }
        const plannedChapters = skeleton.skeletonVolumes.reduce((total: number, volume: any) => total + Number(volume.estimatedChapters), 0);
        if (plannedChapters * input.chapterWordMin > input.targetWords
          || plannedChapters * input.chapterWordMax < input.targetWords) {
          throw new Error(`长篇主线骨架规划${plannedChapters}章，无法按每章${input.chapterWordMin}-${input.chapterWordMax}字承载目标${input.targetWords}字；后续资料未开始生成。`);
        }
        input.onProgress?.('world', input.frozenWorldview
          ? '主线与结局骨架已通过验收，继续沿用冻结世界观'
          : '主线与结局骨架已通过验收，开始生成世界规则');
      }
    };
    const foundationResult = input.frozenWorldview
      ? await this.chainTemplate.executeLongNovelFoundationSkeleton(foundationInput, foundationProgress)
      : await this.chainTemplate.executeChain('long-novel-init-foundation', foundationInput, foundationProgress);
    const outputs: any = foundationResult?.outputs || {};
    const skeleton = outputs.node_1_skeleton;
    const worldOutput = outputs.node_2_worldview;
    const generatedWorldview = input.frozenWorldview || worldOutput?.worldview;"""
replace_once(controller, old_foundation, new_foundation, 'reuse frozen world without invoking world node')
replace_once(
    controller,
    """        '长篇地基顺序生成未完成（需先主线骨架、再世界规则）。'
        + `诊断：${diagnose.length > 0 ? diagnose.join(' | ') : '模型未返回任何可解析内容'}；`""",
    """        (input.frozenWorldview
          ? '长篇恢复地基未完成（冻结世界观保持不变，只重建主线骨架与下游资料）。'
          : '长篇地基顺序生成未完成（需先主线骨架、再世界规则）。')
        + `诊断：${diagnose.length > 0 ? diagnose.join(' | ') : '模型未返回任何可解析内容'}；`""",
    'accurate long recovery diagnostic',
)

# 5) Regression tests.
recovery_spec = 'server/src/chain/generation-recovery.service.spec.ts'
replace_once(
    recovery_spec,
    """  it('blocks whole-project failed-generation cleanup once the world has been established', async () => {
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();
    db.prepare(`INSERT INTO characters VALUES ('char1','p1')`).run();
    db.prepare(`INSERT INTO world_settings VALUES ('w1','p1')`).run();
    db.prepare(`INSERT INTO world_system_profiles VALUES ('wp1','p1','w1','旧世界规则')`).run();

    await expect(service.clearFailedGeneratedAssets('p1')).rejects.toThrow('世界观已冻结');
    expect((db.prepare('SELECT id FROM world_settings WHERE project_id=?').get('p1') as any).id).toBe('w1');
    expect((db.prepare('SELECT rules FROM world_system_profiles WHERE project_id=?').get('p1') as any).rules).toBe('旧世界规则');
    expect((db.prepare('SELECT id FROM outlines WHERE project_id=?').get('p1') as any).id).toBe('o1');
  });""",
    """  it('preserves frozen world while clearing only downstream generated assets for ordinary recovery', async () => {
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();
    db.prepare(`INSERT INTO characters VALUES ('char1','p1')`).run();
    db.prepare(`INSERT INTO character_extended_profiles VALUES ('cp1','p1','char1','旧人物档案')`).run();
    db.prepare(`INSERT INTO world_settings VALUES ('w1','p1')`).run();
    db.prepare(`INSERT INTO world_system_profiles VALUES ('wp1','p1','w1','旧世界规则')`).run();

    const audit = await service.audit('p1');
    expect(audit.canResume).toBe(true);
    await service.clearFailedGeneratedAssets('p1');

    expect((db.prepare('SELECT id FROM world_settings WHERE project_id=?').get('p1') as any).id).toBe('w1');
    expect((db.prepare('SELECT rules FROM world_system_profiles WHERE project_id=?').get('p1') as any).rules).toBe('旧世界规则');
    expect((db.prepare('SELECT COUNT(*) count FROM outlines WHERE project_id=?').get('p1') as any).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) count FROM chapters WHERE project_id=?').get('p1') as any).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) count FROM characters WHERE project_id=?').get('p1') as any).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) count FROM character_extended_profiles WHERE project_id=?').get('p1') as any).count).toBe(0);
    expect((db.prepare('SELECT status FROM projects WHERE id=?').get('p1') as any).status).toBe('creating');
  });""",
    'test ordinary recovery preserves frozen world',
)

foundation_spec = 'server/src/chain/long-novel-foundation-sequence.spec.ts'
replace_once(
    foundation_spec,
    """  it('never starts world generation when skeleton generation fails', async () => {""",
    """  it('can rerun only the existing skeleton node when recovery must reuse a frozen world', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ content: JSON.stringify(skeleton) });
    const chain = new ChainTemplateService(new ChainEngineService(new PromptRegistryService(), { generate } as any));
    const result = await chain.executeLongNovelFoundationSkeleton(input);
    expect(result.status).toBe('completed');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].scenario).toBe('outline');
    expect(result.outputs.node_1_skeleton.coreSetting.title).toBe('旧站之谜');
    expect(result.outputs.node_2_worldview).toBeUndefined();
  });

  it('never starts world generation when skeleton generation fails', async () => {""",
    'test skeleton-only frozen-world recovery',
)

arch_spec = 'server/src/chain/creation-consistency-architecture.spec.ts'
replace_once(
    arch_spec,
    """  it('does not run a late world-depth mutation after downstream canon exists', () => {""",
    """  it('reuses frozen world during long recovery instead of generating or inserting a second world', () => {
    expect(controllerSource).toContain('frozenWorldview: frozenLongWorldview');
    expect(controllerSource).toContain('executeLongNovelFoundationSkeleton');
    expect(controllerSource).toContain('if (!reusingFrozenWorld && Object.keys(worldSetting).length > 0)');
    expect(controllerSource).toContain('wsCount = reusingFrozenWorld ? 1 : 0');
  });

  it('does not run a late world-depth mutation after downstream canon exists', () => {""",
    'architecture test for frozen-world long recovery',
)

print('frozen-world recovery patch applied')
