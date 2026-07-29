// /admin/portal.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, onSnapshot,
  addDoc, updateDoc, serverTimestamp, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* ---------------- Firebase ---------------- */
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
const auth = getAuth(app);
const db   = getFirestore(app);
// Add this small helper near the top (after other utils)
function toJSDate(v){
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate(); // Firestore Timestamp
  if (v instanceof Date) return v;                        // Already a Date
  return null;
}


/* ---------------- DOM ---------------- */
const whoEl   = document.getElementById("who");
const listEl  = document.getElementById("taskList");
const emptyEl = document.getElementById("empty");
const fStatus = document.getElementById("fStatus");
const qEl     = document.getElementById("q");

// optional bookings section (if present in HTML)
const bookingListEl  = document.getElementById("bookingList");
const bookingEmptyEl = document.getElementById("bookingEmpty");

document.getElementById("logoutBtn")?.addEventListener("click", async ()=>{
  await signOut(auth);
  location.href = "/admin/login/admin-login.html";
});

/* Note modal */
const dlgNote         = document.getElementById("dlgNote");
const noteForm        = document.getElementById("noteForm");
const noteMeta        = document.getElementById("noteMeta");
const noteText        = document.getElementById("noteText");
const noteNextDate    = document.getElementById("noteNextDate");
const noteStatus      = document.getElementById("noteStatus");
const btnSaveNote     = document.getElementById("btnSaveNote");
const btnSaveNoteDone = document.getElementById("btnSaveNoteDone");

/* ---------------- State & utils ---------------- */
let currentUser = null;

// live caches
let tasksCache = [];     // [{id,data}]
let bookingsCache = [];  // [{id,data}]
let tasksUnsub = null;
let bookingsUnsub = null;

// task helpers
let tasksIndex = new Map();     // id -> data
let currentTaskId = null;

// notes live subscriptions per task
const notesUnsubs = new Map();  // id -> () => void
const notesCount  = new Map();  // id -> number (to show count on button)

const esc = s => String(s ?? "").replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#039;' }[m]));
const fmt = ts => ts?.toDate?.()?.toLocaleString?.() || "-";
const badge = s => {
  const cls = s==="assigned"?"status-assigned":(s==="in_progress"?"status-in_progress":(s==="done"?"status-done":""));
  return `<span class="badge ${cls}">${esc(String(s).replace("_"," "))}</span>`;
};

/* ---------------- Auth guard ---------------- */
onAuthStateChanged(auth, async (user)=>{
  if (!user) { location.href = "/admin/login/admin-login.html"; return; }
  currentUser = user;

  const snap = await getDoc(doc(db, "users", user.uid));
  const d = snap.data() || {};
  const role = (d.role||"").toLowerCase();
  const okRole = ["nurse","lpn","np","caregiver"].includes(role);
  if (!okRole || !d.active) {
    alert("Access denied. Contact admin.");
    await signOut(auth);
    location.href = "/admin/login/admin-login.html";
    return;
  }
  whoEl.textContent = d.displayName || user.email || user.uid;

  initPortal();
});

/* ---------------- Renderers ---------------- */
function renderTaskCard(id,d){
  const addr = [d?.patient?.address, d?.patient?.phone, d?.patient?.email, d?.patient?.notes]
    .filter(Boolean).join(" • ");
  const nCount = notesCount.get(id) ?? 0;

  return `
    <article class="card" data-id="${id}" data-status="${esc(d?.status||'assigned')}">
      <div class="row" style="justify-content:space-between">
        <strong>${esc(d?.patient?.name||"Patient")}</strong>
        ${badge(d?.status || "assigned")}
      </div>
      <div class="small muted">${esc(addr||"")}</div>
      <div class="small">${esc(d?.service?.title||d?.service?.slug||"-")}</div>
      <div class="small muted">Created: ${fmt(d.createdAt)} · Scheduled: ${fmt(d.scheduledAt)}</div>

      <div class="row" style="gap:6px;margin-top:6px">
        <button class="btn" data-act="start">Start</button>
        <button class="btn" data-act="note">Add note</button>
        <button class="btn" data-act="toggle-notes">Notes (${nCount})</button>
        <button class="btn primary" data-act="done">Mark done</button>
      </div>

      <!-- notes container -->
      <div class="notes" id="notes-${id}" style="display:none;margin-top:8px;border-top:1px solid #e6eef6;padding-top:8px"></div>
    </article>
  `;
}

function renderBookingCard(id, d){
  const name = `${d.patient?.firstName||""} ${d.patient?.lastName||""}`.trim() || (d.patient?.name||"-");
  const contact = d.contact?.email || d.contact?.phone || "";
  const when = d.preference?.preferredDate || "";
  const time = d.preference?.preferredTime || "";
  const addr = d.preference?.address || "";
  const status = d.status || "pending";
  return `
   <article class="card" data-bid="${id}" data-status="${esc(status)}">
      <div class="row" style="justify-content:space-between">
        <strong>${esc(name)}</strong>
        <span class="badge">${esc(status)}</span>
      </div>
      <div class="small">${esc(d.serviceTitle || d.serviceSlug || "-")}</div>
      <div class="small muted">${esc(contact)}</div>
      <div class="small muted">${esc(addr)}</div>
      <div class="small muted">Preferred: ${esc(when)} ${esc(time)} • Created: ${fmt(d.createdAt)}</div>
      <div class="row" style="margin-top:6px;justify-content:flex-end">
        <a class="btn primary" href="/admin/portalBooking.html?id=${encodeURIComponent(id)}">Details</a>
      </div>
    </article>
  `;
}

/* ---------------- Painting ---------------- */
function paintTasks(){
  const qv = (qEl?.value || "").toLowerCase();
  const sv = fStatus?.value || "";

  tasksIndex.clear();
  const cards = tasksCache.filter(({data:d})=>{
    if (sv && d.status !== sv) return false;
    if (qv){
      const hay = `${d.patient?.name||""} ${d.patient?.address||""} ${(d.service?.title||d.service?.slug||"")}`.toLowerCase();
      if (!hay.includes(qv)) return false;
    }
    return true;
  }).map(({id,data})=>{
    tasksIndex.set(id, data);
    return renderTaskCard(id,data);
  });

  listEl.innerHTML = cards.join("");
  emptyEl.style.display = cards.length ? "none" : "block";
}

function paintBookings(){
  if (!bookingListEl) return;
  const qv = (qEl?.value || "").toLowerCase();
  const sv = fStatus?.value || "";

  const cards = bookingsCache.filter(({data:d})=>{
    if (sv && (d.status||"") !== sv) return false;
    if (qv){
      const hay = `${d.patient?.firstName||""} ${d.patient?.lastName||""} ${d.patient?.name||""} ${d.contact?.email||""} ${(d.serviceTitle||d.serviceSlug||"")} ${d.preference?.address||""} ${d.preference?.notes||""}`.toLowerCase();
      if (!hay.includes(qv)) return false;
    }
    return true;
  }).map(({id,data})=> renderBookingCard(id,data));

  bookingListEl.innerHTML = cards.join("");
  bookingEmptyEl.style.display = cards.length ? "none" : "block";
}

/* ---------------- Live bindings ---------------- */
function bindTasks(){
  if (tasksUnsub) tasksUnsub();
  // only tasks assigned to this clinician (matches your rules)
  const qy = query(collection(db,"tasks"), where("assignedTo","==", currentUser.uid));
  tasksUnsub = onSnapshot(qy, (snap)=>{
    const next = [];
    snap.forEach(docSnap=> next.push({ id: docSnap.id, data: docSnap.data()||{} }));
    tasksCache = next;
    // refresh counts by re-subscribing notes for visible tasks
    // (we keep existing open notes subscriptions intact)
    paintTasks();
    // automatically subscribe counts for all tasks (lightweight)
    tasksCache.forEach(({id})=> subscribeNotesCount(id));
  }, err=>{
    listEl.innerHTML = `<div class="muted">⛔ ${esc(err.message||"Cannot read tasks.")}</div>`;
    emptyEl.style.display = "none";
  });
}

function bindBookings(){
  if (!bookingListEl) return;
  if (bookingsUnsub) bookingsUnsub();
  bookingsUnsub = onSnapshot(collection(db,"bookings"), (snap)=>{
    const next = [];
    snap.forEach(docSnap=> next.push({ id: docSnap.id, data: docSnap.data()||{} }));
    bookingsCache = next;
    paintBookings();
  }, err=>{
    bookingListEl.innerHTML = `<div class="muted">⛔ ${esc(err.message||"Cannot read bookings.")}</div>`;
    bookingEmptyEl.style.display = "none";
  });
}

/* ---------------- Notes subscription & rendering ---------------- */
function subscribeNotesCount(taskId){
  // if a detailed notes sub is already open, no need for a second one
  if (notesUnsubs.has(`count:${taskId}`)) return;

  const qy = query(collection(db, "tasks", taskId, "notes"), orderBy("createdAt","desc"));
  const unsub = onSnapshot(qy, (snap)=>{
    notesCount.set(taskId, snap.size);
    // update button label if the card is on screen
    const art = document.querySelector(`article[data-id="${taskId}"]`);
    if (art){
      const btn = art.querySelector('[data-act="toggle-notes"]');
      if (btn) btn.textContent = `Notes (${snap.size})`;
    }
  }, ()=>{/* ignore count errors silently */});
  notesUnsubs.set(`count:${taskId}`, unsub);
}

function toggleNotes(taskId){
  const box = document.getElementById(`notes-${taskId}`);
  if (!box) return;

  const isOpen = box.style.display !== "none";
  if (isOpen){
    box.style.display = "none";
    // keep count subscription, but stop the heavy list sub
    const key = `list:${taskId}`;
    notesUnsubs.get(key)?.();
    notesUnsubs.delete(key);
    return;
  }

  box.style.display = "block";
  // subscribe to full notes list
  const qy = query(collection(db, "tasks", taskId, "notes"), orderBy("createdAt","desc"));
  const unsub = onSnapshot(qy, (snap)=>{
    const rows = [];
    snap.forEach(s=>{
      const d = s.data()||{};
      const when = fmt(d.createdAt);
      const who  = d.authorUid ? ` • ${esc(d.authorUid)}` : "";
      const next = toJSDate(d.followUpAt);
const nextStr = next ? ` • Follow-up: ${esc(next.toLocaleDateString())}` : "";

      rows.push(`
        <div class="small" style="padding:6px 0;border-bottom:1px dashed #e6eef6">
          <div><strong>${esc(when)}</strong>${who}${nextStr}</div>
          <div class="muted">${esc(d.text||"")}</div>
        </div>
      `);
    });
    box.innerHTML = rows.join("") || `<div class="small muted">No notes yet.</div>`;
  }, err=>{
    box.innerHTML = `<div class="small" style="color:#b91c1c">${esc(err.message||"Cannot read notes")}</div>`;
  });
  notesUnsubs.set(`list:${taskId}`, unsub);
}

/* ---------------- Actions ---------------- */
document.addEventListener("click", async (e)=>{
  const btn = e.target.closest("[data-act]");
  if (!btn) return;

  // Task actions operate on cards
  const art = btn.closest("article[data-id]");
  const act = btn.dataset.act;

  // Toggling notes list
  if (act === "toggle-notes"){
    const taskId = art?.dataset.id;
    if (taskId) toggleNotes(taskId);
    return;
  }

  if (!art) return; // other buttons (like bookings) are normal links

  const id = art.dataset.id;
  const d  = tasksIndex.get(id)||{};
  currentTaskId = id;

  try{
    if (act === "start") {
      await updateDoc(doc(db,"tasks",id), { status: "in_progress", lastUpdatedAt: serverTimestamp() });
    } else if (act === "done") {
      await updateDoc(doc(db,"tasks",id), { status: "done", lastUpdatedAt: serverTimestamp() });
    } else if (act === "note") {
      noteForm.reset();
      noteStatus.textContent = "";
      noteMeta.textContent = `${d.patient?.name||"-"} — ${d.service?.title||d.service?.slug||"-"}`;
      dlgNote.showModal();
    }
  }catch(err){
    alert(err.message || "Update failed");
  }
});

/* ---------------- Note modal handlers ---------------- */
async function saveNote(markDone){
  if (!currentTaskId || !currentUser) return;
  noteStatus.textContent = "Saving…";

  const text = (noteText.value || "").trim();
  const nextDateStr = noteNextDate.value || "";
  const nextDate = nextDateStr ? new Date(nextDateStr) : null;

  try{
    await addDoc(collection(db, "tasks", currentTaskId, "notes"), {
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid,
      text,
      followUpAt: (nextDate && !isNaN(nextDate)) ? nextDate : null
    });

    const patch = { lastUpdatedAt: serverTimestamp() };
    if (nextDate && !isNaN(nextDate)) patch.scheduledAt = nextDate;
    if (markDone) patch.status = "done";
    await updateDoc(doc(db,"tasks",currentTaskId), patch);

    noteStatus.textContent = "✅ Saved.";
    setTimeout(()=> dlgNote.close(), 250);
  }catch(err){
    noteStatus.textContent = "⛔ " + (err.message || "Failed to save");
  }
}

btnSaveNote?.addEventListener("click", async (e)=>{ e.preventDefault(); await saveNote(false); });
btnSaveNoteDone?.addEventListener("click", async (e)=>{ e.preventDefault(); await saveNote(true); });

/* ---------------- Init ---------------- */
function initPortal(){
  bindTasks();
  fStatus?.addEventListener("change", paintTasks);
  qEl?.addEventListener("input", paintTasks);
}
