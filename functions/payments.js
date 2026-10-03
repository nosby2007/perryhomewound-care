"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {createHash, createHmac, randomBytes, timingSafeEqual} = require("crypto");
const admin = require("firebase-admin");

const db = admin.firestore();
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

const SITE_ORIGIN = "https://perryhomewoundcare.network";
const MAX_AMOUNT_CENTS = 1000000; // $10,000 safety cap for this self-pay flow.

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendError(res, error) {
  const status = error instanceof ApiError ? error.status : 500;
  if (!(error instanceof ApiError)) console.error(error);
  res.status(status).json({error: error.message || "Unexpected error."});
}

async function requireAdminFromRequest(req) {
  const match = /^Bearer (.+)$/.exec(req.get("Authorization") || "");
  if (!match) throw new ApiError(401, "Sign in required.");

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(match[1]);
  } catch (error) {
    throw new ApiError(401, "Invalid or expired session.");
  }

  const uid = decoded.uid;
  const [adminSnap, userSnap] = await Promise.all([
    db.doc(`admins/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  const adminData = adminSnap.exists ? adminSnap.data() : {};
  const userData = userSnap.exists ? userSnap.data() : {};
  const authorized = (adminSnap.exists && adminData.active === true) ||
    (userSnap.exists && userData.active === true && userData.role === "admin");
  if (!authorized) throw new ApiError(403, "Administrator access required.");
  return uid;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Enter a valid email address.");
  }
  return email;
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function validatePaymentToken(value) {
  const token = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{32,200}$/.test(token)) {
    throw new ApiError(400, "Invalid payment link.");
  }
  return token;
}

function makeInvoiceNumber() {
  const now = new Date();
  const day = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  return `SP-${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function timestampMillis(value) {
  return value?.toMillis?.() || null;
}

async function expireIfPastDue(ref, snap) {
  const data = snap.data() || {};
  const expiresAtMs = timestampMillis(data.expiresAt);
  if (data.status === "open" && expiresAtMs && expiresAtMs <= Date.now()) {
    await ref.update({
      status: "expired",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {...data, status: "expired"};
  }
  return data;
}

async function stripePost(path, pairs, secret, idempotencyKey) {
  const body = new URLSearchParams();
  for (const [key, value] of pairs) body.append(key, String(value));
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const response = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers,
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || "Stripe request failed.";
    throw new ApiError(502, message);
  }
  return payload;
}

function parseStripeSignature(header) {
  let timestamp = null;
  const signatures = [];
  for (const part of String(header || "").split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  return {timestamp, signatures};
}

function secureHexEqual(left, right) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyStripeWebhook(rawBody, signatureHeader, secret) {
  const {timestamp, signatures} = parseStripeSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) throw new ApiError(400, "Invalid Stripe signature.");
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) {
    throw new ApiError(400, "Expired Stripe signature.");
  }
  const expected = createHmac("sha256", secret)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]))
      .digest("hex");
  if (!signatures.some((signature) => secureHexEqual(expected, signature))) {
    throw new ApiError(400, "Invalid Stripe signature.");
  }
}

async function handleCreateSelfPayInvoice(req, res) {
  try {
    if (req.method !== "POST") throw new ApiError(405, "Method not allowed.");
    const uid = await requireAdminFromRequest(req);
    const data = req.body || {};
    const amountCents = Number(data.amountCents);
    if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > MAX_AMOUNT_CENTS) {
      throw new ApiError(400, "Amount must be between $1.00 and $10,000.00.");
    }

    const payerLabel = cleanText(data.payerLabel, 120);
    const payerEmail = normalizeEmail(data.payerEmail);
    const internalReference = cleanText(data.internalReference, 160);
    const expiresInDays = Math.min(30, Math.max(1, Number(data.expiresInDays) || 7));

    const token = randomBytes(32).toString("base64url");
    const paymentRef = tokenHash(token);
    const invoiceNumber = makeInvoiceNumber();
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + expiresInDays * 86400000);

    await db.doc(`selfPayInvoices/${paymentRef}`).create({
      invoiceNumber,
      amountCents,
      currency: "usd",
      status: "open",
      payerLabel,
      payerEmail,
      internalReference,
      createdAt: now,
      createdBy: uid,
      updatedAt: now,
      updatedBy: uid,
      expiresAt,
      stripeCheckoutSessionId: null,
      stripeCheckoutUrl: null,
      stripeCheckoutExpiresAt: null,
      paidAt: null,
    });

    res.status(201).json({
      invoiceNumber,
      amountCents,
      currency: "usd",
      expiresAt: expiresAt.toMillis(),
      payUrl: `${SITE_ORIGIN}/pay?token=${encodeURIComponent(token)}`,
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleListSelfPayInvoices(req, res) {
  try {
    if (req.method !== "GET") throw new ApiError(405, "Method not allowed.");
    await requireAdminFromRequest(req);
    const snap = await db.collection("selfPayInvoices")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();
    const invoices = snap.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        invoiceNumber: d.invoiceNumber || "",
        amountCents: d.amountCents || 0,
        currency: d.currency || "usd",
        status: d.status || "open",
        payerLabel: d.payerLabel || "",
        payerEmail: d.payerEmail || "",
        internalReference: d.internalReference || "",
        createdAt: timestampMillis(d.createdAt),
        expiresAt: timestampMillis(d.expiresAt),
        paidAt: timestampMillis(d.paidAt),
      };
    });
    res.status(200).json({invoices});
  } catch (error) {
    sendError(res, error);
  }
}

async function handleGetSelfPayInvoice(req, res) {
  try {
    if (req.method !== "GET") throw new ApiError(405, "Method not allowed.");
    const token = validatePaymentToken(req.query.token);
    const paymentRef = tokenHash(token);
    const ref = db.doc(`selfPayInvoices/${paymentRef}`);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "Payment request not found or expired.");
    const data = await expireIfPastDue(ref, snap);
    res.status(200).json({
      invoiceNumber: data.invoiceNumber || "",
      amountCents: data.amountCents || 0,
      currency: data.currency || "usd",
      status: data.status || "open",
      expiresAt: timestampMillis(data.expiresAt),
      paidAt: timestampMillis(data.paidAt),
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleCreateSelfPayCheckout(req, res) {
  try {
    if (req.method !== "POST") throw new ApiError(405, "Method not allowed.");
    const token = validatePaymentToken(req.body?.token);
    const paymentRef = tokenHash(token);
    const ref = db.doc(`selfPayInvoices/${paymentRef}`);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "Payment request not found or expired.");
    const data = await expireIfPastDue(ref, snap);
    if (data.status === "paid") throw new ApiError(409, "This balance has already been paid.");
    if (data.status !== "open") throw new ApiError(409, "This payment request is no longer active.");

    const existingExpiresAt = timestampMillis(data.stripeCheckoutExpiresAt);
    if (data.stripeCheckoutUrl && existingExpiresAt && existingExpiresAt > Date.now() + 120000) {
      res.status(200).json({url: data.stripeCheckoutUrl});
      return;
    }

    const stripeKey = stripeSecretKey.value();
    if (!stripeKey) throw new ApiError(500, "Payment processing is not configured.");
    const checkoutExpiresUnix = Math.floor(Date.now() / 1000) + 35 * 60;
    const session = await stripePost("/v1/checkout/sessions", [
      ["mode", "payment"],
      ["success_url", `${SITE_ORIGIN}/pay-success`],
      ["cancel_url", `${SITE_ORIGIN}/pay?cancelled=1`],
      ["client_reference_id", paymentRef],
      ["line_items[0][price_data][currency]", "usd"],
      ["line_items[0][price_data][product_data][name]", "Perry Home Wound Care — Self-Pay Balance"],
      ["line_items[0][price_data][unit_amount]", data.amountCents],
      ["line_items[0][quantity]", 1],
      ["payment_method_types[0]", "card"],
      ["metadata[phwc_payment_ref]", paymentRef],
      ["payment_intent_data[metadata][phwc_payment_ref]", paymentRef],
      ["expires_at", checkoutExpiresUnix],
    ], stripeKey, `phwc-selfpay-${paymentRef}-${Math.floor(Date.now() / 600000)}`);

    if (!session?.id || !session?.url) throw new ApiError(502, "Stripe did not return a checkout URL.");
    const checkoutExpiresAt = admin.firestore.Timestamp.fromMillis(checkoutExpiresUnix * 1000);
    await ref.update({
      stripeCheckoutSessionId: session.id,
      stripeCheckoutUrl: session.url,
      stripeCheckoutExpiresAt: checkoutExpiresAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(200).json({url: session.url});
  } catch (error) {
    sendError(res, error);
  }
}

async function recordPaidCheckout(event) {
  const session = event.data?.object || {};
  if (session.payment_status !== "paid") return;
  const paymentRef = session.metadata?.phwc_payment_ref || session.client_reference_id;
  if (!/^[a-f0-9]{64}$/.test(String(paymentRef || ""))) return;

  const invoiceRef = db.doc(`selfPayInvoices/${paymentRef}`);
  const eventRef = db.doc(`selfPayPaymentEvents/${event.id}`);
  await db.runTransaction(async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists) {
      tx.set(eventRef, {
        type: event.type,
        status: "unmatched",
        checkoutSessionId: session.id || null,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }
    const invoice = invoiceSnap.data() || {};
    const amountMatches = Number(session.amount_total) === Number(invoice.amountCents);
    const currencyMatches = String(session.currency || "").toLowerCase() === String(invoice.currency || "usd").toLowerCase();
    if (!amountMatches || !currencyMatches) {
      tx.set(eventRef, {
        type: event.type,
        status: "amount_mismatch",
        checkoutSessionId: session.id || null,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    const duplicate = invoice.status === "paid" && invoice.stripeCheckoutSessionId !== session.id;
    if (invoice.status !== "paid") {
      tx.update(invoiceRef, {
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        stripeCheckoutSessionId: session.id || invoice.stripeCheckoutSessionId || null,
        stripePaymentIntentId: session.payment_intent || null,
        stripeCustomerId: session.customer || null,
        stripePaymentStatus: session.payment_status || null,
        lastStripeEventId: event.id,
      });
    } else if (duplicate) {
      tx.update(invoiceRef, {
        duplicatePaymentDetected: true,
        duplicatePaymentDetectedAt: admin.firestore.FieldValue.serverTimestamp(),
        duplicateStripeCheckoutSessionId: session.id || null,
        lastStripeEventId: event.id,
      });
    }

    tx.set(eventRef, {
      type: event.type,
      status: duplicate ? "duplicate" : "processed",
      paymentRef,
      checkoutSessionId: session.id || null,
      paymentIntentId: session.payment_intent || null,
      amountTotal: session.amount_total || null,
      currency: session.currency || null,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function handleStripeWebhook(req, res) {
  try {
    if (req.method !== "POST") throw new ApiError(405, "Method not allowed.");
    if (!Buffer.isBuffer(req.rawBody)) throw new ApiError(400, "Raw request body unavailable.");
    const secret = stripeWebhookSecret.value();
    if (!secret) throw new ApiError(500, "Webhook verification is not configured.");
    verifyStripeWebhook(req.rawBody, req.get("stripe-signature"), secret);
    const event = JSON.parse(req.rawBody.toString("utf8"));

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await recordPaidCheckout(event);
    }
    res.status(200).json({received: true});
  } catch (error) {
    sendError(res, error);
  }
}

exports.createSelfPayInvoice = onRequest(
    {invoker: "private"}, handleCreateSelfPayInvoice);
exports.listSelfPayInvoices = onRequest(
    {invoker: "private"}, handleListSelfPayInvoices);
exports.getSelfPayInvoice = onRequest(
    {invoker: "private"}, handleGetSelfPayInvoice);
exports.createSelfPayCheckout = onRequest(
    {invoker: "private", secrets: [stripeSecretKey]}, handleCreateSelfPayCheckout);
exports.stripeWebhook = onRequest(
    {invoker: "private", secrets: [stripeWebhookSecret]}, handleStripeWebhook);
