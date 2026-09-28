# Open PRs board

A page that shows one author's open pull requests on Bitbucket, with the review threads, whose turn it is, the diff and a note for the reviewer per PR.

This is the static export of a Claude artifact. See [docs/scope.md](docs/scope.md) for what it does, what the artifact version could do, and what a shared team version still needs.

## Run

The page fetches `diffs/<pr>.json` with a relative URL, so serve the folder over HTTP:

```sh
npm start
```

Then open http://localhost:8080. Opening `index.html` from disk leaves every row without a diff. The `diffs/` folder is git-ignored; it holds the export from 2026-09-28.

## Development

```sh
npm install
npm run lint
npm run format
```

Oxlint finds problems, oxfmt formats. Scripts live in `src/`, the markup, styles and snapshot data in `index.html`.

xxx, Remco Stoeten <small>MIT</small>
