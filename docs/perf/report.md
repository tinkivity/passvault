# PassVault Performance Report

> Environment: beta | Generated: 2026-04-12T13:35:16.941Z | Baselines v2.0.0

## Endpoint Response Times (p95)

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="system-ui,-apple-system,sans-serif">
  <rect width="800" height="400" fill="#f5f5f7" rx="8"/>
  <text x="400" y="24" text-anchor="middle" font-size="14" font-weight="600" fill="#1d1d1f">Endpoint Response Times (p95)</text>
  <rect x="160" y="47.27272727272727" width="15.671146245059292" height="25" fill="#0071e3" rx="3"/><line x1="248.53754940711462" y1="45.27272727272727" x2="248.53754940711462" y2="74.27272727272728" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="63.77272727272727" text-anchor="end" font-size="12" fill="#1d1d1f">health</text><text x="181.6711462450593" y="63.77272727272727" font-size="11" fill="#0071e3">177ms</text><rect x="160" y="79.54545454545455" width="14.962845849802374" height="25" fill="#0071e3" rx="3"/><line x1="204.2687747035573" y1="77.54545454545455" x2="204.2687747035573" y2="106.54545454545455" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="96.04545454545455" text-anchor="end" font-size="12" fill="#1d1d1f">challenge</text><text x="180.96284584980236" y="96.04545454545455" font-size="11" fill="#0071e3">169ms</text><rect x="160" y="111.81818181818181" width="304.56916996047437" height="25" fill="#0071e3" rx="3"/><line x1="558.4189723320159" y1="109.81818181818181" x2="558.4189723320159" y2="138.8181818181818" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="128.3181818181818" text-anchor="end" font-size="12" fill="#1d1d1f">auth_login</text><text x="470.56916996047437" y="128.3181818181818" font-size="11" fill="#0071e3">3440ms</text><rect x="160" y="144.0909090909091" width="169.90355731225299" height="25" fill="#0071e3" rx="3"/><line x1="469.8814229249012" y1="142.0909090909091" x2="469.8814229249012" y2="171.0909090909091" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="160.5909090909091" text-anchor="end" font-size="12" fill="#1d1d1f">vault_list</text><text x="335.903557312253" y="160.5909090909091" font-size="11" fill="#0071e3">1919ms</text><rect x="160" y="176.36363636363637" width="169.72648221343874" height="25" fill="#0071e3" rx="3"/><line x1="425.61264822134393" y1="174.36363636363637" x2="425.61264822134393" y2="203.36363636363637" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="192.86363636363637" text-anchor="end" font-size="12" fill="#1d1d1f">vault_get_index</text><text x="335.72648221343877" y="192.86363636363637" font-size="11" fill="#0071e3">1917ms</text><rect x="160" y="208.63636363636363" width="343.61422924901194" height="25" fill="#ff3b30" rx="3"/><line x1="381.3438735177866" y1="206.63636363636363" x2="381.3438735177866" y2="235.63636363636363" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="225.13636363636363" text-anchor="end" font-size="12" fill="#1d1d1f">vault_put</text><text x="509.61422924901194" y="225.13636363636363" font-size="11" fill="#ff3b30">3881ms</text><rect x="160" y="240.9090909090909" width="238.78577075098818" height="25" fill="#0071e3" rx="3"/><line x1="469.8814229249012" y1="238.9090909090909" x2="469.8814229249012" y2="267.9090909090909" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="257.4090909090909" text-anchor="end" font-size="12" fill="#1d1d1f">admin_users</text><text x="404.78577075098815" y="257.4090909090909" font-size="11" fill="#0071e3">2697ms</text><rect x="160" y="273.1818181818182" width="251.44664031620556" height="25" fill="#0071e3" rx="3"/><line x1="425.61264822134393" y1="271.1818181818182" x2="425.61264822134393" y2="300.1818181818182" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="289.6818181818182" text-anchor="end" font-size="12" fill="#1d1d1f">admin_stats</text><text x="417.44664031620556" y="289.6818181818182" font-size="11" fill="#0071e3">2840ms</text><rect x="160" y="305.45454545454544" width="279.95573122529646" height="25" fill="#0071e3" rx="3"/><line x1="514.1501976284585" y1="303.45454545454544" x2="514.1501976284585" y2="332.45454545454544" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="321.95454545454544" text-anchor="end" font-size="12" fill="#1d1d1f">admin_templates</text><text x="445.95573122529646" y="321.95454545454544" font-size="11" fill="#0071e3">3162ms</text><rect x="160" y="337.72727272727275" width="288.80948616600796" height="25" fill="#0071e3" rx="3"/><line x1="646.9565217391305" y1="335.72727272727275" x2="646.9565217391305" y2="364.72727272727275" stroke="#d2d2d7" stroke-width="2" stroke-dasharray="4,3"/><text x="152" y="354.22727272727275" text-anchor="end" font-size="12" fill="#1d1d1f">admin_export</text><text x="454.80948616600796" y="354.22727272727275" font-size="11" fill="#0071e3">3262ms</text>
  <text x="720" y="392" text-anchor="end" font-size="10" fill="#86868b">Dashed line = baseline threshold</text>
</svg>

| Endpoint | Min | p50 | p95 | p99 | Max | Baseline | Status |
|----------|-----|-----|-----|-----|-----|----------|--------|
| health | 42 | 152 | 177 | 191 | 191 | 1000 | PASS |
| challenge | 113 | 151 | 169 | 169 | 169 | 500 | PASS |
| auth_login | 2980 | 3178 | 3440 | 3660 | 3660 | 4500 | PASS |
| vault_list | 141 | 642 | 1919 | 3240 | 3240 | 3500 | PASS |
| vault_get_index | 238 | 665 | 1917 | 2112 | 2112 | 3000 | PASS |
| vault_put | 260 | 1076 | 3881 | 4116 | 4116 | 2500 | FAIL |
| admin_users | 281 | 701 | 2697 | 3922 | 3922 | 3500 | PASS |
| admin_stats | 280 | 657 | 2840 | 3191 | 3191 | 3000 | PASS |
| admin_templates | 564 | 1399 | 3162 | 8299 | 8299 | 4000 | PASS |
| admin_export | 762 | 1330 | 3262 | 4972 | 4972 | 5500 | PASS |

## Concurrent Access

| Stream | p50 | p95 | p99 | Max |
|--------|-----|-----|-----|-----|
| concurrent_5_streams | 11914 | 12625 | 12625 | 12625 |

## Payload Size Scaling

| Size | p50 | p95 | Max | Baseline | Status |
|------|-----|-----|-----|----------|--------|
| 1kb_roundtrip | 1935 | 3240 | 5133 | 3500 | PASS |
| 50kb_roundtrip | 1609 | 3456 | 5183 | 4500 | PASS |
| 200kb_roundtrip | 2144 | 3923 | 4229 | 5000 | PASS |
| 500kb_roundtrip | 2103 | 3583 | 3857 | 5000 | PASS |
| 1mb_put | 1089 | 2174 | 2460 | 5500 | PASS |
