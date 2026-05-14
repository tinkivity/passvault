# Deferred Dependency Upgrades

Tracks dependency bumps that have been intentionally postponed. Pick these up in a future sweep once the surrounding ecosystem catches up or the migration cost shrinks.

## Tier 5 — Toolchain majors (postponed 2026-05-14)

These are major-version bumps to core toolchain pieces. They were excluded from the 2026-05 four-tier upgrade because their churn radius extends well beyond a single package — they ripple through every workspace's build output, type emit, and CI matrix.

### TypeScript 5.7 → 6.x

- **Current**: `typescript@^5.7.0` in all four workspaces (`shared`, `backend`, `frontend`, `cdk`) plus root devDeps.
- **Blockers**:
  - TS 6 is expected to ship stricter inference rules, removed deprecated flags, and likely a bumped `lib.d.ts` baseline. Each workspace will need a separate audit.
  - Several of our dependencies (`@aws-sdk/*`, `react`, `vite`, `vitest`) lag a release cycle behind TS majors — wait for green typecheck against their own type emit before adopting.
- **When to revisit**: once TS 6.x is the default in `@tsconfig/node20` and our pinned AWS SDK clients ship 6-compatible types.

### esbuild 0.25 → 0.28

- **Current**: `esbuild@^0.25.0` in `backend` and `cdk` (used by backend `build.mjs` and CDK Lambda bundling).
- **Blockers**:
  - 0.26 / 0.27 / 0.28 each tend to surface minor output-format and tree-shaking changes; we'd want to compare bundle sizes and Lambda cold-start metrics before/after.
  - Vite (frontend bundler) tracks its own esbuild internally — bumping ours doesn't affect Vite, but a mismatch can confuse contributors looking at `npm ls esbuild`.
- **When to revisit**: bundle in the same window as a Node runtime bump on the Lambda side, so we re-baseline cold-start latency once instead of twice.

## Process

When picking these up:
1. Create a feature branch `chore/upgrade-tier5-<package>`.
2. Bump one package at a time — do not bundle TS and esbuild in the same PR.
3. Run `npm run typecheck && npm test && npm run build` across all workspaces.
4. Run the E2E + perf suites against `dev` before merging.
5. Update this file: move the completed item out, or delete this doc entirely if no deferred work remains.
