import { adminReady, db, esc, fmt, badge } from "/admin/admin-shared.js";
import { collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const tbody = document.querySelector("#tblBookings tbody");
const statusFilter = document.getElementById("fBookingStatus");
const searchInput = document.getElementById("qBookings");
let bookings = [];

await adminReady;

const text = (v) => String(v ?? "").trim();
const statusOf = (d) => text(d.intakeStatus || d.status || "pending").toLowerCase();
const scheduledLabel = (v) => v?.toDate?.()?.toLocaleString?.() || (v ? new Date(v).toLocaleString() : "—");
const payerOf = (d) => text(d.primaryPayer || d.insurance?.primaryPayer || d.insurance?.payer || "");
const ownerOf = (d) => text(d.assignedToLabel || d.assignedTo || d.intakeOwner || "");
const patientName = (d) => text(d.patient?.name || [d.patient?.firstName,d.patient?.lastName].filter(Boolean).join(" ")) || "Unnamed request";

function renderMetrics(){
  const count = (statuses) => bookings.filter(d => statuses.includes(statusOf(d))).length;
  document.getElementById("mPending").textContent = count(["pending","new"]);
  document.getElementById("mNeedsInfo").textContent = count(["needs_information"]);
  document.getElementById("mInsurance").textContent = count(["insurance_verification"]);
  document.getElementById("mReady").textContent = count(["ready_to_schedule"]);
  document.getElementById("mScheduled").textContent = count(["scheduled"]);
}

function row(id,d){
  const name = patientName(d);
  const email = text(d.contact?.email);
  const phone = text(d.contact?.phone);
  const service = text(d.serviceTitle || d.serviceSlug || "Wound care request");
  const payer = payerOf(d) || "Not entered";
  const owner = ownerOf(d) || "Unassigned";
  const status = statusOf(d);
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td class="patient-cell"><strong>${esc(name)}</strong><span>${esc(email || phone || "No contact listed")}</span></td>
    <td>${esc(service)}</td>
    <td>${esc(payer)}</td>
    <td>${badge(status)}</td>
    <td>${esc(owner)}</td>
    <td>${esc(scheduledLabel(d.scheduledAt))}</td>
    <td><div class="booking-actions"><a class="btn primary" href="/admin/bookingDetails.html?id=${encodeURIComponent(id)}">Open intake</a></div></td>
  </tr>`;
}

function render(){
  renderMetrics();
  const needle = searchInput.value.trim().toLowerCase();
  const wanted = statusFilter.value;
  const rows = bookings.filter(d => {
    if(wanted && statusOf(d) !== wanted) return false;
    if(!needle) return true;
    const hay = [patientName(d),d.contact?.email,d.contact?.phone,d.serviceTitle,d.serviceSlug,payerOf(d),ownerOf(d),statusOf(d)].join(" ").toLowerCase();
    return hay.includes(needle);
  }).map(d => row(d.id,d));
  tbody.innerHTML = rows.join("") || `<tr><td colspan="8" class="muted">No bookings match this intake view.</td></tr>`;
}

const qy = query(collection(db,"bookings"), orderBy("createdAt","desc"), limit(200));
onSnapshot(qy, snap => {
  bookings = snap.docs.map(s => ({id:s.id,...(s.data()||{})}));
  render();
}, error => {
  console.error("[bookings]",error);
  tbody.innerHTML = `<tr><td colspan="8" class="muted">Unable to load booking intake queue.</td></tr>`;
});

statusFilter.addEventListener("change",render);
searchInput.addEventListener("input",render);
