import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, updateDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

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

document.getElementById("yr").textContent = new Date().getFullYear();
const messagesEl = document.getElementById("messages");
const who = document.getElementById("who");
const logoutBtn = document.getElementById("logoutBtn");
let currentFilter = "all";

// Gate: only admins may view
onAuthStateChanged(auth, async (user) => {
  if (!user) { location.href = "/admin/login/admin-login.html"; return; }
 who.textContent = user.email || user.uid;

  const a = await getDoc(doc(db, "admins", user.uid));
  if (!a.exists() || a.data().active !== true) {
    await signOut(auth);
    location.href = "/admin/login/admin-login.html";
    return;
  }
  // Authorized → load messages
  loadMessages();
});

logoutBtn.addEventListener("click", async (e) => {
  e.preventDefault();
 await signOut(auth);
  location.href = "./login/admin-login.html";
});

function renderMessage(id, data){
  return `
  <div class="card" data-id="${id}" data-status="${data.status}">
    <div class="card-header">
      <h3>${escapeHtml(data.name || "No Name")}</h3>
      <span class="badge ${data.status}">${escapeHtml(data.status)}</span>
    </div>
    <p><strong>Email:</strong> ${escapeHtml(data.email || "-")} | <strong>Phone:</strong> ${escapeHtml(data.phone || "-")}</p>
    <p><strong>Reason:</strong> ${escapeHtml(data.reason || "-")}</p>
    <p>${escapeHtml(data.message || "")}</p>
    <small class="muted">Received: ${data.createdAt?.toDate?.().toLocaleString?.() || "-"}</small>
    <div class="actions">
      <button class="mark-read">Mark as Read</button>
      <button class="archive">Archive</button>
    </div>
  </div>`;
}

function loadMessages(){
  const qy = query(collection(db, "contacts"), orderBy("createdAt", "desc"));
  onSnapshot(qy, (snap)=>{
    if (snap.empty) { messagesEl.innerHTML = "<p>No messages yet.</p>"; return; }
    let html = "";
    snap.forEach(docSnap=>{
      const d = docSnap.data();
      if (currentFilter==="all" || d.status===currentFilter) html += renderMessage(docSnap.id, d);
    });
    messagesEl.innerHTML = html;
    bindActions();
  }, (err)=>{
    messagesEl.innerHTML = `<p style="color:#b91c1c">Permission error: ${escapeHtml(err.message)}</p>`;
  });
}

function bindActions(){
  document.querySelectorAll(".mark-read").forEach(btn=>{
    btn.addEventListener("click", async e=>{
      const card = e.target.closest(".card");
      await updateDoc(doc(db, "contacts", card.dataset.id), {status:"read"});
    });
  });
  document.querySelectorAll(".archive").forEach(btn=>{
    btn.addEventListener("click", async e=>{
      const card = e.target.closest(".card");
      await updateDoc(doc(db, "contacts", card.dataset.id), {status:"archived"});
    });
  });
}

document.querySelectorAll(".filter-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    currentFilter = btn.dataset.status;
    loadMessages();
  });
});

function escapeHtml(x){ return String(x).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#039;' }[m])); }
