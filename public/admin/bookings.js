import { adminReady, db, esc, fmt, badge, mailto } from "/admin/admin-shared.js";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const tbody = document.querySelector("#tblBookings tbody");
const f = document.getElementById("fBookingStatus");
const q = document.getElementById("qBookings");

await adminReady;

function row(id, d){
  const email = d.contact?.email || "";
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${esc(d.patient?.name || "-")}</td>
    <td>${esc(email || d.contact?.phone || "-")}</td>
    <td>${esc(d.serviceTitle || d.serviceSlug || "-")}</td>
    <td>${badge(d.status || 'pending')}</td>
    <td class="actions">
      <a class="btn" href="/admin/bookingDetails.html?id=${encodeURIComponent(id)}">Details</a>
      <a class="btn" href="${mailto(email,'About your booking','Hello,')}" target="_blank">Message</a>
      <button class="btn" data-act="plan" data-id="${id}">Plan</button>
    </td>
  </tr>`;
}

function bind(){
  const qy = query(collection(db,"bookings"), orderBy("createdAt","desc"), limit(150));
  onSnapshot(qy, (snap)=>{
    const rows=[];
    snap.forEach(s=>{
      const d=s.data();
      if (f.value && d.status !== f.value) return;
      if (q.value){
        const hay = `${d.patient?.name||""} ${d.contact?.email||""} ${(d.serviceTitle||d.serviceSlug||"")}`.toLowerCase();
        if (!hay.includes(q.value.toLowerCase())) return;
      }
      rows.push(row(s.id, d));
    });
    tbody.innerHTML = rows.join("") || `<tr><td colspan="6" class="muted">No results.</td></tr>`;
  });
}

document.addEventListener("click", async (e)=>{
  const b = e.target.closest("[data-act='plan']"); if(!b) return;
  const val = prompt("Enter scheduled date/time (YYYY-MM-DD HH:mm, local):"); if(!val) return;
  const d = new Date(val.replace(" ","T"));
  if (isNaN(d)) { alert("Invalid date/time"); return; }
  await updateDoc(doc(db,"bookings", b.dataset.id), {
    scheduledAt: Timestamp.fromDate(d),
    status: "scheduled"
  });
});

bind();
