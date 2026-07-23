import { test, expect } from '@playwright/test';
import { createProject, deleteProject, uniqueTitle } from '../helpers';

test.describe('Project CRUD E2E', () => {
  let projectId: string;
  let projectTitle: string;

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await deleteProject(request, projectId);
    }
  });

  test('should create a new project via API', async ({ request }) => {
    projectTitle = uniqueTitle('crud-project');
    const res = await request.post('http://127.0.0.1:3100/api/v1/projects', {
      data: { title: projectTitle, type: 'long_novel', targetWords: 200000, settings: { genre: '测试', targetAudience: '测试读者', pov: '第三人称限知', perChapterTarget: 5000, volumeCount: 4 } },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body.title).toBe(projectTitle);
    expect(body.type).toBe('long_novel');
    expect(body.status).toBe('active');
    projectId = body.id;
  });

  test('should list projects and verify the new one is present', async ({ request }) => {
    // Create a project first
    projectTitle = uniqueTitle('list-project');
    const createRes = await request.post('http://127.0.0.1:3100/api/v1/projects', {
      data: { title: projectTitle, type: 'long_novel', targetWords: 200000, settings: { genre: '测试', targetAudience: '测试读者', pov: '第三人称限知', perChapterTarget: 5000, volumeCount: 4 } },
    });
    projectId = (await createRes.json()).id;

    // List all projects
    const listRes = await request.get('http://127.0.0.1:3100/api/v1/projects');
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();

    expect(listBody).toHaveProperty('data');
    expect(Array.isArray(listBody.data)).toBe(true);

    const found = listBody.data.find((p: any) => p.id === projectId);
    expect(found).toBeDefined();
    expect(found.title).toBe(projectTitle);
  });

  test('should update project settings', async ({ request }) => {
    // Create a project
    projectTitle = uniqueTitle('update-project');
    const createRes = await request.post('http://127.0.0.1:3100/api/v1/projects', {
      data: { title: projectTitle, type: 'long_novel', targetWords: 200000, settings: { genre: '测试', targetAudience: '测试读者', pov: '第三人称限知', perChapterTarget: 5000, volumeCount: 4 } },
    });
    projectId = (await createRes.json()).id;

    // Update the title
    const newTitle = 'Updated-' + projectTitle;
    const updateRes = await request.put(`http://127.0.0.1:3100/api/v1/projects/${projectId}`, {
      data: { title: newTitle },
    });
    expect(updateRes.status()).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.title).toBe(newTitle);

    // Verify persistence by fetching the project
    const getRes = await request.get(`http://127.0.0.1:3100/api/v1/projects/${projectId}`);
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.title).toBe(newTitle);
  });

  test('should delete a project and verify it is gone', async ({ request }) => {
    // Create a project
    projectTitle = uniqueTitle('delete-project');
    const createRes = await request.post('http://127.0.0.1:3100/api/v1/projects', {
      data: { title: projectTitle, type: 'long_novel', targetWords: 200000, settings: { genre: '测试', targetAudience: '测试读者', pov: '第三人称限知', perChapterTarget: 5000, volumeCount: 4 } },
    });
    const created = await createRes.json();
    projectId = created.id;

    // Delete it
    const deleteRes = await request.delete(`http://127.0.0.1:3100/api/v1/projects/${projectId}`);
    expect(deleteRes.status()).toBe(200);

    // Verify it's gone — we expect a 404
    const getRes = await request.get(`http://127.0.0.1:3100/api/v1/projects/${projectId}`);
    expect(getRes.status()).toBe(404);

    // Reset projectId so afterEach doesn't try to delete again
    projectId = '';
  });
});
