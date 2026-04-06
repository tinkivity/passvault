# PassVault Performance Report

> Generated: 2026-04-06T19:06:21.337Z | Baselines v1.0.0

## Endpoint Response Times (p95)

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="system-ui,-apple-system,sans-serif">
  <rect width="800" height="400" fill="#f5f5f7" rx="8"/>
  <text x="400" y="24" text-anchor="middle" font-size="14" font-weight="600" fill="#1d1d1f">Endpoint Response Times (p95)</text>
  <rect x="160" y="47.27272727272727" width="32.23652173913043" height="25" fill="#0071e3" rx="3"/><line x1="257.39130434782606" y1="45.27272727272727" x2="257.39130434782606" y2="74.27272727272728" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="63.77272727272727" text-anchor="end" font-size="12" fill="#1d1d1f">health</text><text x="198.23652173913044" y="63.77272727272727" font-size="11" fill="#0071e3">331ms</text><rect x="160" y="79.54545454545455" width="16.751304347826085" height="25" fill="#0071e3" rx="3"/><line x1="208.69565217391303" y1="77.54545454545455" x2="208.69565217391303" y2="106.54545454545455" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="96.04545454545455" text-anchor="end" font-size="12" fill="#1d1d1f">challenge</text><text x="182.75130434782608" y="96.04545454545455" font-size="11" fill="#0071e3">172ms</text><rect x="160" y="111.81818181818181" width="303.4713043478261" height="25" fill="#0071e3" rx="3"/><line x1="500.8695652173913" y1="109.81818181818181" x2="500.8695652173913" y2="138.8181818181818" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="128.3181818181818" text-anchor="end" font-size="12" fill="#1d1d1f">auth_login</text><text x="469.4713043478261" y="128.3181818181818" font-size="11" fill="#0071e3">3116ms</text><rect x="160" y="144.0909090909091" width="17.530434782608697" height="25" fill="#0071e3" rx="3"/><line x1="237.91304347826087" y1="142.0909090909091" x2="237.91304347826087" y2="171.0909090909091" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="160.5909090909091" text-anchor="end" font-size="12" fill="#1d1d1f">vault_list</text><text x="183.5304347826087" y="160.5909090909091" font-size="11" fill="#0071e3">180ms</text><rect x="160" y="176.36363636363637" width="49.377391304347825" height="25" fill="#0071e3" rx="3"/><line x1="276.8695652173913" y1="174.36363636363637" x2="276.8695652173913" y2="203.36363636363637" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="192.86363636363637" text-anchor="end" font-size="12" fill="#1d1d1f">vault_get_index</text><text x="215.37739130434784" y="192.86363636363637" font-size="11" fill="#0071e3">507ms</text><rect x="160" y="208.63636363636363" width="26.003478260869564" height="25" fill="#0071e3" rx="3"/><line x1="306.0869565217391" y1="206.63636363636363" x2="306.0869565217391" y2="235.63636363636363" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="225.13636363636363" text-anchor="end" font-size="12" fill="#1d1d1f">vault_put</text><text x="192.00347826086957" y="225.13636363636363" font-size="11" fill="#0071e3">267ms</text><rect x="160" y="240.9090909090909" width="159.52695652173915" height="25" fill="#0071e3" rx="3"/><line x1="354.78260869565213" y1="238.9090909090909" x2="354.78260869565213" y2="267.9090909090909" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="257.4090909090909" text-anchor="end" font-size="12" fill="#1d1d1f">admin_users</text><text x="325.5269565217392" y="257.4090909090909" font-size="11" fill="#0071e3">1638ms</text><rect x="160" y="273.1818181818182" width="49.6695652173913" height="25" fill="#0071e3" rx="3"/><line x1="354.78260869565213" y1="271.1818181818182" x2="354.78260869565213" y2="300.1818181818182" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="289.6818181818182" text-anchor="end" font-size="12" fill="#1d1d1f">admin_stats</text><text x="215.6695652173913" y="289.6818181818182" font-size="11" fill="#0071e3">510ms</text><rect x="160" y="305.45454545454544" width="149.49565217391304" height="25" fill="#0071e3" rx="3"/><line x1="452.17391304347825" y1="303.45454545454544" x2="452.17391304347825" y2="332.45454545454544" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="321.95454545454544" text-anchor="end" font-size="12" fill="#1d1d1f">admin_templates</text><text x="315.4956521739131" y="321.95454545454544" font-size="11" fill="#0071e3">1535ms</text><rect x="160" y="337.72727272727275" width="79.86086956521739" height="25" fill="#0071e3" rx="3"/><line x1="646.9565217391305" y1="335.72727272727275" x2="646.9565217391305" y2="364.72727272727275" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="354.22727272727275" text-anchor="end" font-size="12" fill="#1d1d1f">admin_export</text><text x="245.8608695652174" y="354.22727272727275" font-size="11" fill="#0071e3">820ms</text>
  <text x="720" y="392" text-anchor="end" font-size="10" fill="#86868b">Dashed line = baseline threshold</text>
</svg>

| Endpoint | Min | p50 | p95 | p99 | Max | Baseline | Status |
|----------|-----|-----|-----|-----|-----|----------|--------|
| health | 79 | 152 | 331 | 331 | 331 | 1000 | PASS |
| challenge | 128 | 152 | 172 | 172 | 172 | 500 | PASS |
| auth_login | 2968 | 2970 | 3116 | 3116 | 3116 | 3500 | PASS |
| vault_list | 100 | 141 | 180 | 180 | 180 | 800 | PASS |
| vault_get_index | 140 | 168 | 507 | 507 | 507 | 1200 | PASS |
| vault_put | 139 | 180 | 267 | 267 | 267 | 1500 | PASS |
| admin_users | 410 | 717 | 1638 | 1638 | 1638 | 2000 | PASS |
| admin_stats | 307 | 410 | 510 | 510 | 510 | 2000 | PASS |
| admin_templates | 409 | 614 | 1535 | 1535 | 1535 | 3000 | PASS |
| admin_export | 410 | 513 | 820 | 820 | 820 | 5000 | PASS |

## Concurrent Access

| Stream | p50 | p95 | p99 | Max |
|--------|-----|-----|-----|-----|
| concurrent_5_streams | 1880 | 2214 | 2214 | 2214 |

## Payload Size Scaling

| Size | p50 | p95 | Max | Baseline | Status |
|------|-----|-----|-----|----------|--------|
| 1kb_roundtrip | 352 | 521 | 521 | 1000 | PASS |
| 50kb_roundtrip | 347 | 364 | 364 | 1500 | PASS |
| 200kb_roundtrip | 428 | 770 | 770 | 3000 | PASS |
| 500kb_roundtrip | 614 | 819 | 819 | 3000 | PASS |
| 1mb_put | 374 | 612 | 612 | 5000 | PASS |
