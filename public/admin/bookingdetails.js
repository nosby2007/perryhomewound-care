/* bookingDetails.js
   - /admin/bookingDetails.html?id=<bookingId>
   - Shows booking + details, tasks subcollections
   - Adds task with assignee select (users w/ clinician roles)
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection, addDoc, onSnapshot,
  serverTimestamp, Timestamp, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

/* ---- Firebase config ---- */
const firebaseConfig = {
  apiKey: "AIzaSyCdIpeMxhFMRpzNxmngoP3QY8ZZl2ABG_s",
  authDomain: "credential-4f22b.firebaseapp.com",
  projectId: "credential-4f22b",
  storageBucket: "credential-4f22b.firebasestorage.app",
  messagingSenderId: "107240797765",
  appId: "1:107240797765:web:9ae5b37760081911ad952c",
  measurementId: "G-XKYX4WC53E"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

/* ------------------ helpers ------------------ */
const esc = (x)=> String(x ?? "").replace(/[&<>"']/g, m => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
}[m]));
const fmt = (ts)=> ts?.toDate?.()?.toLocaleString?.() || "-";
const get = (o, path, d="")=>{
  try { return path.split(".").reduce((a,k)=> (a && k in a) ? a[k] : undefined, o) ?? d; }
  catch { return d; }
};
const slugify = (x)=> String(x||"").toLowerCase().trim()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

function fullName(patient){
  if(!patient) return "";
  if (patient.name) return String(patient.name);
  const fn = String(patient.firstName||"").trim();
  const ln = String(patient.lastName||"").trim();
  return (fn || ln) ? `${fn} ${ln}`.trim() : "";
}

/* ------------------ DOM ------------------ */
const who       = document.getElementById("who");
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn?.addEventListener("click", async ()=>{
  await signOut(auth);
  location.href="/admin/login/admin-login.html";
});

const params    = new URLSearchParams(location.search);
const bookingId = params.get("id");
if(!bookingId){
  alert("Missing booking ID");
  throw new Error("Missing ?id=");
}
const bookingRef = doc(db, "bookings", bookingId);

const bookingInfo = document.getElementById("bookingInfo");
const tblDetails  = document.querySelector("#tblDetails tbody");
const tblTasks    = document.querySelector("#tblTasks tbody");

/* dialogs/forms (DETAIL) */
const dlgDetail   = document.getElementById("dlgAddDetail");
const formDetail  = document.getElementById("formAddDetail");
const detailMsg   = document.getElementById("detailMsg");

/* dialogs/forms (TASK) */
const dlgTask       = document.getElementById("dlgAddTask");
const formTask      = document.getElementById("formAddTask");
const bdStatus      = document.getElementById("bdStatus");
const bdAssignedSel = document.getElementById("bdAssignedToSel");
const bdWhen        = document.getElementById("bdWhen");
const bdPName       = document.getElementById("bdPName");
const bdPPhone      = document.getElementById("bdPPhone");
const bdPAddr       = document.getElementById("bdPAddr");
const bdSTitle      = document.getElementById("bdSTitle");
const bdSSlug       = document.getElementById("bdSSlug");
const bdSrcType     = document.getElementById("bdSrcType");
const bdSrcId       = document.getElementById("bdSrcId");
const bdTaskTitle   = document.getElementById("bdTaskTitle");
const bdNotes       = document.getElementById("bdNotes");

/* ------------------ auth ------------------ */
onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.href="/admin/login/admin-login.html"; return; }
  who.textContent = user.email || user.uid;

  // Pre-fill source
  bdSrcType.value = "booking";
  bdSrcId.value   = bookingId;

  await Promise.all([
    loadBookingAndPrefillTask(),
    loadClinicians()
  ]);

  bindDetails();
  bindTasks();
});

/* ------------------ booking header + prefill ------------------ */
async function loadBookingAndPrefillTask(){
  const snap = await getDoc(bookingRef);
  if(!snap.exists()){
    bookingInfo.innerHTML = `<p class="muted">Booking not found.</p>`;
    return;
  }
  const d = snap.data() || {};

  // Render header
  const patientName  = fullName(d.patient) || "-";
  const contactEmail = get(d, "contact.email");
  const contactPhone = get(d, "contact.phone");
  const contactLine  = contactEmail || contactPhone || "-";
  const dob          = get(d, "patient.dob") || "-";
  const woundType    = get(d, "patient.woundType") || "-";
  const pNotes       = get(d, "patient.notes") || "-";

  const prefMode     = get(d, "preference.mode") || "-";
  const prefDate     = get(d, "preference.preferredDate") || "-";
  const prefTime     = get(d, "preference.preferredTime") || "-";
  const address      = get(d, "preference.address") || "-";

  const serviceTitle = d.serviceTitle || d.serviceSlug || "-";
  const status       = d.status || "-";
  const createdAt    = fmt(d.createdAt);
  const userAgent    = d.userAgent || "";

  document.getElementById("bTitle").textContent = patientName || "Booking Details";
  bookingInfo.innerHTML = `
    <div style="padding:14px 16px;">
      <h3 style="margin:0 0 8px;">${esc(serviceTitle)}</h3>

      <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div class="muted"><strong>Patient</strong></div>
          <div><strong>Name:</strong> ${esc(patientName)}</div>
          <div><strong>DOB:</strong> ${esc(dob)}</div>
          <div><strong>Wound type:</strong> ${esc(woundType)}</div>
          <div><strong>Notes:</strong> ${esc(pNotes)}</div>
        </div>

        <div>
          <div class="muted"><strong>Contact & Preference</strong></div>
          <div><strong>Contact:</strong> ${esc(contactLine)}</div>
          <div><strong>Mode:</strong> ${esc(prefMode)}</div>
          <div><strong>Preferred:</strong> ${esc(prefDate)} ${esc(prefTime)}</div>
          <div><strong>Address:</strong> ${esc(address)}</div>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;" />

      <div class="muted">
        <strong>Status:</strong> ${esc(status)} &nbsp; • &nbsp;
        <strong>Created:</strong> ${esc(createdAt)}
        ${userAgent ? `&nbsp; • &nbsp;<strong>UA:</strong> ${esc(userAgent)}` : ""}
      </div>
    </div>
  `;

  // Prefill Add Task form from booking
  bdPName.value  = patientName !== "-" ? patientName : "";
  bdPPhone.value = contactPhone || "";
  bdPAddr.value  = address !== "-" ? address : "";
  bdSTitle.value = serviceTitle !== "-" ? serviceTitle : "";
  bdSSlug.value  = serviceTitle !== "-" ? slugify(serviceTitle) : "";
  bdTaskTitle.value = serviceTitle !== "-" ? `Visit — ${serviceTitle}` : "Visit";
}

/* ------------------ load clinicians into select ------------------ */
const NURSE_ROLES = ['nurse','lpn','np','caregiver'];
async function loadClinicians(){
  // active == true, and role in allowed set
  const qy = query(collection(db,"users"), where("active","==", true));
  const snap = await getDocs(qy);

  const arr=[];
  snap.forEach(s=>{
    const d = s.data()||{};
    const role = String(d.role||"").toLowerCase();
    if(!NURSE_ROLES.includes(role)) return;
    arr.push({ uid:s.id, label: d.displayName||d.email||s.id, role });
  });
  arr.sort((a,b)=> a.label.localeCompare(b.label));

  bdAssignedSel.innerHTML = `<option value="">Select clinician…</option>` +
    arr.map(u=>`<option value="${esc(u.uid)}">${esc(u.label)} — ${u.role.toUpperCase()}</option>`).join("");
}

/* ------------------ subcollection: bookingDetails ------------------ */
function bindDetails(){
  const colRef = collection(db, "bookings", bookingId, "bookingDetails");
  onSnapshot(colRef, (snap)=>{
    const rows=[];
    snap.forEach(s=>{
      const d=s.data()||{};
      rows.push(`
        <tr>
          <td>${esc(d.title||"-")}</td>
          <td>${esc(d.note||"")}</td>
          <td>${fmt(d.createdAt)}</td>
        </tr>
      `);
    });
    tblDetails.innerHTML = rows.join("") || `<tr><td colspan="3" class="muted">No details yet.</td></tr>`;
  });
}

/* ------------------ subcollection: tasks ------------------ */
function bindTasks(){
  const colRef = collection(db, "bookings", bookingId, "tasks");
  onSnapshot(colRef, (snap)=>{
    const rows=[];
    snap.forEach(s=>{
      const d=s.data()||{};
      rows.push(`
        <tr>
          <td>${esc(d.title||"-")}</td>
          <td>${esc(d.assignedTo||"-")}</td>
          <td>${esc(d.status||"-")}</td>
          <td>${fmt(d.scheduledAt)}</td>
        </tr>
      `);
    });
    tblTasks.innerHTML = rows.join("") || `<tr><td colspan="4" class="muted">No tasks yet.</td></tr>`;
  });
}

/* ------------------ Add Detail (dialog) ------------------ */
document.getElementById("btnAddDetail")?.addEventListener("click", ()=>{
  detailMsg.textContent = "";
  formDetail.reset?.();
  dlgDetail.showModal();
});

// With method="dialog", listen on DIALOG
dlgDetail?.addEventListener("close", async ()=>{
  if (dlgDetail.returnValue !== "save") return;

  const title = document.getElementById("detailTitle").value.trim();
  const note  = document.getElementById("detailNote").value.trim();
  if(!title){
    detailMsg.textContent = "Title required.";
    dlgDetail.showModal();
    return;
  }

  try{
    await addDoc(collection(db,"bookings",bookingId,"bookingDetails"), {
      title, note,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || ""
    });
  }catch(err){
    detailMsg.textContent = "⛔ " + (err.message || err.code || "Failed");
    dlgDetail.showModal();
  }
});

/* ------------------ Add Task (dialog) ------------------ */
document.getElementById("btnAddTask")?.addEventListener("click", ()=>{
  bdStatus.textContent = "";
  formTask.reset?.();
  // Re-fill source and booking-derived fields (keeps them visible)
  bdSrcType.value = "booking";
  bdSrcId.value   = bookingId;
  // Keep previously prefilled patient/service values if we had them
  dlgTask.showModal();
});

// With method="dialog", listen on DIALOG
dlgTask?.addEventListener("close", async ()=>{
  if (dlgTask.returnValue !== "save") return;

  const title      = bdTaskTitle.value.trim();
  const assignedTo = bdAssignedSel.value.trim();
  const whenStr    = bdWhen.value.trim();

  const pName  = bdPName.value.trim();
  const pPhone = bdPPhone.value.trim();
  const pAddr  = bdPAddr.value.trim();

  const sTitle = bdSTitle.value.trim();
  const sSlug  = (bdSSlug.value.trim() || slugify(sTitle));

  const notes  = bdNotes.value.trim();

  if(!title || !assignedTo || !pName){
    bdStatus.textContent = "Task title, assignee and patient name are required.";
    dlgTask.showModal();
    return;
  }

  let scheduledAt = null;
  if(whenStr){
    const d = new Date(whenStr.replace(" ", "T"));
    if(!isNaN(d.getTime())) scheduledAt = Timestamp.fromDate(d);
  }

  const task = {
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || "",
    source: { type: "booking", id: bookingId },
    patient: { name: pName, phone: pPhone, address: pAddr, email: "" },
    service: { title: sTitle, slug: sSlug },
    scheduledAt,
    status: "assigned",
    assignedTo,   // clinician UID
    notes,
    title
  };

  try{
    bdStatus.textContent = "Creating…";
    await addDoc(collection(db,"bookings",bookingId,"tasks"), task);
    bdStatus.textContent = "✅ Task created.";
  }catch(err){
    bdStatus.textContent = "⛔ " + (err.message || err.code || "Failed");
    dlgTask.showModal();
  }
});
