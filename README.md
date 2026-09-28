# Open PRs board

Static export of the "Alle open pull requests van Remco" artifact.

- `index.html` is the whole board: styles, markup and the script that renders review threads, notes and diffs.
- `diffs/<pr>.json` holds the per-file diff for each PR. The page fetches them with a relative URL, so serve the folder over HTTP:

```sh
python3 -m http.server 8080
```

Then open http://localhost:8080. Opening `index.html` directly from disk leaves every row without a diff.

Data is a snapshot from 2026-09-28. Refresh it by regenerating the JSON files and the table rows; the page has no live Bitbucket connection.
