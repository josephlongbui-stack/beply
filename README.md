# beply

Private purchasing, inventory and prep planning for bakeries, cafés, restaurants, food trucks and caterers. The bakery is a reproducible sample; your own workspace starts without stock, prices, recipes or a budget. Recipes, supplier comparisons, ingredient charts, orders and the six economic tools share the same calculation model.

## Two ways to run

**Public Vercel app:** open [beply.vercel.app](https://beply.vercel.app). The site is publicly reachable; business records require the private beply owner login. Postgres stores accounts and records, and private Vercel Blob stores uploads/backups. Your generated owner login is delivered separately in `outputs/BEPly-PRIVATE-LOGIN.txt`; keep it out of source packages and shared demo links. See `VERCEL.md` for deployment details and live verification.

The earlier [Sites pilot](https://beply-food-business.pretty-pear-4929.chatgpt.site) remains unchanged in `hosted/beply/`; its ChatGPT sign-in is separate from the Vercel account. Local workspaces are not uploaded automatically. Transfer records by downloading a complete backup and restoring it in the cloud app.

**On this Mac:** Node.js **24.x** and npm are required. No API keys or paid business software are needed.

```bash
git clone --branch beply https://github.com/josephlongbui-stack/beply.git
cd beply
npm ci
npm run seed
npm run setup:ocr  # macOS + Apple command-line tools; optional
npm run build
npm run start -- --port 3001
```

Open **http://127.0.0.1:3001/**. Port 3000 belongs to another application on this machine. Stop an existing server before restarting on the same port. For development, use `npm run dev -- --port 3001` instead of build/start. Webpack is selected explicitly for this environment.

This repository contains the current Vercel/local application. Private credentials, business records, uploads, build outputs and the earlier independent Sites checkout are excluded from Git. Existing installations can run the commands from `npm ci` onward in their current project directory.

The application lives on the `beply` branch. The default `main` branch contains only a starting README and has independent history, with no application code. Check out `beply` before working on this application.

The local app binds to loopback. It is not a phone-accessible deployment. The hosted version is the cross-device version.

## Start with your business

1. Set **Business type**, name, US city/state/ZIP and timezone from the location button. All 50 states, DC and five populated territories are selectable. ZIP is syntax-checked, not geocoded; confirm the timezone.
2. Add stock items under **Stock & recipes**: ingredients, packaging, resale goods or operating supplies. Track weight, volume or whole counts with your own count label. Six bakery definitions are provided as a starting catalog, with no assumed quantities. Custom items use the same quotes, charts and calculations.
3. Upload a recipe, invoice, receipt or statement, or enter it manually. Confirm recipe yields, units and item matches. Count what is physically on hand.
4. Add local suppliers and package quotes, or import a supplier CSV. Enter availability, source, observation/expiry, tax and trip assumptions. Location scopes eligible quotes; there is no live supplier feed.
5. Set the active production quantities, prep deadline, budget, reserve and maximum stops. Review the recalculated plan before approving.
6. Shop with the mobile list or submit an explicitly simulated online order. Record physical receipt separately from payment. Production consumes ingredients once; finished-goods sales do not consume them again.

**Perishables:** label existing stock by lot/container, quantity and use-by date. Labelling never adds stock. Lots past use-by at preparation are excluded from usable inventory; production uses eligible dated lots earliest first. Record disposal with Waste. A fresh physical count clears that item's lot labels so you can label the recounted stock accurately. Dates come from your records, not invented shelf-life rules.

**Upcoming prep:** save named services or catering events. These reserve no stock or money until activated. Complete the active cycle, then activate the next plan and review its recalculated purchasing. This is one active cycle with a queue, not simultaneous multi-day optimization.

**Prices:** all item charts, stock counts, shortfalls and package comparisons appear in one scrolling feed. No history is invented for owner records. The first confirmed production establishes your fixed comparison basket. Scenario price changes can target any stock item.

## Document reading and CSV integration

- Upload PNG, JPEG, WebP, PDF or CSV, up to 8 MB per file. Phone capture uses the browser's native file picker; export HEIC to JPEG.
- Exact bundled sample files have clearly labelled deterministic extraction. Arbitrary uploads begin unconfirmed.
- **Local Mac:** run `npm run setup:ocr`, then click **Read text on this computer** in document review. Apple Vision reads images; PDFKit reads PDF text and Vision reads scanned pages, up to 10 pages. Text recognition is real, but may be wrong. You still verify and enter structured quantities, prices and matches before posting anything. Failures remain visible; no successful analysis is fabricated.
- **Hosted:** external AI document reading is **not connected**. Files are stored privately, and are not sent to an AI provider. Manual review and CSV imports work. A provider connection and explicit data-sharing opt-in are still required.
- CSV imports support recipes, purchases, a production cycle and supplier price lists. Use the supplied templates, validate all rows, then confirm an atomic commit. Repeated identical imports are idempotent. Supplier quotes update price history and purchasing comparisons. Stock and shopping CSV exports escape spreadsheet formula prefixes.
- Invoice drafts are unpaid and unreceived until confirmed. Matching later receipt evidence can complete an invoice without duplicating stock or expense. Conflicting evidence requires review.

## Accounts, backups and storage

The local app offers **Documents → Account & recovery → Create local account**. Accounts claim existing guest records, hash passwords with salted scrypt, rotate sessions and restore access after logout. Use a password manager: email verification and password recovery are not connected. Vercel uses a separate private cloud owner account with salted scrypt passwords and secure, revocable sessions. The older Sites pilot uses ChatGPT identity.

Each successful mutation attempts an automatic snapshot; the latest five are retained per workspace. The recovery panel reports the last successful snapshot and any error. Local snapshots contain source bytes; hosted snapshots refer to immutable private source objects. **Download complete backup** packages both records and source bytes in either version. Restore validates format, checksum, source hashes and record invariants, and creates a separate workspace. Old records remain accessible. Unexecuted restored approvals are cancelled for review.

Keep a separate downloaded recovery copy. Local automatic snapshots on the same computer do not protect against loss of that computer. Downloaded backup files contain private records and are not encrypted.

Local data: `.data/pocket-economist.sqlite`, `.data/uploads/`, `.data/backups/`. `POCKET_DATA_DIR` changes the private data directory. The local OCR binary defaults to `.data/tools/beply-ocr`; `POCKET_OCR_BINARY` can point to another installed helper. Set `POCKET_SECURE_COOKIE=true` only behind HTTPS, not for the local HTTP preview.

Owner workspaces use current server time; samples keep the fixed October 24, 2026 clock. Live counts must be recent. Owner production cannot be confirmed before prep starts and is recorded at the actual confirmation time. Whole-batch quantities remain owner-confirmed, not automatically measured output.

## Verification

```bash
npm run test
npm run typecheck
npm run lint
npm run build
python3 checks/reference_check.py
npm run test:e2e
```

Browser tests start the production build on port 3100, using installed Chrome, desktop 1440×1000 and iPhone 13 emulation, with isolated data at `work/e2e-data`. Build first; do not run a build or `next dev` in this checkout during the suite. macOS OCR tests use the optional installed helper. Hosted browser checks use a separate local D1/R2 preview; see `HOSTING.md`. Actual counts, results and limitations are recorded in `TEST_RESULTS.md`.

The unchanged sample computes **$77.80** for two stores, **$93.30** for the best one-store plan, and a **$2.80** funding gap with an $85 budget/$10 reserve. The interface never reads these expected numbers as results.

## Scope and limits

This is a working private pilot and demonstration, not a finished commercial operating system. No real supplier orders, payments, bank feeds, POS connection, live price feed, team roles or marketplace are connected. Owner inputs remain essential. Forecasts are explicitly illustrative; price suggestions are cost calculations, not guaranteed outcomes.

Limits include 100 stock items, eight owner-entered suppliers, one current package per local supplier/item, 30 queued prep plans, 10 recipes per active cycle, 2,000 planned units per recipe, whole batches, and bounded exact search. The hosted pilot caps source storage at 8 MB/100 files per workspace and aggregate record JSON at 1.5 MB. Complete backup imports are capped at 32 MB locally and 16 MB hosted. This model needs further capacity, security, retention and recovery work before broader commercial use.

Paid returns/refunds, partial payment amounts, corrections to posted purchase lines, simultaneous prep reservations and full food traceability are not implemented. Selling finished goods does not post revenue to the purchasing budget. Primary EN/VI navigation works; detailed copy is mostly English.

Use the in-app Reset only after reviewing its confirmation. `npm run reset -- --yes` deletes all data in the configured local directory, including accounts, uploads, backups and the local OCR helper. Stop the server and save backups first. Do not use that command to update the app.

See `DEMO_SCRIPT.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_STATUS.md`, `HOSTING.md`, `TEST_RESULTS.md` and `MILESTONES.md` for the handoff. The original product pack and reference fixtures remain preserved.
