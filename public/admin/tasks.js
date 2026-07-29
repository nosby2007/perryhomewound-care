import { adminReady, auth, db, esc, fmt, badge } from "/admin/admin-shared.js";
import {
  collection, query, orderBy, limit, onSnapshot,
  updateDoc, doc, where, Timestamp, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const tbody = document.querySelector("#tblTasks tbody");
const fTaskStatus = document.getElementById("fTaskStatus");
const qTasks = document.getElementById("qTasks");
const dlgTask = document.getElementById("dlgTask");
const btnAddTask = document.getElementById("btnAddTask");
const form = document.getElementById("createTaskForm");

const ctAssignedToSel = document.getElementById("ctAssignedToSel");
const ctStatus = document.getElementById("ctStatus");
const ctSTitle = document.getElementById("ctSTitle");
const ctSSlug = document.getElementById("ctSSlug");
const servicesDatalist = document.getElementById("servicesList");

const slugify = (x)=> String(x||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

await adminReady;

// ---- Services datalist (with fallback) ----
const LOCAL_SERVICES = [
  { slug:'comprehensive-wound-management', title:'Comprehensive Wound Management' },
  { slug:'ostomy-care-and-education',     title:'Ostomy Care & Education' },
  { slug:'telewound-prevention-programs', title:'Tele-Wound & Prevention Programs' }
];
let SERVICES_CACHE = [...LOCAL_SERVICES];

async function loadServices(){
  try{
    const qy = query(collection(db, "services"));
    const snap = await getDocs(qy);
    const arr=[];
    snap.forEach(s=>{
      const d=s.data()||{};
      if(d.title){ arr.push({title:String(d.title), slug:String(d.slug||slugify(d.title))}) }
    });
    if(arr.length) SERVICES_CACHE=arr;
  }catch(e){
    console.warn("[tasks] services read failed, using fallback:", e?.message||e);
  }
  servicesDatalist.innerHTML = SERVICES_CACHE
    .map(s=>`<option value="${esc(s.title)}" data-slug="${esc(s.slug)}"></option>`)
    .join("");
}
ctSTitle?.addEventListener("input", ()=>{
  const val = ctSTitle.value.trim().toLowerCase();
  const hit = SERVICES_CACHE.find(s=> s.title.toLowerCase()===val);
  ctSSlug.value = hit ? hit.slug : slugify(val);
});

// ---- Clinicians (users) ----
const NURSE_ROLES = ['nurse','lpn','np','caregiver'];
async function loadClinicians(){
  const qy = query(collection(db,"users"), where("active","==",true));
  const snap = await getDocs(qy);
  const arr=[];
  snap.forEach(docSnap=>{
    const d = docSnap.data()||{};
    const role = String(d.role||"").toLowerCase();
    if(!NURSE_ROLES.includes(role)) return;
    arr.push({ uid:docSnap.id, label: d.displayName||d.email||docSnap.id, role });
  });
  arr.sort((a,b)=> a.label.localeCompare(b.label));
  ctAssignedToSel.innerHTML =
    `<option value="">Select clinician…</option>` +
    arr.map(u=>`<option value="${esc(u.uid)}">${esc(u.label)} — ${u.role.toUpperCase()}</option>`).join("");
}

// ---- Open create-task dialog ----
btnAddTask.addEventListener("click", ()=>{
  form?.reset();
  ctStatus.textContent = "";
  dlgTask.showModal();
});

// ❗ IMPORTANT: listen on the DIALOG, not the form
dlgTask.addEventListener("close", async ()=>{
  if (dlgTask.returnValue !== "save") return;   // user cancelled

  // Collect values
  const assignedTo = ctAssignedToSel.value.trim();
  const when = document.getElementById("ctWhen").value.trim();
  const pName = document.getElementById("ctPName").value.trim();
  const pPhone = document.getElementById("ctPPhone").value.trim();
  const pAddr = document.getElementById("ctPAddr").value.trim();
  const sTitle = ctSTitle.value.trim();
  const sSlug  = (ctSSlug.value.trim() || slugify(sTitle));
  const srcType= document.getElementById("ctSrcType").value;
  const srcId  = document.getElementById("ctSrcId").value.trim();
  const notes  = document.getElementById("ctNotes").value.trim();

  if(!assignedTo || !pName){
    ctStatus.textContent = "Assignee and patient name are required.";
    return;
  }

  let scheduledAt=null;
  if(when){
    const d = new Date(when.replace(" ","T"));
    if(!isNaN(d.getTime())) scheduledAt = Timestamp.fromDate(d);
  }

  const task = {
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || "",
    source: { type: srcType||"manual", id: srcId||"" },
    patient: { name: pName, phone: pPhone, address: pAddr, email: "" },
    service: { title: sTitle, slug: sSlug },
    scheduledAt,
    status: "assigned",
    assignedTo,           // must be the clinician UID (rules depend on this)
    notes
  };

  try{
    ctStatus.textContent = "Creating…";
    const ref = await addDoc(collection(db,"tasks"), task);
    console.log("[tasks] created", ref.id);
    ctStatus.textContent = "✅ Task created.";
  }catch(err){
    console.error("[tasks] addDoc error:", err);
    ctStatus.textContent = "⛔ " + (err.message||"Failed");
  }
});

// ---- Table rendering & live binding ----
function row(id,d){
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${fmt(d.scheduledAt)}</td>
    <td>${esc(d.patient?.name||"-")}</td>
    <td>${esc(d.service?.title||d.service?.slug||"-")}</td>
    <td>${esc(d.assignedTo||"-")}</td>
    <td>${badge(d.status||"assigned")}</td>
    <td class="actions">
      <button class="btn" data-act="set" data-id="${id}" data-val="assigned">Assign</button>
      <button class="btn" data-act="set" data-id="${id}" data-val="in_progress">Start</button>
      <button class="btn" data-act="set" data-id="${id}" data-val="done">Done</button>
    </td>
  </tr>`;
}

function bind(){
  const qy = query(collection(db,"tasks"), orderBy("createdAt","desc"), limit(150));
  onSnapshot(qy, (snap)=>{
    const rows=[];
    snap.forEach(s=>{
      const d=s.data();
      if (fTaskStatus.value && d.status !== fTaskStatus.value) return;
      if (qTasks.value){
        const hay = `${d.patient?.name||""} ${d.service?.title||d.service?.slug||""} ${d.assignedTo||""}`.toLowerCase();
        if(!hay.includes(qTasks.value.toLowerCase())) return;
      }
      rows.push(row(s.id,d));
    });
    tbody.innerHTML = rows.join("") || `<tr><td colspan="7" class="muted">No tasks.</td></tr>`;
  }, (err)=>{
    console.error("[tasks] onSnapshot error:", err);
    tbody.innerHTML = `<tr><td colspan="7" style="color:#b91c1c">${esc(err.message||"Permission denied / Index needed")}</td></tr>`;
  });
}

document.addEventListener("click", async (e)=>{
  const b = e.target.closest("[data-act]"); if(!b) return;
  const id = b.dataset.id; const val=b.dataset.val;
  try{
    await updateDoc(doc(db,"tasks",id), { status: val, lastUpdatedAt: serverTimestamp() });
  }catch(err){
    console.error("[tasks] update error:", err);
    alert("Update failed: " + (err.message||err.code||""));
  }
});

// init
await loadServices();
await loadClinicians();
bind();
