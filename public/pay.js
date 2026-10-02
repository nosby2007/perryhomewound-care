const token = new URLSearchParams(window.location.search).get("token") || "";
const cancelled = new URLSearchParams(window.location.search).get("cancelled") === "1";
const state = document.getElementById("state");
const payPanel = document.getElementById("payPanel");
const invoiceNumber = document.getElementById("invoiceNumber");
const amount = document.getElementById("amount");
const expiresAt = document.getElementById("expiresAt");
const payBtn = document.getElementById("payBtn");
const helpPanel = document.getElementById("helpPanel");
let paymentToken = token;

if (token) history.replaceState({}, "", "/pay");

function money(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "usd").toUpperCase(),
  }).format((Number(cents) || 0) / 100);
}

function setState(message, kind = "info") {
  state.textContent = message;
  state.className = `state ${kind}`;
  state.hidden = false;
}

async function loadInvoice() {
  if (!paymentToken) {
    payPanel.hidden = true;
    helpPanel.hidden = false;
    if (cancelled) setState("Checkout was cancelled. Reopen the secure payment link PHWC sent you to try again.", "info");
    return;
  }

  try {
    const response = await fetch(`/api/selfPayInvoice?token=${encodeURIComponent(paymentToken)}`, {
      headers: {Accept: "application/json"},
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load this payment request.");

    invoiceNumber.textContent = data.invoiceNumber || "—";
    amount.textContent = money(data.amountCents, data.currency);
    expiresAt.textContent = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : "—";
    payPanel.hidden = false;
    helpPanel.hidden = true;

    if (data.status === "paid") {
      payBtn.hidden = true;
      setState("This balance has already been paid. Thank you.", "success");
    } else if (data.status !== "open") {
      payBtn.hidden = true;
      setState("This payment request is no longer active. Please contact Perry Home Wound Care if you need a new link.", "info");
    }
  } catch (error) {
    payPanel.hidden = true;
    helpPanel.hidden = false;
    setState(error.message, "error");
  }
}

payBtn.addEventListener("click", async () => {
  payBtn.disabled = true;
  payBtn.textContent = "Opening secure checkout…";
  try {
    const response = await fetch("/api/createSelfPayCheckout", {
      method: "POST",
      headers: {"Content-Type": "application/json", Accept: "application/json"},
      body: JSON.stringify({token: paymentToken}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to start secure checkout.");
    if (!data.url) throw new Error("Secure checkout URL was not returned.");
    window.location.assign(data.url);
  } catch (error) {
    setState(error.message, "error");
    payBtn.disabled = false;
    payBtn.textContent = "Pay securely";
  }
});

loadInvoice();
