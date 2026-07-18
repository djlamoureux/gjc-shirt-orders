import axios from "axios";

// SKU -> Printful sync_variant_id mapping
const SKU_MAP = {
  // GJC Shirt - Eat Sleep Throw Repeat (white)
  "GJC-ESTR-WHT-S":   5389942464,
  "GJC-ESTR-WHT-M":   5389942465,
  "GJC-ESTR-WHT-L":   5389942466,
  "GJC-ESTR-WHT-XL":  5389942467,
  "GJC-ESTR-WHT-2XL": 5389942468,
  // GJC Shirt - Judoka Lifecycle (white)
  "GJC-JLC-WHT-S":    5399188469,
  "GJC-JLC-WHT-M":    5399188470,
  "GJC-JLC-WHT-L":    5399188472,
  "GJC-JLC-WHT-XL":   5399188473,
  "GJC-JLC-WHT-2XL":  5399188474,
};

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const PRINTFUL_TOKEN = process.env.PRINTFUL_API_TOKEN;
  const PRINTFUL_STORE_ID = process.env.PRINTFUL_STORE_ID;

  if (!PRINTFUL_TOKEN || !PRINTFUL_STORE_ID) {
    console.error("[Webhook] Missing PRINTFUL_API_TOKEN or PRINTFUL_STORE_ID env vars");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const body = req.body;

  // Validate event type
  if (body?.event_type !== "one-time-order.completed") {
    return res.status(200).json({ message: "Event ignored" });
  }

  const order = body?.data;
  if (!order?.id) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const cfOrderId = String(order.id);
  const lineItems = order.line_items ?? [];

  if (lineItems.length === 0) {
    return res.status(400).json({ error: "No line items in order" });
  }

  const item = lineItems[0];
  const sku = item?.products_variant?.sku ?? "";
  const quantity = item?.quantity ?? 1;

  const printfulVariantId = SKU_MAP[sku];
  if (!printfulVariantId) {
    console.error(`[Webhook] Unknown SKU: ${sku} for CF order ${cfOrderId}`);
    return res.status(422).json({ error: `Unknown SKU: ${sku}` });
  }

  // Build Printful order payload
  const printfulPayload = {
    external_id: cfOrderId,
    recipient: {
      name: `${order.shipping_address_first_name ?? ""} ${order.shipping_address_last_name ?? ""}`.trim(),
      address1: order.shipping_address_street_one ?? "",
      address2: order.shipping_address_street_two ?? undefined,
      city: order.shipping_address_city ?? "",
      state_code: order.shipping_address_region ?? "",
      country_code: order.shipping_address_country ?? "US",
      zip: order.shipping_address_postal_code ?? "",
      phone: order.contact?.phone_number ?? undefined,
      email: order.contact?.email_address ?? undefined,
    },
    items: [
      {
        sync_variant_id: printfulVariantId,
        quantity,
      },
    ],
  };

  try {
    const pfRes = await axios.post("https://api.printful.com/orders", printfulPayload, {
      headers: {
        Authorization: `Bearer ${PRINTFUL_TOKEN}`,
        "X-PF-Store-Id": PRINTFUL_STORE_ID,
        "Content-Type": "application/json",
      },
    });

    const printfulOrderId = pfRes.data?.result?.id;
    console.log(`[Webhook] CF order ${cfOrderId} -> Printful order ${printfulOrderId} created`);
    return res.status(200).json({ message: "Order fulfilled", printfulOrderId });
  } catch (err) {
    const errMsg = err?.response?.data ?? err?.message ?? String(err);
    console.error(`[Webhook] Printful order failed for CF order ${cfOrderId}:`, errMsg);
    return res.status(500).json({ error: "Printful order creation failed", detail: errMsg });
  }
}
