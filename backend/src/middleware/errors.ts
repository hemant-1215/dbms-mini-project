import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.issues } }); return;
  }
  const code = String((error as { code?: string }).code ?? 'INTERNAL_ERROR');
  const status = code === 'ER_DUP_ENTRY' ? 409 : code === 'ER_NO_REFERENCED_ROW_2' ? 404 : 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: { code, message: status === 500 ? 'The server could not complete the request.' : String((error as Error).message) } });
};
