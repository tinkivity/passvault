# PassVault Performance Report

> Environment: dev | Generated: 2026-04-11T11:35:18.887Z | Baselines v1.0.0

## Endpoint Response Times (p95)

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="system-ui,-apple-system,sans-serif">
  <rect width="800" height="400" fill="#f5f5f7" rx="8"/>
  <text x="400" y="24" text-anchor="middle" font-size="14" font-weight="600" fill="#1d1d1f">Endpoint Response Times (p95)</text>
  <rect x="160" y="47.27272727272727" width="34.47652173913043" height="25" fill="#0071e3" rx="3"/><line x1="257.39130434782606" y1="45.27272727272727" x2="257.39130434782606" y2="74.27272727272728" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="63.77272727272727" text-anchor="end" font-size="12" fill="#1d1d1f">health</text><text x="200.47652173913042" y="63.77272727272727" font-size="11" fill="#0071e3">354ms</text><rect x="160" y="79.54545454545455" width="17.725217391304348" height="25" fill="#0071e3" rx="3"/><line x1="208.69565217391303" y1="77.54545454545455" x2="208.69565217391303" y2="106.54545454545455" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="96.04545454545455" text-anchor="end" font-size="12" fill="#1d1d1f">challenge</text><text x="183.72521739130434" y="96.04545454545455" font-size="11" fill="#0071e3">182ms</text><rect x="160" y="111.81818181818181" width="298.0173913043478" height="25" fill="#0071e3" rx="3"/><line x1="500.8695652173913" y1="109.81818181818181" x2="500.8695652173913" y2="138.8181818181818" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="128.3181818181818" text-anchor="end" font-size="12" fill="#1d1d1f">auth_login</text><text x="464.0173913043478" y="128.3181818181818" font-size="11" fill="#0071e3">3060ms</text><rect x="160" y="144.0909090909091" width="19.38086956521739" height="25" fill="#0071e3" rx="3"/><line x1="237.91304347826087" y1="142.0909090909091" x2="237.91304347826087" y2="171.0909090909091" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="160.5909090909091" text-anchor="end" font-size="12" fill="#1d1d1f">vault_list</text><text x="185.38086956521738" y="160.5909090909091" font-size="11" fill="#0071e3">199ms</text><rect x="160" y="176.36363636363637" width="40.125217391304346" height="25" fill="#0071e3" rx="3"/><line x1="276.8695652173913" y1="174.36363636363637" x2="276.8695652173913" y2="203.36363636363637" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="192.86363636363637" text-anchor="end" font-size="12" fill="#1d1d1f">vault_get_index</text><text x="206.12521739130435" y="192.86363636363637" font-size="11" fill="#0071e3">412ms</text><rect x="160" y="208.63636363636363" width="20.93913043478261" height="25" fill="#0071e3" rx="3"/><line x1="306.0869565217391" y1="206.63636363636363" x2="306.0869565217391" y2="235.63636363636363" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="225.13636363636363" text-anchor="end" font-size="12" fill="#1d1d1f">vault_put</text><text x="186.9391304347826" y="225.13636363636363" font-size="11" fill="#0071e3">215ms</text><rect x="160" y="240.9090909090909" width="106.15652173913044" height="25" fill="#0071e3" rx="3"/><line x1="354.78260869565213" y1="238.9090909090909" x2="354.78260869565213" y2="267.9090909090909" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="257.4090909090909" text-anchor="end" font-size="12" fill="#1d1d1f">admin_users</text><text x="272.1565217391304" y="257.4090909090909" font-size="11" fill="#0071e3">1090ms</text><rect x="160" y="273.1818181818182" width="42.9495652173913" height="25" fill="#0071e3" rx="3"/><line x1="354.78260869565213" y1="271.1818181818182" x2="354.78260869565213" y2="300.1818181818182" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="289.6818181818182" text-anchor="end" font-size="12" fill="#1d1d1f">admin_stats</text><text x="208.9495652173913" y="289.6818181818182" font-size="11" fill="#0071e3">441ms</text><rect x="160" y="305.45454545454544" width="152.02782608695654" height="25" fill="#0071e3" rx="3"/><line x1="452.17391304347825" y1="303.45454545454544" x2="452.17391304347825" y2="332.45454545454544" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="321.95454545454544" text-anchor="end" font-size="12" fill="#1d1d1f">admin_templates</text><text x="318.02782608695657" y="321.95454545454544" font-size="11" fill="#0071e3">1561ms</text><rect x="160" y="337.72727272727275" width="167.02608695652174" height="25" fill="#0071e3" rx="3"/><line x1="646.9565217391305" y1="335.72727272727275" x2="646.9565217391305" y2="364.72727272727275" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="354.22727272727275" text-anchor="end" font-size="12" fill="#1d1d1f">admin_export</text><text x="333.02608695652174" y="354.22727272727275" font-size="11" fill="#0071e3">1715ms</text>
  <text x="720" y="392" text-anchor="end" font-size="10" fill="#86868b">Dashed line = baseline threshold</text>
</svg>

| Endpoint | Min | p50 | p95 | p99 | Max | Baseline | Status |
|----------|-----|-----|-----|-----|-----|----------|--------|
| health | 61 | 159 | 354 | 354 | 354 | 1000 | PASS |
| challenge | 114 | 152 | 182 | 182 | 182 | 500 | PASS |
| auth_login | 2881 | 2920 | 3060 | 3060 | 3060 | 3500 | PASS |
| vault_list | 114 | 141 | 199 | 199 | 199 | 800 | PASS |
| vault_get_index | 142 | 164 | 412 | 412 | 412 | 1200 | PASS |
| vault_put | 132 | 167 | 215 | 215 | 215 | 1500 | PASS |
| admin_users | 366 | 462 | 1090 | 1090 | 1090 | 2000 | PASS |
| admin_stats | 241 | 292 | 441 | 441 | 441 | 2000 | PASS |
| admin_templates | 382 | 577 | 1561 | 1561 | 1561 | 3000 | PASS |
| admin_export | 406 | 581 | 1715 | 1715 | 1715 | 5000 | PASS |

## Concurrent Access

| Stream | p50 | p95 | p99 | Max |
|--------|-----|-----|-----|-----|
| concurrent_5_streams | 1912 | 2071 | 2071 | 2071 |

## Payload Size Scaling

| Size | p50 | p95 | Max | Baseline | Status |
|------|-----|-----|-----|----------|--------|
| 1kb_roundtrip | 364 | 556 | 556 | 1000 | PASS |
| 50kb_roundtrip | 364 | 434 | 434 | 1500 | PASS |
| 200kb_roundtrip | 425 | 521 | 521 | 3000 | PASS |
| 500kb_roundtrip | 602 | 685 | 685 | 3000 | PASS |
| 1mb_put | 418 | 698 | 698 | 5000 | PASS |
