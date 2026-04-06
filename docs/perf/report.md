# PassVault Performance Report

> Generated: 2026-04-06T15:41:05.858Z | Baselines v1.0.0

## Endpoint Response Times (p95)

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="system-ui,-apple-system,sans-serif">
  <rect width="800" height="400" fill="#f5f5f7" rx="8"/>
  <text x="400" y="24" text-anchor="middle" font-size="14" font-weight="600" fill="#1d1d1f">Endpoint Response Times (p95)</text>
  <rect x="160" y="131.33333333333331" width="481.11304347826086" height="28" fill="#0071e3" rx="3"/><line x1="646.9565217391305" y1="129.33333333333331" x2="646.9565217391305" y2="161.33333333333331" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="149.33333333333331" text-anchor="end" font-size="12" fill="#1d1d1f">health</text><text x="647.1130434782608" y="149.33333333333331" font-size="11" fill="#0071e3">494ms</text><rect x="160" y="250.66666666666666" width="181.1478260869565" height="28" fill="#0071e3" rx="3"/><line x1="646.9565217391305" y1="248.66666666666666" x2="646.9565217391305" y2="280.66666666666663" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="268.66666666666663" text-anchor="end" font-size="12" fill="#1d1d1f">challenge</text><text x="347.1478260869565" y="268.66666666666663" font-size="11" fill="#0071e3">186ms</text>
  <text x="720" y="392" text-anchor="end" font-size="10" fill="#86868b">Dashed line = baseline threshold</text>
</svg>

| Endpoint | Min | p50 | p95 | p99 | Max | Baseline | Status |
|----------|-----|-----|-----|-----|-----|----------|--------|
| health | 69 | 154 | 494 | 494 | 494 | 500 | PASS |
| challenge | 119 | 154 | 186 | 186 | 186 | 500 | PASS |

## Concurrent Access

| Stream | p50 | p95 | p99 | Max |
|--------|-----|-----|-----|-----|
| concurrent_5_streams | 321 | 977 | 977 | 977 |
