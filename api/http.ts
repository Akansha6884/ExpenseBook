import { ErrorRequestHandler } from 'express';

/**
 * Answers every error with JSON. Without this, Express's default handler
 * returns an HTML page containing the stack trace and file paths.
 */
export const jsonErrors: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  const status = httpStatusOf(err);
  if (status === 400) {
    res.status(400).json({ error: 'Request body must be valid JSON' });
  } else if (status === 413) {
    res.status(413).json({ error: 'Request body is too large' });
  } else {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** Status set by body-parser on its errors (400 bad JSON, 413 too large). */
function httpStatusOf(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number') {
    return err.status;
  }
  return undefined;
}
