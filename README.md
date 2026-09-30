# Open PRs board

A page that shows one author's open pull requests on Bitbucket, with the review threads, whose turn it is, the diff and a note, priority and review time per PR.

It is a Next.js app. The PR list, threads and diffs come from a Bitbucket snapshot; notes, priority and review time live in a shared SQLite database, so every viewer sees the same values. See [docs/scope.md](docs/scope.md) for what the board does and what a team version still needs.

## Run

```sh
bun install
cp .env.example .env.local
bun run db:migrate
bun run db:seed
bun run dev
```

Then open http://localhost:3000. `db:seed` loads the notes from the snapshot in `data/snapshot/notes.json` and skips notes that already exist.

The per-PR diffs are read from `diffs/<pr>.json`. That folder is git-ignored because it holds repository source; without it, opening a row shows a load error instead of the file list.

## Configuration

| Variable                | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`          | libSQL URL. Defaults to `file:data/board.db`. A Turso URL works as well.   |
| `DATABASE_AUTH_TOKEN`   | Token for a remote libSQL database.                                        |
| `BOARD_EDITOR_PASSCODE` | Passcode that unlocks editing through the **Bewerken** link in the header. |
| `BOARD_SESSION_SECRET`  | Secret that signs the editor cookie.                                       |

Without a passcode and a secret, every viewer is read-only.

## Development

```sh
bun run typecheck
bun run lint
bun run format
bun run build
```

Oxlint finds problems, oxfmt formats. The page lives in `src/app`, the board UI in `src/features/board`, and the snapshot loaders, notes store and editor session in `src/server`. After changing `src/server/db/schema.ts`, run `bun run db:generate` and commit the migration in `drizzle/`.

The app uses Cache Components. Snapshot data and notes are cached with `use cache`, note saves go through a server action that calls `updateTag('notes')`, and only the editor check is rendered per request.

xxx, Remco Stoeten <small>MIT</small>
