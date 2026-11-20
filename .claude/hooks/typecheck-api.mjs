// Stop: runs `npm run typecheck:api` when the API or a file it imports has uncommitted changes.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// api/ imports these from src/app; keep this in step with those imports.
const API_INPUTS = /^(api\/.*\.ts|src\/app\/auth\/auth\.model\.ts|src\/app\/expenses\/expense-filters\.ts|src\/app\/expenses\/expense\.model\.ts)$/;

function run(command) {
  return execSync(command, { cwd: process.env.CLAUDE_PROJECT_DIR, encoding: 'utf8', stdio: 'pipe' });
}

function apiChanged() {
  return run('git status --porcelain')
    .split('\n')
    .some((line) => API_INPUTS.test(line.slice(3).trim().replace(/^"|"$/g, '')));
}

function main() {
  // Already sent back once for this stop: report nothing more, so Claude can't loop here.
  if (JSON.parse(readFileSync(0, 'utf8')).stop_hook_active || !apiChanged()) {
    return;
  }
  try {
    run('npm run typecheck:api');
  } catch (err) {
    const reason = `npm run typecheck:api failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`.trim();
    console.log(JSON.stringify({ decision: 'block', reason }));
  }
}

try {
  main();
} catch {
  // Not a git repo, git missing, bad input: skip the check rather than block stopping.
}
