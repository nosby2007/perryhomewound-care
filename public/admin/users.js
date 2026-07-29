import { adminReady, db, esc, fmt } from "/admin/admin-shared.js";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const tbody = document.querySelector("#tblUsers tbody");
const q = document.getElementById("qUsers");

await adminReady;

function row(id,d){
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${esc(d.name||d.displayName||"-")}</td>
    <td>${esc(d.email||"-")}</td>
    <td>${esc(d.role||"-")}</td>
    <td class="actions">
      <button class="btn" data-act="role" data-id="${id}" data-val="admin">Make admin</button>
      <button class="btn" data-act="role" data-id="${id}" data-val="nurse">Make nurse</button>
      <button class="btn" data-act="role" data-id="${id}" data-val="disabled">Disable</button>
    </td>
  </tr>`;
}
function bind(){
  const qy = query(collection(db,"users"), orderBy("createdAt","desc"), limit(200));
  onSnapshot(qy, (snap)=>{
    const rows=[];
    snap.forEach(s=>{
      const d=s.data()||{};
      if (q.value){
        const hay = `${d.name||d.displayName||""} ${d.email||""} ${d.role||""}`.toLowerCase();
        if(!hay.includes(q.value.toLowerCase())) return;
      }
      rows.push(row(s.id,d));
    });
    tbody.innerHTML = rows.join("") || `<tr><td colspan="5" class="muted">No users.</td></tr>`;
  });
}
document.addEventListener("click", async (e)=>{
  const b = e.target.closest("[data-act='role']"); if(!b) return;
  await updateDoc(doc(db,"users", b.dataset.id), { role: b.dataset.val });
});
bind();
