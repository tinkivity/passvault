/**
 * Report generators for perf results.
 *
 * Outputs: terminal ASCII, self-contained HTML, and markdown with inline SVG.
 */

import type { BenchmarkResult } from './measure.js';
import { barChart, boxPlot, lineChart } from './svg-charts.js';

interface Baselines {
  version: string;
  endpoints: Record<string, { p95: number }>;
  concurrent: { max_per_user_ms: number; allow_429: boolean };
  payload: Record<string, number>;
}

interface AllResults {
  endpoints: BenchmarkResult[];
  concurrent: BenchmarkResult[];
  payload: BenchmarkResult[];
}

// ---------------------------------------------------------------------------
// Terminal (ASCII horizontal bar chart)
// ---------------------------------------------------------------------------

export function generateTerminalReport(results: AllResults, baselines: Baselines): string {
  const lines: string[] = [];
  const maxWidth = 50;

  lines.push('');
  lines.push('='.repeat(72));
  lines.push('  PassVault Performance Report');
  lines.push('='.repeat(72));

  // Endpoint results
  lines.push('');
  lines.push('  Endpoint Response Times (p95)');
  lines.push('-'.repeat(72));

  const allP95 = results.endpoints.map(r => r.p95);
  const maxP95 = Math.max(...allP95, 1);

  for (const r of results.endpoints) {
    const baseline = baselines.endpoints[r.name]?.p95 ?? 0;
    const over = r.p95 > baseline;
    const barLen = Math.round((r.p95 / maxP95) * maxWidth);
    const bar = (over ? 'X' : '#').repeat(barLen);
    const baselineMarker = Math.round((baseline / maxP95) * maxWidth);
    const status = over ? 'FAIL' : 'PASS';
    const label = r.name.padEnd(20);
    const value = `${r.p95}ms`.padStart(7);
    const blStr = `(bl: ${baseline}ms)`.padStart(14);

    // Build the bar with a baseline marker
    let barDisplay = bar;
    if (baselineMarker <= maxWidth) {
      const padded = barDisplay.padEnd(maxWidth, ' ');
      const chars = padded.split('');
      if (baselineMarker < chars.length) {
        chars[baselineMarker] = '|';
      }
      barDisplay = chars.join('');
    }

    lines.push(`  ${label} ${value} ${blStr} [${barDisplay.trimEnd()}] ${status}`);
  }

  // Concurrent results
  if (results.concurrent.length > 0) {
    lines.push('');
    lines.push('  Concurrent Access');
    lines.push('-'.repeat(72));
    for (const r of results.concurrent) {
      lines.push(`  ${r.name.padEnd(20)} p95=${r.p95}ms  max=${r.max}ms`);
    }
  }

  // Payload results
  if (results.payload.length > 0) {
    lines.push('');
    lines.push('  Payload Size Scaling');
    lines.push('-'.repeat(72));
    for (const r of results.payload) {
      const status = r.baseline !== undefined && r.p95 > r.baseline ? 'FAIL' : 'PASS';
      const blStr = r.baseline !== undefined ? ` (bl: ${r.baseline}ms)` : '';
      lines.push(`  ${r.name.padEnd(20)} p95=${r.p95}ms  max=${r.max}ms${blStr} ${status}`);
    }
  }

  lines.push('');
  lines.push('='.repeat(72));
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML (self-contained with inline SVG)
// ---------------------------------------------------------------------------

export function generateHtmlReport(results: AllResults, baselines: Baselines): string {
  const barData = results.endpoints.map(r => ({
    label: r.name,
    actual: r.p95,
    baseline: baselines.endpoints[r.name]?.p95 ?? 0,
  }));

  const boxData = results.endpoints.map(r => ({
    label: r.name,
    min: r.min,
    p50: r.p50,
    p95: r.p95,
    p99: r.p99,
    max: r.max,
  }));

  // Payload line chart data
  const payloadSizes: Record<string, number> = {
    '1kb': 1,
    '50kb': 50,
    '200kb': 200,
    '500kb': 500,
    '1mb': 1024,
  };

  const actualPoints = results.payload
    .filter(r => !r.name.includes('reject'))
    .map(r => {
      const key = r.name.replace('_roundtrip', '').replace('_put', '');
      return { x: payloadSizes[key] ?? 0, y: r.p95 };
    })
    .filter(p => p.x > 0)
    .sort((a, b) => a.x - b.x);

  const baselinePointMap: Record<string, number> = {
    '1kb_roundtrip_ms': 1,
    '50kb_roundtrip_ms': 50,
    '200kb_roundtrip_ms': 200,
    '500kb_roundtrip_ms': 500,
    '1mb_put_ms': 1024,
  };

  const baselineLinePoints = Object.entries(baselines.payload)
    .filter(([k]) => baselinePointMap[k] !== undefined)
    .map(([k, v]) => ({ x: baselinePointMap[k], y: v }))
    .sort((a, b) => a.x - b.x);

  const barSvg = barChart(barData);
  const boxSvg = boxPlot(boxData);
  const lineSvg = actualPoints.length > 0 ? lineChart(actualPoints, baselineLinePoints) : '';

  // Results table
  const tableRows = results.endpoints
    .map(r => {
      const bl = baselines.endpoints[r.name]?.p95 ?? 0;
      const over = r.p95 > bl;
      const status = over ? '<span style="color:#ff3b30">FAIL</span>' : '<span style="color:#34c759">PASS</span>';
      return `<tr><td>${r.name}</td><td>${r.min}</td><td>${r.p50}</td><td>${r.p95}</td><td>${r.p99}</td><td>${r.max}</td><td>${bl}</td><td>${status}</td></tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>PassVault Performance Report</title>
<style>
  body { font-family: system-ui,-apple-system,sans-serif; background: #f5f5f7; margin: 0; padding: 2rem; color: #1d1d1f; }
  h1 { font-size: 1.5rem; font-weight: 600; }
  h2 { font-size: 1.15rem; font-weight: 600; margin-top: 2rem; }
  .chart { max-width: 800px; margin: 1.5rem 0; }
  table { border-collapse: collapse; width: 100%; max-width: 900px; margin: 1rem 0; font-size: 0.85rem; }
  th, td { padding: 0.5rem 0.75rem; text-align: right; border-bottom: 1px solid #d2d2d7; }
  th { text-align: right; font-weight: 600; background: #e8e8ed; }
  td:first-child, th:first-child { text-align: left; }
  .meta { font-size: 0.8rem; color: #86868b; margin-top: 2rem; }
</style>
</head>
<body>
<h1>PassVault Performance Report</h1>
<p class="meta">Generated: ${new Date().toISOString()} | Baselines v${baselines.version}</p>

<h2>Endpoint Response Times</h2>
<div class="chart">${barSvg}</div>

<h2>Response Time Distribution</h2>
<div class="chart">${boxSvg}</div>

<h2>Detailed Results (ms)</h2>
<table>
<thead><tr><th>Endpoint</th><th>Min</th><th>p50</th><th>p95</th><th>p99</th><th>Max</th><th>Baseline</th><th>Status</th></tr></thead>
<tbody>
${tableRows}
</tbody>
</table>

${lineSvg ? `<h2>Payload Size Scaling</h2><div class="chart">${lineSvg}</div>` : ''}

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Markdown (with inline SVG)
// ---------------------------------------------------------------------------

export function generateMarkdownReport(results: AllResults, baselines: Baselines): string {
  const barData = results.endpoints.map(r => ({
    label: r.name,
    actual: r.p95,
    baseline: baselines.endpoints[r.name]?.p95 ?? 0,
  }));

  const barSvg = barChart(barData);

  const lines: string[] = [];
  lines.push('# PassVault Performance Report');
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()} | Baselines v${baselines.version}`);
  lines.push('');
  lines.push('## Endpoint Response Times (p95)');
  lines.push('');
  lines.push(barSvg);
  lines.push('');
  lines.push('| Endpoint | Min | p50 | p95 | p99 | Max | Baseline | Status |');
  lines.push('|----------|-----|-----|-----|-----|-----|----------|--------|');

  for (const r of results.endpoints) {
    const bl = baselines.endpoints[r.name]?.p95 ?? 0;
    const over = r.p95 > bl;
    const status = over ? 'FAIL' : 'PASS';
    lines.push(`| ${r.name} | ${r.min} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${bl} | ${status} |`);
  }

  if (results.concurrent.length > 0) {
    lines.push('');
    lines.push('## Concurrent Access');
    lines.push('');
    lines.push('| Stream | p50 | p95 | p99 | Max |');
    lines.push('|--------|-----|-----|-----|-----|');
    for (const r of results.concurrent) {
      lines.push(`| ${r.name} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} |`);
    }
  }

  if (results.payload.length > 0) {
    lines.push('');
    lines.push('## Payload Size Scaling');
    lines.push('');
    lines.push('| Size | p50 | p95 | Max | Baseline | Status |');
    lines.push('|------|-----|-----|-----|----------|--------|');
    for (const r of results.payload) {
      const bl = r.baseline ?? 0;
      const status = bl > 0 && r.p95 > bl ? 'FAIL' : 'PASS';
      lines.push(`| ${r.name} | ${r.p50} | ${r.p95} | ${r.max} | ${bl || '-'} | ${status} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
