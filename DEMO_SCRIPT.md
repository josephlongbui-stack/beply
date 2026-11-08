# beply — presentation and hands-on walkthrough

Open https://beply.vercel.app on any computer or phone and sign in with your private owner login. Select **Sample bakery** for a ready demonstration; **My business** starts empty. The owner login is in the separate private handoff file, not this demo script. The optional Mac build remains at http://127.0.0.1:3001 and only works on that computer.

## 1. Show the product without invented business numbers

Open **My business**. The first screen names bakeries, cafés, restaurants, food trucks and caterers. Point out that no inventory, recipe, supplier price or budget has been assumed. Select a business type and location. A profile change does not invent suppliers or regional prices.

Upload a recipe, receipt or invoice. An arbitrary file is a private source with unconfirmed fields. On the local Mac, **Read text on this computer** performs actual local recognition; compare the text with the image. The hosted version clearly says its external reading provider is not connected. Enter and confirm source facts, or use CSV imports.

## 2. Demonstrate the complete reproducible workflow

Select **Sample bakery** in the header. These are fictional records in a separate workspace.

1. Today/Shopping calculates **$77.80** for the reference production.
2. Set maximum stops to one: the best eligible plan is **$93.30**. Return to two.
3. Set budget to **$85** and reserve to **$10**: show the computed **$2.80 funding gap**, with approval unavailable. Restore the $110 sample budget ($100 available after the $10 reserve).
4. Change a production quantity or supplier price and show immediate recalculation. Save inputs before approval; restore the sample if you want the exact reference again.
5. Approve the eligible plan. Stock does not increase.
6. Open the mobile shopping list, check lines, export/print, and confirm goods physically received. Repeating cumulative receipt confirmation does not add the same goods again.
7. Record payment separately. It changes spending, not physical stock.
8. In Stock & recipes, complete sample production. Ingredient stock decreases and finished goods appear. Record a finished-goods sale; ingredient quantities remain unchanged.

The online-order action is explicitly simulated. Never present it as a live supplier order or payment.

## 3. Show the broader food-business features

Return to **My business**. Add **Coffee beans** as grams or **Takeaway cups** as whole counts with a custom “cups” label. The item begins uncounted, with no price history. Confirm a physical count; enter a reorder reminder if useful. Include cups as a recipe component if they should be purchased and consumed with each service.

Label an existing milk container with quantity and use-by time under **Perishable lots**. This adds no stock. Set a use-by before the next prep to show increased purchasing need. Waste is an explicit inventory event; expiry alone does not delete stock.

Under **Upcoming prep**, save “Saturday breakfast” or a catering event with recipe quantities and deadlines. Explain that it is inactive and unreserved. Finish the active cycle, then activate the saved plan; purchasing recalculates from remaining stock and current quotes.

Upload the supplier-price CSV template with real stock/supplier names already in the workspace. Validate rows, confirm the import, then show the updated package comparison and price observation in Prices. The importer does not contact the supplier.

## 4. Scroll through the economics

On Prices, all ingredient charts and stock cards remain on the page as you scroll. Sample histories are labelled. Owner charts remain empty until observations exist. Decisions lets you choose a stock item for a price-change scenario; changes do not alter the real ledger. Show purchasing power, opportunity cost, the current-cycle calendar and menu-cost suggestions from the same data. Missing data remains qualified.

## 5. Demonstrate recovery

Documents → Account & recovery shows sign-in and backup status. Download a complete backup, then restore it as a separate copy. The original workspace remains available in the recovery list, and uploaded sources remain accessible. Review restored orders before acting.

Local build: create a local account, sign out and sign in again to recover the same records. Hosted build: use the same ChatGPT sign-in on another device. Do not call local password accounts a cloud login.

## Honest closing statement

“This is a working private pilot for purchasing, stock and prep decisions. CSV integration is working. The cloud version keeps records across devices. External AI reading, POS connections, real orders/payments and team access are not connected.”
