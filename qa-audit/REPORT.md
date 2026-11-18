# QA audit — supplied localhost application

Date: 2026-11-16. Browser: Chromium, desktop 1440×900 and narrow viewport 390×844. Scope: the four supplied URLs plus details and results pages. This is a **Guess Who quiz application**, not API Flow Tester. An end-to-end certification of API Flow Tester is blocked until its URL/build is supplied.

## Safety and method

Port 3000 was used for navigation, reading details, and rejected POSTs with required fields missing. No DELETE, PUT, or PATCH requests were allowed. Remote upload/save/report calls were intercepted and simulated; no remote data was created. Quiz starts and answer submissions used copied server/data/public files on an isolated port. Browser-local report fixtures contain only harmless HTML. Existing data was not deleted. No application fixes were made.

The first real-time quiz attempt timed out; that run is not evidence of a completed game. A repeat uses an explicitly accelerated isolated server (question scheduling 1.5 seconds instead of 15 seconds); its displayed countdown is consequently unsuitable for timer accuracy conclusions. The runner and raw results are in [audit.cjs](audit.cjs) and [evidence.json](evidence.json).

Severity: High = core function, data integrity, or security failure; Medium = substantial usability/recovery failure; Low = minor defect. Product mismatch is a scope blocker, separate from defect severity.

## Coverage

| Requested area | Result |
|---|---|
| Navigation | All supplied pages return 200; username login and Add Details navigation exercised; details/results inspected |
| API configurations | Blocked: no configuration UI, environments, methods, headers, auth, or variable controls exist in this build |
| API execution | Existing GET /details and missing-field POST validation exercised; quiz sockets tested in isolation; arbitrary API execution UI absent |
| Workflows | Quiz flow exercised in isolation; API workflow designer/runner absent |
| Imports | No API collection/OpenAPI import UI exists; two-image upload validation and simulated upload failure exercised |
| Reports | Empty user results, admin report request, simulated admin report failure, and browser-local HTML rendering tested |
| Validation | Empty username, empty name, missing gender, wrong image count; server field validation tested in isolated copy |
| Error handling | Simulated save 400, upload network failure, and report 404 |
| Responsive layout | Six routes at desktop and narrow width; quiz image reveal inspected separately |

## Reproducible defects

### QA-01 — Save targets a different deployment (High)

Steps: Open `/adminDashboard.html` on localhost. Enter a name, select gender, choose two PNGs, and submit. Inspect the outgoing request after successful uploads. In the audit, upload responses were stubbed with `secure_url` and the save intercepted.

Expected: Save to the current application's configured backend and show the record in local View Details.

Actual: The browser posts to `https://guess-who-amw8.onrender.com/details`, bypassing the local backend. Remote persistence was deliberately not attempted. The exact destination and payload are recorded under `requests` in evidence.json. Cause: hard-coded URL in `public/admin.js`.

Evidence: [form](screenshots/adminDashboard-desktop.png), [post-submit state](screenshots/save-error-cleared.png).

### QA-02 — Rejected save is reported as successful and clears inputs (High)

Steps: Fill the form with two images. Stub image uploads as successful. Return HTTP 400 with `{"message":"Missing data"}` from the save endpoint. Submit.

Expected: Display the rejection, retain inputs, and allow correction/retry.

Actual: Alert says “Person added successfully!” and name, gender, and file inputs are cleared. The promise chain never checks `res.ok`. The alert text and cleared name are recorded in evidence.json.

Evidence: [cleared form after rejection](screenshots/save-error-cleared.png).

### QA-03 — Upload network failure has no visible recovery feedback (Medium)

Steps: Fill the same form, select exactly two images, and fail the Cloudinary upload request using browser request interception. Submit.

Expected: Visible error explaining that saving failed and a retry option/state.

Actual: Only a console error is produced; the page shows no failure message. Users cannot distinguish a failed upload from an unfinished request.

Evidence: [failure state](screenshots/upload-network-error.png).

### QA-04 — Correct answer is exposed before an answer is chosen (High)

Steps: Start a quiz on the isolated server, inspect the incoming `newQuestion` socket event or inspect option buttons in DevTools. Read `document.querySelector('[data-correct="true"]').innerText`.

Expected: The client cannot learn the correct answer before submission; the server evaluates the selected option.

Actual: The event includes `question.answer` and the correct button is marked `data-correct="true"`. The raw evidence records matching answer and DOM values.

Evidence: [question UI](screenshots/quiz-answer-desktop.png); event/DOM comparison in evidence.json. Screenshot provides UI context; the leak itself is established by the captured values.

### QA-05 — API accepts invalid record fields (High)

Steps: On an isolated server only, POST `/details` with `{"answer":"   ","image1":"not-a-url","image2":123,"gender":"invalid"}`.

Expected: HTTP 400 with field errors; no new record.

Actual: HTTP 201 “Data saved successfully”, storing whitespace name, invalid URL, numeric image, and unsupported gender. The handler only tests truthiness. This was executed only against copied data on port 3001; the invalid test record remains in that isolated fixture.

Evidence: [saved isolated fixture](isolated/details.json); [form context](screenshots/adminDashboard-desktop.png). This is an API defect; no screenshot can establish its HTTP response. Observed response: `201 {"message":"Data saved successfully","data":{"id":1794832403085,"answer":"   ","image1":"not-a-url","image2":123,"gender":"invalid"}}`.

### QA-06 — Admin report uses a remote endpoint absent from local server (High)

Steps: Open `/adminResults.html`; inspect its network request. Simulate HTTP 404 HTML from the remote URL. Also request `GET /admin/results` locally.

Expected: Report loads results from the current backend, or visibly explains an empty/error state.

Actual: Page requests `https://guess-who-amw8.onrender.com/admin/results`; local server defines no corresponding endpoint. On the simulated 404, JSON parsing fails and the page remains an empty table with no visible error. The remote server's actual availability was not tested.

Evidence: [empty failed report](screenshots/admin-results-error.png); destination in evidence.json.

### QA-07 — Game opens as an unexplained empty screen (Medium)

Steps: Open `/guessWho.html` before the admin starts a quiz, including via a successful username login.

Expected: “Waiting for host” state or useful instructions; no broken/uninitialized imagery.

Actual: Timer shows 0, the image placeholder has no source, and there are no options, status, or navigation instructions.

Evidence: [game initial state](screenshots/guessWho-desktop.png).

### QA-08 — Admin report is unreachable through admin navigation (Medium)

Steps: Open `/admin.html` and inspect all visible navigation controls.

Expected: An admin can navigate to the existing admin results page.

Actual: Only Add Details, View Details, and Start Quiz are offered. The View Result link is commented out in source; reaching the report requires manually entering its URL.

Evidence: [admin navigation](screenshots/admin-desktop.png).

### QA-09 — Repeated submissions inflate score (High)

Steps: On the isolated quiz, submit the same correct answer three times using `socket.emit('submitAnswer', answer)`, then click the correct option once. Submit no other answers. Let the quiz finish.

Expected: One point for that question; subsequent submissions are ignored server-side.

Actual: Final report gives Guest **4** points. The client click lock does not protect the server handler, which increments on every matching event. The accelerated isolated run completed and navigated to results successfully.

Evidence: [four points from one question](screenshots/quiz-completed.png); completed-quiz text in evidence.json.

### QA-10 — Results interpret usernames as HTML (High)

Steps: In a browser-local fixture, set `sessionStorage.quizResults` to `JSON.stringify({qa:{username:'<b id="qa-html-marker">QA HTML MARKUP</b>',score:1}})`, then open `/results.html`.

Expected: The entire username appears as plain text.

Actual: A real `b` element with that ID is rendered. `row.innerHTML` interpolates usernames directly. The server's registration handler also accepts raw usernames. The audit used harmless formatting, not executable payloads; arbitrary-script execution was not tested.

Evidence: [rendered markup](screenshots/report-html-injection.png); `htmlRendered: 1` in evidence.json.

### QA-11 — Loaded quiz images clip at narrow widths (Medium)

Steps: At a 390×844 viewport, show both loaded quiz images (normally after answering). For deterministic reproduction without relying on external image hosts, on `/guessWho.html` set both image sources to the existing `/next_9653622.png` asset and their display to `block`, then wait for image decoding. This modifies only the browser DOM.

Expected: Both images fit within the viewport or stack vertically.

Actual: Each image stays 300 pixels wide with a 50-pixel gap. First image begins at x=-130, second at x=220, and document scroll width is 520 against viewport width 390. The first image's left side is clipped. The earlier game screenshot with failed external image loads does not establish this defect; the deterministic loaded-image fixture does.

Evidence: [loaded images at narrow width](screenshots/quiz-responsive-loaded-images.png).

## Data integrity verification

The original `details.json` SHA-256 before and after testing was identical: `4A2933C1F678988BEB9ACD8BBA6867A403B9E205633F35E2C5AE0AABB9F123FF`. Existing package/node_modules working-tree changes predated this audit and were left untouched.

## Limitations

External Cloudinary behavior, remote backend persistence, cross-browser compatibility, real mobile devices, accessibility conformance, and destructive operations were not tested. Narrow-width Chromium checks are viewport tests, not real-device certification. Screenshots may include existing quiz images; handle them as application data. No claim is made that unavailable API Flow Tester features passed.
