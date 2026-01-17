/**
 * Agent log routes (audit trail)
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { agentLogs, type NewAgentLog } from '../db/schema';
import type { Env } from '../types';

const logsRouter = new Hono<{ Bindings: Env }>();

/**
 * Records AI agent decision and action for audit trail
 * POST /api/logs
 */
logsRouter.post('/', async (c) => {
  const db = drizzle(c.env.DB);
  const body = await c.req.json<{
    floorId: string;
    stepName: string;
    stepIndex?: number;
    thoughtProcess?: string;
    actionTaken: string;
    inputData?: Record<string, unknown>;
    outputData?: Record<string, unknown>;
    status?: 'success' | 'error' | 'warning';
    errorMessage?: string;
  }>();

  const logId = crypto.randomUUID();
  const newLog: NewAgentLog = {
    id: logId,
    floorId: body.floorId,
    stepName: body.stepName,
    stepIndex: body.stepIndex || null,
    thoughtProcess: body.thoughtProcess || null,
    actionTaken: body.actionTaken,
    inputData: body.inputData || null,
    outputData: body.outputData || null,
    status: body.status || 'success',
    errorMessage: body.errorMessage || null,
  };

  await db.insert(agentLogs).values(newLog);

  return c.json({
    success: true,
    logId,
  });
});

/**
 * Retrieves all agent logs for a floor (audit trail)
 * GET /api/logs/:floorId
 */
logsRouter.get('/:floorId', async (c) => {
  const db = drizzle(c.env.DB);
  const floorId = c.req.param('floorId');

  const logs = await db.select().from(agentLogs).where(eq(agentLogs.floorId, floorId)).all();

  return c.json({
    success: true,
    logs,
  });
});

export default logsRouter;
