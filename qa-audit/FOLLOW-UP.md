# Screenshot follow-up — 2026-11-17

The previous handoff was incomplete: the new frontend was being served by an old, still-running Node backend. Read-only verification of localhost:3000 reproduced `/admin/results` returning 404, while `/script.js` contained the new deadline/acknowledgment protocol. The old backend emitted no deadline or question ID and did not acknowledge registration/start events. That mismatch caused NaN, locked options, timeouts and missing admin reports. Isolated tests had not caught the live-process mismatch.

## Corrections

- Restarted the verified `node server.js` process serving port 3000. The fixed server is now running on that same port; `/health` and `/admin/results` return 200.
- Added a versioned health check before starting a quiz, rejected incompatible question payloads with an explicit restart message, and prevented NaN rendering. HTML/JS/CSS now revalidate rather than silently using stale cached assets.
- Removed all navigation links from the game page, including Login. Native browser navigation receives a leave-page warning during a quiz when the browser permits it.
- Styled admin navigation as buttons. The admin home has an aligned panel and a separate status box below its controls. Details and results have centered toolbars, styled refresh buttons and consistent spacing.
- Verified selectable answers before submission, server acknowledgment after selection, and automatic results navigation. Buttons still intentionally lock after an answer or after a question expires.

## Verification

**28/28 isolated regression checks passed.** Added checks cover incompatible legacy packets, frontend/backend compatibility, enabled/clickable options, no game navigation and admin message layout. [Regression results](REGRESSION.json).

**A complete live quiz on http://localhost:3000 passed**, using the normal 15-second questions and the existing people records. Verified login, decreasing finite timer, selectable answers, acknowledgment, automatic player results, admin report loading and report persistence. It created one additive report for `QA Live Regression 20261117`; no person records were created or deleted. [Live results](LIVE-REGRESSION.json).

Screenshots from the running app:

- [Admin controls and status](live-DOA2gy/admin-started.png)
- [Mobile admin layout](live-DOA2gy/admin-mobile.png)
- [Admin results with the completed live quiz](live-DOA2gy/admin-results.png)
- [Player results](live-DOA2gy/player-results.png)
- [Details navigation buttons](live-DOA2gy/details-buttons.png)
- [Timer and enabled answer options](live-DOA2gy/game-active.png)

The sandboxed browser could not fetch third-party images, so the live game screenshot does not establish remote image rendering. A read-only request to an existing Cloudinary image outside the sandbox returned 200 image/jpeg. Image-layout tests continue to use a deterministic local image fixture. No upload or destructive request was made.

Original `details.json` remains unchanged, SHA-256:
`4A2933C1F678988BEB9ACD8BBA6867A403B9E205633F35E2C5AE0AABB9F123FF`.

Refresh already-open tabs with Ctrl+F5 to replace their old in-memory HTML/JavaScript. No further server restart is needed for these fixes.
