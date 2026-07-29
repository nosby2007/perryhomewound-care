// ---- Firebase (v10 modular) ----
// Fill with your Firebase project values
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
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
const db = getFirestore(app);

// Optional App Check
// initializeAppCheck(app, { provider: new ReCaptchaV3Provider("YOUR_RECAPTCHA_V3_SITE_KEY"), isTokenAutoRefreshEnabled: true });

// ---- Prefill service from URL ----
const params = new URLSearchParams(location.search);
const serviceSlug = params.get("service") || "";
const serviceTitle = params.get("title") || "";

document.getElementById("serviceSlug").value = serviceSlug;
document.getElementById("serviceTitle").value = serviceTitle;
document.getElementById("svcTitle").textContent = serviceTitle || "Any service";

// ---- Form handling ----
const form = document.getElementById("bookingForm");
const statusEl = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  const data = Object.fromEntries(new FormData(form).entries());
  const required = ["firstName","lastName","dob","woundType","mode","preferredDate","preferredTime","contactName","phone","email","consent"];
  for (const k of required) {
    if (!data[k]) {
      showError("Please complete all required fields.");
      submitBtn.disabled = false; submitBtn.textContent = "Request appointment";
      return;
    }
  }

  const booking = {
    serviceSlug: data.serviceSlug || null,
    serviceTitle: data.serviceTitle || null,
    patient: {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      dob: data.dob,
      woundType: data.woundType,
      notes: (data.notes || "").trim()
    },
    preference: {
      mode: data.mode,
      preferredDate: data.preferredDate,
      preferredTime: data.preferredTime,
      address: (data.address || "").trim()
    },
    contact: {
      name: data.contactName.trim(),
      phone: data.phone.trim(),
      email: data.email.trim(),
      refSource: data.refSource || ""
    },
    status: "pending",
    createdAt: serverTimestamp(),
    userAgent: navigator.userAgent || ""
  };

  try {
    await addDoc(collection(db, "bookings"), booking);
    document.getElementById("succSvc").textContent = booking.serviceTitle || "Your selected service";
    document.getElementById("successWrap").hidden = false;
    form.hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    showError("Could not submit your request. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Request appointment";
  }
});

function showError(msg){
  statusEl.textContent = msg;
  statusEl.style.color = "#b91c1c";
}
