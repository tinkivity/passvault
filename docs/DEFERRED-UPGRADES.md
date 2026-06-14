# Deferred Dependency Upgrades

Tracks dependency bumps that have been intentionally postponed. Pick these up in a future sweep once the surrounding ecosystem catches up or the migration cost shrinks.

## Tier 5 — Toolchain majors (postponed 2026-05-14)

These are major-version bumps to core toolchain pieces. They were excluded from the 2026-05 four-tier upgrade because their churn radius extends well beyond a single package — they ripple through every workspace's build output, type emit, and CI matrix.

### TypeScript 5.7 → 6.x

> esbuild 0.25 → 0.28 was picked up on 2026-06-14 (cleared the high-severity `GHSA-gv7w-rqvm-qjhr` RCE advisory). Bundle sizes were unchanged (≤0.01% delta), typecheck/test/build green across all workspaces. TypeScript 6 remains deferred below.


- **Current**: `typescript@^5.7.0` in all four workspaces (`shared`, `backend`, `frontend`, `cdk`) plus root devDeps.
- **Blockers**:
  - TS 6 is expected to ship stricter inference rules, removed deprecated flags, and likely a bumped `lib.d.ts` baseline. Each workspace will need a separate audit.
  - Several of our dependencies (`@aws-sdk/*`, `react`, `vite`, `vitest`) lag a release cycle behind TS majors — wait for green typecheck against their own type emit before adopting.
- **When to revisit**: once TS 6.x is the default in `@tsconfig/node20` and our pinned AWS SDK clients ship 6-compatible types.

## Process

When picking these up:
1. Create a feature branch `chore/upgrade-tier5-<package>`.
2. Bump one package at a time — do not bundle TS and esbuild in the same PR.
3. Run `npm run typecheck && npm test && npm run build` across all workspaces.
4. Run the E2E + perf suites against `dev` before merging.
5. Update this file: move the completed item out, or delete this doc entirely if no deferred work remains.
