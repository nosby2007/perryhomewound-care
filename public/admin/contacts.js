import { adminReady, db, esc, fmt, badge, mailto } from "/admin/admin-shared.js";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const tbody = document.querySelector("#tblContacts tbody");
const f = document.getElementById("fContactStatus");
const q = document.getElementById("qContacts");

await adminReady;

function row(id,d){
  const email = d.email || "";
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${esc(d.name||"-")}</td>
    <td>${esc(email)} / ${esc(d.phone||"-")}</td>
    <td>${esc(d.reason||"-")}</td>
    <td>${badge(d.status||'new')}</td>
    <td class="actions">
      <a class="btn" href="${mailto(email,'Regarding your inquiry','Hello,')}" target="_blank">Message</a>
      <button class="btn" data-act="set" data-id="${id}" data-val="read">Mark read</button>
      <button class="btn" data-act="set" data-id="${id}" data-val="archived">Archive</button>
    </td>
  </tr>`;
}
function bind(){
  const qy = query(collection(db,"contacts"), orderBy("createdAt","desc"), limit(150));
  onSnapshot(qy, (snap)=>{
    const rows=[];
    snap.forEach(s=>{
      const d=s.data();
      if (f.value && d.status !== f.value) return;
      if (q.value){
        const hay = `${d.name||""} ${d.email||""} ${d.phone||""} ${d.reason||""}`.toLowerCase();
        if(!hay.includes(q.value.toLowerCase())) return;
      }
      rows.push(row(s.id,d));
    });
    tbody.innerHTML = rows.join("") || `<tr><td colspan="6" class="muted">No results.</td></tr>`;
  });
}
document.addEventListener("click", async (e)=>{
  const b = e.target.closest("[data-act='set']"); if(!b) return;
  await updateDoc(doc(db,"contacts", b.dataset.id), { status: b.dataset.val });
});
bind();
