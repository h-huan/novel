from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


# 1) ProjectController is read/update/delete only. Creation belongs to /discover -> create-project-async.
path = 'server/src/modules/project/project.controller.ts'
text = read(path)
text = text.replace('  Post,\n', '')
text = text.replace("import { CreateProjectDto } from './dto/create-project.dto';\n", '')
create_block = """  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.service.create(dto);
  }

"""
text = once(text, create_block, '', 'ProjectController direct create')
write(path, text)

# 2) Remove the unused direct-create business path.
path = 'server/src/modules/project/project.service.ts'
text = read(path)
text = text.replace(', missingConstitutionStandards', '')
text = text.replace("import { v4 as uuid } from 'uuid';\n", '')
text = text.replace("import type { CreateProjectDto } from './dto/create-project.dto';\n", '')
start = text.find('  /**\n   * Direct project CRUD is no longer an idea-incubation path.')
end = text.find('  findAll(query: ProjectQueryDto)', start)
if start < 0 or end < 0:
    raise SystemExit(f'ProjectService create block markers missing: start={start} end={end}')
text = text[:start] + text[end:]
write(path, text)

dto = Path('server/src/modules/project/dto/create-project.dto.ts')
if not dto.exists():
    raise SystemExit('create-project.dto.ts already missing unexpectedly')
dto.unlink()

# 3) Renderer store cannot create a second project shell.
path = 'desktop/src/renderer/stores/projectStore.ts'
text = read(path)
start = text.find('/**\n * 创建 / 更新项目共用的执行标准字段清单。')
end = text.find('/** 更新项目卡片执行标准', start)
if start < 0 or end < 0:
    raise SystemExit(f'projectStore create helpers markers missing: start={start} end={end}')
text = text[:start] + text[end:]
text, n = re.subn(r'^\s*createProject: \(data: ProjectCreateData\) => Promise<Project>;\n', '', text, count=1, flags=re.M)
if n != 1:
    raise SystemExit(f'projectStore state create signature expected 1, got {n}')
start = text.find('  createProject: async (data: ProjectCreateData) => {')
end = text.find('  updateProject: async (id: string, data: ProjectUpdateData) => {', start)
if start < 0 or end < 0:
    raise SystemExit(f'projectStore create implementation markers missing: start={start} end={end}')
text = text[:start] + text[end:]
write(path, text)

# 4) Unit tests must stop protecting the deleted second creation path.
path = 'server/src/modules/project/project.service.spec.ts'
text = read(path)
text = text.replace("import { STANDARD_PRECONDITIONS } from '../../acceptance/test-standards';\n", '')
start = text.find("  describe('create', () => {")
end = text.find("  describe('findOne', () => {", start)
if start < 0 or end < 0:
    raise SystemExit(f'project service create tests markers missing: start={start} end={end}')
text = text[:start] + text[end:]
write(path, text)

# 5) E2E fixture writes directly into the isolated test SQLite database.
path = 'server/e2e/helpers.ts'
text = read(path)
text = once(
    text,
    "import { APIRequestContext, expect } from '@playwright/test';\n",
    "import { APIRequestContext, expect } from '@playwright/test';\n"
    "import { DatabaseSync } from 'node:sqlite';\n"
    "import { randomUUID } from 'node:crypto';\n"
    "import path from 'node:path';\n"
    "import { STANDARD_PRECONDITIONS } from '../src/acceptance/test-standards';\n"
    "import { constitutionSettings, updateConstitution } from '../src/modules/project/creative-constitution';\n",
    'e2e helper imports',
)
start = text.find('export function validProjectPayload(')
end = text.find('/** Delete a project by id */', start)
if start < 0 or end < 0:
    raise SystemExit(f'e2e fixture block markers missing: start={start} end={end}')
fixture = '''/**
 * Seed a project directly into the isolated E2E SQLite database.
 * Production has no generic project-create API: /discover -> create-project-async
 * is the only user creation path. This helper exists only inside DATA_DIR=.runtime-data-*.
 */
export async function createProject(request: APIRequestContext, title?: string) {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir || !dataDir.includes('.runtime-data-')) {
    throw new Error(`E2E project fixture refused non-isolated DATA_DIR: ${dataDir || '(unset)'}`);
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const projectTitle = title || uniqueTitle();
  const constitution = updateConstitution(
    { type: 'long_novel', settings: '{}' },
    {
      ...STANDARD_PRECONDITIONS,
      type: 'long_novel',
      targetAudience: '成年网文读者',
      plotTags: ['成长', '选择'],
    },
  );
  constitution.revision = 1;
  constitution.confirmedStory = {
    title: projectTitle,
    storyType: 'long_novel',
    targetPlatform: constitution.targetPlatform,
    hook: '测试项目仅用于隔离 E2E 生命周期验证',
    description: '隔离测试数据库中的确定性项目夹具，不代表真实文学质量样本。',
    protagonist: '测试主角',
    coreConflict: '测试冲突',
    uniquePoint: '测试唯一点',
    styleTags: ['都市', '系统'],
  };
  const settings = constitutionSettings({
    autoSave: true,
    autoSaveInterval: 30,
    writingMode: 'full_auto',
    structurePlanning: 'dynamic_by_story_rhythm',
  }, constitution);

  const db = new DatabaseSync(path.join(dataDir, 'novel.db'));
  try {
    db.exec('PRAGMA busy_timeout = 10000');
    db.prepare(`INSERT INTO projects
      (id,title,type,status,target_words,current_words,settings,writing_style,platform_style,target_platform,current_workflow_stage,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, projectTitle, constitution.projectType, 'active', constitution.targetWords, 0,
      JSON.stringify(settings), JSON.stringify(constitution.writingStyle), constitution.targetPlatform,
      constitution.targetPlatform, 'world_setting', now, now,
    );
  } finally {
    db.close();
  }

  const res = await request.get(`${BASE}/projects/${id}`);
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.id).toBe(id);
  expect(body.creativeConstitution?.confirmedStory?.title).toBe(projectTitle);
  return { id, title: projectTitle, response: body };
}

'''
text = text[:start] + fixture + text[end:]
write(path, text)

# 6) E2E proves the direct production creation endpoint is absent.
path = 'server/e2e/flows/project-crud.spec.ts'
text = read(path)
old = '''  test('should create a new project via API', async ({ request }) => {
    projectTitle = uniqueTitle('crud-project');
    const created = await createProject(request, projectTitle);
    projectId = created.id;
    const body = created.response;

    expect(body).toHaveProperty('id');
    expect(body.title).toBe(projectTitle);
    expect(body.type).toBe('long_novel');
    expect(body.status).toBe('active');
  });
'''
new = '''  test('direct POST /projects is not a project creation entry', async ({ request }) => {
    const response = await request.post(`${BASE}/projects`, { data: { title: uniqueTitle('forbidden-create') } });
    expect(response.status()).toBe(404);
  });
'''
text = once(text, old, new, 'project CRUD direct-create E2E')
write(path, text)

# 7) API docs follow the same single creation entry.
path = 'server/docs/API.md'
text = read(path)
start = text.find('### 创建项目\n')
end = text.find('### 项目接口\n', start)
if start < 0 or end < 0:
    raise SystemExit(f'API create-project section markers missing: start={start} end={end}')
replacement = '''### 创建小说

```http
POST /api/v1/chain/create-project-async
Content-Type: application/json
```

该接口只接受 `/chain/idea-discover` 已确认故事卡及完整执行标准，先建立 `creating` 项目壳，再按唯一生成主链构建世界观、角色和大纲；通过激活前完整性/一致性检查后才进入 `active`。

不存在通用 `POST /projects` 创建入口；`/projects` 只负责读取、更新既有项目和删除项目，避免再次形成第二条创建链。

'''
text = text[:start] + replacement + text[end:]
text = text.replace('POST   /api/v1/projects\n', '')
write(path, text)
