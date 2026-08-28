#!/usr/bin/env node
// Node port of skill-creator/scripts/aggregate_benchmark.py — used because
// this machine has no Python interpreter. Reads grading.json (+ sibling
// timing.json) from each run dir under an iteration workspace and writes
// benchmark.json / benchmark.md with mean ± stddev per configuration and
// the delta between the first two configs.
//
// Usage:
//   node aggregate.mjs <iteration-dir> --skill-name <name> [--skill-path <path>] [--runs-per-config N]

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

function stats(values) {
  if (!values.length) return { mean: 0, stddev: 0, min: 0, max: 0 };
  const n = values.length;
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const stddev = n > 1
    ? Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1))
    : 0;
  const r = (x) => Math.round(x * 10000) / 10000;
  return { mean: r(mean), stddev: r(stddev), min: r(Math.min(...values)), max: r(Math.max(...values)) };
}

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function loadRunResults(iterationDir) {
  const evalDirs = fs.readdirSync(iterationDir)
    .filter((d) => d.startsWith('eval-'))
    .map((d) => path.join(iterationDir, d))
    .filter((d) => fs.statSync(d).isDirectory())
    .sort();

  const results = {}; // config -> [result]

  evalDirs.forEach((evalDir, idx) => {
    const meta = readJSON(path.join(evalDir, 'eval_metadata.json'));
    const evalId = meta?.eval_id ?? idx;

    for (const configName of fs.readdirSync(evalDir).sort()) {
      const configDir = path.join(evalDir, configName);
      if (!fs.statSync(configDir).isDirectory()) continue;
      const runDirs = fs.readdirSync(configDir).filter((r) => r.startsWith('run-')).sort();
      if (!runDirs.length) continue;
      results[configName] ??= [];

      for (const runName of runDirs) {
        const runDir = path.join(configDir, runName);
        const runNumber = parseInt(runName.split('-')[1], 10);
        const grading = readJSON(path.join(runDir, 'grading.json'));
        if (!grading) { console.warn(`Warning: grading.json not found in ${runDir}`); continue; }

        const summary = grading.summary || {};
        const result = {
          eval_id: evalId,
          run_number: runNumber,
          pass_rate: summary.pass_rate ?? 0,
          passed: summary.passed ?? 0,
          failed: summary.failed ?? 0,
          total: summary.total ?? 0,
        };

        let timeSeconds = grading.timing?.total_duration_seconds ?? 0;
        let tokens = 0;
        const timing = readJSON(path.join(runDir, 'timing.json'));
        if ((!timeSeconds || timeSeconds === 0) && timing) {
          timeSeconds = timing.total_duration_seconds ?? 0;
          tokens = timing.total_tokens ?? 0;
        } else if (timing) {
          tokens = timing.total_tokens ?? 0;
        }
        result.time_seconds = timeSeconds;

        const metrics = grading.execution_metrics || {};
        result.tool_calls = metrics.total_tool_calls ?? 0;
        result.tokens = tokens || metrics.output_chars || 0;
        result.errors = metrics.errors_encountered ?? 0;

        result.expectations = grading.expectations || [];
        for (const exp of result.expectations) {
          if (!('text' in exp) || !('passed' in exp)) {
            console.warn(`Warning: expectation missing text/passed/evidence in ${runDir}`);
          }
        }
        const ns = grading.user_notes_summary || {};
        result.notes = [...(ns.uncertainties || []), ...(ns.needs_review || []), ...(ns.workarounds || [])];

        results[configName].push(result);
      }
    }
  });

  return results;
}

function aggregate(results) {
  const runSummary = {};
  const configs = Object.keys(results);
  for (const config of configs) {
    const runs = results[config] || [];
    if (!runs.length) {
      runSummary[config] = {
        pass_rate: { mean: 0, stddev: 0, min: 0, max: 0 },
        time_seconds: { mean: 0, stddev: 0, min: 0, max: 0 },
        tokens: { mean: 0, stddev: 0, min: 0, max: 0 },
      };
      continue;
    }
    runSummary[config] = {
      pass_rate: stats(runs.map((r) => r.pass_rate)),
      time_seconds: stats(runs.map((r) => r.time_seconds)),
      tokens: stats(runs.map((r) => r.tokens || 0)),
    };
  }

  const primary = configs[0] ? runSummary[configs[0]] : {};
  const baseline = configs[1] ? runSummary[configs[1]] : {};
  const dPR = (primary.pass_rate?.mean ?? 0) - (baseline.pass_rate?.mean ?? 0);
  const dT = (primary.time_seconds?.mean ?? 0) - (baseline.time_seconds?.mean ?? 0);
  const dTok = (primary.tokens?.mean ?? 0) - (baseline.tokens?.mean ?? 0);
  runSummary.delta = {
    pass_rate: `${dPR >= 0 ? '+' : ''}${dPR.toFixed(2)}`,
    time_seconds: `${dT >= 0 ? '+' : ''}${dT.toFixed(1)}`,
    tokens: `${dTok >= 0 ? '+' : ''}${dTok.toFixed(0)}`,
  };
  return runSummary;
}

function buildBenchmark(iterationDir, skillName, skillPath, runsPerConfig) {
  const results = loadRunResults(iterationDir);
  const runSummary = aggregate(results);

  const runs = [];
  for (const config of Object.keys(results)) {
    for (const r of results[config]) {
      runs.push({
        eval_id: r.eval_id,
        configuration: config,
        run_number: r.run_number,
        result: {
          pass_rate: r.pass_rate, passed: r.passed, failed: r.failed, total: r.total,
          time_seconds: r.time_seconds, tokens: r.tokens || 0,
          tool_calls: r.tool_calls || 0, errors: r.errors || 0,
        },
        expectations: r.expectations,
        notes: r.notes,
      });
    }
  }
  // put each with_skill run before its baseline counterpart
  const order = { with_skill: 0, new_skill: 0, without_skill: 1, old_skill: 1 };
  runs.sort((a, b) =>
    a.eval_id - b.eval_id ||
    (order[a.configuration] ?? 9) - (order[b.configuration] ?? 9) ||
    a.run_number - b.run_number);

  const evalIds = [...new Set(runs.map((r) => r.eval_id))].sort((a, b) => a - b);

  return {
    metadata: {
      skill_name: skillName || '<skill-name>',
      skill_path: skillPath || '<path/to/skill>',
      executor_model: 'claude-sonnet-5',
      analyzer_model: 'claude-sonnet-5',
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      evals_run: evalIds,
      runs_per_configuration: runsPerConfig,
    },
    runs,
    run_summary: runSummary,
    notes: [],
  };
}

function toMarkdown(b) {
  const rs = b.run_summary;
  const configs = Object.keys(rs).filter((k) => k !== 'delta');
  const a = configs[0] || 'config_a';
  const bb = configs[1] || 'config_b';
  const title = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const A = rs[a] || {}, B = rs[bb] || {}, d = rs.delta || {};
  const pct = (x) => `${((x || 0) * 100).toFixed(0)}%`;
  const L = [
    `# Skill Benchmark: ${b.metadata.skill_name}`, '',
    `**Model**: ${b.metadata.executor_model}`,
    `**Date**: ${b.metadata.timestamp}`,
    `**Evals**: ${b.metadata.evals_run.join(', ')} (${b.metadata.runs_per_configuration} run(s) each per configuration)`, '',
    '## Summary', '',
    `| Metric | ${title(a)} | ${title(bb)} | Delta |`,
    '|--------|------------|---------------|-------|',
    `| Pass Rate | ${pct(A.pass_rate?.mean)} ± ${pct(A.pass_rate?.stddev)} | ${pct(B.pass_rate?.mean)} ± ${pct(B.pass_rate?.stddev)} | ${d.pass_rate ?? '—'} |`,
    `| Time | ${(A.time_seconds?.mean ?? 0).toFixed(1)}s ± ${(A.time_seconds?.stddev ?? 0).toFixed(1)}s | ${(B.time_seconds?.mean ?? 0).toFixed(1)}s ± ${(B.time_seconds?.stddev ?? 0).toFixed(1)}s | ${d.time_seconds ?? '—'}s |`,
    `| Tokens | ${(A.tokens?.mean ?? 0).toFixed(0)} ± ${(A.tokens?.stddev ?? 0).toFixed(0)} | ${(B.tokens?.mean ?? 0).toFixed(0)} ± ${(B.tokens?.stddev ?? 0).toFixed(0)} | ${d.tokens ?? '—'} |`,
  ];

  // per-eval breakdown
  L.push('', '## Per-eval pass rate', '', `| Eval | ${title(a)} | ${title(bb)} |`, '|---|---|---|');
  for (const id of b.metadata.evals_run) {
    const get = (cfg) => {
      const r = b.runs.find((x) => x.eval_id === id && x.configuration === cfg);
      return r ? `${r.result.passed}/${r.result.total}` : '—';
    };
    L.push(`| ${id} | ${get(a)} | ${get(bb)} |`);
  }

  if (b.notes?.length) {
    L.push('', '## Notes', '');
    for (const n of b.notes) L.push(`- ${n}`);
  }
  return L.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const iterationDir = args._[0];
if (!iterationDir || !fs.existsSync(iterationDir)) {
  console.error('Usage: node aggregate.mjs <iteration-dir> --skill-name <name>');
  process.exit(1);
}
const benchmark = buildBenchmark(
  iterationDir,
  args['skill-name'] || '',
  args['skill-path'] || '',
  parseInt(args['runs-per-config'] || '1', 10),
);
const outJson = path.join(iterationDir, 'benchmark.json');
const outMd = path.join(iterationDir, 'benchmark.md');
fs.writeFileSync(outJson, JSON.stringify(benchmark, null, 2));
fs.writeFileSync(outMd, toMarkdown(benchmark));
console.log(`Generated: ${outJson}`);
console.log(`Generated: ${outMd}`);
for (const c of Object.keys(benchmark.run_summary).filter((k) => k !== 'delta')) {
  console.log(`  ${c}: ${(benchmark.run_summary[c].pass_rate.mean * 100).toFixed(1)}% pass rate`);
}
console.log(`  delta: ${benchmark.run_summary.delta.pass_rate}`);
