from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


# CreativeConstitution is the domain contract. Its unit tests must not depend on the deleted HTTP create DTO.
path = 'server/src/modules/project/creative-constitution.spec.ts'
text = read(path)
text = text.replace("import { plainToInstance } from 'class-transformer';\n", '')
text = text.replace("import { CreateProjectDto } from './dto/create-project.dto';\n", '')
text = once(
    text,
    "    const dto = plainToInstance(CreateProjectDto, { title: 'test', type: 'short_story', targetPlatform: 'zhihu' });\n    const c = updateConstitution({ settings: '{}' }, dto);\n",
    "    const c = updateConstitution({ settings: '{}' }, { title: 'test', type: 'short_story', targetPlatform: 'zhihu' });\n",
    'creative constitution direct DTO test',
)
write(path, text)

# Platform/category tests exercise the constitution/category functions directly, not a removed creation transport DTO.
path = 'server/src/modules/project/platform-categories.spec.ts'
text = read(path)
text = text.replace("import { plainToInstance } from 'class-transformer';\n", '')
text = text.replace("import { CreateProjectDto } from './dto/create-project.dto';\n", '')
text = once(
    text,
    "function constitutionOf(partial: Record<string, unknown>) {\n  const dto = plainToInstance(CreateProjectDto, { title: 't', type: 'long_novel', ...partial });\n  return updateConstitution({ settings: '{}' }, dto);\n}\n",
    "function constitutionOf(partial: Record<string, unknown>) {\n  return updateConstitution({ settings: '{}' }, { title: 't', type: 'long_novel', ...partial });\n}\n",
    'platform category direct DTO helper',
)
write(path, text)

# HTTP constitution lifecycle uses an isolated DB fixture; it must not recreate the deleted POST /projects path.
path = 'server/e2e/flows/creative-constitution.spec.ts'
text = read(path)
text = once(
    text,
    "import { uniqueTitle, validProjectPayload } from '../helpers';\n",
    "import { createProject, uniqueTitle } from '../helpers';\n",
    'creative constitution E2E helper import',
)
old = """  const created = await request.post(url, {
    data: validProjectPayload({
      title: uniqueTitle('constitution-e2e'),
      type: 'short_story',
      targetWords: 12000,
    }),
  });
  expect(created.status(), await created.text()).toBe(201);
  const p = await created.json();
"""
new = """  const created = await createProject(request, uniqueTitle('constitution-e2e'));
  const p = created.response;
"""
text = once(text, old, new, 'creative constitution E2E direct create block')
text = once(
    text,
    "    expect(p.creativeConstitution).toMatchObject({ revision: 1, projectType: 'short_story', targetPlatform: 'custom' });\n",
    "    expect(p.creativeConstitution).toMatchObject({ revision: 1, projectType: 'long_novel', targetPlatform: 'fanqie' });\n",
    'creative constitution E2E initial expectation',
)
text = once(
    text,
    "    expect(saved.creativeConstitution.targetPlatform).toBe('custom');\n",
    "    expect(saved.creativeConstitution.targetPlatform).toBe('fanqie');\n",
    'creative constitution E2E saved platform expectation',
)
text = once(
    text,
    "      data: { targetPlatform: 'custom', settings: { targetPlatform: 'fanqie' } },\n",
    "      data: { targetPlatform: 'fanqie', settings: { targetPlatform: 'zhihu' } },\n",
    'creative constitution E2E conflicting sources',
)
write(path, text)

# Writing-flow E2E must use the current WorldSetting create contract. The deleted
# /world-settings/simple alias must never be reintroduced just to satisfy tests.
path = 'server/e2e/flows/writing-flow.spec.ts'
text = read(path)
old_world_one = """    const world = await request.put(`${BASE}/projects/${projectId}/world-settings/simple`, {
      data: {
        storyPremise: '档案员追查午夜新增的失踪登记。',
        era: '现代城市',
        locations: ['档案馆'],
        socialRules: '官方档案必须保留可追溯修改记录。',
        specialSettings: '午夜后新增的异常登记只改变档案显示，不直接改写现实经历。',
      },
    });
"""
new_world_one = """    const world = await request.post(`${BASE}/projects/${projectId}/world-settings`, {
      data: {
        name: '档案馆异常规则',
        era: '现代城市',
        workIntro: '档案员追查午夜新增的失踪登记。',
        constraints: [{
          category: '档案规则',
          rule: '官方档案必须保留可追溯修改记录。',
          description: '午夜后新增的异常登记只改变档案显示，不直接改写现实经历。',
          severity: 'hard',
        }],
      },
    });
"""
text = once(text, old_world_one, new_world_one, 'writing flow world fixture one')
old_world_two = """    const world = await request.put(`${BASE}/projects/${projectId}/world-settings/simple`, {
      data: {
        storyPremise: '档案员追查午夜新增的失踪登记。',
        era: '现代城市',
        locations: ['档案馆'],
        socialRules: '档案修改必须可追溯。',
        specialSettings: '',
      },
    });
"""
new_world_two = """    const world = await request.post(`${BASE}/projects/${projectId}/world-settings`, {
      data: {
        name: '档案馆基础规则',
        era: '现代城市',
        workIntro: '档案员追查午夜新增的失踪登记。',
        constraints: [{
          category: '档案规则',
          rule: '档案修改必须可追溯。',
          description: '用于验证大纲缺失门禁的确定性世界观夹具。',
          severity: 'hard',
        }],
      },
    });
"""
text = once(text, old_world_two, new_world_two, 'writing flow world fixture two')
status_assertion = "    expect(world.status(), await world.text()).toBe(200);\n"
status_count = text.count(status_assertion)
if status_count != 2:
    raise SystemExit(f'writing flow world create status: expected 2 occurrences, found {status_count}')
text = text.replace(status_assertion, "    expect(world.status(), await world.text()).toBe(201);\n")
write(path, text)
