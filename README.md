# Open PRs board

A page that shows one author's open pull requests on Bitbucket, with the review threads, whose turn it is, the diff and a note, priority and review time per PR.

It is a Next.js app with Better Auth workspaces. PRs, threads and diffs sync from Bitbucket, GitHub or the bundled demo snapshot into Postgres; notes, priority, review time, groups and comments live in the same database, so every member of a workspace sees the same board. See [docs/scope.md](docs/scope.md) for the scope.

## Run

Postgres runs in Docker on port 5435. The container also creates a `board_test` database for the tests.

```sh
bun install
cp .env.example .env.local
bun run db:up
bun run db:migrate
bun run dev
```

Then open http://localhost:3000, create an account and a workspace, and connect a repository. `bun run user:verify <email>` marks an account as verified without sending mail. `bun run db:seed <workspace-slug>` loads the demo snapshot into an existing workspace, including its groups, links and notes.

`bun run db:down` stops the container and keeps the data volume.

## Configuration

| Variable                                         | Purpose                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `DATABASE_URL`                                   | Postgres URL. Defaults to `postgres://board:board@localhost:5435/board`.          |
| `DATABASE_POOL_SIZE`                             | Connection pool size. Defaults to 10.                                             |
| `TEST_DATABASE_URL`                              | Database the sync tests reset and migrate. Defaults to the `board_test` database. |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`          | Better Auth signing secret and the public base URL.                               |
| `BITBUCKET_CLIENT_ID`, `BITBUCKET_CLIENT_SECRET` | Bitbucket OAuth consumer for sign-in and repository access.                       |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`       | GitHub OAuth app for sign-in and repository access.                               |
| `CRON_SECRET`                                    | Bearer token the `/api/cron/sync` route expects.                                  |

## Development

```sh
bun run typecheck
bun run lint
bun run format
bun run build
bun test
```

Oxlint finds problems, oxfmt formats. Routes live in `src/app`, features in `src/features`, and the database client, auth and errors in `src/server`. `bun test` needs the Docker database running. After changing `src/server/db/auth-schema.ts` or `src/server/db/board-schema.ts`, run `bun run db:generate` and commit the migration in `drizzle/`.

xxx, Remco Stoeten <small>MIT</small>
