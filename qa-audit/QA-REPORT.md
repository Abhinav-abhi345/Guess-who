# Fix verification and end-to-end regression report

**2026-11-17 follow-up:** The previously stale localhost process has now been restarted, the screenshot issues have been corrected, and a full live localhost quiz passed. See [FOLLOW-UP.md](FOLLOW-UP.md) for current results (28 regression checks plus live verification). Runtime handoff statements below describe the earlier 2026-11-16 run.

Date: 2026-11-16. Result: **All 11 reported defects have implemented fixes and passing regression checks.**

The requested starting file `QA-REPORT.md` did not exist. The baseline was [REPORT.md](REPORT.md), preserved unchanged, plus its screenshots and raw evidence. This file records the subsequent fixes. The repository is the Guess Who quiz application; it contains no API Flow Tester configuration, API-workflow, or collection-import features.

## Baseline and plan

[FIX-PLAN.md](FIX-PLAN.md) records the sequence and scope. The isolated pre-fix run reproduced **11/11 reported defects**. [BASELINE.json](BASELINE.json) contains each failed assertion; its fixture retains the original server source and synthetic data. The baseline timer alone was shortened in that copied source to make scoring verification practical.

## Fix mapping

| Finding | Implemented behavior | Regression evidence |
|---|---|---|
| QA-01 Wrong save deployment | `public/admin.js` saves to same-origin `/details`; real save/list flow verified with mocked image hosting | Same-origin save assertion; saved-person list screenshot |
| QA-02 Failed save shows success | HTTP errors and malformed responses produce visible errors; input/files remain; form clears only after a successful response | Intercepted HTTP 400 retains fields/files and shows rejection |
| QA-03 Silent upload failure | Upload network/HTTP/JSON/URL failures produce visible retry guidance; controls are restored | Network failure, upload rejection and recovery checks |
| QA-04 Answer disclosure | Question events omit the correct answer and second image; DOM contains no correctness markers; server evaluates submissions | Payload and DOM assertions, question screenshot |
| QA-05 Invalid records accepted | Body shape, trimmed name/length, gender and absolute HTTP(S) image URLs validated before writes; errors returned as JSON | Invalid types, whitespace, credentials, unsafe schemes, malformed/oversized JSON; unchanged fixture after rejected writes |
| QA-06 Broken admin reports | Local `/admin/results` reads persisted snapshots; visible loading/empty/error/retry states | Real reports, HTTP/malformed failures and restart-persistence checks |
| QA-07 Empty initial game | Waiting, disconnected, connection-error, image-error and quiz-error states; current question sent to late joiners | Waiting screenshot; late-join/reconnect and insufficient-data checks |
| QA-08 Missing report navigation | View Results link restored on admin home; related pages include navigation | Link click reaches report; responsive navigation screenshots |
| QA-09 Repeated answer scoring | Server enforces active question ID, deadline, valid option and one submission per registered socket; round scores reset | Four identical submissions earn one point; invalid/stale/replayed/late/unregistered answers rejected; wrong answer cannot be changed |
| QA-10 HTML usernames | Both player and admin reports construct cells with `textContent`; malformed stored reports show errors | Harmless markup and event-handler fixture remain text with no created element or executed handler |
| QA-11 Mobile image clipping | Loaded images constrained to available width and stacked on narrow screens; viewport metadata added | Positive image dimensions and in-viewport bounds asserted; loaded-image screenshot |

Additional regression findings repaired: Enter-key login previously bypassed the intended login flow; details-loading failures previously had no visible message/retry. The save form now prevents concurrent submissions, checks file count/type/size, freezes fields while saving, and restores controls on failure. The timer now follows the server deadline and updates the progress ring.

## Test results

| Run | Result | Artifacts |
|---|---|---|
| Pre-fix baseline | 11 reported defect checks failed as expected; safety check passed | [BASELINE.json](BASELINE.json) |
| Final fast regression, 1.5-second questions | **25/25 passed** | [REGRESSION.json](REGRESSION.json), [run artifacts](regression-pveA7i/) |
| Normal timing, 15-second questions | **23/23 passed** | [REGRESSION-PRODUCTION.json](REGRESSION-PRODUCTION.json), [run artifacts](regression-pjkUFc/) |
| JavaScript parsing | `node --check` passed for server, upload client, game client, report client and regression runner | Commands below |
| Dependency installation audit | npm reported zero known vulnerabilities across 92 packages | Installation output; this is not a penetration-test certification |

The two extra fast-suite checks cover file type/count/size rejection without uploads and concurrent-submission prevention. The normal-timing run includes the original defect checks, all complete quiz flows, timer/progress assertions, save/list, reports/retries, socket security, score resets, late joins/reconnects, persistence after restarting the isolated server, data-read failure handling, and responsive navigation. The final harness also refuses to use an unrelated server that might already occupy the configured QA port.

Responsive checks cover all seven routes at **320, 390, 768 and 1440 pixels** in Chromium. External image hosting is simulated. A deterministic loaded-image DOM fixture verifies the original clipping defect independently of remote image availability; its waiting-state label is not an active gameplay screenshot.

## Screenshot evidence

- [Visible rejected save with retained fields](regression-pveA7i/screenshots/save-error.png)
- [Upload failure feedback](regression-pveA7i/screenshots/upload-error.png)
- [Saved person in local list](regression-pveA7i/screenshots/saved-person-list.png)
- [Question without answer markers](regression-pveA7i/screenshots/question-no-disclosure.png)
- [One point after repeated submissions](regression-pveA7i/screenshots/quiz-one-point-results.png)
- [Escaped player username](regression-pveA7i/screenshots/results-escaped.png)
- [Escaped admin report username](regression-pveA7i/screenshots/admin-report-escaped.png)
- [Loaded images fit mobile viewport](regression-pveA7i/screenshots/game-mobile-images.png)
- [320-pixel admin form](regression-pveA7i/screenshots/adminDashboard-320.png)
- [Normal countdown and progress ring](regression-pjkUFc/screenshots/timer-progress.png)
- [Reports after server restart](regression-pveA7i/screenshots/reports-after-restart.png)

## Reproduce the regression run

From the repository root, after installing dependencies and Chromium as documented in [README.md](../README.md):

```powershell
npm.cmd test

# Repeat with the normal question duration:
$env:QA_DURATION_MS = '15000'
npm.cmd test
Remove-Item Env:QA_DURATION_MS

node --check server.js
node --check public/admin.js
node --check public/script.js
node --check public/reports.js
node --check qa-audit/regression.cjs
```

`npm.cmd run test:e2e` runs the same suite. There is no build/compile step in this plain Node/HTML application. Playwright Core is pinned at 1.65.1; the test host used Node v26.13.1 and installed Chromium. The server's normal question duration remains 15000 ms; tests configure duration without rewriting fixed application source.

## Data integrity and safety

The original `details.json` SHA-256 before and after all runs is identical:

`4A2933C1F678988BEB9ACD8BBA6867A403B9E205633F35E2C5AE0AABB9F123FF`

All saves, quiz starts, answer submissions, simulated data corruption and server restarts occurred against synthetic fixture files on dedicated ports. No DELETE, PUT or PATCH request was executed. Unexpected external or destructive requests fail the suite; both final runs passed that check. No real Cloudinary upload was performed. Existing dependency edits were retained; Playwright and test scripts were added for repeatable regression testing.

## Runtime handoff and security limits

The existing process on `localhost:3000` still had the old backend loaded when checked (`/admin/results` returned 404). It was not terminated or reset. **Restart that existing server with `npm.cmd start`, or use `npm.cmd run dev`, to load the fixed backend.** A fresh isolated process using the fixed source passed every verification above. Existing person data needs no migration. Completed reports will be created in `quiz-results.json` after future quizzes.

No administrator authentication or authorization exists in the original application. This work does not invent an identity policy: anyone who can reach the server can still access people, admin pages/actions and reports. Consequently this is not a complete anti-cheat boundary: public people data can associate an image with a name, and multiple connections can act as separate players. A reconnect currently joins as a new socket participant rather than restoring durable player identity. These access/identity limitations are outside the eleven recorded defects and should be addressed before an untrusted/public deployment.

Live Cloudinary integration, other browser engines, real mobile devices, destructive endpoints and API Flow Tester features were not certified. Persistence uses atomic JSON replacement in a single server process; it is not a multi-process database. The normal-timing run passed before the final two upload/concurrency test cases and a test-harness startup-safety improvement were added; application source was unchanged between the two final runs.
