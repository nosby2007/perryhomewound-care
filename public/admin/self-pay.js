import { adminReady, auth, esc } from "/admin/admin-shared.js";

const form = document.getElementById("selfPayForm");
const amount = document.getElementById("amount");
const payerLabel = document.getElementById("payerLabel");
const payerEmail = document.getElementById("payerEmail");
const internalReference = document.getElementById("internalReference");
const expiresInDays = document.getElementById("expiresInDays");
const createBtn = document.getElementById("createBtn");
const resultBox = document.getElementById("resultBox");
const resultInvoice = document.getElementById("resultInvoice");
const resultLink = document.getElementById("resultLink");
const copyBtn = document.getElementById("copyBtn");
const refreshBtn = document.getElementById("refreshBtn");
const tbody = document.querySelector("#selfPayTable tbody");
const notice = document.getElementById("notice");

await adminReady;

async function api(url, options = {}) {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function money(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "usd").toUpperCase(),
  }).format((Number(cents) || 0) / 100);
}

function when(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

function statusBadge(status) {
  const safe = esc(status || "open");
  return `<span class="badge status-${safe}">${safe}</span>`;
}

function showNotice(message, kind = "info") {
  notice.textContent = message;
  notice.className = `notice ${kind}`;
  notice.hidden = false;
}

async function loadInvoices() {
  tbody.innerHTML = `<tr><td colspan="7" class="muted">Loading…</td></tr>`;
  try {
    const {invoices = []} = await api("/api/selfPayInvoices");
    tbody.innerHTML = invoices.map((invoice) => `
      <tr>
        <td>${esc(invoice.invoiceNumber || "—")}</td>
        <td>${esc(invoice.payerLabel || "—")}</td>
        <td>${money(invoice.amountCents, invoice.currency)}</td>
        <td>${statusBadge(invoice.status)}</td>
        <td>${when(invoice.createdAt)}</td>
        <td>${when(invoice.expiresAt)}</td>
        <td>${when(invoice.paidAt)}</td>
      </tr>`).join("") || `<tr><td colspan="7" class="muted">No self-pay payment requests yet.</td></tr>`;
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Unable to load payments.</td></tr>`;
    showNotice(error.message, "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  notice.hidden = true;
  resultBox.hidden = true;
  const dollars = Number(amount.value);
  const amountCents = Math.round(dollars * 100);
  if (!Number.isFinite(dollars) || amountCents < 100) {
    showNotice("Enter an amount of at least $1.00.", "error");
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = "Creating…";
  try {
    const created = await api("/api/createSelfPayInvoice", {
      method: "POST",
      body: JSON.stringify({
        amountCents,
        payerLabel: payerLabel.value,
        payerEmail: payerEmail.value,
        internalReference: internalReference.value,
        expiresInDays: Number(expiresInDays.value),
      }),
    });
    resultInvoice.textContent = created.invoiceNumber;
    resultLink.value = created.payUrl;
    resultBox.hidden = false;
    showNotice("Secure payment link created. The public checkout contains no clinical details.", "success");
    form.reset();
    expiresInDays.value = "7";
    await loadInvoices();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = "Create secure payment link";
  }
});

copyBtn.addEventListener("click", async () => {
  if (!resultLink.value) return;
  await navigator.clipboard.writeText(resultLink.value);
  copyBtn.textContent = "Copied";
  setTimeout(() => { copyBtn.textContent = "Copy link"; }, 1600);
});

refreshBtn.addEventListener("click", loadInvoices);
loadInvoices();
