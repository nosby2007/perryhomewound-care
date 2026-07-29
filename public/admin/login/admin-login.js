import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

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
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ----- DOM -----
const statusEl  = document.getElementById("status");
const emailForm = document.getElementById("emailForm");
const emailBtn  = document.getElementById("emailBtn");
const googleBtn = document.getElementById("googleBtn");

// ----- UI helpers -----
const msg = (t, cls="") => { if(statusEl){ statusEl.textContent=t||""; statusEl.className=`small ${cls}`; } };
const setBusy = (b) => {
  if (emailBtn)  { emailBtn.disabled = b; emailBtn.textContent = b ? "Signing in…" : "Sign in"; }
  if (googleBtn) { googleBtn.disabled = b; }
};
const go = (url) => window.location.assign(url);
const isClinicianRole = (r) => ["nurse","lpn","np","caregiver"].includes(String(r||"").toLowerCase());
const isAdminRole     = (r) => String(r||"").toLowerCase() === "admin";

// Persist session (no top-level await to avoid old browser issues)
setPersistence(auth, browserLocalPersistence).catch(()=>{});

// Auto-route if already signed in
onAuthStateChanged(auth, async (user)=>{
  if (!user) return;
  try { await routeByRole(user.uid); }
  catch(e){ console.error("[route] onAuth error", e); msg("Signed in but cannot route. Contact admin.", "err"); }
});

// Email/password sign-in
emailForm?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  setBusy(true);
  try {
    const data = Object.fromEntries(new FormData(emailForm).entries());
    const cred = await signInWithEmailAndPassword(auth, data.email, data.password);
    await routeByRole(cred.user.uid);
  } catch (err) {
    console.error("[auth] email error:", err);
    msg(err.message || "Sign-in failed.", "err");
  } finally { setBusy(false); }
});

// Google sign-in (optional)
googleBtn?.addEventListener("click", async ()=>{
  setBusy(true);
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await routeByRole(cred.user.uid);
  } catch (err) {
    console.error("[auth] google error:", err);
    msg(err.message || "Google sign-in failed.", "err");
  } finally { setBusy(false); }
});

// ----- Core router (TDZ-safe: no 'role' before init) -----
async function routeByRole(uid){
  let profileSnap;
  let adminSnap;
  try {
    [profileSnap, adminSnap] = await Promise.all([
      getDoc(doc(db, "users", uid)),
      getDoc(doc(db, "admins", uid))
    ]);
  } catch(e) {
    console.error("[route] role lookup failed:", e);
    msg("Cannot verify your access. Contact an administrator.", "err");
    return;
  }

  const allowlistedAdmin = adminSnap.exists() && adminSnap.data()?.active === true;
  if (allowlistedAdmin) { go("/admin/admin-dashboard.html"); return; }
  if (!profileSnap.exists()) {
    await signOut(auth);
    msg("Your profile is not ready yet. Contact an administrator.", "err");
    return;
  }

  const profile  = profileSnap.data() || {};
  const userRole = String(profile.role || "").toLowerCase(); // ✅ define before use
  const isActive = profile.active === true;

  // Admins
  if (isAdminRole(userRole) && isActive) { go("/admin/admin-dashboard.html"); return; }

  // Clinicians
  if (isClinicianRole(userRole)) {
    if (!isActive) { await signOut(auth); msg("Your account is pending approval. Contact admin.", "err"); return; }
    go("/admin/portal.html"); return;
  }

  // Everyone else
  await signOut(auth);
  msg("Your account has no authorized role. Contact admin.", "err");
}
