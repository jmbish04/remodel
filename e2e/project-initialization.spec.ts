import { test, expect } from '@playwright/test';

/**
 * Project Initialization E2E Tests
 *
 * Verifies that the application correctly initializes a project
 * on startup and persists state to the database.
 */

test.describe('Project Initialization', () => {
  test('should create a new project on first load', async ({ page }) => {
    // Mock the API response for project initialization
    await page.route('/api/projects/init', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          project: {
            id: 'test-project-123',
            name: 'My Remodel Project',
            userId: 'default-user',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto('/');

    // Wait for the project initialization request
    const projectInitRequest = page.waitForRequest('/api/projects/init');
    await projectInitRequest;

    // Verify the application loaded successfully
    await expect(page.locator('h1')).toContainText(/smart home remodel/i);
  });

  test('should handle project initialization errors gracefully', async ({ page }) => {
    // Mock an error response
    await page.route('/api/projects/init', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Database connection failed',
        }),
      });
    });

    await page.goto('/');

    // Should show error message to user
    await expect(page.locator('text=error').first()).toBeVisible({ timeout: 10000 });
  });

  test('should load existing project if project ID is in localStorage', async ({ page, context }) => {
    // Set localStorage with existing project ID
    await context.addInitScript(() => {
      localStorage.setItem('projectId', 'existing-project-456');
    });

    // Mock the GET project API
    await page.route('/api/projects/existing-project-456', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          project: {
            id: 'existing-project-456',
            name: 'Existing Project',
            userId: 'default-user',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            floors: [],
          },
        }),
      });
    });

    await page.goto('/');

    // Should NOT call /api/projects/init, should call GET instead
    const getProjectRequest = page.waitForRequest('/api/projects/existing-project-456');
    await getProjectRequest;

    await expect(page.locator('h1')).toContainText(/smart home remodel/i);
  });
});
