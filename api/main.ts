// Standalone API server for development. `ng serve` proxies /api here (see proxy.conf.json).
// In production the same router is mounted by server.ts instead.
import express from 'express';
import { apiRouter } from './app';
import { openDatabase } from './db';

const port = Number(process.env['API_PORT'] ?? 3000);
const db = openDatabase();

const app = express();
app.use('/api', apiRouter(db));

const server = app.listen(port, () => {
  console.log(`Expense API listening on http://localhost:${port}/api`);
});

function shutdown(): void {
  server.close(() => db.close());
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
