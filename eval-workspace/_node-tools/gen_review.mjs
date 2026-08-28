#!/usr/bin/env node
// Node port of skill-creator/eval-viewer/generate_review.py (static mode
// only) — used because this machine has no Python interpreter. Walks an
// iteration workspace for run dirs (those containing outputs/), embeds
// their outputs + grading + prompt into the skill-creator viewer.html
// template, and writes a standalone HTML file.
//
// Usage:
//   node gen_review.mjs <iteration-dir> --skill-name <name> --template <viewer.html> --out <file.html> [--benchmark <benchmark.json>] [--previous-workspace <dir>]

import fs from 'node:fs';
import path from 'node:path';

const METADATA_FILES = new Set(['transcript.md', 'user_notes.md', 'metrics.json']);
const TEXT_EXT = new Set(['.txt', '.md', '.json', '.csv', '.py', '.js', '.ts', '.tsx', '.jsx',
  '.yaml', '.yml', '.xml', '.html', '.css', '.sh', '.rb', '.go', '.rs', '.java', '.c', '.cpp',
  '.h', '.hpp', '.sql', '.r', '.toml']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'skill', 'inputs']);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function embedFile(fp) {
  const ext = path.extname(fp).toLowerCase();
  const name = path.basename(fp);
  if (TEXT_EXT.has(ext)) {
    let content;
    try { content = fs.readFileSync(fp, 'utf8'); } catch { content = '(Error reading file)'; }
    return { name, type: 'text', content };
  }
  if (IMAGE_EXT.has(ext)) {
    try {
      const b64 = fs.readFileSync(fp).toString('base64');
      const mime = ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1)}`;
      return { name, type: 'image', mime, data_uri: `data:${mime};base64,${b64}` };
    } catch { return { name, type: 'error', content: '(Error reading file)' }; }
  }
  try {
    const b64 = fs.readFileSync(fp).toString('base64');
    return { name, type: 'binary', mime: 'application/octet-stream', data_uri: `data:application/octet-stream;base64,${b64}` };
  } catch { return { name, type: 'error', content: '(Error reading file)' }; }
}

function buildRun(root, runDir) {
  let prompt = '';
  let evalId = null;
  for (const cand of [path.join(runDir, 'eval_metadata.json'), path.join(path.dirname(runDir), 'eval_metadata.json'),
                      path.join(path.dirname(path.dirname(runDir)), 'eval_metadata.json')]) {
    const meta = fs.existsSync(cand) ? readJSON(cand) : null;
    if (meta) { prompt = meta.prompt || ''; evalId = meta.eval_id ?? evalId; if (prompt) break; }
  }
  if (!prompt) prompt = '(No prompt found)';

  const runId = path.relative(root, runDir).split(path.sep).join('-');

  const outputsDir = path.join(runDir, 'outputs');
  const outputs = [];
  if (fs.existsSync(outputsDir) && fs.statSync(outputsDir).isDirectory()) {
    for (const f of fs.readdirSync(outputsDir).sort()) {
      const fp = path.join(outputsDir, f);
      if (fs.statSync(fp).isFile() && !METADATA_FILES.has(f)) outputs.push(embedFile(fp));
    }
  }

  let grading = null;
  for (const cand of [path.join(runDir, 'grading.json'), path.join(path.dirname(runDir), 'grading.json')]) {
    if (fs.existsSync(cand)) { grading = readJSON(cand); if (grading) break; }
  }

  return { id: runId, prompt, eval_id: evalId, outputs, grading };
}

function findRuns(root, current = root, runs = []) {
  if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) return runs;
  if (fs.existsSync(path.join(current, 'outputs')) && fs.statSync(path.join(current, 'outputs')).isDirectory()) {
    runs.push(buildRun(root, current));
    return runs;
  }
  for (const child of fs.readdirSync(current).sort()) {
    const cp = path.join(current, child);
    if (fs.statSync(cp).isDirectory() && !SKIP_DIRS.has(child)) findRuns(root, cp, runs);
  }
  return runs;
}

function loadPrevious(prevWorkspace) {
  const out = {};
  if (!prevWorkspace || !fs.existsSync(prevWorkspace)) return out;
  const fb = {};
  const fbPath = path.join(prevWorkspace, 'feedback.json');
  if (fs.existsSync(fbPath)) {
    const data = readJSON(fbPath);
    for (const r of data?.reviews || []) if ((r.feedback || '').trim()) fb[r.run_id] = r.feedback;
  }
  for (const run of findRuns(prevWorkspace)) {
    out[run.id] = { feedback: fb[run.id] || '', outputs: run.outputs || [] };
  }
  for (const [rid, f] of Object.entries(fb)) if (!(rid in out)) out[rid] = { feedback: f, outputs: [] };
  return out;
}

const args = parseArgs(process.argv.slice(2));
const iterationDir = args._[0];
const templatePath = args.template;
const outPath = args.out;
if (!iterationDir || !templatePath || !outPath) {
  console.error('Usage: node gen_review.mjs <iteration-dir> --skill-name <name> --template <viewer.html> --out <file.html> [--benchmark <benchmark.json>] [--previous-workspace <dir>]');
  process.exit(1);
}

const runs = findRuns(iterationDir).sort((a, b) =>
  (a.eval_id ?? Infinity) - (b.eval_id ?? Infinity) || a.id.localeCompare(b.id));

const previous = loadPrevious(args['previous-workspace']);
const previous_feedback = {};
const previous_outputs = {};
for (const [rid, d] of Object.entries(previous)) {
  if (d.feedback) previous_feedback[rid] = d.feedback;
  if (d.outputs?.length) previous_outputs[rid] = d.outputs;
}

const embedded = {
  skill_name: args['skill-name'] || '',
  runs,
  previous_feedback,
  previous_outputs,
};
if (args.benchmark && fs.existsSync(args.benchmark)) {
  embedded.benchmark = readJSON(args.benchmark);
}

const template = fs.readFileSync(templatePath, 'utf8');
if (!template.includes('/*__EMBEDDED_DATA__*/')) {
  console.error('Template missing /*__EMBEDDED_DATA__*/ marker');
  process.exit(1);
}
const html = template.replace('/*__EMBEDDED_DATA__*/', `const EMBEDDED_DATA = ${JSON.stringify(embedded)};`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log(`Static viewer written to: ${outPath}`);
console.log(`  ${runs.length} run(s) embedded`);
