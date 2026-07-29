// nav-auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
// Optionnel App Check en prod :
// import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyCdIpeMxhFMRpzNxmngoP3QY8ZZl2ABG_s",
  authDomain: "credential-4f22b.firebaseapp.com",
  projectId: "credential-4f22b",
  storageBucket: "credential-4f22b.firebasestorage.app", // vérifie: souvent c'est *.appspot.com
  messagingSenderId: "107240797765",
  appId: "1:107240797765:web:9ae5b37760081911ad952c",
  measurementId: "G-XKYX4WC53E"
};

const app  = initializeApp(firebaseConfig);
// initializeAppCheck(app, { provider: new ReCaptchaV3Provider("YOUR_RECAPTCHA_V3_SITE_KEY"), isTokenAutoRefreshEnabled: true });

const auth = getAuth(app);
const db   = getFirestore(app);

const el = document.getElementById("navAuth");
if (el) el.innerHTML = `<a class="btn" href="./admin/login/admin-login.html">Sign in</a>`; // état initial

onAuthStateChanged(auth, async (user) => {
  if (!el) return;

  if (!user) {
    // Déconnecté → bouton Sign in
    el.innerHTML = `<a class="btn" href="./admin/login/admin-login.html">Sign in</a>`;
    return;
  }

  // Connecté → check rôle admin
  const adminSnap = await getDoc(doc(db, "admins", user.uid));
  const isAdmin = adminSnap.exists() && adminSnap.data().active === true;
  const who = user.email || user.uid.slice(0, 6);

  if (isAdmin) {
    // Admin → bouton Admin + Sign out
    el.innerHTML = `
      <span class="small muted" style="margin-right:10px; color:#888; font-size:0.95em; vertical-align:middle;">${escapeHtml(who)}</span>
      <a class="btn" href="/admin/admin-dashboard.html" style="background:#1976d2; color:#fff; margin-right:6px; padding:6px 14px; border-radius:4px; text-decoration:none;">Admin</a>
      <a class="btn" href="#" id="navSignOut" style="background:#e53935; color:#fff; padding:6px 14px; border-radius:4px; text-decoration:none;">Sign out</a>
    `;
    document.getElementById("navSignOut")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await signOut(auth);
      location.href = "/admin/login/admin-login.html";
    });
  } else {
    // Connecté mais non-admin → juste Sign out
    el.innerHTML = `
      <span class="small muted" style="margin-right:6px;">${escapeHtml(who)}</span>
      <a class="btn" href="#" id="navSignOut">Sign out</a>
    `;
    document.getElementById("navSignOut")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await signOut(auth);
      // on reste sur la page courante
      location.reload();
    });
  }
});

function escapeHtml(x){
  return String(x).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#039;'}[m]));
}
