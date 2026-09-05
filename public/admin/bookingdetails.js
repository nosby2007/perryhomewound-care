import { adminReady, auth, db, esc, fmt, mountSidebar } from "/admin/admin-shared.js";
import {
  addDoc, arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, query,
  serverTimestamp, Timestamp, updateDoc, where
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

mountSidebar("bookings");
const user = await adminReady;

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const bookingId = params.get("id");
if(!bookingId){ alert("Missing booking ID"); throw new Error("Missing booking ID"); }

const bookingRef = doc(db,"bookings",bookingId);
let booking = null;
let clinicianLabels = new Map();

const text = v => String(v ?? "").trim();
const fullName = patient => text(patient?.name || [patient?.firstName,patient?.lastName].filter(Boolean).join(" "));
const slugify = x => text(x).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const localInput = value => {
  const d = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if(!d || Number.isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toTimestamp = value => value ? Timestamp.fromDate(new Date(value)) : null;
const checked = id => $(id)?.checked === true;
const setCheck = (id,v) => { if($(id)) $(id).checked = v === true; };
const setValue = (id,v) => { if($(id)) $(id).value = v ?? ""; };

async function loadClinicians(){
  const snap = await getDocs(query(collection(db,"users"),where("active","==",true)));
  const allowed = new Set(["admin","nurse","rn","lpn","np","provider","caregiver"]);
  const options=[];
  snap.forEach(s=>{
    const d=s.data()||{}; const role=text(d.role).toLowerCase();
    if(!allowed.has(role)) return;
    const label=text(d.displayName||d.name||d.email||s.id);
    clinicianLabels.set(s.id,label);
    options.push({id:s.id,label,role});
  });
  options.sort((a,b)=>a.label.localeCompare(b.label));
  $("assignedTo").innerHTML=`<option value="">Unassigned</option>`+options.map(x=>`<option value="${esc(x.id)}">${esc(x.label)} — ${esc(x.role.toUpperCase())}</option>`).join("");
}

function bookingStatus(){ return text(booking?.intakeStatus || booking?.status || "pending").toLowerCase(); }

function populate(){
  const d=booking||{};
  const patient=d.patient||{}; const contact=d.contact||{}; const preference=d.preference||{}; const checklist=d.intakeChecklist||{};
  const name=fullName(patient);
  $("bTitle").textContent=name||"Booking Intake";
  $("heroPatient").textContent=name||"Unnamed booking request";
  $("heroSummary").textContent=`${text(d.serviceTitle||d.serviceSlug||"Wound care request")} · received ${fmt(d.createdAt)}`;
  $("heroStatus").textContent=bookingStatus().replaceAll("_"," ");
  $("heroStatus").className=`badge status-${bookingStatus()}`;

  setValue("patientName",name); setValue("patientDob",text(patient.dob)); setValue("patientPhone",text(contact.phone||patient.phone)); setValue("patientEmail",text(contact.email||patient.email));
  setValue("serviceAddress",text(preference.address||patient.address)); setValue("serviceTitle",text(d.serviceTitle||d.serviceSlug)); setValue("woundType",text(patient.woundType)); setValue("patientNotes",text(patient.notes));
  setValue("primaryPayer",text(d.primaryPayer||d.insurance?.primaryPayer||d.insurance?.payer)); setValue("secondaryPayer",text(d.secondaryPayer||d.insurance?.secondaryPayer));
  setValue("eligibilityStatus",text(d.eligibilityStatus||"Not Checked")); setValue("authorizationStatus",text(d.authorizationStatus||"Not Required")); setValue("authorizationNumber",text(d.authorizationNumber));
  setValue("intakeStatus",bookingStatus()); setValue("scheduledAt",localInput(d.scheduledAt)); setValue("preferredVisit",[text(preference.preferredDate),text(preference.preferredTime)].filter(Boolean).join(" ")||"Not specified"); setValue("intakeNotes",text(d.intakeNotes));
  if(d.assignedTo && !$("assignedTo").querySelector(`option[value="${CSS.escape(d.assignedTo)}"]`)){
    const opt=document.createElement("option"); opt.value=d.assignedTo; opt.textContent=text(d.assignedToLabel||d.assignedTo); $("assignedTo").appendChild(opt);
  }
  setValue("assignedTo",text(d.assignedTo));
  setCheck("docFaceSheet",checklist.faceSheet); setCheck("docOrder",checklist.order); setCheck("docInsurance",checklist.insurance); setCheck("docClinical",checklist.clinicalRecords); setCheck("contactConfirmed",checklist.contactConfirmed);
  updateReadiness();
}

function readinessItems(){
  const eligibility=$("eligibilityStatus").value;
  const auth=$("authorizationStatus").value;
  return [
    {ok:!!text($("patientName").value),label:"Patient identified"},
    {ok:!!(text($("patientPhone").value)||text($("patientEmail").value)),label:"Contact pathway available"},
    {ok:!!text($("serviceTitle").value),label:"Requested service defined"},
    {ok:!!text($("primaryPayer").value),label:"Primary payer entered"},
    {ok:!["Not Checked","Pending"].includes(eligibility),label:"Eligibility reviewed"},
    {ok:["Not Required","Approved"].includes(auth),label:"Authorization resolved"},
    {ok:!!$("assignedTo").value,label:"Operational owner assigned"},
    {ok:checked("docInsurance"),label:"Insurance information confirmed"},
    {ok:checked("contactConfirmed"),label:"Patient/family contact confirmed"},
    {ok:checked("docOrder")||auth==="Not Required",label:"Order/referral requirement addressed"}
  ];
}

function updateReadiness(){
  const items=readinessItems(); const done=items.filter(x=>x.ok).length; const pct=Math.round(done/items.length*100); const missing=items.filter(x=>!x.ok);
  $("readinessValue").textContent=`${pct}%`; $("readinessRing").style.setProperty("--score",`${pct}%`);
  $("readinessTitle").textContent=pct>=90?"Ready for clinical handoff":pct>=70?"Nearly ready":"Incomplete intake";
  $("readinessSummary").textContent=missing.length?`${missing.length} administrative item${missing.length===1?"":"s"} still need attention.`:"All core intake checks are complete.";
  $("readinessChip").textContent=pct>=90?"Ready":"Needs review"; $("readinessChip").className=pct>=90?"ready-chip":"missing-chip";
  $("missingList").innerHTML=missing.length?missing.map(x=>`<div class="checkitem"><span><strong>${esc(x.label)}</strong><span>Complete before final handoff when applicable.</span></span></div>`).join(""):`<div class="intake-note">No core intake gaps detected. Continue normal clinical verification and scheduling workflow.</div>`;
  return pct;
}

function formPatch(){
  const patient={...(booking?.patient||{}),name:text($("patientName").value),dob:text($("patientDob").value),woundType:text($("woundType").value),notes:text($("patientNotes").value)};
  const contact={...(booking?.contact||{}),phone:text($("patientPhone").value),email:text($("patientEmail").value)};
  const preference={...(booking?.preference||{}),address:text($("serviceAddress").value)};
  const assignedTo=$("assignedTo").value; const assignedToLabel=assignedTo?($("assignedTo").selectedOptions[0]?.textContent||clinicianLabels.get(assignedTo)||assignedTo):"";
  return {
    patient,contact,preference,serviceTitle:text($("serviceTitle").value),
    primaryPayer:text($("primaryPayer").value),secondaryPayer:text($("secondaryPayer").value),
    eligibilityStatus:$("eligibilityStatus").value,authorizationStatus:$("authorizationStatus").value,authorizationNumber:text($("authorizationNumber").value),
    intakeStatus:$("intakeStatus").value,status:$("intakeStatus").value,assignedTo,assignedToLabel,
    scheduledAt:toTimestamp($("scheduledAt").value),intakeNotes:text($("intakeNotes").value),
    intakeChecklist:{faceSheet:checked("docFaceSheet"),order:checked("docOrder"),insurance:checked("docInsurance"),clinicalRecords:checked("docClinical"),contactConfirmed:checked("contactConfirmed")},
    intakeReadiness:updateReadiness(),updatedAt:serverTimestamp(),updatedBy:user.uid
  };
}

async function persistIntake(silent=false){
  const patch=formPatch();
  if(!patch.patient.name) throw new Error("Patient name is required.");
  await updateDoc(bookingRef,patch); booking={...(booking||{}),...patch};
  if(!silent) $("intakeMessage").textContent="Intake saved.";
  populate();
  return patch;
}

async function markScheduled(){
  if(!$("scheduledAt").value) throw new Error("Choose a scheduled date and time first.");
  if(!$("assignedTo").value) throw new Error("Assign an owner before scheduling.");
  $("intakeStatus").value="scheduled";
  await persistIntake(true);
  $("intakeMessage").textContent="Booking marked scheduled.";
}

async function createClinicalTask(){
  const patch=await persistIntake(true);
  if(!patch.assignedTo) throw new Error("Assign an owner before creating the clinical task.");
  const title=patch.serviceTitle?`Visit — ${patch.serviceTitle}`:"Wound care visit";
  const task={
    createdAt:serverTimestamp(),createdBy:user.uid,source:{type:"booking",id:bookingId},
    patient:{name:patch.patient.name,phone:patch.contact.phone,email:patch.contact.email,address:patch.preference.address},
    service:{title:patch.serviceTitle,slug:slugify(patch.serviceTitle)},scheduledAt:patch.scheduledAt,
    status:"assigned",assignedTo:patch.assignedTo,assignedToLabel:patch.assignedToLabel,
    notes:patch.intakeNotes,title
  };
  const taskRef=await addDoc(collection(db,"tasks"),task);
  await updateDoc(bookingRef,{taskIds:arrayUnion(taskRef.id),lastTaskId:taskRef.id,updatedAt:serverTimestamp(),updatedBy:user.uid});
  $("intakeMessage").textContent="Clinical task created and sent to Central Command.";
}

async function loadBooking(){
  const snap=await getDoc(bookingRef);
  if(!snap.exists()) throw new Error("Booking not found.");
  booking={id:snap.id,...snap.data()}; populate();
}

function bindDetails(){
  onSnapshot(collection(db,"bookings",bookingId,"bookingDetails"),snap=>{
    const rows=snap.docs.map(s=>({id:s.id,...s.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    $("detailList").innerHTML=rows.length?rows.map(d=>`<div class="intake-note"><strong>${esc(d.title||"Intake note")}</strong><div>${esc(d.note||"")}</div><small>${esc(fmt(d.createdAt))}</small></div>`).join(""):`<div class="muted">No intake notes yet.</div>`;
  });
}

function bindTasks(){
  onSnapshot(query(collection(db,"tasks"),where("source.id","==",bookingId)),snap=>{
    const rows=snap.docs.map(s=>({id:s.id,...s.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    $("taskList").innerHTML=rows.length?rows.map(t=>`<div class="intake-note"><strong>${esc(t.title||t.service?.title||"Clinical task")}</strong><div>${esc(t.assignedToLabel||t.assignedTo||"Unassigned")} · ${esc(t.status||"assigned")}</div><small>${esc(fmt(t.scheduledAt))}</small></div>`).join(""):`<div class="muted">No central clinical task has been created yet.</div>`;
  });
}

$("bookingIntakeForm").addEventListener("submit",e=>{e.preventDefault();persistIntake().catch(err=>$("intakeMessage").textContent=err.message);});
$("markScheduledBtn").addEventListener("click",()=>markScheduled().catch(err=>$("intakeMessage").textContent=err.message));
$("createTaskBtn").addEventListener("click",()=>createClinicalTask().catch(err=>$("intakeMessage").textContent=err.message));
$("bookingIntakeForm").addEventListener("input",updateReadiness); $("bookingIntakeForm").addEventListener("change",updateReadiness);

const dlg=$("dlgAddDetail"),formDetail=$("formAddDetail");
$("btnAddDetail").addEventListener("click",()=>{formDetail.reset();$("detailMsg").textContent="";dlg.showModal();});
dlg.addEventListener("close",async()=>{
  if(dlg.returnValue!=="save") return;
  const title=text($("detailTitle").value),note=text($("detailNote").value);
  if(!title){$("detailMsg").textContent="Title required.";dlg.showModal();return;}
  try{await addDoc(collection(db,"bookings",bookingId,"bookingDetails"),{title,note,createdAt:serverTimestamp(),createdBy:user.uid});}
  catch(err){$("detailMsg").textContent=err.message||"Unable to save note.";dlg.showModal();}
});

await loadClinicians();
await loadBooking();
bindDetails();
bindTasks();
