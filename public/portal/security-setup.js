import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, multiFactor, onAuthStateChanged, signOut, TotpMultiFactorGenerator } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const config={apiKey:"AIzaSyCdIpeMxhFMRpzNxmngoP3QY8ZZl2ABG_s",authDomain:"credential-4f22b.firebaseapp.com",projectId:"credential-4f22b",storageBucket:"credential-4f22b.firebasestorage.app",messagingSenderId:"107240797765",appId:"1:107240797765:web:9ae5b37760081911ad952c"};
const app=initializeApp(config,"phwc-portal-mfa");const auth=getAuth(app);const db=getFirestore(app);const $=id=>document.getElementById(id);let currentUser=null;let secret=null;
function fail(m){$("setupError").textContent=m||"";}

onAuthStateChanged(auth,async user=>{
  if(!user){location.replace("/portal/login");return;}
  currentUser=user;
  if(!user.emailVerified){await signOut(auth);location.replace("/portal/login?reason=email-verification");return;}
  const profile=await getDoc(doc(db,"portalUsers",user.uid));
  if(!profile.exists()||profile.data()?.active!==true||!profile.data()?.patientId){await signOut(auth);location.replace("/portal/login?reason=not-authorized");return;}
  if((multiFactor(user).enrolledFactors||[]).length>0){location.replace("/portal");}
});

$("generateBtn").addEventListener("click",async()=>{
  fail("");if(!currentUser)return;
  try{const session=await multiFactor(currentUser).getSession();secret=await TotpMultiFactorGenerator.generateSecret(session);$("secretKey").value=secret.secretKey;$("setupSecret").classList.remove("hidden");$("generateBtn").disabled=true;}catch(e){fail(e?.message||"Unable to start authenticator setup.");}
});

$("enrollBtn").addEventListener("click",async()=>{
  fail("");if(!secret||!currentUser)return fail("Generate the authenticator setup first.");const code=$("totpCode").value.trim();if(!/^\d{6,8}$/.test(code))return fail("Enter the verification code from your authenticator app.");
  $("enrollBtn").disabled=true;
  try{const assertion=TotpMultiFactorGenerator.assertionForEnrollment(secret,code);await multiFactor(currentUser).enroll(assertion,"PHWC Authenticator");location.replace("/portal");}catch(e){fail(e?.message||"The verification code could not be confirmed.");$("enrollBtn").disabled=false;}
});
$("signOutBtn").addEventListener("click",async()=>{await signOut(auth);location.replace("/portal/login");});
