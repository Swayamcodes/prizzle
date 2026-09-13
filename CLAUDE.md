# CLAUDE.md — Prizzle

## Project
Bidirectional Prisma ↔ Drizzle schema converter (web + CLI). See SPEC.md and
ARCHITECTURE.md for scope and stack. Monorepo, pnpm workspaces.

## Non-negotiable conventions

- TypeScript strict mode, always. Extend `tsconfig.base.json` — never loosen
  its flags in a package-level tsconfig without explicit approval.
- No `any`. If a type is genuinely unknown (e.g. raw parser input), use
  `unknown` and narrow it, not `any`.
- No deprecated APIs, ever. If a library's docs mark something deprecated,
  do not use it even if it's shorter or more familiar.
- Use the latest STABLE version of every library. Do not use beta/RC/canary
  releases (e.g. Prisma v8 is currently RC — use v7).
- This project uses TypeScript 7.0 via a compatibility alias:
  `typescript` resolves to the TS6-API-compatible package (for tooling),
  `@typescript/native` is real TS7 (for the actual `tsc` build/typecheck).
  Do not "fix" this by installing plain `typescript@7` — it will break
  typescript-eslint again.
- ESLint uses flat config (`eslint.config.mjs`). Type-aware rules are scoped
  to `packages/*/src/**/*.ts` only — do not apply them repo-wide.

## Code style

- Explicit return types on exported functions.
- No `console.log` in committed code — use a proper logger or remove before
  the diff is finalized.
- Prefer small, single-purpose functions over large ones with branching logic.
- Comments explain *why*, not *what* — the code should already say what it does.

## Commit messages

- Explain *why* the change was made, not just what changed.
- One logical change per commit.

## When generating code for this repo

- Parsers/generators go in `packages/core/src/{parsers,generators}`, never
  reach into `web` or `cli` — core must stay framework-agnostic.
- Handle the edge cases explicitly asked for in the prompt (comments in
  schema, multi-line definitions, nested attributes) — don't silently skip
  them.
- If a requirement is ambiguous, state the assumption made in a comment
  rather than guessing silently.

## What NOT to do

- Don't regenerate a whole file for a small change — propose a diff/patch.
- Don't add dependencies not already listed in ARCHITECTURE.md without
  flagging it first.
- Don't write tests as the only verification — code gets manually run and
  checked before tests are written.