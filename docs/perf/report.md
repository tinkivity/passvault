# PassVault Performance Report

> Generated: 2026-04-06T18:12:55.911Z | Baselines v1.0.0

## Endpoint Response Times (p95)

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="system-ui,-apple-system,sans-serif">
  <rect width="800" height="400" fill="#f5f5f7" rx="8"/>
  <text x="400" y="24" text-anchor="middle" font-size="14" font-weight="600" fill="#1d1d1f">Endpoint Response Times (p95)</text>
  <rect x="160" y="47.27272727272727" width="43.923478260869565" height="25" fill="#0071e3" rx="3"/><line x1="257.39130434782606" y1="45.27272727272727" x2="257.39130434782606" y2="74.27272727272728" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="63.77272727272727" text-anchor="end" font-size="12" fill="#1d1d1f">health</text><text x="209.92347826086956" y="63.77272727272727" font-size="11" fill="#0071e3">451ms</text><rect x="160" y="79.54545454545455" width="17.043478260869566" height="25" fill="#0071e3" rx="3"/><line x1="208.69565217391303" y1="77.54545454545455" x2="208.69565217391303" y2="106.54545454545455" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="96.04545454545455" text-anchor="end" font-size="12" fill="#1d1d1f">challenge</text><text x="183.04347826086956" y="96.04545454545455" font-size="11" fill="#0071e3">175ms</text><rect x="160" y="111.81818181818181" width="299.1860869565217" height="25" fill="#0071e3" rx="3"/><line x1="500.8695652173913" y1="109.81818181818181" x2="500.8695652173913" y2="138.8181818181818" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="128.3181818181818" text-anchor="end" font-size="12" fill="#1d1d1f">auth_login</text><text x="465.1860869565217" y="128.3181818181818" font-size="11" fill="#0071e3">3072ms</text><rect x="160" y="144.0909090909091" width="39.83304347826087" height="25" fill="#0071e3" rx="3"/><line x1="237.91304347826087" y1="142.0909090909091" x2="237.91304347826087" y2="171.0909090909091" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="160.5909090909091" text-anchor="end" font-size="12" fill="#1d1d1f">vault_list</text><text x="205.83304347826086" y="160.5909090909091" font-size="11" fill="#0071e3">409ms</text><rect x="160" y="176.36363636363637" width="71.38782608695652" height="25" fill="#0071e3" rx="3"/><line x1="237.91304347826087" y1="174.36363636363637" x2="237.91304347826087" y2="203.36363636363637" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="192.86363636363637" text-anchor="end" font-size="12" fill="#1d1d1f">vault_get_index</text><text x="237.38782608695652" y="192.86363636363637" font-size="11" fill="#0071e3">733ms</text><rect x="160" y="208.63636363636363" width="32.82086956521739" height="25" fill="#0071e3" rx="3"/><line x1="306.0869565217391" y1="206.63636363636363" x2="306.0869565217391" y2="235.63636363636363" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="225.13636363636363" text-anchor="end" font-size="12" fill="#1d1d1f">vault_put</text><text x="198.82086956521738" y="225.13636363636363" font-size="11" fill="#0071e3">337ms</text><rect x="160" y="240.9090909090909" width="37.106086956521736" height="25" fill="#0071e3" rx="3"/><line x1="354.78260869565213" y1="238.9090909090909" x2="354.78260869565213" y2="267.9090909090909" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="257.4090909090909" text-anchor="end" font-size="12" fill="#1d1d1f">admin_users</text><text x="203.10608695652172" y="257.4090909090909" font-size="11" fill="#0071e3">381ms</text><rect x="160" y="273.1818181818182" width="17.627826086956524" height="25" fill="#0071e3" rx="3"/><line x1="354.78260869565213" y1="271.1818181818182" x2="354.78260869565213" y2="300.1818181818182" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="289.6818181818182" text-anchor="end" font-size="12" fill="#1d1d1f">admin_stats</text><text x="183.62782608695653" y="289.6818181818182" font-size="11" fill="#0071e3">181ms</text><rect x="160" y="305.45454545454544" width="249.22434782608696" height="25" fill="#0071e3" rx="3"/><line x1="452.17391304347825" y1="303.45454545454544" x2="452.17391304347825" y2="332.45454545454544" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="321.95454545454544" text-anchor="end" font-size="12" fill="#1d1d1f">admin_templates</text><text x="415.22434782608696" y="321.95454545454544" font-size="11" fill="#0071e3">2559ms</text><rect x="160" y="337.72727272727275" width="99.53391304347826" height="25" fill="#0071e3" rx="3"/><line x1="646.9565217391305" y1="335.72727272727275" x2="646.9565217391305" y2="364.72727272727275" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="354.22727272727275" text-anchor="end" font-size="12" fill="#1d1d1f">admin_export</text><text x="265.53391304347826" y="354.22727272727275" font-size="11" fill="#0071e3">1022ms</text>
  <text x="720" y="392" text-anchor="end" font-size="10" fill="#86868b">Dashed line = baseline threshold</text>
</svg>

| Endpoint | Min | p50 | p95 | p99 | Max | Baseline | Status |
|----------|-----|-----|-----|-----|-----|----------|--------|
| health | 91 | 144 | 451 | 451 | 451 | 1000 | PASS |
| challenge | 122 | 151 | 175 | 175 | 175 | 500 | PASS |
| auth_login | 2901 | 2970 | 3072 | 3072 | 3072 | 3500 | PASS |
| vault_list | 119 | 144 | 409 | 409 | 409 | 800 | PASS |
| vault_get_index | 139 | 187 | 733 | 733 | 733 | 800 | PASS |
| vault_put | 136 | 143 | 337 | 337 | 337 | 1500 | PASS |
| admin_users | 120 | 161 | 381 | 381 | 381 | 2000 | PASS |
| admin_stats | 101 | 157 | 181 | 181 | 181 | 2000 | PASS |
| admin_templates | 510 | 615 | 2559 | 2559 | 2559 | 3000 | PASS |
| admin_export | 499 | 612 | 1022 | 1022 | 1022 | 5000 | PASS |

## Concurrent Access

| Stream | p50 | p95 | p99 | Max |
|--------|-----|-----|-----|-----|
| concurrent_5_streams | 618 | 1947 | 1947 | 1947 |

## Payload Size Scaling

| Size | p50 | p95 | Max | Baseline | Status |
|------|-----|-----|-----|----------|--------|
| 1kb_roundtrip | 360 | 690 | 690 | 1000 | PASS |
| 50kb_roundtrip | 342 | 650 | 650 | 1500 | PASS |
| 200kb_roundtrip | 412 | 619 | 619 | 3000 | PASS |
| 500kb_roundtrip | 633 | 1033 | 1033 | 3000 | PASS |
| 1mb_put | 391 | 613 | 613 | 5000 | PASS |
