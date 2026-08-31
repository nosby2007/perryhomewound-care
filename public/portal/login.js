import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, getMultiFactorResolver, multiFactor, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, TotpMultiFactorGenerator } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const config={apiKey:"AIzaSyCdIpeMxhFMRpzNxmngoP3QY8ZZl2ABG_s",authDomain:"credential-4f22b.firebaseapp.com",projectId:"credential-4f22b",storageBucket:"credential-4f22b.firebasestorage.app",messagingSenderId:"107240797765",appId:"1:107240797765:web:9ae5b37760081911ad952c"};
const app=initializeApp(config,"phwc-portal-login"); const auth=getAuth(app); const db=getFirestore(app);
const $=(id)=>document.getElementById(id); const err=$("loginError");

function message(text){err.textContent=text||"";}
async function authorize(user){
  if(!user.emailVerified){await signOut(auth);throw new Error("Please verify your email before using the patient portal.");}
  const profile=await getDoc(doc(db,"portalUsers",user.uid));
  if(!profile.exists()||profile.data()?.active!==true||!profile.data()?.patientId){await signOut(auth);throw new Error("This account is not authorized for patient portal access. Contact Perry Home Wound Care.");}
  if((multiFactor(user).enrolledFactors||[]).length<1){location.replace("/portal/security-setup");return;}
  location.replace("/portal");
}

async function resolveMfa(error){
  const resolver=getMultiFactorResolver(auth,error); const hint=resolver.hints.find(h=>h.factorId==="totp")||resolver.hints[0];
  if(!hint || hint.factorId!=="totp") throw new Error("Your configured second factor requires a supported verification flow. Contact Perry Home Wound Care for portal access assistance.");
  const code=window.prompt("Enter the 6-digit code from your authenticator app:");
  if(!code) throw new Error("Multi-factor verification was cancelled.");
  const assertion=TotpMultiFactorGenerator.assertionForSignIn(hint.uid,code.trim());
  const result=await resolver.resolveSignIn(assertion); return result.user;
}

$("loginForm").addEventListener("submit",async(e)=>{
  e.preventDefault(); message(""); $("loginBtn").disabled=true;
  try{
    let user;
    try{ user=(await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value)).user; }
    catch(error){ if(error.code==="auth/multi-factor-auth-required") user=await resolveMfa(error); else throw error; }
    await authorize(user);
  }catch(error){message(error?.message||"Unable to sign in securely.");}
  finally{$("loginBtn").disabled=false;}
});

$("forgotBtn").addEventListener("click",async()=>{
  const email=$("email").value.trim(); if(!email) return message("Enter your email first, then select Forgot password.");
  try{await sendPasswordResetEmail(auth,email);message("If the account is valid, password reset instructions have been sent.");}catch{message("Unable to start password reset. Contact Perry Home Wound Care.");}
});

const reason=new URLSearchParams(location.search).get("reason");
if(reason==="mfa-required")message("Multi-factor authentication is required before portal access.");
if(reason==="email-verification")message("A verified email address is required before portal access.");
if(reason==="not-authorized")message("This account is not currently authorized for the patient portal.");
