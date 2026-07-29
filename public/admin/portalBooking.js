import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, addDoc, onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

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

const esc = s => String(s ?? "").replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const fmt = ts => ts?.toDate?.()?.toLocaleString?.() || "-";

const params = new URLSearchParams(location.search);
const bookingId = params.get("id");
if (!bookingId) { alert("Missing booking id"); throw new Error("missing id"); }

const titleEl = document.getElementById("title");
const bookingInfo = document.getElementById("bookingInfo");
const tblDetails  = document.getElementById("tblDetails");
const tblTasks    = document.getElementById("tblTasks");

const dlgDetail   = document.getElementById("dlgDetail");
const formDetail  = document.getElementById("formDetail");
const detailMsg   = document.getElementById("detailMsg");
document.getElementById("btnAddDetail").addEventListener("click", ()=>{ detailMsg.textContent=""; formDetail.reset(); dlgDetail.showModal(); });

onAuthStateChanged(auth, async (user)=>{
  if (!user) { location.href="/admin/login/admin-login.html"; return; }
  await loadBooking();
  bindDetails();
  bindTasks();
});

async function loadBooking(){
  const snap = await getDoc(doc(db,"bookings",bookingId));
  if (!snap.exists()) { bookingInfo.innerHTML = `<p class="muted">Booking not found.</p>`; return; }
  const d = snap.data() || {};
  titleEl.textContent = `${d.patient?.firstName||""} ${d.patient?.lastName||""}`.trim() || "Booking";

  bookingInfo.innerHTML = `
    <div><strong>${esc(d.serviceTitle||d.serviceSlug||"-")}</strong></div>
    <div class="muted">Status: ${esc(d.status||"-")} • Created: ${fmt(d.createdAt)}</div>
    <hr style="border:none;border-top:1px solid #e6eef6;margin:10px 0"/>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <div class="muted"><strong>Patient</strong></div>
        <div>${esc(d.patient?.firstName||"-")} ${esc(d.patient?.lastName||"")}</div>
        <div>DOB: ${esc(d.patient?.dob||"-")}</div>
        <div>Wound: ${esc(d.patient?.woundType||"-")}</div>
        <div>Notes: ${esc(d.patient?.notes||"-")}</div>
      </div>
      <div>
        <div class="muted"><strong>Preference</strong></div>
        <div>Mode: ${esc(d.preference?.mode||"-")}</div>
        <div>Preferred: ${esc(d.preference?.preferredDate||"-")} ${esc(d.preference?.preferredTime||"")}</div>
        <div>Address: ${esc(d.preference?.address||"-")}</div>
        <div>Contact: ${esc(d.contact?.email||d.contact?.phone||"-")}</div>
      </div>
    </div>
  `;
}

function bindDetails(){
  onSnapshot(collection(db,"bookings",bookingId,"bookingDetails"), (snap)=>{
    const rows=[];
    snap.forEach(s=>{
      const d=s.data()||{};
      rows.push(`
        <tr>
          <td data-label="Title">${esc(d.title||"-")}</td>
          <td data-label="Note">${esc(d.note||"")}</td>
          <td data-label="Created">${fmt(d.createdAt)}</td>
        </tr>`);
    });
    tblDetails.innerHTML = rows.join("") || `<tr><td colspan="3" class="muted">No notes yet.</td></tr>`;
  });
}

function bindTasks(){
  onSnapshot(collection(db,"bookings",bookingId,"tasks"), (snap)=>{
    const rows=[];
    snap.forEach(s=>{
      const d=s.data()||{};
      
  // tasks table:
  rows.push(`
    <tr>
      <td data-label="Title">${esc(d.title||"-")}</td>
      <td data-label="Assignee">${esc(d.assignedTo||"-")}</td>
      <td data-label="Status">${esc(d.status||"-")}</td>
      <td data-label="When">${fmt(d.scheduledAt)}</td>
    </tr>`);
    });
    tblTasks.innerHTML = rows.join("") || `<tr><td colspan="4" class="muted">No tasks for this booking.</td></tr>`;
  });
}

formDetail.addEventListener("close", async ()=>{
  if (formDetail.returnValue !== "save") return;
  const title = document.getElementById("detailTitle").value.trim();
  const note  = document.getElementById("detailNote").value.trim();
  if (!title) { detailMsg.textContent="Title required"; dlgDetail.showModal(); return; }
  try{
    await addDoc(collection(db,"bookings",bookingId,"bookingDetails"), {
      title, note, createdAt: serverTimestamp(), createdBy: (auth.currentUser?.uid||"")
    });
  }catch(err){
    detailMsg.textContent = "⛔ " + (err.message||"Failed to add");
    dlgDetail.showModal();
  }
});

// bookingDetails table:

  
