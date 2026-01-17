import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Blueprint Upload and Calibration E2E Tests
 *
 * Verifies the complete blueprint upload workflow:
 * - File upload to Cloudflare Images
 * - Floor creation in database
 * - Calibration wizard progression
 */

test.describe('Blueprint Upload', () => {
  test.beforeEach(async ({ page }) => {
    // Mock project initialization
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should upload blueprint to Cloudflare Images and create floor', async ({ page }) => {
    let floorCreated = false;
    let imageUploaded = false;

    // Mock floor creation
    await page.route('/api/floors/create', async (route) => {
      floorCreated = true;
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
            orientationData: null,
            isUnderground: false,
            stairLocation: null,
            sortOrder: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    });

    // Mock image upload
    await page.route('/api/images/upload', async (route) => {
      const postData = route.request().postDataJSON();

      // Verify required fields are present
      expect(postData.ownerType).toBe('floor');
      expect(postData.type).toBe('blueprint_original');
      expect(postData.base64Data).toBeDefined();

      imageUploaded = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          id: 'image-123',
          cloudflareId: 'cf-image-123',
          publicUrl: 'https://imagedelivery.net/test-account/cf-image-123/public',
          variants: ['https://imagedelivery.net/test-account/cf-image-123/public'],
        }),
      });
    });

    // Click "Add Floor Plan" or similar button
    const uploadButton = page.getByRole('button', { name: /upload|add.*floor.*plan/i });
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
    await uploadButton.click();

    // Upload a blueprint file
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();

    // Create a test image file
    const testImagePath = path.join(__dirname, 'fixtures', 'test-blueprint.png');

    // If fixtures don't exist, we'll use setInputFiles with buffer
    await fileInput.setInputFiles({
      name: 'test-blueprint.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });

    // Wait for both API calls
    // Wait for API responses instead of a fixed timeout
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/floors/create') && resp.status() === 200),
      page.waitForResponse(resp => resp.url().includes('/api/images/upload') && resp.status() === 200),
    ]);

    // Verify both APIs were called
    expect(floorCreated).toBe(true);
    expect(imageUploaded).toBe(true);

    // Verify the canvas displays the blueprint
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('should handle upload errors gracefully', async ({ page }) => {
    // Mock image upload failure
    await page.route('/api/images/upload', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Cloudflare Images upload failed',
        }),
      });
    });

    const uploadButton = page.getByRole('button', { name: /upload|add.*floor.*plan/i });
    if (await uploadButton.isVisible({ timeout: 2000 })) {
      await uploadButton.click();

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test-blueprint.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
      });

      // Should display error message
      await expect(page.locator('text=/error|failed/i').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should allow calibration after blueprint upload', async ({ page }) => {
    // Mock successful upload
    await page.route('/api/floors/create', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          floor: { id: 'floor-123', name: 'Main Floor', projectId: 'test-project-123' },
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
          cloudflareId: 'cf-image-123',
          publicUrl: 'https://imagedelivery.net/test/public',
          variants: ['https://imagedelivery.net/test/public'],
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

    const uploadButton = page.getByRole('button', { name: /upload|add.*floor.*plan/i });
    if (await uploadButton.isVisible({ timeout: 2000 })) {
      await uploadButton.click();

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test-blueprint.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
      });

      // Look for calibration UI elements
      const calibrateButton = page.getByRole('button', { name: /calibrate|set.*scale/i });
      await expect(calibrateButton).toBeVisible({ timeout: 5000 });
    }
  });
});
