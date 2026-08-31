// -------- Firebase boot --------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCdIpeMxhFMRpzNxmngoP3QY8ZZl2ABG_s",
  authDomain: "credential-4f22b.firebaseapp.com",
  projectId: "credential-4f22b",
  storageBucket: "credential-4f22b.firebasestorage.app",
  messagingSenderId: "107240797765",
  appId: "1:107240797765:web:9ae5b37760081911ad952c",
  measurementId: "G-XKYX4WC53E"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const adminReady = new Promise((resolve, reject)=>{
  let unsubscribe = ()=>{};
  unsubscribe = onAuthStateChanged(auth, async (user)=>{
    unsubscribe();
    if(!user){
      go("/admin/login/admin-login.html");
      reject(new Error("Authentication required"));
      return;
    }
    try{
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
        go("/admin/login/admin-login.html?error=access-denied");
        reject(new Error("Administrator access required"));
        return;
      }
      resolve(user);
    }catch(error){
      reject(error);
    }
  }, reject);
});

// -------- Utilities --------
export const esc = (x)=> String(x ?? "").replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot', "'":'&#039;' }[m]));
export const fmt = (ts)=> ts?.toDate?.()?.toLocaleString?.() || "-";
export const mailto = (to, subject, body)=>{ const u = new URL("mailto:"+(to||"")); if(subject)u.searchParams.set("subject",subject); if(body)u.searchParams.set("body",body); return u.toString(); };
export const badge = (st)=> `<span class="badge status-${esc(st||'new')}">${esc(st||'new')}</span>`;
export const go = (url)=> window.location.assign(url);

function addNavItem(nav, target, href, label){
  if(!nav || nav.querySelector(`[data-target="${target}"]`)) return;
  const link = document.createElement("a");
  link.className = "sitem";
  link.dataset.target = target;
  link.href = href;
  link.textContent = label;
  const usersLink = nav.querySelector('[data-target="users"]');
  if(usersLink) nav.insertBefore(link, usersLink); else nav.appendChild(link);
}

function addCommandCenter(nav){
  if(!nav || nav.querySelector('[data-target="command"]')) return;
  const link = document.createElement("a");
  link.className = "sitem";
  link.dataset.target = "command";
  link.href = "/admin/admin-dashboard.html";
  link.textContent = "⌁ Command Center";
  nav.insertBefore(link, nav.firstElementChild || null);
}

// Sidebar current item highlight + shared growth navigation
export function mountSidebar(activeId){
  const who = document.getElementById("who");
  const logoutBtn = document.getElementById("logoutBtn");
  const nav = document.querySelector(".snav");

  addCommandCenter(nav);
  addNavItem(nav, "crm", "/admin/crm.html", "Outreach CRM");
  addNavItem(nav, "social", "/admin/social-studio.html", "Content Studio");
  addNavItem(nav, "blog", "/admin/blog-studio.html", "Blog Studio");

  if(activeId === "social" && !document.querySelector('script[data-phwc-social-share]')){
    const shareScript = document.createElement("script");
    shareScript.src = "/admin/social-share.js";
    shareScript.dataset.phwcSocialShare = "1";
    document.head.appendChild(shareScript);
  }

  if(activeId === "crm" && !document.querySelector('script[data-hair-braids-crm]')){
    const hairScript = document.createElement("script");
    hairScript.src = "/admin/hair-braids-crm.js";
    hairScript.dataset.hairBraidsCrm = "1";
    document.head.appendChild(hairScript);
  }

  document.querySelectorAll(".snav .sitem").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.target === activeId);
  });
  adminReady.then((user)=>{
    if (who) who.textContent = user.email || user.uid;
  }).catch(()=>{});
  logoutBtn?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await signOut(auth);
    go("/admin/login/admin-login.html");
  });
}
