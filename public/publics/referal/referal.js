// Firebase v10 (modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
// Optionnel: App Check reCAPTCHA v3 (recommandé en prod)
// import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js";

// TODO: remplace par ta config (credential-4f22b)
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

document.getElementById("yr").textContent = new Date().getFullYear();

const form   = document.getElementById("refForm");
const status = document.getElementById("formStatus");
const send   = document.getElementById("sendBtn");
const toast  = document.getElementById("toast");

// Pré-remplissage service depuis ?service= & ?title=
{
  const p = new URLSearchParams(location.search);
  const s = p.get("service");
  const t = p.get("title");
  if (s) document.getElementById("serviceSlug").value = s;
  if (t) document.getElementById("serviceTitle").value = t;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.textContent = "";
  send.disabled = true; send.textContent = "Envoi…";

  const data = Object.fromEntries(new FormData(form).entries());

  // Honeypot
  if (data.website) { return reset("Rejeté (anti-spam)."); }

  // Validation minimale
  const required = ["refType","refName","refEmail","patientName","patientDob","diagnosis","urgency","notes","consent"];
  const missing = required.filter(k => !data[k] || (k!=="consent" && !String(data[k]).trim()));
  if (missing.length || !form.querySelector('input[name="consent"]').checked){
    return reset("Merci de compléter tous les champs obligatoires (*).");
  }

  const doc = {
    // Contexte service (facultatif)
    serviceSlug: (data.serviceSlug||"").trim(),
    serviceTitle: (data.serviceTitle||"").trim(),

    // Référent
    refType: data.refType,
    refName: data.refName.trim(),
    refOrg: (data.refOrg||"").trim(),
    refRole: (data.refRole||"").trim(),
    refEmail: data.refEmail.trim(),
    refPhone: (data.refPhone||"").trim(),

    // Patient
    patientName: data.patientName.trim(),
    patientDob: data.patientDob,
    patientArea: (data.patientArea||"").trim(),
    diagnosis: data.diagnosis.trim(),
    urgency: data.urgency,
    notes: data.notes.trim(),

    // Préférences / meta
    contactPref: data.contactPref || "",
    consent: !!data.consent,
    createdAt: serverTimestamp(),
    status: "new",               // statut initial
    page: location.pathname + location.search,
    userAgent: navigator.userAgent || "",
  };

  try {
    await addDoc(collection(db, "patientReferal"), doc); // ⚠️ nom de collection selon ta demande
    form.reset();
    showToast();
    reset("✅ Référence envoyée. Nous vous recontactons rapidement.");
  } catch (err) {
    console.error(err);
    reset("⛔ Impossible d'envoyer. Réessaie plus tard.");
  }
});

function reset(msg){
  status.textContent = msg || "";
  send.disabled = false; send.textContent = "Envoyer";
}
function showToast(){
  toast.hidden = false;
  setTimeout(()=> toast.hidden = true, 3500);
}
