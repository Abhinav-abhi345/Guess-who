# Fix and regression plan

Baseline: `REPORT.md` (11 defects); requested `QA-REPORT.md` does not exist. Preserve that report as historical evidence. The application in this repository is Guess Who, not an API workflow tester.

1. Establish an isolated server/browser regression harness with synthetic people and separate writable data/report files. Record failing baseline checks.
2. QA-01–03: save to same-origin `/details`; check HTTP and upload responses; retain input on failure, expose errors and retry, and prevent concurrent submissions.
3. QA-04/09: keep answers and second images server-side until the question closes; accept one valid submission per registered socket and question ID; reject stale, duplicate, and late submissions; reset scores for a new quiz and snapshot results.
4. QA-05: validate body shape, trimmed name, supported gender, and HTTP(S) image URLs with field errors before writing.
5. QA-06/08/10: implement local persisted report history, link it from admin navigation, render names through textContent, and expose loading/empty/error/retry states.
6. QA-07/11: add waiting/disconnected/quiz error states, handle late joins, size images responsively, and add mobile viewport metadata.
7. Run HTTP validation and socket security cases, then browser regressions for all eleven issues, successful save/list/quiz/results/report flows, failure recovery, keyboard/navigation and responsive layouts. Save screenshots and final verdicts.

Security review includes malformed request bodies, unsafe URL schemes, answer disclosure, repeat/replayed submissions, report HTML injection, and error exposure. Admin authentication/authorization is not present in the baseline and needs a separate identity/access policy; do not claim this work implements one.

Existing `details.json` and pre-existing dependency modifications must remain unchanged. All writes during regression target synthetic fixtures; external uploads are intercepted. No destructive request is executed.
