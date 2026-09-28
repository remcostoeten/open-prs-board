# Scope: open PRs board

Preliminary document, 2026-09-28. It describes what the board is today and what it did when it ran as a Claude artifact, so the team can decide what a shared version should keep.

## What it is today

A single static page that shows every open pull request of one author in the `client-site` Bitbucket repository. It was generated once from the Bitbucket API and published as a Claude artifact. This repository is the export of that artifact.

- `index.html` holds the markup, the styles, and two JSON blocks: `review-data` (review threads, reviewer state, fix diffs per thread) and `notes-snapshot` (notes, priority and effort per PR at export time).
- `src/board.js` renders the interactive parts and `src/stack-links.js` draws the arrows between stacked PRs.
- `diffs/<pr>.json` holds the full per-file diff of each PR. These files are git-ignored because they total about 3.5 MB and contain repository source.

Nothing on the page talks to Bitbucket. Every value is a snapshot taken at generation time.

## What the page does

**PR table.** One row per open PR with number, Jira key (new WEB key plus the old DEV key), title, diff size, test environment link, pipeline state, draft flag, author, assignee, review state and last update. Rows are grouped: the APP stack first in merge order, then the remaining PRs.

**Stack view.** Stacked PRs carry a step number and an animated arrow to the PR they merge into. A note under the stack explains the rebase flow, and a link opens the deployed test environment for the integration branch.

**Row details.** Clicking a row opens a panel with:

- the reviewer's state and every review thread, ordered open, recheck, resolved;
- a status line per thread that explains whose turn it is, derived from whether the file changed after the comment and whether the author replied;
- for a thread with a later fix, the diff between the commented commit and the current one;
- threads with identical messages on several files collapsed into one card that lists all files;
- the full file list with per-file stats, and a diff viewer that places threads inline at the commented line.

**Approved rows** are marked done and dimmed. Their threads stay readable.

**Sorting.** The non-stack group can be sorted by priority or by update time. The choice is kept in `localStorage`.

## What it did as an artifact

The artifact version had a small shared database through the Claude artifact runtime. The export replaced that connection with `const db = null`, so the local copy falls back to the baked snapshot.

- **Notes per PR.** The author could write a note for the reviewer on any PR and on the stack as a whole. Saving wrote to the shared store, and every viewer saw the note on their next load. Rows with a note show an orange label and the first lines of the note.
- **Priority per PR** (1 to 5) and **review effort** (1, 5, 15 or 30+ minutes). Both were stored the same way and drove the priority sort.
- **Write gating.** The runtime told the page whether the viewer could write. The author got editors, everyone else got read-only views with the same data.
- **Snapshot fallback.** Signed-out visitors read an empty store, so the page kept the snapshot baked into the HTML for them.

Regeneration was manual. The author ran a session that fetched the PR list, threads and diffs from Bitbucket, wrote the JSON, and republished the artifact. Notes survived that because they lived in the store, not in the HTML.

## What is missing for team use

- **Live data.** The page needs a data source that pulls PRs, threads and diffs from Bitbucket on demand or on a schedule, instead of a baked snapshot.
- **More than one author.** The board is hard-coded to one author. A team version needs a per-author or per-reviewer view.
- **Persistence.** Notes, priority and effort need a store that is not the Claude artifact runtime.
- **Access.** The artifact was private. A team version needs authentication or a location behind the existing VPN or basic auth.
- **Build.** The page has no bundler and no tests. Oxlint and oxfmt are set up; anything beyond that is a decision.

## Open decisions

1. Keep it a static page regenerated on a schedule, or make it a small server that proxies Bitbucket?
2. Where do notes and priorities live? Options are a JSON file in the repo, a small SQLite database, or Jira fields.
3. Should the reviewer's turn state be written back to Bitbucket or Jira, or stay board-only?
4. Does the stack view stay bespoke for APP, or does it derive stacks from the PR target branches?
