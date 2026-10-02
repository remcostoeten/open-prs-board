<h1 align="center">Open PRs board</h1>

<p align="center">
  A shared board of your team's open pull requests on Bitbucket and GitHub, showing whose turn it is on every review thread.
</p>

<p align="center">
  <img src="https://shieldcn.dev/badge/framework-Next.js%2016-black.svg?font=jetbrains-mono&logo=nextdotjs" alt="framework: Next.js 16" />
  <img src="https://shieldcn.dev/badge/database-Postgres-black.svg?font=jetbrains-mono&logo=postgresql" alt="database: Postgres" />
  <img src="https://shieldcn.dev/badge/auth-Better%20Auth-black.svg?font=jetbrains-mono&logo=false" alt="auth: Better Auth" />
  <img src="https://shieldcn.dev/badge/runtime-Bun-black.svg?font=jetbrains-mono&logo=bun" alt="runtime: Bun" />
</p>

Pull requests, review threads and diffs sync from Bitbucket, GitHub or a bundled demo snapshot into Postgres. Notes, priority, review time, groups and comments live in the same database, so every member of a workspace sees the same board. The interface is in Dutch.

- One table with the open PRs of **every connected repository**, across providers.
- Each review thread says whose turn it is, based on whether the file changed after the comment and whether the author replied.
- A diff viewer per PR that places the threads at the commented line.
- A note, a priority and a review time per PR, shared with the workspace.
- Groups and links between PRs, for stacks that merge in a fixed order.
- Sync on connect, on a webhook, on demand, and every 10 minutes when deployed.

The background and the original scope are in [docs/scope.md](docs/scope.md).

## Getting started

You need [Bun](https://bun.sh) and Docker with Compose. Bun is the package manager and the runtime here; it is compatible with npm packages and installs them a lot faster. Nothing else has to be installed, because Postgres runs in a container on port 5435.

```sh
bun install
cp .env.example .env.local
```

Open `.env.local` and fill in `BETTER_AUTH_SECRET`. Any long random string works:

```sh
openssl rand -base64 32
```

The database URLs in `.env.example` already point at the Docker container, and the OAuth variables can stay empty for now. Then start the database, create the tables and run the app:

```sh
bun run db:up        # docker compose up, waits until Postgres is healthy
bun run db:migrate   # drizzle-kit migrate, applies the migrations in drizzle/
bun run dev          # http://localhost:3000
```

### Dummy data

The quickest way to a filled board is the demo account. One command creates a verified user, a workspace named Demo and nine fictional pull requests of a `webshop` repository, with a stack, review threads in every state, diffs, notes and priorities:

```sh
bun run db:demo
```

Sign in with `demo@example.com` and `demo-password`. The data lives in `data/dummy` and needs no provider account. Running the command again changes nothing while the account exists.

### First run with your own account

1. Open http://localhost:3000 and create an account with an email address and a password of at least 10 characters.
2. Give your workspace a name.
3. Pick repositories. Without a provider connection the only choice is `webshop` under Demo-snapshot, the fictional dataset in `data/dummy`.

That gives you a working board. To also load the groups, links and notes that belong to a dataset, seed it into your workspace:

```sh
docker exec open-prs-board-db psql -U board -d board -c 'select name, slug from organization'
bun run db:seed <workspace-slug>            # dummy, the default
```

The first command prints the slug, which is the workspace name plus a random suffix.

### Real data

The repository only ships the fictional `webshop` dataset. Data from a real repository never goes into git. There are two ways to get it:

- **Sync it from the provider.** Connect Bitbucket or GitHub as described in [Connecting Bitbucket and GitHub](#connecting-bitbucket-and-github) and pick the repository. Pull requests, threads and diffs land in Postgres and stay there.
- **Use an exported snapshot.** A snapshot is a set of files in the same shape as `data/dummy`, taken from a private repository and passed around by hand. Put `board.json`, `review.json` and `notes.json` in `data/snapshot/` and the per-PR diffs in `diffs/<pr>.json`. Both folders are git-ignored. The snapshot then shows up as a second repository under Demo-snapshot, and `bun run db:seed <workspace-slug> snapshot` loads its groups, links and notes. Ask a colleague who has one. Without `diffs/` the PRs and threads load without diffs.

`bun run db:down` stops the container and keeps the data. `docker compose down -v` also deletes it.

## Connecting Bitbucket and GitHub

To sync real repositories, create an OAuth app at the provider, put its id and secret in `.env.local` and restart `bun run dev`. A provider shows up on the sign-in page and in the repository picker once both of its variables are set.

| Provider  | Where                                    | Callback URL                                               | Permissions                                             |
| --------- | ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Bitbucket | Workspace settings, OAuth consumers      | `http://localhost:3000/api/auth/oauth2/callback/bitbucket` | Account, email, repositories and pull requests          |
| GitHub    | Settings, Developer settings, OAuth Apps | `http://localhost:3000/api/auth/callback/github`           | Requested at sign-in: `read:user`, `user:email`, `repo` |

Sign in with the provider, or sign in to your existing account and link it, then choose repositories under Instellingen.

### Bitbucket without an OAuth consumer

When your Bitbucket workspace does not let you create an OAuth consumer, connect with a personal Atlassian API token instead. It needs no workspace admin and no variables in `.env.local`.

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) and choose **Create API token with scopes**. Pick the Bitbucket app and only these read scopes: `read:user:bitbucket`, `read:repository:bitbucket` and `read:pullrequest:bitbucket`.
2. In the board, open Instellingen, fill in your Atlassian email address and the token under "Bitbucket met een API-token" and save. The board checks the pair against Bitbucket before it stores the token, encrypted with `BETTER_AUTH_SECRET`.
3. Bitbucket now shows up in the repository picker. Sync uses the token like any OAuth connection.

API tokens expire, at most a year after you create them. When sync starts failing with an invalid connection, replace the token in Instellingen. Changing `BETTER_AUTH_SECRET` makes every stored token unreadable, so everyone has to enter theirs again. The board syncs with the token of a workspace member who has an account at that provider.

A connected repository syncs right away. After that it syncs when a webhook arrives or when the cron route runs. Owners and admins find the webhook URL and secret per repository under Instellingen. Webhooks need a public URL, so on localhost you trigger the scheduled sync yourself:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync
```

On Vercel, `vercel.json` calls that route every 10 minutes.

## Inviting colleagues

Owners and admins create an invitation under Instellingen. No email is sent yet. The page gives you a link to pass on yourself, which works only for the invited address and expires after 7 days.

Accepting an invitation needs a verified email address. Signing in with Bitbucket or GitHub verifies it when the provider has confirmed the address. For an account with email and password, mark it as verified by hand:

```sh
bun run user:verify <email>
```

To give or revoke admin rights from the terminal:

```sh
bun run users
```

It lists every user with their workspaces and roles. Pick a user, then a workspace if they are in more than one, and confirm to make them admin or back to member. An owner's role is never changed.

## Configuration

| Variable                                         | Purpose                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                   | Postgres URL. Defaults to `postgres://board:board@localhost:5435/board`.                            |
| `DATABASE_POOL_SIZE`                             | Connection pool size. Defaults to 10.                                                               |
| `TEST_DATABASE_URL`                              | Database the sync tests reset and migrate. Defaults to the `board_test` database.                   |
| `BETTER_AUTH_SECRET`                             | Signing secret. Required.                                                                           |
| `BETTER_AUTH_URL`                                | Public base URL of the app. `http://localhost:3000` in development.                                 |
| `BITBUCKET_CLIENT_ID`, `BITBUCKET_CLIENT_SECRET` | Bitbucket OAuth consumer for sign-in and repository access. Optional.                               |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`       | GitHub OAuth app for sign-in and repository access. Optional.                                       |
| `CRON_SECRET`                                    | Bearer token the `/api/cron/sync` route expects. The route rejects every request while it is empty. |

## Development

```sh
bun run typecheck   # generate route types and run tsc
bun run lint        # Oxlint, including the custom rules in tools/oxlint
bun run format      # oxfmt
bun test            # needs the Docker database, uses board_test
```

Routes live in `src/app`, features in `src/features`, and the database client, auth and errors in `src/server`. After changing `src/server/db/auth-schema.ts` or `src/server/db/board-schema.ts`, run `bun run db:generate` and commit the migration in `drizzle/`.

This project runs on a Next.js version with breaking changes compared to older releases. Read [AGENTS.md](AGENTS.md) and the guides in `node_modules/next/dist/docs/` before changing routes or config.

<br/>

xxx,<br/>
[Remco Stoeten](https://remcostoeten.com)<br/>
<small>MIT</small>
