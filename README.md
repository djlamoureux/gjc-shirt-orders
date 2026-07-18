# GJC Webhook - ClickFunnels → Printful Fulfillment

A zero-database serverless webhook that listens for completed ClickFunnels orders and automatically creates Printful fulfillment orders for Georgetown Judo Club shirts.

## How it works

1. ClickFunnels fires a `one-time-order.completed` webhook to `/api/webhook`
2. The function maps the product SKU to a Printful sync variant ID
3. A Printful order is created using the customer's shipping address
4. Done — no database, no UI, no sleeping

## SKU Mapping

| SKU | Product | Size | Printful Sync Variant ID |
|-----|---------|------|--------------------------|
| GJC-ESTR-WHT-S | Eat Sleep Throw Repeat | S | 5389942464 |
| GJC-ESTR-WHT-M | Eat Sleep Throw Repeat | M | 5389942465 |
| GJC-ESTR-WHT-L | Eat Sleep Throw Repeat | L | 5389942466 |
| GJC-ESTR-WHT-XL | Eat Sleep Throw Repeat | XL | 5389942467 |
| GJC-ESTR-WHT-2XL | Eat Sleep Throw Repeat | 2XL | 5389942468 |
| GJC-JLC-WHT-S | Judoka Lifecycle | S | 5399188469 |
| GJC-JLC-WHT-M | Judoka Lifecycle | M | 5399188470 |
| GJC-JLC-WHT-L | Judoka Lifecycle | L | 5399188472 |
| GJC-JLC-WHT-XL | Judoka Lifecycle | XL | 5399188473 |
| GJC-JLC-WHT-2XL | Judoka Lifecycle | 2XL | 5399188474 |

## Environment Variables

Set these in Vercel project settings (Settings → Environment Variables):

| Variable | Description |
|----------|-------------|
| `PRINTFUL_API_TOKEN` | Your Printful private API token |
| `PRINTFUL_STORE_ID` | Your Printful store ID (`13936432`) |

## Webhook URL

After deploying to Vercel, your webhook endpoint will be:
```
https://your-project.vercel.app/api/webhook
```

Register this URL in ClickFunnels under:
**Settings → Integrations → Webhooks → Outgoing Endpoints**
- Event: `one-time-order.completed`
- Workspace: Georgetown Judo Club Store (167059)

## Deployment

1. Push this repo to GitHub
2. Import the repo in [vercel.com/new](https://vercel.com/new)
3. Add the two environment variables above
4. Deploy — Vercel auto-deploys on every push to `main`

