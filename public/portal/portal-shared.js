import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, multiFactor, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
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
export const app = initializeApp(firebaseConfig,"phwc-patient-portal");
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const esc = (x)=>String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
export const fmtDate = (v)=>{ if(!v) return "—"; const d=v?.toDate?v.toDate():new Date(v); return Number.isNaN(d.getTime())?"—":d.toLocaleDateString(); };
export const fmtDateTime = (v)=>{ if(!v) return "—"; const d=v?.toDate?v.toDate():new Date(v); return Number.isNaN(d.getTime())?"—":d.toLocaleString(); };

export const portalReady = new Promise((resolve,reject)=>{
  let unsub=()=>{};
  unsub=onAuthStateChanged(auth,async(user)=>{
    unsub();
    if(!user){ location.replace("/portal/login"); reject(new Error("Authentication required")); return; }
    try{
      if(!user.emailVerified){ await signOut(auth); location.replace("/portal/login?reason=email-verification"); reject(new Error("Verified email required")); return; }
      const factors=multiFactor(user).enrolledFactors || [];
      if(factors.length<1){ await signOut(auth); location.replace("/portal/login?reason=mfa-required"); reject(new Error("Multi-factor authentication required")); return; }
      const snap=await getDoc(doc(db,"portalUsers",user.uid));
      if(!snap.exists() || snap.data()?.active!==true || !snap.data()?.patientId){ await signOut(auth); location.replace("/portal/login?reason=not-authorized"); reject(new Error("Portal access not provisioned")); return; }
      resolve({user,profile:snap.data(),patientId:String(snap.data().patientId)});
    }catch(err){ reject(err); }
  },reject);
});

export async function portalSignOut(){ await signOut(auth); location.replace("/portal/login"); }
