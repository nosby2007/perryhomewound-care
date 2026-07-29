import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore, collection, query, orderBy, limit, onSnapshot,
  updateDoc, doc, where, Timestamp, getDocs, addDoc, serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";


// ----- Firebase config -----
const firebaseConfig = {
  apiKey: "AIzaSyCdIpeMxhFMRpzNxmngoP3QY8ZZl2ABG_s",
  authDomain: "credential-4f22b.firebaseapp.com",
  projectId: "credential-4f22b",
  storageBucket: "credential-4f22b.firebasestorage.app",
  messagingSenderId: "107240797765",
  appId: "1:107240797765:web:9ae5b37760081911ad952c",
  measurementId: "G-XKYX4WC53E"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ----- Helpers -----
const esc = (x)=> String(x ?? "").replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#039;' }[m]));
const fmt = (ts)=> ts?.toDate?.()?.toLocaleString?.() || "-";
const slugify = (x)=> String(x||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
function mailto(to, subject, body){ const u = new URL("mailto:"+(to||"")); if(subject)u.searchParams.set("subject",subject); if(body)u.searchParams.set("body",body); return u.toString(); }
function badge(st){ return `<span class="badge status-${esc(st||'new')}">${esc(st||'new')}</span>`; }

// ----- DOM -----
document.getElementById("yr").textContent = new Date().getFullYear();
const who = document.getElementById("who");
const logoutBtn = document.getElementById("logoutBtn");

// Sidebar nav → switch panels
document.getElementById("snav").addEventListener("click",(e)=>{
  const btn = e.target.closest(".sitem"); if(!btn) return;
  document.querySelectorAll(".sitem").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(btn.dataset.target).classList.add("active");
});

function row(id,d){
  const email = d.contact?.email || "";
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${esc(d.patient?.name||"-")}</td>
    <td>${esc(email||d.contact?.phone||"-")}</td>
    <td>${esc(d.serviceTitle||d.serviceSlug||"-")}</td>
    <td>${badge(d.status||'pending')}</td>
    <td class="actions">
      <button class="btn" data-act="details" data-id="${id}">Details</button>
      <a class="btn" href="${mailto(email,'About your booking','Hello,')}" target="_blank">Message</a>
      <button class="btn" data-act="plan" data-id="${id}">Plan</button>
    </td>
  </tr>`;
}


// Tables
const tbodyTasks     = document.querySelector("#tblTasks tbody");
const tbodyBookings  = document.querySelector("#tblBookings tbody");
const tbodyContacts  = document.querySelector("#tblContacts tbody");
const tbodyRef       = document.querySelector("#tblRef tbody");
const tbodyUsers     = document.querySelector("#tblUsers tbody");

// Filters
const fTaskStatus    = document.getElementById("fTaskStatus");
const qTasks         = document.getElementById("qTasks");
const fBookingStatus = document.getElementById("fBookingStatus");
const qBookings      = document.getElementById("qBookings");
const fContactStatus = document.getElementById("fContactStatus");
const qContacts      = document.getElementById("qContacts");
const fRefStatus     = document.getElementById("fRefStatus");
const qRef           = document.getElementById("qRef");
const qUsers         = document.getElementById("qUsers");

// KPIs
const kBookings = document.getElementById("kBookings");
const kBookingsMeta = document.getElementById("kBookingsMeta");
const kContacts = document.getElementById("kContacts");
const kContactsMeta = document.getElementById("kContactsMeta");
const kRef = document.getElementById("kRef");
const kRefMeta = document.getElementById("kRefMeta");

// Modals
const dlgTask = document.getElementById("dlgTask");
const createTaskForm = document.getElementById("createTaskForm");
const ctAssignedToSel = document.getElementById("ctAssignedToSel");
const ctStatus = document.getElementById("ctStatus");
const ctSTitle = document.getElementById("ctSTitle");
const ctSSlug  = document.getElementById("ctSSlug");
const servicesDatalist= document.getElementById("servicesList");
document.getElementById("btnAddTask").addEventListener("click", ()=>{ createTaskForm.reset(); ctStatus.textContent=""; dlgTask.showModal(); });

// JSON viewer
const modal = document.getElementById("jsonModal");
const jsonPre = document.getElementById("jsonPre");
document.getElementById("closeModal").addEventListener("click", ()=> modal.close());
function showJSON(id, data){ jsonPre.textContent = JSON.stringify({id, ...data}, null, 2); modal.showModal(); }

const dlg = document.getElementById("dlgBookingDetails");
const dlgTitle = document.getElementById("dlgTitle");
const dlgBody  = document.getElementById("dlgBody");

document.addEventListener("click", async (e)=>{
  // existing handlers...
  const detBtn = e.target.closest("[data-act='details']");
  if (detBtn) {
    const id = detBtn.dataset.id;
    await openBookingDetails(id);
  }
});

// Services list (datalist)
const LOCAL_SERVICES = [
  { slug:'comprehensive-wound-management', title:'Comprehensive Wound Management' },
  { slug:'ostomy-care-and-education',     title:'Ostomy Care & Education' },
  { slug:'telewound-prevention-programs', title:'Tele-Wound & Prevention Programs' }
];
let SERVICES_CACHE = [...LOCAL_SERVICES];
async function loadServices(){
  try{
    const qy = query(collection(db, "services"), where("active","==", true), orderBy("title","asc"));
    const snap = await getDocs(qy);
    const arr = [];
    snap.forEach(docSnap=>{
      const d = docSnap.data()||{}; if(!d.title) return;
      arr.push({ title: String(d.title), slug: String(d.slug||slugify(d.title)) });
    });
    if(arr.length) SERVICES_CACHE = arr;
  }catch(e){ /* fallback */ }
  servicesDatalist.innerHTML = SERVICES_CACHE.map(s=>`<option value="${esc(s.title)}" data-slug="${esc(s.slug)}"></option>`).join("");
}
ctSTitle?.addEventListener("input", ()=>{
  const val = ctSTitle.value.trim();
  const hit = SERVICES_CACHE.find(s=> s.title.toLowerCase()===val.toLowerCase());
  ctSSlug.value = hit ? hit.slug : slugify(val);
});

// Clinicians (assign list)
const NURSE_ROLES = ['nurse','lpn','np','caregiver'];
async function loadClinicians(){
  const qy = query(collection(db, "users"), where("active","==", true));
  const snap = await getDocs(qy);
  const arr = [];
  snap.forEach(docSnap=>{
    const d = docSnap.data()||{}; const role = String(d.role||"").toLowerCase();
    if(!NURSE_ROLES.includes(role)) return;
    arr.push({ uid: docSnap.id, displayName: d.displayName||"", email: d.email||"", role, phone: d.phone||"" });
  });
  arr.sort((a,b)=> (a.displayName||a.email).localeCompare(b.displayName||b.email));
  ctAssignedToSel.innerHTML = `<option value="">Select clinician…</option>` + arr.map(u=>{
    const label = (u.displayName||u.email||u.uid); const roleLabel=u.role.toUpperCase();
    return `<option value="${esc(u.uid)}">${esc(label)} — ${roleLabel}</option>`;
  }).join("");
}

// Auth guard (admin only page)
onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.href="/admin/login/admin-login.html"; return; }
  const [profileSnap, adminSnap] = await Promise.all([
    getDoc(doc(db, "users", user.uid)),
    getDoc(doc(db, "admins", user.uid))
  ]);
  const profile = profileSnap.data() || {};
  const authorized =
    (profile.active === true && String(profile.role || "").toLowerCase() === "admin") ||
    (adminSnap.exists() && adminSnap.data()?.active === true);
  if(!authorized){
    await signOut(auth);
    location.href="/admin/login/admin-login.html?error=access-denied";
    return;
  }
  who.textContent = user.email || user.uid;

  // Load static data
  await loadServices();
  await loadClinicians();

  // Bind live tables
  bindTasks();
  bindBookings();
  bindContacts();
  bindReferrals();
  bindUsers();
});

logoutBtn.addEventListener("click", async (e)=>{
  e.preventDefault(); await signOut(auth);
  location.href="/admin/login/admin-login.html";
});

// ---------- Live Bindings ----------
function bindTasks(){
  let qy = query(collection(db,"tasks"), orderBy("createdAt","desc"), limit(150));
  onSnapshot(qy, (snap)=>{
    const rows=[];
    snap.forEach(docSnap=>{
      const d = docSnap.data();
      // Filters
      if (fTaskStatus.value && d.status !== fTaskStatus.value) return;
      if (qTasks.value){
        const hay = `${d.patient?.name||""} ${d.service?.title||d.service?.slug||""} ${d.assignedTo||""}`.toLowerCase();
        if(!hay.includes(qTasks.value.toLowerCase())) return;
      }
      rows.push(rowTask(docSnap.id,d));
    });
    tbodyTasks.innerHTML = rows.join("") || `<tr><td colspan="7" class="muted">No tasks.</td></tr>`;
  });
}
function rowTask(id,d){
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${fmt(d.scheduledAt)}</td>
    <td>${esc(d.patient?.name||"-")}</td>
    <td>${esc(d.service?.title||d.service?.slug||"-")}</td>
    <td>${esc(d.assignedTo||"-")}</td>
    <td>${badge(d.status||"assigned")}</td>
    <td class="actions">
      <button class="btn" data-act="open" data-col="tasks" data-id="${id}">Open</button>
      <button class="btn" data-act="set"  data-col="tasks" data-id="${id}" data-val="assigned">Assign</button>
      <button class="btn" data-act="set"  data-col="tasks" data-id="${id}" data-val="in_progress">Start</button>
      <button class="btn" data-act="set"  data-col="tasks" data-id="${id}" data-val="done">Done</button>
      <button class="btn" data-act="plan" data-col="tasks" data-id="${id}">Plan</button>
    </td>
  </tr>`;
}

function bindBookings(){
  let qy = query(collection(db, "bookings"), orderBy("createdAt","desc"), limit(100));
  onSnapshot(qy, (snap)=>{
    const rows=[]; let total=0,pending=0;
    snap.forEach(docSnap=>{
      total++; const d=docSnap.data(); if(d.status==="pending") pending++;
      if (fBookingStatus.value && d.status !== fBookingStatus.value) return;
      if (qBookings.value){
        const hay = `${d.patient?.name||""} ${d.contact?.email||""} ${d.serviceTitle||d.serviceSlug||""}`.toLowerCase();
        if(!hay.includes(qBookings.value.toLowerCase())) return;
      }
      rows.push(rowBooking(docSnap.id,d));
    });
    tbodyBookings.innerHTML = rows.join("") || `<tr><td colspan="6" class="muted">No results.</td></tr>`;
    kBookings.textContent = String(total); kBookingsMeta.textContent = `pending: ${pending}`;
  });
}
function rowBooking(id,d){
  const email = d.contact?.email || "";
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${esc(d.patient?.name||"-")}</td>
    <td>${esc(email||d.contact?.phone||"-")}</td>
    <td>${esc(d.serviceTitle||d.serviceSlug||"-")}</td>
    <td>${badge(d.status||'pending')}</td>
    <td class="actions">
      <button class="btn" data-act="open" data-col="bookings" data-id="${id}">Open</button>
      <button class="btn" data-act="manage" data-col="bookings" data-id="${id}">Manage</button>
      <a class="btn" href="${mailto(email,'About your booking','Hello,')}" target="_blank">Message</a>
      <button class="btn" data-act="plan" data-col="bookings" data-id="${id}">Plan</button>
    </td>
  </tr>`;
}

function bindContacts(){
  let qy = query(collection(db, "contacts"), orderBy("createdAt","desc"), limit(150));
  onSnapshot(qy, (snap)=>{
    const rows=[]; let total=0,nnew=0;
    snap.forEach(docSnap=>{
      total++; const d=docSnap.data(); if((d.status||'new')==='new') nnew++;
      if (fContactStatus.value && d.status !== fContactStatus.value) return;
      if (qContacts.value){
        const hay = `${d.name||""} ${d.email||""} ${d.phone||""} ${d.reason||""}`.toLowerCase();
        if(!hay.includes(qContacts.value.toLowerCase())) return;
      }
      rows.push(rowContact(docSnap.id,d));
    });
    tbodyContacts.innerHTML = rows.join("") || `<tr><td colspan="6" class="muted">No results.</td></tr>`;
    kContacts.textContent = String(total); kContactsMeta.textContent = `new: ${nnew}`;
  });
}
function rowContact(id,d){
  const email = d.email || "";
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${esc(d.name||"-")}</td>
    <td>${esc(email)} / ${esc(d.phone||"-")}</td>
    <td>${esc(d.reason||"-")}</td>
    <td>${badge(d.status||'new')}</td>
    <td class="actions">
      <button class="btn" data-act="open" data-col="contacts" data-id="${id}">Open</button>
      <button class="btn" data-act="manage" data-col="contacts" data-id="${id}">Manage</button>
      <a class="btn" href="${mailto(email,'Regarding your inquiry','Hello,')}" target="_blank">Message</a>
    </td>
  </tr>`;
}

function bindReferrals(){
  let qy = query(collection(db, "patientReferal"), orderBy("createdAt","desc"), limit(150));
  onSnapshot(qy, (snap)=>{
    const rows=[]; let total=0,nnew=0;
    snap.forEach(docSnap=>{
      total++; const d=docSnap.data(); if((d.status||'new')==='new') nnew++;
      if (fRefStatus.value && (d.status||'new') !== fRefStatus.value) return;
      if (qRef.value){
        const hay = `${d.refName||""} ${d.refEmail||""} ${d.patientName||""} ${d.diagnosis||""}`.toLowerCase();
        if(!hay.includes(qRef.value.toLowerCase())) return;
      }
      rows.push(rowRef(docSnap.id,d));
    });
    tbodyRef.innerHTML = rows.join("") || `<tr><td colspan="6" class="muted">No results.</td></tr>`;
    kRef.textContent = String(total); kRefMeta.textContent = `new: ${nnew}`;
  });
}
function rowRef(id,d){
  const email = d.refEmail || "";
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${esc(d.refName||"-")}<br/><span class="small muted">${esc(d.refOrg||"")}</span></td>
    <td>${esc(d.patientName||"-")}</td>
    <td>${esc(d.diagnosis||"-")}</td>
    <td>${badge(d.status||'new')}</td>
    <td class="actions">
      <button class="btn" data-act="open" data-col="patientReferal" data-id="${id}">Open</button>
      <button class="btn" data-act="manage" data-col="patientReferal" data-id="${id}">Manage</button>
      <a class="btn" href="${mailto(email,'Regarding your referral','Hello,')}" target="_blank">Message</a>
      <button class="btn" data-act="plan" data-col="patientReferal" data-id="${id}">Plan</button>
    </td>
  </tr>`;
}

function bindUsers(){
  let qy = query(collection(db, "users"), orderBy("createdAt","desc"), limit(150));
  onSnapshot(qy, (snap)=>{
    const rows=[]; let total=0;
    snap.forEach(docSnap=>{
      total++; const d=docSnap.data()||{};
      if (qUsers.value){
        const hay = `${d.name||d.displayName||""} ${d.email||""} ${d.role||""}`.toLowerCase();
        if(!hay.includes(qUsers.value.toLowerCase())) return;
      }
      rows.push(rowUser(docSnap.id,d));
    });
    tbodyUsers.innerHTML = rows.join("") || `<tr><td colspan="5" class="muted">No users.</td></tr>`;
    document.getElementById("kUsers").textContent = String(total);
  });
}
function rowUser(id,d){
  return `<tr>
    <td>${fmt(d.createdAt)}</td>
    <td>${esc(d.name||d.displayName||"-")}</td>
    <td>${esc(d.email||"-")}</td>
    <td>${esc(d.role||"-")}</td>
    <td class="actions">
      <button class="btn" data-act="open" data-col="users" data-id="${id}">Open</button>
      <button class="btn" data-act="manage" data-col="users" data-id="${id}">Manage</button>
    </td>
  </tr>`;
}

// ---------- Actions / Planning ----------
document.addEventListener("click", async (e)=>{
  const el = e.target.closest("[data-act]"); if(!el) return;
  const act = el.dataset.act, col = el.dataset.col, id = el.dataset.id;
  const ref = doc(db, col, id);

  if (act === "open") {
    const snap = await getDoc(ref);
    showJSON(id, snap.exists()? snap.data() : {error:"Not found"});
  }

  if (act === "manage") {
    let options = "new,read,archived";
    if (col === "bookings") options = "pending,scheduled,completed,cancelled";
    if (col === "patientReferal") options = "new,reviewed,contacted,converted,archived";
    if (col === "users") options = "admin,staff,viewer,disabled";
    const val = prompt(`Set status/role (${options}):`); if(!val) return;
    const field = (col === "users") ? "role" : "status";
    await updateDoc(ref, { [field]: val.trim() });
  }

  if (act === "plan") {
    const val = prompt("Enter scheduled date/time (YYYY-MM-DD HH:mm, local):"); if(!val) return;
    const d = new Date(val.replace(" ","T")); if(isNaN(d.getTime())){ alert("Invalid date/time"); return; }
    await updateDoc(ref, { scheduledAt: Timestamp.fromDate(d), status: "scheduled" });
  }

  if (act === "set" && col === "tasks") {
    const status = el.dataset.val;
    await updateDoc(ref, { status, lastUpdatedAt: serverTimestamp() });
  }
});

// ---------- Filters ----------
[
  fTaskStatus, qTasks,
  fBookingStatus, qBookings,
  fContactStatus, qContacts,
  fRefStatus, qRef,
  qUsers
].forEach(inp=>{
  inp?.addEventListener?.("input",  ()=>{ /* live listeners already refresh; just noop */ });
  inp?.addEventListener?.("change", ()=>{ /* noop */ });
});

// ---------- Create Task (modal) ----------
createTaskForm?.addEventListener("close", async ()=>{
  if (createTaskForm.returnValue !== "save") return;
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

  if (!assignedTo || !pName) {
    ctStatus.textContent = "Assignee and patient name are required."; return;
  }

  let scheduledAt = null;
  if (when) {
    const d = new Date(when.replace(" ", "T"));
    if (!isNaN(d.getTime())) scheduledAt = Timestamp.fromDate(d);
  }

  const task = {
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || "",
    source: { type: srcType||"manual", id: srcId||"" },
    patient: { name: pName, phone: pPhone, address: pAddr, email: "" },
    service: { title: sTitle, slug: sSlug },
    scheduledAt,
    status: "assigned",
    assignedTo,
    notes
  };

  try{
    await addDoc(collection(db, "tasks"), task);
    ctStatus.textContent = "✅ Task created.";
    setTimeout(()=> dlgTask.close(), 400);
  }catch(err){
    ctStatus.textContent = "⛔ " + (err.message||err.code||"Failed");
  }
});

async function openBookingDetails(id){
  try{
    // booking doc
    const ref = doc(db, "bookings", id);
    const snap = await getDoc(ref);
    if(!snap.exists()){
      dlgTitle.textContent = "Booking not found";
      dlgBody.innerHTML = `<p class="muted">This booking no longer exists.</p>`;
      dlg.showModal(); return;
    }
    const d = snap.data();

    dlgTitle.textContent = d.patient?.name || "Booking";

    // load subcollections (bookingDetails & tasks)
    const detailsSnap = await getDocs(collection(db, "bookings", id, "bookingDetails"));
    const tasksSnap   = await getDocs(collection(db, "bookings", id, "tasks"));

    // render sections
    dlgBody.innerHTML = `
      <section class="box">
        <h4>Booking</h4>
        <div class="kv">
          <div class="k">Created</div>     <div>${fmt(d.createdAt)}</div>
          <div class="k">Status</div>      <div>${esc(d.status||'pending')}</div>
          <div class="k">Scheduled</div>   <div>${fmt(d.scheduledAt)}</div>
          <div class="k">Service</div>     <div>${esc(d.serviceTitle||d.serviceSlug||'-')}</div>
          <div class="k">Patient</div>     <div>${esc(d.patient?.name||'-')}</div>
          <div class="k">Contact</div>     <div>${esc(d.contact?.email||d.contact?.phone||'-')}</div>
          ${d.notes ? `<div class="k">Notes</div><div>${esc(d.notes)}</div>` : ``}
        </div>
      </section>

      <section class="subgrid">
        <div class="box">
          <h4>Booking Details</h4>
          ${renderDetailsList(detailsSnap)}
        </div>

        <div class="box">
          <h4>Tasks</h4>
          ${renderTasksList(tasksSnap)}
        </div>
      </section>
    `;

    dlg.showModal();
  }catch(err){
    dlgTitle.textContent = "Error";
    dlgBody.innerHTML = `<p class="muted">Failed to load details.</p><pre class="small muted">${esc(err.message||String(err))}</pre>`;
    dlg.showModal();
  }
}

function renderDetailsList(snap){
  if (snap.empty) return `<p class="muted">No booking details yet.</p>`;
  const rows = [];
  snap.forEach(s=>{
    const d=s.data()||{};
    rows.push(`
      <div class="kv" style="border-top:1px dashed #e6e9ef; padding-top:8px;">
        <div class="k">Title</div><div><strong>${esc(d.title||'-')}</strong></div>
        ${d.note ? `<div class="k">Note</div><div>${esc(d.note)}</div>` : ``}
        <div class="k">Created</div><div>${fmt(d.createdAt)}</div>
      </div>
    `);
  });
  return rows.join("");
}

function renderTasksList(snap){
  if (snap.empty) return `<p class="muted">No tasks for this booking.</p>`;
  const rows = [];
  snap.forEach(s=>{
    const d=s.data()||{};
    rows.push(`
      <div class="kv" style="border-top:1px dashed #e6e9ef; padding-top:8px;">
        <div class="k">Title</div><div><strong>${esc(d.title||'-')}</strong></div>
        <div class="k">Assignee</div><div>${esc(d.assignedTo||'-')}</div>
        <div class="k">Status</div><div>${esc(d.status||'-')}</div>
        <div class="k">When</div><div>${fmt(d.scheduledAt)}</div>
        <div class="k">Created</div><div>${fmt(d.createdAt)}</div>
      </div>
    `);
  });
  return rows.join("");
}
