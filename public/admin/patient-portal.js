import { adminReady, app, auth, db, storage, esc } from "/admin/admin-shared.js";
import { addDoc, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { ref as storageRef, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-functions.js";

await adminReady;
const $=id=>document.getElementById(id);const msg=t=>$("paMsg").textContent=t||"";const text=id=>($(id)?.value||"").trim();
const patientId=()=>text("patientId");const asDate=id=>$(id)?.value?new Date(`${$(id).value}T12:00:00`):null;
function requirePatient(){const id=patientId();if(!id)throw new Error("Search and select a patient from the list first.");return id;}
function safeName(name){return String(name||"document").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,120);}
function httpsUrl(value){if(!value)return"";const u=new URL(value);if(u.protocol!=="https:")throw new Error("Payment URL must use HTTPS.");return u.href;}

const createPortalAccountFn = httpsCallable(getFunctions(app), "createPatientPortalAccount");
let patientLabelToId = new Map();

async function loadPatientOptions(){
  const snap = await getDocs(query(collection(db,"patientReferal"), orderBy("createdAt","desc"), limit(300)));
  patientLabelToId = new Map();
  const options = snap.docs.map(d=>{
    const p = d.data();
    const name = (p.patientName||"").trim() || "(Unnamed patient)";
    const dob = (p.patientDob||"").trim();
    const label = `${name}${dob?` — DOB ${dob}`:""} (Ref ${d.id.slice(0,6)})`;
    patientLabelToId.set(label, {id:d.id, name});
    return label;
  });
  $("patientOptions").innerHTML = options.map(l=>`<option value="${esc(l)}"></option>`).join("");
}
loadPatientOptions().catch(()=>msg("Unable to load patient search list."));

$("patientSearch").addEventListener("input",()=>{
  const match = patientLabelToId.get($("patientSearch").value);
  if(match){ $("patientId").value = match.id; if(!text("displayName")) $("displayName").value = match.name; }
  else { $("patientId").value = ""; }
});

$("createPortalAccount").addEventListener("click",async()=>{
  msg("");$("portalCredentials").textContent="";
  try{
    const id=requirePatient();const email=text("patientEmail");
    if(!email) throw new Error("Enter the patient's email address.");
    const nextVisit = $("portalNextVisit").value ? new Date(`${$("portalNextVisit").value}T12:00:00`).toISOString() : null;
    const result = await createPortalAccountFn({patientId:id,email,displayName:text("displayName"),primaryPayer:text("portalPayer"),nextVisit});
    const {tempPassword} = result.data||{};
    msg("Portal account created. Share the login below with the patient through a secure channel; they'll be asked to set a new password and MFA on first sign-in.");
    $("portalCredentials").innerHTML=`<strong>Login:</strong> ${esc(email)} &nbsp; <strong>Temporary password:</strong> <code>${esc(tempPassword||"")}</code>`;
    await loadWounds();
  }catch(e){msg(e?.message||"Unable to create the portal account.");}
});

$("savePortalLink").addEventListener("click",async()=>{
  msg("");try{
    const id=requirePatient();
    const existing=await getDocs(query(collection(db,"portalUsers"),where("patientId","==",id),limit(1)));
    if(existing.empty) throw new Error('No portal account is linked yet for this patient. Use "Create portal account" first.');
    const uid=existing.docs[0].id;
    await updateDoc(doc(db,"portalUsers",uid),{active:$("portalActive").value==="true",displayName:text("displayName"),updatedAt:serverTimestamp(),updatedBy:auth.currentUser?.uid||""});
    await setDoc(doc(db,"patientPortal",id),{displayName:text("displayName"),primaryPayer:text("portalPayer"),nextVisit:asDate("portalNextVisit"),updatedAt:serverTimestamp(),updatedBy:auth.currentUser?.uid||""},{merge:true});
    msg("Portal profile updated.");await loadWounds();
  }catch(e){msg(e?.message||"Unable to update portal profile.");}
});

async function loadWounds(){
  const id=patientId();if(!id)return;const snap=await getDocs(query(collection(db,"patientPortal",id,"wounds"),orderBy("updatedAt","desc")));const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
  $("woundAdminList").innerHTML=rows.length?rows.map(w=>`<div style="padding:6px 0;border-bottom:1px solid #eee"><strong>${esc(w.location||"Wound")}</strong> · ID <code>${esc(w.id)}</code><button class="btn" data-use-wound="${esc(w.id)}" style="margin-left:8px">Use for measurement</button></div>`).join(""):"No portal wounds published yet.";
}
$("loadPatient").addEventListener("click",async()=>{msg("");try{requirePatient();await loadWounds();msg("Patient portal data loaded.");}catch(e){msg(e.message);}});
document.addEventListener("click",e=>{const b=e.target.closest("[data-use-wound]");if(b){e.preventDefault();$("mWoundId").value=b.dataset.useWound;}});

$("addWound").addEventListener("click",async()=>{msg("");try{const id=requirePatient();const ref=await addDoc(collection(db,"patientPortal",id,"wounds"),{location:text("wLocation"),type:text("wType"),currentTreatment:text("wTreatment"),active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:auth.currentUser?.uid||""});$("mWoundId").value=ref.id;msg("Wound published to portal.");await loadWounds();}catch(e){msg(e?.message||"Unable to add wound.");}});

$("addMeasurement").addEventListener("click",async()=>{msg("");try{const id=requirePatient(),wid=text("mWoundId");if(!wid)throw new Error("Select or enter a wound ID.");const length=Number($("mLength").value||0),width=Number($("mWidth").value||0),depth=Number($("mDepth").value||0),measuredAt=asDate("mDate")||new Date();await addDoc(collection(db,"patientPortal",id,"wounds",wid,"measurements"),{length,width,depth,area:length*width,measuredAt,createdAt:serverTimestamp(),createdBy:auth.currentUser?.uid||""});await updateDoc(doc(db,"patientPortal",id,"wounds",wid),{lastMeasuredAt:measuredAt,updatedAt:serverTimestamp()});msg("Measurement published. Progress chart will update for the patient.");}catch(e){msg(e?.message||"Unable to add measurement.");}});

$("addVisit").addEventListener("click",async()=>{msg("");try{const id=requirePatient();await addDoc(collection(db,"patientPortal",id,"visits"),{visitDate:asDate("vDate")||new Date(),visitType:text("vType")||"Wound care visit",summary:text("vSummary"),publishedAt:serverTimestamp(),publishedBy:auth.currentUser?.uid||""});msg("Visit summary published.");}catch(e){msg(e?.message||"Unable to publish visit.");}});

$("addLab").addEventListener("click",async()=>{msg("");try{const id=requirePatient();await addDoc(collection(db,"patientPortal",id,"labs"),{orderedAt:asDate("lDate")||new Date(),name:text("lName"),status:$("lStatus").value,resultSummary:text("lResult"),publishedAt:serverTimestamp(),publishedBy:auth.currentUser?.uid||""});msg("Lab/order published.");}catch(e){msg(e?.message||"Unable to publish lab/order.");}});

$("addBilling").addEventListener("click",async()=>{msg("");try{const id=requirePatient();await addDoc(collection(db,"patientPortal",id,"billing"),{serviceDate:asDate("bDate")||new Date(),description:text("bDescription"),payer:text("bPayer"),claimStatus:text("bClaimStatus"),status:text("bClaimStatus")||"Pending",insuranceBilled:Number($("bInsurance").value||0),patientResponsibility:Number($("bPatient").value||0),paymentUrl:httpsUrl(text("bPaymentUrl")),publishedAt:serverTimestamp(),publishedBy:auth.currentUser?.uid||""});msg("Billing status published. No card data is stored in PHWC.");}catch(e){msg(e?.message||"Unable to publish billing.");}});

$("publishDocument").addEventListener("click",async()=>{msg("");try{const id=requirePatient(),file=$("dFile").files?.[0];if(!file)throw new Error("Choose a PDF or image.");const allowed=["application/pdf","image/jpeg","image/png","image/webp"];if(!allowed.includes(file.type))throw new Error("Only PDF, JPEG, PNG and WebP are allowed.");if(file.size>15*1024*1024)throw new Error("Maximum document size is 15 MB.");const documentId=crypto.randomUUID();const path=`patientPortal/${id}/${documentId}/${safeName(file.name)}`;await uploadBytes(storageRef(storage,path),file,{contentType:file.type,customMetadata:{patientId:id,publishedBy:auth.currentUser?.uid||""}});await addDoc(collection(db,"patientPortal",id,"documents"),{title:text("dTitle")||file.name,documentType:$("dType").value,storagePath:path,contentType:file.type,size:file.size,publishedAt:serverTimestamp(),publishedBy:auth.currentUser?.uid||""});$("dFile").value="";msg("Document securely published to this patient's portal only.");}catch(e){msg(e?.message||"Unable to publish document.");}});
