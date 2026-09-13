# ARCHITECTURE.md — Prizzle

## Stack (latest stable as of Sept 2026 — verify exact patch with `npm view <pkg> version` before install)

| Package               | Tool              | Version          | Why this version                                                             |
| --------------------- | ----------------- | ---------------- | ---------------------------------------------------------------------------- |
| root                  | pnpm              | 12.x             | Latest major (Rust rewrite), fastest monorepo installs                       |
| root                  | TypeScript        | 7.0.x            | Latest stable; native Go compiler, strict mode everywhere                    |
| core                  | @prisma/internals | 7.x (e.g. 7.7.0) | Matches Prisma ORM v7 stable line — **not** v8 (still RC, different product) |
| core                  | Prettier          | latest 3.x       | Formats generated output                                                     |
| web                   | Next.js           | 16.3.x           | Latest Active LTS, App Router                                                |
| web                   | React             | 19.2.x           | Matches Next.js 16.3 peer requirement                                        |
| web                   | Monaco Editor     | latest           | Editor component                                                             |
| web                   | Tailwind CSS      | latest 4.x       | Utility styling                                                              |
| web                   | Zod               | 4.6.x            | Validation at API boundary                                                   |
| cli                   | Commander.js      | latest           | Verify current major with `npm view commander version` before scaffolding    |
| cli                   | Inquirer.js       | latest           | Same — verify at scaffold time                                               |
| cli                   | Chalk             | latest           | Same                                                                         |
| core (runtime target) | drizzle-orm       | ~0.45.x          | Pre-1.0, expect minor API drift — pin exact version, don't use `^` loosely   |

## Why Prisma v7, not v8

Prisma v8 is currently an RC of a _different product_ — a unified CLI covering
ORM + a hosted Developer Platform (projects/branches/services). It's not simply
"Prisma ORM, newer." We build against v7 (the current stable ORM) and revisit
v8 once it's stable and we've confirmed `@prisma/internals`-equivalent parsing
APIs exist in it.

## Monorepo structure

[unchanged from the plan we already agreed — packages/core, packages/web, packages/cli]

## Data flow

Prisma schema → parsers/prisma-parser.ts → internal AST (types/schema.ts) →
generators/{drizzle,prisma}-generator.ts → output schema

## Key architectural decision: core is UI-agnostic

`packages/core` never imports anything from `web` or `cli`. Both wrap it. This
is what lets us swap/upgrade the web framework or CLI framework later without
touching the parsing/generation logic.

## Partial conversion & warnings
Parsers do not hard-fail a whole file for a recoverable unsupported construct
(indexes, composite primary keys, custom types). They skip the construct,
convert everything else, and attach it to the returned Schema.warnings array
with the original source. Only genuinely unrepresentable constructs (composite
types) remain a hard failure. Generators are responsible for surfacing
warnings in their output (e.g. an inline comment marking what was skipped).