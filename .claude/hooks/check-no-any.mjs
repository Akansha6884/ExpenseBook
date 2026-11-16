// PostToolUse (Write|Edit): tells Claude about `any` types in the .ts file it just changed.
import { readFileSync } from 'node:fs';

const ANY_TYPE = /(?:[:<|&,=]|=>|\bas|\bextends)\s*any\b|\bany\[\]/;
const COMMENT_OR_STRING = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g;

/** The one exception the expense-reviewer checklist allows. */
function isAllowed(file, line) {
  return file.endsWith('expense-form.component.ts') && /\banyValue\b/.test(line);
}

/** Blanks comments and strings, keeping line numbers, so "any" in prose isn't flagged. */
function codeOnly(source) {
  return source.replace(COMMENT_OR_STRING, (match) => match.replace(/[^\n]/g, ' '));
}

function main() {
  const file = String(JSON.parse(readFileSync(0, 'utf8')).tool_input?.file_path ?? '').replace(/\\/g, '/');
  if (!file.endsWith('.ts') || file.endsWith('.d.ts') || file.includes('/node_modules/')) {
    return;
  }
  const source = readFileSync(file, 'utf8').split('\n');
  const found = codeOnly(source.join('\n'))
    .split('\n')
    .flatMap((line, i) => (ANY_TYPE.test(line) && !isAllowed(file, line) ? [`${file}:${i + 1}: ${source[i].trim()}`] : []));
  if (found.length > 0) {
    const reason = `CLAUDE.md forbids \`any\`. Define an interface/type, or use \`unknown\` and narrow:\n${found.join('\n')}`;
    console.log(JSON.stringify({ decision: 'block', reason }));
  }
}

try {
  main();
} catch {
  // A broken check must never get in the way of the edit itself.
}
