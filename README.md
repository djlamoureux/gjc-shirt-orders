# Georgetown Judo Club Fulfillment Webhook

This Vercel serverless function receives paid ClickFunnels orders and creates the matching Printful fulfillment order. It replaces the sleeping Manus webhook with an always-available HTTPS endpoint at `/api/webhook`.

## What it protects

The function accepts only `one-time-order.completed` events and validates the ClickFunnels HMAC-SHA256 signature using the raw request body. It supports one or more GJC shirt line items in a single order. Each Printful order receives the ClickFunnels order ID as its unique `external_id`, allowing the listener to look up and return a prior Printful order when ClickFunnels retries a delivery. This provides durable, database-free duplicate protection.

## Active mappings

| ClickFunnels SKU family | Printful product | Sizes |
| --- | --- | --- |
| `GJC-ESTR-WHT-*` | GJC TShirt - Eat Sleep Throw Repeat 2 | S, M, L, XL, 2XL, 3XL |
| `GJC-JLC-WHT-*` | GJC TShirt - Judoka Lifecycle 2 | S, M, L, XL, 2XL, 3XL |
| `GJC-JKGW-BLK-*` | Georgetown Judo Club TShirt - Judo Kanji the Gentle Way 2 | S, M, L, XL, 2XL, 3XL |

## Required Vercel environment variables

Set these for **Production**, **Preview**, and **Development** in Vercel before switching the live ClickFunnels endpoint:

| Variable | Purpose |
| --- | --- |
| `PRINTFUL_API_TOKEN` | Printful private API token used to create and retrieve fulfillment orders. |
| `PRINTFUL_STORE_ID` | `13936432`, the LamoureuxWares / Etsy Printful store. |
| `CLICKFUNNELS_WEBHOOK_SECRET` | The secret returned exactly once when the new ClickFunnels outgoing webhook endpoint is created. |

## Deployment and cutover

1. Push `main` to GitHub and link the repository to Vercel.
2. Add all three environment variables in Vercel, then verify `GET https://<vercel-domain>/api/webhook` responds with `{"status":"ok"}`.
3. Create a new ClickFunnels outgoing endpoint for `one-time-order.completed` pointing at `https://<vercel-domain>/api/webhook`. Save the displayed webhook secret immediately in Vercel as `CLICKFUNNELS_WEBHOOK_SECRET`.
4. Send a controlled, signed ClickFunnels test request. Confirm it creates a Printful **draft** with the intended sync variant, then cancel the draft.
5. Disable the old Manus endpoint only after the Vercel test is successful. Do not leave both endpoints active, because both can create fulfillment orders.

## Local validation

Run `npm install` and `npm test`. The suite checks all 18 active mappings, multi-item order construction, unknown-SKU rejection, and ClickFunnels signature verification.
