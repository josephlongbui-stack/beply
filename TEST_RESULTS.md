# beply — actual verification results

## Public Vercel release — latest

Live at https://beply.vercel.app. Deployment `dpl_XzXvnsFUmhgaurhWud6i9H5iQNeu` is READY, and the production domain opens without Vercel login. Private app records still require the owner account.

| Check | Actual result |
| --- | --- |
| Unit/integration suite | **71 passed in 7 files**, 1.89 seconds, including 12 cloud/Postgres tests. |
| Type checking and lint | Passed after migration repairs. |
| Existing local production browser suite | **26 passed**, desktop/mobile, 46.6 seconds. |
| Actual Neon migration and Vercel build | Passed. The SQL comment splitter and CommonJS migration startup failures were repaired before the successful release. |
| Live HTTPS integration checks | **9 groups passed** against real Neon and private Blob, including account/session gates, exact reference calculation, changed inputs, conflict handling, inventory transitions, upload above 5 MB, CSV commit/export, complete backup above 4.5 MB and restore, revocation/private source protection. |
| Live browser | Owner sign-in, empty workspace, sample $77.80, six ingredient charts, mobile $85/$10 → $2.80 preview and save/reload persistence verified at 1440×1000 and 390×844; no document horizontal overflow. |

The owner workspace was left empty. Synthetic sample scenarios were restored after verification. Live evidence: `vercel-live-results.json`, `vercel-production-build.log`, `vercel-unit.log`, `vercel-browser.log`, `vercel-source-manifest.json`, and the `vercel-live-*` screenshots. See VERCEL.md for the cloud architecture and limitations. Physical phones, camera hardware, external AI reading, production load and independent security review remain unverified/unavailable as specified below.

## Earlier local and Sites release verification

The following evidence describes the preserved earlier release; Vercel verification above supersedes its cloud-access status.

Executed October 24, 2026 on macOS with Node 24.21.0. The local application uses Next.js 16.4.3; the hosted checkout uses the Sites/Vinext Worker runtime. These are completed checks, with their verification limits below.

| Check | Actual result |
| --- | --- |
| Unit/domain/persistence tests | **59 passed in 6 files**, 703 ms final run. |
| Local TypeScript and lint | `npm run typecheck` and `npm run lint` passed. |
| Local production build | `npm run build` passed; application compiled and all routes generated successfully. |
| Local production browser suite | **26 passed**, 44.6 seconds; 13 stories each at desktop 1440×1000 and iPhone 13 emulation in Chromium. No failed, skipped or flaky tests in this final run. |
| Hosted TypeScript and lint | `npx tsc --noEmit` and `npm run lint` passed in `hosted/beply`. |
| Hosted production build | Sites build helper completed successfully from the published source. |
| Hosted-runtime browser suite | **8 passed**, 16.9 seconds; four stories each at desktop and phone widths, using the local Worker/D1/R2 preview. |
| Reference oracle | Python reference assertions passed; unchanged seed and expected results agree with the application calculations. |
| Local OCR | A real uploaded PNG was read by Apple Vision and displayed for review; tested in both desktop and mobile browser stories. |
| Private deployment | Native Sites status **succeeded**, October 24 at 18:29 UTC. Live private gate and ChatGPT login path reached in the browser. |
| Visual inspection | Updated startup, market feed, documents/recovery and food-business stock/prep views inspected at desktop/mobile widths. Browser stories check page overflow. |

## Reference and inventory invariants

Computed results: two stores **$77.80**, best one store **$93.30**, and **$2.80** funding gap with an $85 total budget and $10 reserve. The interface calculates these from data; it does not read expected results to display them.

Approval does not change physical inventory. Cumulative repeated receiving adds each quantity once. Recording production consumes ingredients and creates finished goods. Selling finished goods does not consume ingredients again. Both local and hosted browser flows exercise these transitions. Location, supplier prices, production quantities, budget and stop limits change eligibility and computed purchasing.

The fixture SHA-256 values are unchanged:

- `demo/seed.json`: `f5c9af0c9b596d9d1c113d9b6c883bc080e30b1b0df30a15906fd9831e300c01`
- `demo/expected_results.json`: `e5af7bda11012f76c026d9ffd9478c957f74d48c8c46e8b38ec84e40eae79d7c`

## Food-business and recovery coverage

Unit tests cover custom coffee/cup items and generic count labels, expired-lot purchasing, earliest-use-by consumption, explicit waste, fresh-count relabelling, queued prep activation, and rejection of future live production completion. Supplier CSV previews use the same quote validation as manual entry and commit atomically/idempotently.

Local account tests cover claiming a guest workspace, salted credential hashes, token rotation/expiry, sign-in throttling and account isolation. Backup tests cover record/source integrity, hash/path rejection, duplicate records, preserved originals and the five-snapshot retention limit. Reset targets the active workspace, including restored copies.

The two added local browser stories exercise:

1. Café profile, custom cups, counted stock, dated milk lots and a saved/activated next service.
2. Actual uploaded-image OCR, local account creation/logout/login, complete backup download, restored workspace and recovered source bytes.

The original eleven stories continue to cover input-first onboarding, ordinary uploads and manual recipe review, invoices and duplicate reconciliation, sample purchasing/receiving, CSV validation, economics, all six scrolling charts, US quote eligibility, production times and DST transitions.

Hosted browser coverage additionally verifies source bytes survive sign-out/sign-in and restore, stale concurrent writes return a conflict, anonymous APIs are denied, foreign workspace/file requests are denied, and cross-origin writes are blocked. These tests use the preview identity and local D1/R2 storage; they do not substitute for a commercial security audit.

## Deployment and verification boundary

- URL: https://beply-food-business.pretty-pear-4929.chatgpt.site
- Audience: owner-private.
- Site: `appgprj_6adcf3fb4f2081919c18296ac79dab18`
- Source commit: `ae8287f598537234634a0dadc404c2e0bca62f59`
- Saved version: `appgprj_6adcf3fb4f2081919c18296ac79dab18~appgver_fb112f7532408191846689b7573d7088`
- Deployment: `appgdep_6adcf8ee1ee88191b5d7bbc38c53cf99`

The platform reports successful production deployment. The browser confirms unauthenticated access reaches the private gate and the ChatGPT login screen. The owner was not signed into that browser, so **authenticated production API operations and cross-device persistence on the live deployment have not been exercised**. The same workflows passed in the hosted local runtime. Sign in with the Site owner's ChatGPT account to use the cloud app.

The updated local production application is running at http://127.0.0.1:3001. Its startup screen was reloaded and inspected in the in-app browser. The separate hosted QA server on port 3101 was stopped after verification and publication.

## Repairs and test infrastructure

The first expanded local browser run passed all 26 checks. A later development-server run exposed intermittent Next.js empty/partial build-manifest errors; concurrent suites also collided over Playwright trace output. Hosted tests now have a separate artifact directory. Final local browser checks run the production build, avoiding development compilation during requests, and all 26 pass. Development hot-reload manifest instability was not claimed to be a resolved framework defect.

Other fixes included mobile table minimum widths, responsive lot/prep headings, preserving generated uploaded-document IDs, active-copy reset targeting, and a hosted mobile navigation readiness race in the test harness.

Non-failing output includes Node SQLite's experimental notice, browser color-environment notices, a Vite future config-loader notice, and a hosted build chunk-size advisory. Type/lint checks pass.

## Not verified or not connected

Physical iPhones/Android phones, iOS Safari, Firefox, camera hardware, physical printing, production load, an independent security audit and disaster recovery beyond the tested export/restore path were not tested. Image OCR was tested; the implemented embedded-text/scanned-PDF branches were not separately verified in this run. OCR supplies reviewable text, not automatically confirmed structured business facts.

External AI document reading is not connected. There are no live supplier prices, real supplier orders/payments, POS/bank integrations, automatic tax lookup or team roles. No uploaded private business files were transferred to the hosted app during deployment. Local and cloud workspaces remain separate until the owner chooses to restore a complete backup.

This is a working private pilot and demonstration, with explicit limits in IMPLEMENTATION_STATUS.md. It is not certified as a complete commercial business platform.

## Evidence

Current logs in `outputs/verification/`:

- `food-checks-final.log`: 59 tests, type check, lint and local build.
- `food-browser-final.log` and `food-browser-results.json`: all 26 production browser checks.
- `hosted-build-final.log`: hosted production build.
- `hosted-browser-final.log` and `hosted-browser-results.json`: all eight hosted-preview browser checks.
- `food-reference.json`: full oracle calculation output.
- `hosted-deployment.json`: native successful deployment result and source commit, without credentials.

Screenshots are in `outputs/screenshots/`. Older verification artifacts remain available under their original filenames.
