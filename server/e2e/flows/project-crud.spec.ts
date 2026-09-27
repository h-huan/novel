import { test, expect } from '@playwright/test';
import { createProject, deleteProject, uniqueTitle } from '../helpers';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1`;

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
    const created = await createProject(request, projectTitle);
    projectId = created.id;
    const body = created.response;

    expect(body).toHaveProperty('id');
    expect(body.title).toBe(projectTitle);
    expect(body.type).toBe('long_novel');
    expect(body.status).toBe('active');
  });

  test('should list projects and verify the new one is present', async ({ request }) => {
    projectTitle = uniqueTitle('list-project');
    const created = await createProject(request, projectTitle);
    projectId = created.id;

    const listRes = await request.get(`${BASE}/projects`);
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();

    expect(listBody).toHaveProperty('data');
    expect(Array.isArray(listBody.data)).toBe(true);

    const found = listBody.data.find((p: any) => p.id === projectId);
    expect(found).toBeDefined();
    expect(found.title).toBe(projectTitle);
  });

  test('should update project settings', async ({ request }) => {
    projectTitle = uniqueTitle('update-project');
    const created = await createProject(request, projectTitle);
    projectId = created.id;

    const newTitle = 'Updated-' + projectTitle;
    const updateRes = await request.put(`${BASE}/projects/${projectId}`, {
      data: { title: newTitle },
    });
    expect(updateRes.status()).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.title).toBe(newTitle);

    const getRes = await request.get(`${BASE}/projects/${projectId}`);
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.title).toBe(newTitle);
  });

  test('should delete a project and verify it is gone', async ({ request }) => {
    projectTitle = uniqueTitle('delete-project');
    const created = await createProject(request, projectTitle);
    projectId = created.id;

    const deleteRes = await request.delete(`${BASE}/projects/${projectId}`);
    expect(deleteRes.status()).toBe(200);

    const getRes = await request.get(`${BASE}/projects/${projectId}`);
    expect(getRes.status()).toBe(404);
    projectId = '';
  });
});
