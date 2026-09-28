import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { constitutionSettings, updateConstitution } from '../modules/project/creative-constitution';
import { STANDARD_PRECONDITIONS } from './test-standards';

/**
 * Acceptance-only project seed.
 *
 * Production project creation has exactly one entry:
 * /discover -> /chain/create-project-async. Acceptance tests that exercise
 * metrics, migration or constitution behavior still need a deterministic project
 * row without invoking an LLM. They must use this isolated SQLite fixture instead
 * of reviving ProjectService.create() or POST /projects.
 */
export function seedAcceptanceProject(
  db: DatabaseSync,
  overrides: Record<string, any> = {},
) {
  const id = String(overrides.id || randomUUID());
  const title = String(overrides.title || '验收项目');
  const type = String(overrides.type || 'long_novel');
  const now = new Date().toISOString();

  const constitution = updateConstitution(
    { type, settings: '{}' },
    {
      ...STANDARD_PRECONDITIONS,
      targetAudience: '成年网文读者',
      plotTags: ['成长', '选择'],
      ...overrides,
      title,
      type,
    },
  );
  constitution.revision = 1;
  constitution.confirmedStory = {
    title,
    storyType: type,
    targetPlatform: constitution.targetPlatform,
    hook: '测试项目仅用于隔离验收，不代表真实文学样本。',
    description: '直接写入内存 SQLite 的测试夹具，用于验证现有领域逻辑。',
    protagonist: '测试主角',
    coreConflict: '测试冲突',
    uniquePoint: '测试唯一点',
    styleTags: ['验收'],
  };

  const settings = constitutionSettings(
    {
      autoSave: true,
      autoSaveInterval: 30,
      writingMode: 'full_auto',
      structurePlanning: 'dynamic_by_story_rhythm',
    },
    constitution,
  );

  db.prepare(`INSERT INTO projects
    (id,title,type,status,target_words,current_words,settings,writing_style,platform_style,target_platform,current_workflow_stage,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,
    title,
    constitution.projectType,
    String(overrides.status || 'active'),
    constitution.targetWords,
    0,
    JSON.stringify(settings),
    JSON.stringify(constitution.writingStyle),
    constitution.targetPlatform,
    constitution.targetPlatform,
    String(overrides.currentWorkflowStage || 'world_setting'),
    now,
    now,
  );

  return {
    id,
    title,
    type: constitution.projectType,
    status: String(overrides.status || 'active'),
    creativeConstitution: constitution,
  };
}
