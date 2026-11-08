# beply on Vercel

Live on October 24, 2026: **https://beply.vercel.app**. The production website is publicly reachable. Business records, uploads and backups remain private behind the beply owner login. Preview deployments retain Vercel protection. The prior Sites deployment is unchanged.

## Deployment and access

- Production deployment: `dpl_XzXvnsFUmhgaurhWud6i9H5iQNeu`, state **READY**.
- Immutable URL: `https://beply-8446iwbp0-joseph-bui.vercel.app`.
- Additional production alias: `https://beply-joseph-bui.vercel.app`.
- Vercel account/team: `joseph-bui` (Hobby); project `beply`, `prj_myS2niacv0kCCsEc0R9eN2TpsygR`.
- Neon Free database: `beply-postgres`, `store_A0VWzPgvVnjbKo5k`, US East. Neon Auth/realtime are disabled; the app owns authentication. No paid upgrade was selected.
- Private Blob: `beply-private-files`, `store_DSSaJgF22vpYO8uP`.
- Node 24.x, Next.js 16.4.3, `iad1`; install `npm ci`; Vercel build `npm run cloud:migrate && npm run build`.
- The additive schema was applied successfully during the actual production build. Secret database, Blob and single-use setup-code variables are configured server-side. No secrets are included in the source archive.
- Deployment input: 110 source files, recorded in `outputs/verification/vercel-source-manifest.json`. Manifest SHA-256: `87592ae3aa4230960b95eb69ef57a9fc09f86ef45bd894870cac8df9897922ff`.

The owner account is initialized and working. Its generated credentials are delivered only in `outputs/BEPly-PRIVATE-LOGIN.txt` with local owner-only file permissions. Keep this file private and save the login in a password manager. The single-use setup code has been consumed. Do not use First visit to register again. Password recovery is not yet available.

My business starts empty. Choose Sample bakery for the reproducible demonstration. Synthetic verification data was isolated to sample workspaces; samples were reset to their original scenario after checks. No local private business records were migrated. Use a complete backup/restore if you choose to transfer your local records.

## Running and updating

The public site runs on Vercel independently of this computer. It does not require a local server or API key to use its implemented features. Sign in with the same owner account from another device.

For local use, run `npm ci`, `npm run build`, and `npm run start -- --port 3001` in the repository. The local SQLite app remains separate from the cloud app.

For future releases, deploy the root Next.js project to the existing Vercel project. Keep `.env*`, `.data`, `.vercel`, `work`, `outputs`, `hosted`, dependencies and build output out of source uploads. Vercel supplies server secrets and runs the additive migration before building. Preview database branching is enabled; production uses its stable database. Review future schema changes for compatibility before deploying. Source upload was through the connected Vercel API; automatic Git deployments are not configured.

## Architecture

The UI and domain engine are shared by the local and Vercel builds. Each API dispatches to `src/server/cloud/api.ts` on Vercel before accessing SQLite or the filesystem. `db/vercel.sql` defines Postgres accounts, hashed sessions, profiles, workspace state/revisions, backup status and upload authorizations.

Every workspace read/update is scoped to its owner. Saves use revision compare-and-swap. A committed save remains successful if its automatic Blob snapshot fails; the recovery panel reports the failure. Five recent snapshots are retained and reference immutable private sources. Downloaded recovery packages include source bytes. Restoration validates checksums/invariants, creates a separate copy, and cancels unexecuted approvals for review.

Sources upload directly to private Vercel Blob using a short-lived authorization. Finalization checks owner, workspace, purpose and expiry before recording the document. Downloads stream. Abandoned uploads stay private; automatic cleanup of abandoned objects is not implemented.

Passwords use salted scrypt hashes. Revocable sessions have hashed seven-day tokens and secure HttpOnly SameSite Strict cookies on Vercel. Foreign-origin writes are rejected. Signup requires a single-use owner code. Team roles, email verification, password recovery and MFA are not implemented.

## Working features and limits

The purchasing/stock engine, editable inputs, document review, exact sample extraction, CSV, perishables, prep queues and six economic tools use the same state. Owner workspaces start without invented figures. The opt-in sample computes $77.80 for two stores, $93.30 for one store and a $2.80 funding gap with an $85 budget/$10 reserve.

Cloud AI document reading is not connected. Arbitrary uploads remain unconfirmed; no extraction is fabricated. Apple Vision OCR is local-Mac-only. Prices are entered/imported or explicitly sampled. Orders and payments are simulated or owner-recorded, never sent to real suppliers/processors.

Pilot limits: 100 source files and 8 MB aggregate sources per workspace, 1.5 MB workspace records, 16 MB backup imports, and 30 direct upload authorizations/account/hour. Keep separate downloaded backups. This is not an independently audited commercial platform.

## Actual verification

- **71 unit/integration tests passed**, including 12 cloud tests using PGlite Postgres and a private-object-store test double. The deployment schema parser now runs against Postgres in the suite and reapplication preserves existing accounts.
- **26 local production browser stories passed**, desktop/mobile, 46.6 seconds. Type checking and lint passed again after the migration fixes.
- **Vercel production build passed**, including the real Neon schema migration. Two initial migration failures were fixed: top-level await under CommonJS and a semicolon inside a SQL comment.
- **Nine live HTTPS integration groups passed** against actual Neon and private Blob: public access/auth gates, owner signup/login, reference totals and changed inputs, stale-write rejection, approval/receipt/production/sale invariants, private upload above 5 MB, CSV validation/commit/export, complete backup above 4.5 MB restored with source bytes, and session revocation/source protection.
- The public browser was inspected at 1440×1000 and 390×844. Sign-in, empty owner workspace, sample calculation, all six scrolling ingredient charts, mobile purchasing edits and persistence after reload were checked. Both widths had no document-level horizontal overflow. The $85/$10 mobile preview showed a $2.80 gap and disabled approval.
- Physical phones, camera capture, iOS Safari, production load and an independent security audit were not tested. AI document reading, real orders/payments and password recovery remain unavailable.

Evidence is under `outputs/verification/vercel-*` and `outputs/screenshots/vercel-live-*`. Credentials are deliberately excluded from all evidence and source archives.
