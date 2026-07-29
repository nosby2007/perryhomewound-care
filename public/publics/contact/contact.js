// ---------- Firebase (v10 modular) ----------
// 1) Replace with your Firebase project config
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
// Optional App Check (recommended for public forms)
// import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js";

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
const db  = getFirestore(app);

// initializeAppCheck(app, { provider: new ReCaptchaV3Provider("YOUR_RECAPTCHA_V3_SITE_KEY"), isTokenAutoRefreshEnabled: true });

// ---------- Page setup ----------
document.getElementById("yr").textContent = new Date().getFullYear();

// Preselect reason from query string (?reason=Referral)
const p = new URLSearchParams(location.search);
const pre = p.get("reason");
if (pre) document.querySelector('select[name="reason"]').value = pre;

// ---------- Form logic ----------
const form   = document.getElementById("contactForm");
const send   = document.getElementById("sendBtn");
const status = document.getElementById("formStatus");
const toast  = document.getElementById("toast");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.textContent = "";
  send.disabled = true; send.textContent = "Sending…";

  const data = Object.fromEntries(new FormData(form).entries());

  // Honeypot
  if (data.website) { reset("Blocked by anti-spam."); return; }

  // Validation
  if (!data.name?.trim() || !data.email?.trim() || !data.message?.trim() || !data.consent) {
    reset("Please complete all required fields.");
    return;
  }

  const doc = {
    name: data.name.trim(),
    email: data.email.trim(),
    phone: (data.phone || "").trim(),
    reason: data.reason || "",
    message: data.message.trim(),
    createdAt: serverTimestamp(),
    status: "new",
    userAgent: navigator.userAgent || "",
    page: location.pathname + location.search
  };

  try {
    await addDoc(collection(db, "contacts"), doc);
    form.reset();
    showToast();
    reset("✅ Thank you! We’ll be in touch soon.");
  } catch (err) {
    console.error(err);
    reset("Could not send your message. Please try again.");
  }
});

function reset(msg){
  status.textContent = msg || "";
  send.disabled = false; send.textContent = "Send message";
}

function showToast(){
  toast.hidden = false;
  setTimeout(()=> toast.hidden = true, 3500);
}
