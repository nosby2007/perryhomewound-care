import { adminReady, auth, db, esc, fmt, badge, mailto } from "/admin/admin-shared.js";
import {
  addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy,
  query, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const tbody = document.querySelector("#tblRef tbody");
const f = document.getElementById("fRefStatus");
const q = document.getElementById("qRef");

await adminReady;

function row(id,d){
  const email = d.refEmail || "";
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${esc(d.refName||"-")}<br/><span class="small muted">${esc(d.refOrg||"")}</span></td>
    <td>${esc(d.patientName||"-")}</td>
    <td>${esc(d.diagnosis||"-")}</td>
    <td>${badge(d.status||'new')}</td>
    <td class="actions">
      <a class="btn" href="${mailto(email,'Regarding your referral','Hello,')}" target="_blank">Message</a>
      <button class="btn" data-act="set" data-id="${id}" data-val="reviewed">Reviewed</button>
      <button class="btn" data-act="set" data-id="${id}" data-val="contacted">Contacted</button>
      <button class="btn" data-act="set" data-id="${id}" data-val="converted">Converted</button>
      <button class="btn" data-act="set" data-id="${id}" data-val="archived">Archive</button>
      <button class="btn" data-act="makeTask" data-id="${id}">Convert to Task</button>
    </td>
  </tr>`;
}
function bind(){
  const qy = query(collection(db,"patientReferal"), orderBy("createdAt","desc"), limit(150));
  onSnapshot(qy, (snap)=>{
    const rows=[];
    snap.forEach(s=>{
      const d=s.data();
      if (f.value && (d.status||'new') !== f.value) return;
      if (q.value){
        const hay = `${d.refName||""} ${d.refEmail||""} ${d.patientName||""} ${d.diagnosis||""}`.toLowerCase();
        if(!hay.includes(q.value.toLowerCase())) return;
      }
      rows.push(row(s.id,d));
    });
    tbody.innerHTML = rows.join("") || `<tr><td colspan="6" class="muted">No results.</td></tr>`;
  });
}
document.addEventListener("click", async (e)=>{
  const b = e.target.closest("[data-act='set']"); if(!b) return;
  await updateDoc(doc(db,"patientReferal", b.dataset.id), { status: b.dataset.val });
});
bind();

// Handler:
document.addEventListener("click", async (e)=>{
  const b = e.target.closest("[data-act='makeTask']"); if(!b) return;
  const id = b.dataset.id;
  const snap = await getDoc(doc(db,"patientReferal", id));
  if(!snap.exists()) return alert("Referral not found");
  const r = snap.data();
  // Pré-remplissage minimal: assignation manuelle après
  await addDoc(collection(db,"tasks"), {
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || "",
    source: { type:"referral", id },
    patient: { name: r.patientName||"", phone: r.patientPhone||"", address: r.patientArea||"", email: "" },
    service: { title: r.serviceTitle||"", slug: r.serviceSlug||"" },
    scheduledAt: null,
    status: "assigned",
    assignedTo: "", // à choisir plus tard
    notes: r.notes||""
  });
  await updateDoc(doc(db,"patientReferal", id), { status: "converted" });
  alert("Task created from referral.");
});
