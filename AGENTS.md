<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Open PRs board

A shared board of a team's open pull requests on Bitbucket and GitHub. Pull requests, review threads and diffs sync from a provider into Postgres. Notes, priority, review time, groups and comments live in the same database and are scoped to a workspace. [README.md](README.md) covers setup, [docs/scope.md](docs/scope.md) the background.

## Stack

- Next.js 16 App Router with `reactCompiler`, `cacheComponents`, `typedRoutes` and `inlineCss` enabled in `next.config.ts`.
- React 19, TypeScript, Zod for every external boundary.
- Postgres through Drizzle ORM and the `postgres` driver. Locally it runs in Docker on port 5435.
- Better Auth for sessions, OAuth sign-in and workspaces.
- Bun as package manager, script runner and test runner. Do not use npm, pnpm or yarn, and do not add a second lockfile.

## Commands

```sh
bun run dev          # http://localhost:3000
bun run typecheck    # next typegen, then tsc --noEmit
bun run lint         # Oxlint with the custom plugins in tools/oxlint
bun run format       # oxfmt, writes changes
bun run format:check # oxfmt, check only
bun test             # needs the Docker database, runs against board_test
bun run db:up        # docker compose up, waits until Postgres is healthy
bun run db:generate  # drizzle-kit generate, after a schema change
bun run db:migrate   # drizzle-kit migrate
bun run db:demo      # demo user, workspace and the dummy dataset
```

Before reporting a change as done, run `typecheck`, `lint`, `format:check` and `bun test`. A test run that fails with `ECONNREFUSED` means the database container is down. Start it with `bun run db:up` instead of skipping the tests.

## Layout

| Path                     | Holds                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `src/app`                | Routes only. A page resolves the session and renders a screen from a feature.        |
| `src/features/<name>`    | One feature: `actions.ts`, `queries.ts`, `schema.ts`, `types.ts`, components, tests. |
| `src/features/providers` | The provider contract in `types.ts`, the registry, and one folder per adapter.       |
| `src/features/sync`      | The sync engine: queue, run, store, token selection and purge.                       |
| `src/server`             | Database client and schema, auth, session, guards, error logging and retry.          |
| `src/shared`             | Error codes, the `Result` types and small helpers. There is no `lib` folder.         |
| `src/store/semantic.ts`  | The semantic type aliases. Import from here, never redeclare them.                   |
| `data/dummy`             | The fictional `webshop` dataset behind `db:demo`.                                    |
| `data/snapshot`          | An exported snapshot of a real repository. Do not copy its contents elsewhere.       |
| `drizzle`                | Generated migrations. Never edit them by hand.                                       |
| `tools/oxlint`           | The local Oxlint plugins. `anti-slop` is vendored, leave it as it is.                |
| `.claude/skills`         | Vendored skills: `generic-program-rules` and `emil-design-eng`. Leave them as-is.    |

Imports use the `@/` alias for `src`.

## Conventions

Load and follow the `generic-program-rules` skill in [.claude/skills/generic-program-rules/SKILL.md](.claude/skills/generic-program-rules/SKILL.md) before writing code, prose, commit messages or summaries. It covers code style, comments, types, linting and writing voice. These are the project-specific points, and they win where the two conflict.

For UI work, such as components, interactions, animation or visual polish, also load [.claude/skills/emil-design-eng/SKILL.md](.claude/skills/emil-design-eng/SKILL.md).

- **Language.** The interface is in Dutch, the code, comments, commits and docs are in English. User-facing strings for the board live in `src/features/board/copy.ts`.
- **Formatting.** oxfmt decides: four spaces, single quotes, no semicolons. Do not hand-format against it.
- **Functions.** Standalone functions are declarations, callbacks are arrows. Oxlint enforces both.
- **Parameters.** `anti-slop/no-object-parameters` is on. Pass positional arguments or a named type, not an inline object literal type.
- **Catch blocks.** `skriuw/no-silent-catch` rejects an empty catch. Handle the error, log it with `logError`, or call `noop()` from `src/shared/helpers/noop.ts`.
- **Lint findings.** Fix the cause. Do not add disable comments, lower a severity or add an ignore pattern.
- **Types.** Use `ID`, `Timestamp`, `Nullable` and the other aliases from `src/store/semantic.ts`. Finite states are literal unions.
- **Tests.** Tests sit in `__tests__` next to the code and run with `bun test`. Module mocking is banned by lint, so inject dependencies or register a test adapter with `registerAdapter`.

## Errors

Nothing in the server code throws for an expected failure.

- Internal code returns `Result<Value>` with an `AppError` built by `appError` from `src/shared/errors/result.ts`. Error codes are defined in `src/shared/errors/codes.ts`. Add a code there before using it.
- Server actions return `ActionResult<Value>`. Convert with `toPublicError` so the client only sees the public message, the recovery hint and a reference.
- Log with `logError` from `src/server/errors/log.ts` and pass the correlation ID along.
- Wrap provider calls in `withRetry` from `src/server/errors/retry.ts`. It decides on retry from the `retryable` flag and `retryAfterMs`.

## Server actions and access

Every server action starts by resolving who is calling, with the helpers in `src/server/guard.ts`:

- `currentActor()` for any signed-in member of a workspace, `managerActor()` for owners and admins.
- `readablePullRequest`, `writablePullRequest` and `writableThread` to check that a row belongs to the actor's workspace.
- `denied(code, correlationId)` to return a refusal.

Validate action input with a Zod schema from the feature's `schema.ts` before touching the database. Never trust an id from the client without a workspace check.

## Database

- The schema is split over `src/server/db/auth-schema.ts` (Better Auth tables) and `src/server/db/board-schema.ts` (domain tables).
- Domain tables spread `baseEntitySchema()` from `src/server/db/helpers.ts` for `id`, `createdAt` and `updatedAt`, and use its `timestamp` column type so values stay ISO strings.
- After a schema change, run `bun run db:generate` and commit the new file in `drizzle/` together with the change.
- Tests reset and migrate the database in `TEST_DATABASE_URL`. Never point that variable at a database with data you want to keep.

## Providers

A provider is an object that satisfies `ProviderAdapter` in `src/features/providers/types.ts` and is listed in `src/features/providers/registry.ts`. The sync engine only talks to that contract.

- Parse every provider response with the adapter's Zod schema, then map it to the `Synced*` types in a `map.ts`. No provider-specific shape leaves the adapter folder.
- Map HTTP failures to error codes, so the engine can tell `rate_limited` from `access_lost`.
- The `snapshot` adapter reads the file datasets in `data/` and needs no token. Use it for tests and for local work.

## Do not

- Commit `.env.local`, anything from `diffs/`, or real repository data. `diffs/` contains source code from a private repository.
- Add ESLint, Prettier or another formatter.
- Mention Claude or any AI tool in commit messages or pull request descriptions.
- Remove the Next.js block at the top of this file. `next dev` writes it back.
