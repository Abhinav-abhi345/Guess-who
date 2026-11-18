# Guess Who

A local multiplayer picture quiz built with Express and Socket.IO. This repository does not contain an API workflow tester.

## Run

```powershell
npm.cmd install
npm.cmd start
```

Open `http://localhost:3000/` to join, and `/admin.html` to manage people, start a quiz, and view reports. After changing `server.js`, restart the existing server; `npm.cmd run dev` restarts automatically for subsequent edits.

Person records remain in `details.json`. Completed quiz snapshots are written atomically to `quiz-results.json` and remain available after restart. Back up both files with your application data. A single server process owns these files; this is not a multi-process database.

Environment settings:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `DATA_FILE` | `details.json` beside server | Person records |
| `RESULTS_FILE` | `quiz-results.json` beside server | Completed quiz history |
| `PUBLIC_DIR` | `public` beside server | Static application assets |
| `QUESTION_DURATION_MS` | `15000` | Question duration; integer 250–300000 |

Image uploads use the existing Cloudinary cloud/preset in `public/admin.js`. Configure that upload preset for your deployment. The image host must accept PNG/JPEG uploads; save requests and reports use the current application origin.

## Regression tests

```powershell
npm.cmd install
npx.cmd playwright-core install chromium
npm.cmd test
```

The suite starts its own server on port 3197, copies server code into a newly created `qa-audit/regression-*` directory, and uses synthetic people and separate report files. It never sends destructive requests or modifies the real `details.json`. Cloudinary requests are stubbed; unexpected external requests fail the suite. Screenshots, server logs, and test summaries are retained in each run directory; `qa-audit/REGRESSION.json` identifies the latest run.

The default suite uses 1.5-second questions. To run with the normal 15-second duration:

```powershell
$env:QA_DURATION_MS = '15000'
npm.cmd test
Remove-Item Env:QA_DURATION_MS
```

Set `QA_PORT` if 3197 is occupied. `PLAYWRIGHT_MODULE` optionally selects an already installed Playwright Core module. Original audit evidence is in `qa-audit/REPORT.md`; fix coverage is in `qa-audit/QA-REPORT.md`.

## Access model

The existing application has no administrator sign-in or role enforcement. Keep it on a trusted network until an identity/access policy is implemented: people, admin actions, quiz starts, and reports are currently accessible to anyone who can reach the server. The scoring fixes protect against duplicate and stale submissions on a connection; they do not prevent multiple accounts or provide durable player identity across reconnects. Live third-party uploads, real mobile hardware, and other browsers are outside the automated Chromium regression scope.
