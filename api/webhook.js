import crypto from "node:crypto";
import axios from "axios";

const PRINTFUL_API_URL = "https://api.printful.com";
const SIGNATURE_TOLERANCE_SECONDS = 600;

/**
 * ClickFunnels SKU -> Printful sync variant ID.
 * IDs come from the active replacement-quality Printful products in store 13936432.
 */
export const SKU_MAP = {
  // GJC TShirt - Eat Sleep Throw Repeat 2
  "GJC-ESTR-WHT-S": 5507237633,
  "GJC-ESTR-WHT-M": 5507237634,
  "GJC-ESTR-WHT-L": 5507237635,
  "GJC-ESTR-WHT-XL": 5507237636,
  "GJC-ESTR-WHT-2XL": 5507237637,
  "GJC-ESTR-WHT-3XL": 5507237638,

  // GJC TShirt - Judoka Lifecycle 2
  "GJC-JLC-WHT-S": 5507245145,
  "GJC-JLC-WHT-M": 5507245146,
  "GJC-JLC-WHT-L": 5507245147,
  "GJC-JLC-WHT-XL": 5507245148,
  "GJC-JLC-WHT-2XL": 5507245149,
  "GJC-JLC-WHT-3XL": 5507245150,

  // Georgetown Judo Club TShirt - Judo Kanji the Gentle Way 2
  "GJC-JKGW-BLK-S": 5507135814,
  "GJC-JKGW-BLK-M": 5507135815,
  "GJC-JKGW-BLK-L": 5507135816,
  "GJC-JKGW-BLK-XL": 5507135817,
  "GJC-JKGW-BLK-2XL": 5507135818,
  "GJC-JKGW-BLK-3XL": 5507135819,
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function verifySignature({ rawBody, signature, timestamp, secret, now = Date.now() }) {
  if (!rawBody || !signature || !timestamp || !secret) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Math.floor(now / 1000) - timestampNumber) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const received = String(signature);

  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"));
}

export function buildItems(lineItems) {
  const unmappedSkus = [];
  const items = [];

  for (const lineItem of lineItems ?? []) {
    const sku = lineItem?.products_variant?.sku?.trim() ?? "";
    const quantity = Number(lineItem?.quantity ?? 1);
    const syncVariantId = SKU_MAP[sku];

    if (!syncVariantId) {
      unmappedSkus.push(sku || "(missing SKU)");
      continue;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`Invalid quantity for SKU ${sku}`);
    }
    items.push({ sync_variant_id: syncVariantId, quantity });
  }

  return { items, unmappedSkus };
}

function printfulHeaders(token, storeId) {
  return {
    Authorization: `Bearer ${token}`,
    "X-PF-Store-Id": storeId,
    "Content-Type": "application/json",
  };
}

async function findPrintfulOrderByExternalId(externalId, headers) {
  try {
    const response = await axios.get(`${PRINTFUL_API_URL}/orders/@${externalId}`, { headers });
    return response.data?.result ?? null;
  } catch (error) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
}

function toRecipient(order) {
  return {
    name: `${order.shipping_address_first_name ?? ""} ${order.shipping_address_last_name ?? ""}`.trim(),
    address1: order.shipping_address_street_one ?? "",
    address2: order.shipping_address_street_two || undefined,
    city: order.shipping_address_city ?? "",
    state_code: order.shipping_address_region ?? "",
    country_code: order.shipping_address_country ?? "US",
    zip: order.shipping_address_postal_code ?? "",
    phone: order.contact?.phone_number || order.shipping_address_phone_number || undefined,
    email: order.contact?.email_address || undefined,
  };
}

function logPrintfulFailure(cfOrderId, error) {
  const detail = error?.response?.data ?? error?.message ?? String(error);
  console.error(`[Webhook] Printful request failed for ClickFunnels order ${cfOrderId}`, detail);
}

/**
 * Vercel serverless webhook for paid ClickFunnels orders.
 * Printful external_id provides durable, database-free duplicate protection.
 */
export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", service: "gjc-shirt-orders" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const printfulToken = process.env.PRINTFUL_API_TOKEN;
  const printfulStoreId = process.env.PRINTFUL_STORE_ID;
  const clickfunnelsWebhookSecret = process.env.CLICKFUNNELS_WEBHOOK_SECRET;
  if (!printfulToken || !printfulStoreId || !clickfunnelsWebhookSecret) {
    console.error("[Webhook] Required Vercel environment variables are missing");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  let rawBody;
  let body;
  try {
    rawBody = (await readRawBody(req)).toString("utf8");
    body = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const signature = req.headers["x-webhook-clickfunnels-signature"];
  const timestamp = req.headers["x-webhook-clickfunnels-timestamp"];
  if (!verifySignature({
    rawBody,
    signature: Array.isArray(signature) ? signature[0] : signature,
    timestamp: Array.isArray(timestamp) ? timestamp[0] : timestamp,
    secret: clickfunnelsWebhookSecret,
  })) {
    console.warn("[Webhook] Rejected an invalid ClickFunnels webhook signature");
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  if (body?.event_type !== "one-time-order.completed") {
    return res.status(200).json({ message: "Event ignored" });
  }

  const order = body?.data;
  if (!order?.id) {
    return res.status(400).json({ error: "Invalid order payload" });
  }

  const cfOrderId = String(order.id);
  let mapped;
  try {
    mapped = buildItems(order.line_items);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (mapped.items.length === 0) {
    console.error(`[Webhook] No mapped SKUs in ClickFunnels order ${cfOrderId}`);
    return res.status(422).json({ error: "No mapped fulfillment SKU" });
  }
  if (mapped.unmappedSkus.length > 0) {
    console.error(`[Webhook] Unmapped SKUs in ClickFunnels order ${cfOrderId}: ${mapped.unmappedSkus.join(", ")}`);
    return res.status(422).json({ error: "Order contains an unmapped fulfillment SKU" });
  }

  const headers = printfulHeaders(printfulToken, printfulStoreId);
  try {
    const existingOrder = await findPrintfulOrderByExternalId(cfOrderId, headers);
    if (existingOrder) {
      console.log(`[Webhook] Duplicate ClickFunnels order ${cfOrderId}; Printful order ${existingOrder.id} already exists`);
      return res.status(200).json({
        message: "Order already fulfilled",
        duplicate: true,
        printfulOrderId: existingOrder.id,
      });
    }

    const response = await axios.post(
      `${PRINTFUL_API_URL}/orders`,
      {
        external_id: cfOrderId,
        recipient: toRecipient(order),
        items: mapped.items,
      },
      { headers },
    );

    const printfulOrderId = response.data?.result?.id;
    console.log(`[Webhook] ClickFunnels order ${cfOrderId} created Printful order ${printfulOrderId}`);
    return res.status(200).json({ message: "Order fulfilled", printfulOrderId });
  } catch (error) {
    // Printful enforces a unique external_id. Re-check it in case a retry raced the first request.
    if (error?.response?.status === 400 || error?.response?.status === 409) {
      try {
        const existingOrder = await findPrintfulOrderByExternalId(cfOrderId, headers);
        if (existingOrder) {
          console.log(`[Webhook] Duplicate ClickFunnels order ${cfOrderId} reconciled to Printful order ${existingOrder.id}`);
          return res.status(200).json({
            message: "Order already fulfilled",
            duplicate: true,
            printfulOrderId: existingOrder.id,
          });
        }
      } catch (lookupError) {
        logPrintfulFailure(cfOrderId, lookupError);
      }
    }

    logPrintfulFailure(cfOrderId, error);
    return res.status(502).json({ error: "Printful order creation failed" });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
