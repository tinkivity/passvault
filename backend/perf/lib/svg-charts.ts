/**
 * Pure SVG string generators for perf reports.
 * No external dependencies — returns raw SVG markup.
 */

const COLORS = {
  pass: '#0071e3',
  fail: '#ff3b30',
  baseline: '#d2d2d7',
  background: '#f5f5f7',
  text: '#1d1d1f',
  textLight: '#86868b',
} as const;

interface BarDatum {
  label: string;
  actual: number;
  baseline: number;
}

/** Grouped bar chart: blue = actual, gray dashed = baseline, red if over. */
export function barChart(data: BarDatum[]): string {
  const width = 800;
  const height = 400;
  const marginLeft = 160;
  const marginRight = 80;
  const marginTop = 40;
  const marginBottom = 30;
  const chartWidth = width - marginLeft - marginRight;
  const chartHeight = height - marginTop - marginBottom;

  const maxValue = Math.max(...data.map(d => Math.max(d.actual, d.baseline))) * 1.15;
  const barHeight = Math.min(28, (chartHeight / data.length) - 8);
  const barGap = (chartHeight - barHeight * data.length) / (data.length + 1);

  const xScale = (v: number) => (v / maxValue) * chartWidth;
  const yPos = (i: number) => marginTop + barGap * (i + 1) + barHeight * i;

  let bars = '';
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const y = yPos(i);
    const over = d.actual > d.baseline;
    const color = over ? COLORS.fail : COLORS.pass;

    // Actual bar
    bars += `<rect x="${marginLeft}" y="${y}" width="${xScale(d.actual)}" height="${barHeight}" fill="${color}" rx="3"/>`;
    // Baseline dashed line
    const bx = marginLeft + xScale(d.baseline);
    bars += `<line x1="${bx}" y1="${y - 2}" x2="${bx}" y2="${y + barHeight + 2}" stroke="${COLORS.baseline}" stroke-width="2" stroke-dasharray="4,3"/>`;
    // Label
    bars += `<text x="${marginLeft - 8}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-size="12" fill="${COLORS.text}">${d.label}</text>`;
    // Value
    bars += `<text x="${marginLeft + xScale(d.actual) + 6}" y="${y + barHeight / 2 + 4}" font-size="11" fill="${color}">${d.actual}ms</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="system-ui,-apple-system,sans-serif">
  <rect width="${width}" height="${height}" fill="${COLORS.background}" rx="8"/>
  <text x="${width / 2}" y="24" text-anchor="middle" font-size="14" font-weight="600" fill="${COLORS.text}">Endpoint Response Times (p95)</text>
  ${bars}
  <text x="${marginLeft + chartWidth}" y="${height - 8}" text-anchor="end" font-size="10" fill="${COLORS.textLight}">Dashed line = baseline threshold</text>
</svg>`;
}

interface BoxDatum {
  label: string;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/** Horizontal box-and-whisker plot. */
export function boxPlot(data: BoxDatum[]): string {
  const width = 800;
  const height = 60 + data.length * 50;
  const marginLeft = 160;
  const marginRight = 60;
  const marginTop = 40;
  const chartWidth = width - marginLeft - marginRight;

  const globalMax = Math.max(...data.map(d => d.max)) * 1.1;
  const xScale = (v: number) => marginLeft + (v / globalMax) * chartWidth;

  let rows = '';
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const y = marginTop + i * 50 + 25;
    const boxH = 20;

    // Whisker line (min to max)
    rows += `<line x1="${xScale(d.min)}" y1="${y}" x2="${xScale(d.max)}" y2="${y}" stroke="${COLORS.pass}" stroke-width="1.5"/>`;
    // Box (p50 to p95)
    rows += `<rect x="${xScale(d.p50)}" y="${y - boxH / 2}" width="${xScale(d.p95) - xScale(d.p50)}" height="${boxH}" fill="${COLORS.pass}" opacity="0.3" stroke="${COLORS.pass}" stroke-width="1.5" rx="2"/>`;
    // p99 tick
    rows += `<line x1="${xScale(d.p99)}" y1="${y - boxH / 2 - 3}" x2="${xScale(d.p99)}" y2="${y + boxH / 2 + 3}" stroke="${COLORS.fail}" stroke-width="1.5"/>`;
    // Min/max caps
    rows += `<line x1="${xScale(d.min)}" y1="${y - 6}" x2="${xScale(d.min)}" y2="${y + 6}" stroke="${COLORS.pass}" stroke-width="1.5"/>`;
    rows += `<line x1="${xScale(d.max)}" y1="${y - 6}" x2="${xScale(d.max)}" y2="${y + 6}" stroke="${COLORS.pass}" stroke-width="1.5"/>`;
    // Label
    rows += `<text x="${marginLeft - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="${COLORS.text}">${d.label}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="system-ui,-apple-system,sans-serif">
  <rect width="${width}" height="${height}" fill="${COLORS.background}" rx="8"/>
  <text x="${width / 2}" y="24" text-anchor="middle" font-size="14" font-weight="600" fill="${COLORS.text}">Response Time Distribution (Box Plot)</text>
  ${rows}
  <text x="${marginLeft + chartWidth}" y="${height - 8}" text-anchor="end" font-size="10" fill="${COLORS.textLight}">Box: p50-p95 | Red tick: p99 | Whiskers: min-max</text>
</svg>`;
}

interface LinePoint {
  x: number;
  y: number;
}

/** Line chart for payload size scaling. */
export function lineChart(points: LinePoint[], baselinePoints: LinePoint[]): string {
  const width = 800;
  const height = 400;
  const marginLeft = 80;
  const marginRight = 40;
  const marginTop = 40;
  const marginBottom = 50;
  const chartWidth = width - marginLeft - marginRight;
  const chartHeight = height - marginTop - marginBottom;

  const allX = [...points.map(p => p.x), ...baselinePoints.map(p => p.x)];
  const allY = [...points.map(p => p.y), ...baselinePoints.map(p => p.y)];
  const maxX = Math.max(...allX) * 1.05;
  const maxY = Math.max(...allY) * 1.15;

  const sx = (v: number) => marginLeft + (v / maxX) * chartWidth;
  const sy = (v: number) => marginTop + chartHeight - (v / maxY) * chartHeight;

  const toPath = (pts: LinePoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

  const actualPath = toPath(points);
  const baselinePath = toPath(baselinePoints);

  // Dots for actual values
  const dots = points
    .map(p => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="4" fill="${COLORS.pass}"/>`)
    .join('\n  ');

  // X-axis labels
  const xLabels = points
    .map(p => `<text x="${sx(p.x).toFixed(1)}" y="${height - marginBottom + 20}" text-anchor="middle" font-size="11" fill="${COLORS.textLight}">${p.x >= 1024 ? `${(p.x / 1024).toFixed(0)}MB` : `${p.x}KB`}</text>`)
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="system-ui,-apple-system,sans-serif">
  <rect width="${width}" height="${height}" fill="${COLORS.background}" rx="8"/>
  <text x="${width / 2}" y="24" text-anchor="middle" font-size="14" font-weight="600" fill="${COLORS.text}">Payload Size vs Round-Trip Time</text>
  <path d="${baselinePath}" fill="none" stroke="${COLORS.baseline}" stroke-width="2" stroke-dasharray="6,4"/>
  <path d="${actualPath}" fill="none" stroke="${COLORS.pass}" stroke-width="2.5"/>
  ${dots}
  ${xLabels}
  <text x="${marginLeft - 10}" y="${marginTop + chartHeight / 2}" text-anchor="middle" font-size="11" fill="${COLORS.textLight}" transform="rotate(-90, ${marginLeft - 10}, ${marginTop + chartHeight / 2})">Time (ms)</text>
</svg>`;
}
