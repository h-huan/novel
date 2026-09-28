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
