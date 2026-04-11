# PassVault Performance Report

> Environment: dev | Generated: 2026-04-11T14:10:32.938Z | Baselines v1.0.0

## Endpoint Response Times (p95)

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="system-ui,-apple-system,sans-serif">
  <rect width="800" height="400" fill="#f5f5f7" rx="8"/>
  <text x="400" y="24" text-anchor="middle" font-size="14" font-weight="600" fill="#1d1d1f">Endpoint Response Times (p95)</text>
  <rect x="160" y="47.27272727272727" width="49.18260869565217" height="25" fill="#0071e3" rx="3"/><line x1="257.39130434782606" y1="45.27272727272727" x2="257.39130434782606" y2="74.27272727272728" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="63.77272727272727" text-anchor="end" font-size="12" fill="#1d1d1f">health</text><text x="215.18260869565216" y="63.77272727272727" font-size="11" fill="#0071e3">505ms</text><rect x="160" y="79.54545454545455" width="16.556521739130435" height="25" fill="#0071e3" rx="3"/><line x1="208.69565217391303" y1="77.54545454545455" x2="208.69565217391303" y2="106.54545454545455" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="96.04545454545455" text-anchor="end" font-size="12" fill="#1d1d1f">challenge</text><text x="182.55652173913043" y="96.04545454545455" font-size="11" fill="#0071e3">170ms</text><rect x="160" y="111.81818181818181" width="307.65913043478264" height="25" fill="#0071e3" rx="3"/><line x1="500.8695652173913" y1="109.81818181818181" x2="500.8695652173913" y2="138.8181818181818" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="128.3181818181818" text-anchor="end" font-size="12" fill="#1d1d1f">auth_login</text><text x="473.65913043478264" y="128.3181818181818" font-size="11" fill="#0071e3">3159ms</text><rect x="160" y="144.0909090909091" width="19.38086956521739" height="25" fill="#0071e3" rx="3"/><line x1="237.91304347826087" y1="142.0909090909091" x2="237.91304347826087" y2="171.0909090909091" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="160.5909090909091" text-anchor="end" font-size="12" fill="#1d1d1f">vault_list</text><text x="185.38086956521738" y="160.5909090909091" font-size="11" fill="#0071e3">199ms</text><rect x="160" y="176.36363636363637" width="30.09391304347826" height="25" fill="#0071e3" rx="3"/><line x1="276.8695652173913" y1="174.36363636363637" x2="276.8695652173913" y2="203.36363636363637" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="192.86363636363637" text-anchor="end" font-size="12" fill="#1d1d1f">vault_get_index</text><text x="196.09391304347827" y="192.86363636363637" font-size="11" fill="#0071e3">309ms</text><rect x="160" y="208.63636363636363" width="22.10782608695652" height="25" fill="#0071e3" rx="3"/><line x1="306.0869565217391" y1="206.63636363636363" x2="306.0869565217391" y2="235.63636363636363" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="225.13636363636363" text-anchor="end" font-size="12" fill="#1d1d1f">vault_put</text><text x="188.10782608695652" y="225.13636363636363" font-size="11" fill="#0071e3">227ms</text><rect x="160" y="240.9090909090909" width="146.08695652173913" height="25" fill="#0071e3" rx="3"/><line x1="354.78260869565213" y1="238.9090909090909" x2="354.78260869565213" y2="267.9090909090909" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="257.4090909090909" text-anchor="end" font-size="12" fill="#1d1d1f">admin_users</text><text x="312.0869565217391" y="257.4090909090909" font-size="11" fill="#0071e3">1500ms</text><rect x="160" y="273.1818181818182" width="32.23652173913043" height="25" fill="#0071e3" rx="3"/><line x1="354.78260869565213" y1="271.1818181818182" x2="354.78260869565213" y2="300.1818181818182" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="289.6818181818182" text-anchor="end" font-size="12" fill="#1d1d1f">admin_stats</text><text x="198.23652173913044" y="289.6818181818182" font-size="11" fill="#0071e3">331ms</text><rect x="160" y="305.45454545454544" width="173.2591304347826" height="25" fill="#0071e3" rx="3"/><line x1="452.17391304347825" y1="303.45454545454544" x2="452.17391304347825" y2="332.45454545454544" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="321.95454545454544" text-anchor="end" font-size="12" fill="#1d1d1f">admin_templates</text><text x="339.2591304347826" y="321.95454545454544" font-size="11" fill="#0071e3">1779ms</text><rect x="160" y="337.72727272727275" width="86.5808695652174" height="25" fill="#0071e3" rx="3"/><line x1="646.9565217391305" y1="335.72727272727275" x2="646.9565217391305" y2="364.72727272727275" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="354.22727272727275" text-anchor="end" font-size="12" fill="#1d1d1f">admin_export</text><text x="252.5808695652174" y="354.22727272727275" font-size="11" fill="#0071e3">889ms</text>
  <text x="720" y="392" text-anchor="end" font-size="10" fill="#86868b">Dashed line = baseline threshold</text>
</svg>

| Endpoint | Min | p50 | p95 | p99 | Max | Baseline | Status |
|----------|-----|-----|-----|-----|-----|----------|--------|
| health | 74 | 153 | 505 | 505 | 505 | 1000 | PASS |
| challenge | 127 | 151 | 170 | 170 | 170 | 500 | PASS |
| auth_login | 3019 | 3060 | 3159 | 3159 | 3159 | 3500 | PASS |
| vault_list | 82 | 157 | 199 | 199 | 199 | 800 | PASS |
| vault_get_index | 149 | 167 | 309 | 309 | 309 | 1200 | PASS |
| vault_put | 130 | 163 | 227 | 227 | 227 | 1500 | PASS |
| admin_users | 363 | 638 | 1500 | 1500 | 1500 | 2000 | PASS |
| admin_stats | 224 | 273 | 331 | 331 | 331 | 2000 | PASS |
| admin_templates | 458 | 741 | 1779 | 1779 | 1779 | 3000 | PASS |
| admin_export | 479 | 620 | 889 | 889 | 889 | 5000 | PASS |

## Concurrent Access

| Stream | p50 | p95 | p99 | Max |
|--------|-----|-----|-----|-----|
| concurrent_5_streams | 2010 | 2130 | 2130 | 2130 |

## Payload Size Scaling

| Size | p50 | p95 | Max | Baseline | Status |
|------|-----|-----|-----|----------|--------|
| 1kb_roundtrip | 324 | 491 | 491 | 1000 | PASS |
| 50kb_roundtrip | 387 | 406 | 406 | 1500 | PASS |
| 200kb_roundtrip | 421 | 503 | 503 | 3000 | PASS |
| 500kb_roundtrip | 585 | 801 | 801 | 3000 | PASS |
| 1mb_put | 329 | 569 | 569 | 5000 | PASS |
