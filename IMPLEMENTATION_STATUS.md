# beply v1.3 — implemented, simulated and unfinished

## Working features

- Bakery, café, restaurant, food-truck and caterer profiles; US location/timezone settings with DST-aware inputs.
- Empty owner onboarding, preserved opt-in bakery/guided samples, bold beply design and minimal bánh mì SVG identity.
- Custom stock catalog for ingredients, packaging, resale goods and supplies; weight/volume/whole-count units, storage limits and low-stock reminders.
- Private source uploads, document review, invoices/receipts/statements, recipe versions and duplicate-purchase reconciliation.
- Exact bounded purchasing calculations from recipes, stock, current supplier quotes, deadlines, budget/reserve and shopping-stop limits.
- Approval, shopping, separate payment bookkeeping, partial/repeated receiving, production consumption, finished-goods sales, waste and stock reconciliation.
- Dated perishable lots, expiry-aware purchasing and earliest-use-by consumption. Physical stock is not deleted automatically on expiry.
- Named queued prep/service plans, activation after the current cycle, and production history. No stock is reserved by an inactive queued plan.
- One scrolling price/stock feed, qualified outlooks, fixed-basket purchasing power, selected-item economic scenarios, opportunity costs, current-cycle purchasing calendar and cost-based menu prices.
- Recipe/purchase/production/supplier-price CSV import, row-level preview and atomic idempotent commit; inventory/shopping exports.
- Local username/password accounts, private sessions, server-side session expiry, sign-in throttling and credential hashing. Hosted build uses platform sign-in instead.
- Automatic snapshots, download of records plus source files, checksum/hash validation and restoration into a separate workspace.
- Real on-device text reading on this Mac using Apple Vision/PDFKit. Actual recognized text is shown for review; structured business facts still need owner entry/confirmation.
- A separate hosted application with D1 records, R2 private sources, owner-scoped reads/writes, compare-and-swap revisions and ChatGPT sign-in. See HOSTING.md for actual publication status.

## Explicit simulations

Bundled bakery records and historical prices are fictional. Sample-file extraction is deterministic and identified as such. Samples retain a fixed date. Online submission only generates a local SIM reference; no supplier is contacted. Payment recording is bookkeeping, not a charge. Forecasts are illustrative trailing means/ranges and are not calibrated predictions. Trip costs are entered assumptions.

## Not connected or unfinished

- Hosted external document analysis is not connected; no files are sent to an AI provider. Manual review and CSV work. Connecting a provider requires a separate account/secret and explicit opt-in.
- No Square, Shopify, bank, supplier ordering, live quote, tax lookup or delivery-routing connection. CSV is the first implemented integration.
- Hosted access is owner-private. No team invitations, roles, broader public signup, multi-location transfers or independent commercial security audit.
- Local and Vercel accounts have no email verification, MFA or password-reset service. Local snapshots remain on the same machine; keep a separate recovery copy.
- One active production cycle, with up to 30 queued plans. No global multi-day optimization, simultaneous reservations, subrecipe staging, fractional batches or automatic sales/POS ingestion.
- Lots are owner-assigned labels on received/count-confirmed stock. No supplier-lot recall graph, temperature monitoring or automatic food-safety assessment. Counts clear lot allocation for that item.
- Posted purchase corrections, refunds/returns, partial payments and actual-yield variance need additional workflows. Sales reduce finished stock without posting purchasing-budget revenue.
- Hosted pilot limits: 8 MB/100 source files and 1.5 MB aggregate records per workspace. Solver, catalog and batch bounds are documented in README.
- Real iOS Safari, Firefox, camera hardware, physical printing, large-scale performance, disaster recovery beyond tested export/restore, and a paid external AI provider are not verified.

The application can demonstrate its implemented end-to-end workflows. These remaining items prevent an honest claim that it is a complete production business platform.

## Public Vercel release — October 24, 2026

Deployed and live at https://beply.vercel.app. Production is publicly reachable; private records, uploads and backups require owner sign-in. Neon Free and private Blob are connected. Live HTTPS tests verified the reference calculations, persisted inputs, inventory transitions, CSV import/export, uploads above 5 MB, complete backup restoration, session revocation and private-file access controls. Desktop/mobile browser inspection also passed. See VERCEL.md and TEST_RESULTS.md. The earlier Sites implementation remains preserved.
