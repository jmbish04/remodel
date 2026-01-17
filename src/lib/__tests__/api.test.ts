/**
 * Comprehensive unit tests for the API client
 * Tests all exported API namespaces and methods
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  projectsApi,
  floorsApi,
  roomsApi,
  imagesApi,
  visualsApi,
  logsApi,
  snapshotsApi,
} from '../api';

describe('API Client', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  describe('projectsApi', () => {
    describe('init', () => {
      it('should create a new project with default userId', async () => {
        const mockProject = {
          id: 'proj-123',
          name: 'My Remodel',
          userId: 'default-user',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, project: mockProject }),
        });

        const result = await projectsApi.init('My Remodel');

        expect(global.fetch).toHaveBeenCalledWith('/api/projects/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'My Remodel', userId: undefined }),
        });
        expect(result.project.name).toBe('My Remodel');
      });

      it('should create a project with custom userId', async () => {
        const mockProject = {
          id: 'proj-123',
          name: 'My Remodel',
          userId: 'user-456',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, project: mockProject }),
        });

        await projectsApi.init('My Remodel', 'user-456');

        expect(global.fetch).toHaveBeenCalledWith('/api/projects/init', expect.objectContaining({
          body: JSON.stringify({ name: 'My Remodel', userId: 'user-456' }),
        }));
      });

      it('should handle API errors', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Database error' }),
        });

        await expect(projectsApi.init('Test')).rejects.toThrow('Database error');
      });
    });

    describe('get', () => {
      it('should retrieve a project with nested floors and rooms', async () => {
        const mockResponse = {
          success: true,
          project: {
            id: 'proj-123',
            name: 'My Home',
            userId: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
            floors: [
              {
                id: 'floor-1',
                projectId: 'proj-123',
                name: 'Main Floor',
                scaleRatio: 10.5,
                isCalibrated: true,
                orientationData: null,
                isUnderground: false,
                stairLocation: null,
                sortOrder: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                rooms: [
                  {
                    id: 'room-1',
                    floorId: 'floor-1',
                    name: 'Living Room',
                    widthFt: 15,
                    lengthFt: 20,
                    approxArea: 300,
                    polygonJson: null,
                    labelPosition: null,
                    remodelGoals: null,
                    remodelGoalsJson: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ],
              },
            ],
          },
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await projectsApi.get('proj-123');

        expect(global.fetch).toHaveBeenCalledWith('/api/projects/proj-123', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(result.project.floors).toHaveLength(1);
        expect(result.project.floors[0].rooms).toHaveLength(1);
      });
    });
  });

  describe('floorsApi', () => {
    describe('create', () => {
      it('should create a new floor', async () => {
        const mockFloor = {
          id: 'floor-123',
          projectId: 'proj-1',
          name: 'Basement',
          scaleRatio: null,
          isCalibrated: false,
          orientationData: null,
          isUnderground: true,
          stairLocation: null,
          sortOrder: -1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, floor: mockFloor }),
        });

        const result = await floorsApi.create('proj-1', 'Basement', true, -1);

        expect(global.fetch).toHaveBeenCalledWith('/api/floors/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: 'proj-1',
            name: 'Basement',
            isUnderground: true,
            sortOrder: -1,
          }),
        });
        expect(result.floor.isUnderground).toBe(true);
      });
    });

    describe('sync', () => {
      it('should sync floor calibration data', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, floorId: 'floor-123' }),
        });

        await floorsApi.sync('floor-123', {
          scaleRatio: 12.5,
          isCalibrated: true,
          orientationData: {
            frontDoorId: 'door-1',
            frontAngle: 90,
          },
        });

        expect(global.fetch).toHaveBeenCalledWith('/api/floors/floor-123/sync', expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"scaleRatio":12.5'),
        }));
      });
    });
  });

  describe('roomsApi', () => {
    describe('upsert', () => {
      it('should create a new room', async () => {
        const mockResponse = {
          success: true,
          roomId: 'room-123',
          room: {
            id: 'room-123',
            floorId: 'floor-1',
            name: 'Kitchen',
            widthFt: 12,
            lengthFt: 15,
            approxArea: 180,
            polygonJson: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 120 },
              { x: 0, y: 120 },
            ],
            labelPosition: { x: 50, y: 60 },
            remodelGoals: 'Modern farmhouse style',
            remodelGoalsJson: {
              style: 'modern farmhouse',
              budget: 25000,
              priorities: ['cabinets', 'countertops'],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await roomsApi.upsert({
          floorId: 'floor-1',
          name: 'Kitchen',
          widthFt: 12,
          lengthFt: 15,
          approxArea: 180,
          remodelGoals: 'Modern farmhouse style',
          remodelGoalsJson: {
            style: 'modern farmhouse',
            budget: 25000,
            priorities: ['cabinets', 'countertops'],
          },
        });

        expect(result.room?.name).toBe('Kitchen');
        expect(result.room?.remodelGoalsJson?.budget).toBe(25000);
      });

      it('should update an existing room', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, roomId: 'room-123' }),
        });

        await roomsApi.upsert({
          id: 'room-123',
          floorId: 'floor-1',
          name: 'Updated Kitchen',
          widthFt: 14,
        });

        expect(global.fetch).toHaveBeenCalledWith('/api/rooms', expect.objectContaining({
          body: expect.stringContaining('"id":"room-123"'),
        }));
      });
    });
  });

  describe('imagesApi', () => {
    describe('upload', () => {
      it('should upload a base64 image', async () => {
        const mockResponse = {
          success: true,
          id: 'img-123',
          cloudflareId: 'cf-img-123',
          publicUrl: 'https://imagedelivery.net/abc/cf-img-123/public',
          variants: [
            'https://imagedelivery.net/abc/cf-img-123/public',
            'https://imagedelivery.net/abc/cf-img-123/thumbnail',
          ],
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await imagesApi.upload({
          base64Data: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
          ownerType: 'floor',
          ownerId: 'floor-1',
          type: 'blueprint_original',
          width: 1920,
          height: 1080,
        });

        expect(result.publicUrl).toContain('imagedelivery.net');
        expect(result.variants).toHaveLength(2);
      });

      it('should include generation metadata for AI images', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            id: 'img-456',
            cloudflareId: 'cf-img-456',
            publicUrl: 'https://imagedelivery.net/abc/cf-img-456/public',
            variants: [],
          }),
        });

        await imagesApi.upload({
          base64Data: 'data:image/png;base64,abc...',
          ownerType: 'room',
          ownerId: 'room-1',
          type: 'render_3d',
          promptUsed: 'Generate isometric 3D render',
          generationModel: 'gemini-2.5-flash-image-preview',
        });

        expect(global.fetch).toHaveBeenCalledWith('/api/images/upload', expect.objectContaining({
          body: expect.stringContaining('"promptUsed":"Generate isometric 3D render"'),
        }));
      });
    });

    describe('getForOwner', () => {
      it('should retrieve all images for a floor', async () => {
        const mockImages = [
          {
            id: 'img-1',
            ownerType: 'floor',
            ownerId: 'floor-1',
            cloudflareId: 'cf-1',
            publicUrl: 'https://imagedelivery.net/abc/cf-1/public',
            type: 'blueprint_original',
            promptUsed: null,
            generationModel: null,
            width: 1920,
            height: 1080,
            mimeType: 'image/png',
            fileSize: 2048000,
            createdAt: new Date(),
          },
          {
            id: 'img-2',
            ownerType: 'floor',
            ownerId: 'floor-1',
            cloudflareId: 'cf-2',
            publicUrl: 'https://imagedelivery.net/abc/cf-2/public',
            type: 'render_3d',
            promptUsed: 'Generate 3D render',
            generationModel: 'gemini-2.5-flash-image-preview',
            width: 1024,
            height: 1024,
            mimeType: 'image/png',
            fileSize: 1024000,
            createdAt: new Date(),
          },
        ];

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, images: mockImages }),
        });

        const result = await imagesApi.getForOwner('floor', 'floor-1');

        expect(result.images).toHaveLength(2);
        expect(result.images[0].type).toBe('blueprint_original');
        expect(result.images[1].type).toBe('render_3d');
      });
    });
  });

  describe('visualsApi', () => {
    describe('generate', () => {
      it('should generate a 3D render via Gemini', async () => {
        const mockResponse = {
          success: true,
          imageUrl: 'https://imagedelivery.net/abc/img-render/public',
          imageId: 'img-render-123',
          base64: 'data:image/png;base64,generated...',
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await visualsApi.generate({
          imageBase64: 'data:image/png;base64,original...',
          prompt: 'Generate isometric 3D render',
          generationType: 'render_3d',
          ownerId: 'floor-1',
          ownerType: 'floor',
        });

        expect(result.imageUrl).toContain('imagedelivery.net');
        expect(result.base64).toContain('base64');
      });

      it('should support custom Gemini model', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'https://example.com/img.png',
            imageId: 'img-1',
            base64: 'data:image/png;base64,test',
          }),
        });

        await visualsApi.generate({
          imageBase64: 'data:image/png;base64,test',
          prompt: 'Generate render',
          generationType: 'render_interior',
          ownerId: 'room-1',
          ownerType: 'room',
          model: 'gemini-3-flash-preview',
        });

        expect(global.fetch).toHaveBeenCalledWith('/api/generate/visual', expect.objectContaining({
          body: expect.stringContaining('"model":"gemini-3-flash-preview"'),
        }));
      });
    });
  });

  describe('logsApi', () => {
    describe('create', () => {
      it('should create an agent log entry', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, logId: 'log-123' }),
        });

        const result = await logsApi.create({
          floorId: 'floor-1',
          stepName: 'CALIBRATION',
          stepIndex: 0,
          thoughtProcess: 'User is setting scale ratio',
          actionTaken: 'Set scale to 12.5 pixels per foot',
          inputData: { feet: 10, inches: 0 },
          outputData: { pixelsPerFoot: 12.5 },
          status: 'success',
        });

        expect(result.logId).toBe('log-123');
        expect(global.fetch).toHaveBeenCalledWith('/api/logs', expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"stepName":"CALIBRATION"'),
        }));
      });

      it('should log errors', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, logId: 'log-456' }),
        });

        await logsApi.create({
          floorId: 'floor-1',
          stepName: 'DIGITIZING',
          actionTaken: 'Attempted to digitize floor plan',
          status: 'error',
          errorMessage: 'Gemini API rate limit exceeded',
        });

        expect(global.fetch).toHaveBeenCalledWith('/api/logs', expect.objectContaining({
          body: expect.stringContaining('"status":"error"'),
        }));
      });
    });

    describe('getForFloor', () => {
      it('should retrieve all logs for a floor', async () => {
        const mockLogs = [
          {
            id: 'log-1',
            floorId: 'floor-1',
            stepName: 'CALIBRATION',
            stepIndex: 0,
            thoughtProcess: 'Setting scale',
            actionTaken: 'Applied calibration',
            inputData: null,
            outputData: null,
            status: 'success',
            errorMessage: null,
            timestamp: new Date(),
          },
          {
            id: 'log-2',
            floorId: 'floor-1',
            stepName: 'DIGITIZING',
            stepIndex: 1,
            thoughtProcess: 'Converting to vector',
            actionTaken: 'Digitized floor plan',
            inputData: null,
            outputData: null,
            status: 'success',
            errorMessage: null,
            timestamp: new Date(),
          },
        ];

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, logs: mockLogs }),
        });

        const result = await logsApi.getForFloor('floor-1');

        expect(result.logs).toHaveLength(2);
        expect(result.logs[0].stepName).toBe('CALIBRATION');
      });
    });
  });

  describe('snapshotsApi', () => {
    describe('create', () => {
      it('should save a complete floor plan snapshot', async () => {
        const mockPlanData = {
          walls: [
            {
              id: 'wall-1',
              start: { x: 0, y: 0 },
              end: { x: 100, y: 0 },
              type: 'wall' as const,
              isExternal: true,
            },
          ],
          rooms: [
            {
              id: 'room-1',
              name: 'Living Room',
              labelPosition: { x: 50, y: 50 },
            },
          ],
          width: 1920,
          height: 1080,
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, snapshotId: 'snap-123' }),
        });

        const result = await snapshotsApi.create({
          floorId: 'floor-1',
          versionNumber: 1,
          description: 'After removing closet wall',
          planData: mockPlanData,
          remodelZone: {
            x: 100,
            y: 100,
            width: 200,
            height: 200,
          },
        });

        expect(result.snapshotId).toBe('snap-123');
        expect(global.fetch).toHaveBeenCalledWith('/api/snapshots', expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"versionNumber":1'),
        }));
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw errors for non-200 responses', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Project not found' }),
      });

      await expect(projectsApi.get('invalid-id')).rejects.toThrow('Project not found');
    });

    it('should handle malformed JSON errors', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(projectsApi.get('test-id')).rejects.toThrow('API error: 500');
    });

    it('should handle network errors', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network failure'));

      await expect(projectsApi.init('Test')).rejects.toThrow('Network failure');
    });
  });
});
