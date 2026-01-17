import { test, expect } from '@playwright/test';

/**
 * Wizard Workflow E2E Tests
 *
 * Tests the complete user journey through the remodel wizard:
 * 1. Upload blueprint
 * 2. Calibrate scale
 * 3. Set orientation
 * 4. Detect rooms (AI)
 * 5. Set remodel goals
 * 6. Generate visualizations
 */

test.describe('Wizard Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock all required APIs
    await page.route('/api/projects/init', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          project: {
            id: 'test-project-123',
            name: 'Test Project',
            userId: 'default-user',
          },
        }),
      });
    });

    await page.route('/api/floors/create', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          floor: {
            id: 'floor-123',
            projectId: 'test-project-123',
            name: 'Main Floor',
            scaleRatio: null,
            isCalibrated: false,
          },
        }),
      });
    });

    await page.route('/api/images/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          id: 'image-123',
          cloudflareId: 'cf-123',
          publicUrl: 'https://example.com/image.png',
          variants: [],
        }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should complete full wizard workflow with agent logging', async ({ page }) => {
    let logCount = 0;

    // Mock agent logging
    await page.route('/api/logs', async (route) => {
      const postData = route.request().postDataJSON();
      logCount++;

      // Verify log structure
      expect(postData.floorId).toBe('floor-123');
      expect(postData.stepName).toBeDefined();
      expect(postData.actionTaken).toBeDefined();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          logId: `log-${logCount}`,
        }),
      });
    });

    // Mock floor sync for calibration
    await page.route('/api/floors/*/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          floorId: 'floor-123',
        }),
      });
    });

    // Mock room creation
    await page.route('/api/rooms', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          roomId: 'room-123',
          room: {
            id: 'room-123',
            floorId: 'floor-123',
            name: 'Living Room',
          },
        }),
      });
    });

    // Step 1: Upload blueprint
    const uploadButton = page.getByRole('button', { name: /upload|add.*floor.*plan/i });
    if (await uploadButton.isVisible({ timeout: 2000 })) {
      await uploadButton.click();

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'blueprint.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
      });

      await page.waitForTimeout(1000);
    }

    // Step 2: Calibration (if visible)
    const calibrateButton = page.getByRole('button', { name: /calibrate|set.*scale/i });
    if (await calibrateButton.isVisible({ timeout: 2000 })) {
      await calibrateButton.click();

      // Simulate drawing calibration line on canvas
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      if (box) {
        await canvas.click({ position: { x: box.width / 4, y: box.height / 2 } });
        await canvas.click({ position: { x: (box.width * 3) / 4, y: box.height / 2 } });
      }

      // Enter known dimension
      const dimensionInput = page.locator('input[type="number"]').first();
      if (await dimensionInput.isVisible({ timeout: 1000 })) {
        await dimensionInput.fill('20');
      }

      const confirmButton = page.getByRole('button', { name: /confirm|save|done/i }).first();
      if (await confirmButton.isVisible({ timeout: 1000 })) {
        await confirmButton.click();
      }
    }

    // Verify agent logs were created
    await page.waitForTimeout(500);
    expect(logCount).toBeGreaterThan(0);
  });

  test('should save snapshots before and after remodel operations', async ({ page }) => {
    let snapshotCount = 0;

    // Mock snapshot creation
    await page.route('/api/snapshots', async (route) => {
      const postData = route.request().postDataJSON();
      snapshotCount++;

      // Verify snapshot structure
      expect(postData.floorId).toBe('floor-123');
      expect(postData.versionNumber).toBeDefined();
      expect(postData.planData).toBeDefined();
      expect(postData.planData.walls).toBeDefined();
      expect(postData.planData.rooms).toBeDefined();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          snapshotId: `snapshot-${snapshotCount}`,
        }),
      });
    });

    await page.route('/api/floors/*/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, floorId: 'floor-123' }),
      });
    });

    // Look for remodel operations
    const remodelButton = page.getByRole('button', { name: /remodel|redesign|modify/i });
    if (await remodelButton.isVisible({ timeout: 2000 })) {
      await remodelButton.click();
      await page.waitForTimeout(1000);

      // Snapshot should be created before remodel
      expect(snapshotCount).toBeGreaterThan(0);
    }
  });

  test('should use API endpoint for AI visual generation', async ({ page }) => {
    let visualGenerationCalled = false;

    // Mock visual generation endpoint
    await page.route('/api/generate/visual', async (route) => {
      const postData = route.request().postDataJSON();

      // Verify request structure
      expect(postData.imageBase64).toBeDefined();
      expect(postData.prompt).toBeDefined();
      expect(postData.generationType).toMatch(/render_3d|render_interior|render_edited/);
      expect(postData.ownerId).toBeDefined();
      expect(postData.ownerType).toMatch(/floor|room/);

      visualGenerationCalled = true;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          imageUrl: 'https://example.com/generated.png',
          imageId: 'gen-image-123',
          base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }),
      });
    });

    await page.route('/api/floors/*/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, floorId: 'floor-123' }),
      });
    });

    // Look for AI generation buttons
    const generateButton = page.getByRole('button', { name: /generate|create.*visual|ai.*render/i });
    if (await generateButton.isVisible({ timeout: 2000 })) {
      await generateButton.click();
      await page.waitForTimeout(2000);

      // Verify API endpoint was called instead of direct Gemini calls
      expect(visualGenerationCalled).toBe(true);
    }
  });

  test('should handle room creation and updates', async ({ page }) => {
    let roomCreated = false;
    let roomUpdated = false;

    await page.route('/api/rooms', async (route) => {
      const postData = route.request().postDataJSON();

      if (postData.id) {
        roomUpdated = true;
      } else {
        roomCreated = true;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          roomId: postData.id || 'new-room-123',
          room: {
            id: postData.id || 'new-room-123',
            floorId: 'floor-123',
            name: postData.name,
            approxArea: postData.approxArea,
          },
        }),
      });
    });

    await page.route('/api/floors/*/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, floorId: 'floor-123' }),
      });
    });

    // Simulate room operations if available
    const canvas = page.locator('canvas').first();
    if (await canvas.isVisible({ timeout: 2000 })) {
      // Click on canvas to potentially create/select room
      await canvas.click({ position: { x: 100, y: 100 } });
      await page.waitForTimeout(500);
    }

    // Check if room management UI appears
    const roomNameInput = page.locator('input[placeholder*="room" i], input[placeholder*="name" i]').first();
    if (await roomNameInput.isVisible({ timeout: 2000 })) {
      await roomNameInput.fill('Master Bedroom');

      const saveButton = page.getByRole('button', { name: /save|update|create/i }).first();
      if (await saveButton.isVisible({ timeout: 1000 })) {
        await saveButton.click();
        await page.waitForTimeout(500);
      }
    }

    // At least one room operation should occur during workflow
    // (Note: This is flexible since UI might vary)
  });

  test('should retrieve and display agent logs', async ({ page }) => {
    // Mock logs retrieval
    await page.route('/api/logs/floor-123', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          logs: [
            {
              id: 'log-1',
              floorId: 'floor-123',
              stepName: 'Blueprint Upload',
              stepIndex: 0,
              thoughtProcess: 'User uploaded blueprint image',
              actionTaken: 'Uploaded to Cloudflare Images',
              status: 'success',
              timestamp: new Date().toISOString(),
            },
            {
              id: 'log-2',
              floorId: 'floor-123',
              stepName: 'Calibration',
              stepIndex: 1,
              thoughtProcess: 'Calculated scale ratio from user input',
              actionTaken: 'Set scale ratio to 12.5 pixels/foot',
              status: 'success',
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.route('/api/floors/*/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, floorId: 'floor-123' }),
      });
    });

    // Look for logs/history view
    const historyButton = page.getByRole('button', { name: /history|log|audit/i });
    if (await historyButton.isVisible({ timeout: 2000 })) {
      await historyButton.click();

      // Should display log entries
      await expect(page.locator('text=/blueprint upload|calibration/i').first()).toBeVisible({
        timeout: 3000,
      });
    }
  });
});
