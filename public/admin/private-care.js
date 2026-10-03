import {adminReady,db,esc} from "/admin/admin-shared.js";
import {collection,doc,getDocs,serverTimestamp,Timestamp,writeBatch,updateDoc} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

await adminReady;
const $=id=>document.getElementById(id);
let episodes=[],clients=[],staff=[],visits=[],saving=false;

function notice(msg,type="success"){$("notice").textContent=msg;$("notice").className="notice "+type;$("notice").hidden=false;}
function dateText(v){return v?.toDate?.()?.toLocaleDateString?.()||v||"-";}
function dateKey(v){const d=v?.toDate?.();if(!d)return "";return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function supervisionDays(lines,payer){
  // Medicaid waiver/program requirements can differ from general PHCP intervals.
  // Do not manufacture a compliance deadline until the specific program is captured.
  if(payer==="MEDICAID") return null;
  if(lines.includes("NURSING")) return 62;
  if(lines.includes("PERSONAL_CARE")) return 92;
  return 122;
}
async function load(){
  const [episodeSnap,clientSnap,staffSnap,visitSnap]=await Promise.all([
    getDocs(collection(db,"privateCareEpisodes")),
    getDocs(collection(db,"privateCareClients")),
    getDocs(collection(db,"privateCareStaff")),
    getDocs(collection(db,"privateCareVisits"))
  ]);
  episodes=episodeSnap.docs.map(d=>({id:d.id,...d.data()}));
  clients=clientSnap.docs.map(d=>({id:d.id,...d.data()}));
  staff=staffSnap.docs.map(d=>({id:d.id,...d.data()}));
  visits=visitSnap.docs.map(d=>({id:d.id,...d.data()}));
  render();
  populatePlanEpisodes();
  populateScheduling();
  populateEvvAndSupervision();
}
function render(){
  const today=new Date(),todayKey=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
  $("mActive").textContent=clients.filter(x=>x.status==="active").length;
  $("mPending").textContent=episodes.filter(x=>x.status==="pending_admission").length;
  $("mPrivate").textContent=episodes.filter(x=>x.payer==="PRIVATE_PAY").length;
  $("mDue").textContent=episodes.filter(x=>x.nextSupervisionDue&&dateKey(x.nextSupervisionDue)<=todayKey).length;
  $("episodesBody").innerHTML=episodes.length?episodes.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).map(x=>`<tr><td><strong>${esc(x.clientName||x.clientId)}</strong></td><td>${(x.serviceLines||[]).map(s=>`<span class="service-chip">${esc(s.replaceAll("_"," "))}</span>`).join("")}</td><td>${esc(x.payer)}</td><td class="status-${esc(x.status)}">${esc(x.status)}</td><td>${esc(dateText(x.startDate))}</td><td>${x.nextSupervisionDue?esc(dateText(x.nextSupervisionDue)):(x.payer==="MEDICAID"?"Program-specific":"-")}</td></tr>`).join(""):'<tr><td colspan="6" class="muted">No Private Care episodes yet.</td></tr>';
}

$("admissionForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(saving)return;
  $("notice").hidden=true;
  const submit=e.submitter||e.target.querySelector('button[type="submit"]');
  const lines=[...document.querySelectorAll('input[name="serviceLine"]:checked')].map(x=>x.value);
  const first=$("firstName").value.trim(),last=$("lastName").value.trim();
  if(!first||!last){notice("Enter a valid first and last name.","error");return;}
  if(!lines.length){notice("Select at least one service line.","error");return;}
  const payer=$("payer").value;
  const start=$("startDate").value?new Date($("startDate").value+"T12:00:00"):new Date();
  const days=supervisionDays(lines,payer);
  const due=days?new Date(start):null;
  if(due)due.setDate(due.getDate()+days);
  saving=true;if(submit)submit.disabled=true;
  try{
    const clientRef=doc(collection(db,"privateCareClients"));
    const episodeRef=doc(collection(db,"privateCareEpisodes"));
    const batch=writeBatch(db);
    batch.set(clientRef,{firstName:first,lastName:last,displayName:`${first} ${last}`,dob:$("dob").value||null,phone:$("phone").value.trim(),address:$("address").value.trim(),responsibleParty:$("responsibleParty").value.trim(),status:"active",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    batch.set(episodeRef,{clientId:clientRef.id,clientName:`${first} ${last}`,referralId:$("referralId").value.trim()||null,serviceLines:lines,payer,status:"pending_admission",startDate:Timestamp.fromDate(start),schedule:{daysPerWeek:Number($("daysPerWeek").value)||null,hoursPerDay:Number($("hoursPerDay").value)||null},assessment:{medicallyFrail:$("medicallyFrail").checked,adlNeeds:$("adlNeeds").value.trim(),safetyRisks:$("safetyRisks").value.trim()},supervisor:$("supervisor").value.trim(),supervisionIntervalDays:days,supervisionPolicy:payer==="MEDICAID"?"PROGRAM_SPECIFIC":"GA_PHCP",nextSupervisionDue:due?Timestamp.fromDate(due):null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await batch.commit();
    e.target.reset();
    notice(payer==="MEDICAID"?"Admission created. Select the Medicaid waiver/program before setting the supervision deadline.":"Private Care admission created.");
  }catch(err){
    console.error(err);notice(err.message||"Unable to create admission.","error");return;
  }finally{saving=false;if(submit)submit.disabled=false;}
  try{await load();}catch(err){console.error(err);notice("Admission saved, but the census could not refresh. Use Refresh; do not recreate the admission.","error");}
});
function populatePlanEpisodes(){
  const select=$("planEpisode"); if(!select)return;
  const current=select.value;
  select.innerHTML='<option value="">Select episode…</option>'+episodes.filter(x=>x.status==="pending_admission").map(x=>`<option value="${esc(x.id)}">${esc(x.clientName||x.clientId)} — ${esc(x.status)}</option>`).join("");
  if(episodes.some(x=>x.id===current&&x.status==="pending_admission"))select.value=current;
}
let planSaving=false;
$("planForm")?.addEventListener("submit",async e=>{
  e.preventDefault(); if(planSaving)return;
  const episodeId=$("planEpisode").value;
  const episode=episodes.find(x=>x.id===episodeId);
  if(!episode||episode.status!=="pending_admission"){notice("Select a pending-admission episode. Active plans must be revised through a separate revision workflow.","error");return;}
  const charges=$("charges").value.trim(),paymentTerms=$("paymentTerms").value.trim();
  const servicesFrequency=$("servicesFrequency").value.trim(),functionalNeeds=$("functionalNeeds").value.trim(),goals=$("goals").value.trim(),dischargePlan=$("dischargePlan").value.trim();
  if(!charges||!paymentTerms||!servicesFrequency||!functionalNeeds||!goals||!dischargePlan||!$("agreementConfirmed").checked||!$("planApproved").checked){notice("Complete the required agreement and service-plan fields before activation.","error");return;}
  planSaving=true; const btn=$("savePlanBtn"); if(btn)btn.disabled=true;
  try{
    const batch=writeBatch(db),now=serverTimestamp();
    const agreementRef=doc(collection(db,"privateCareEpisodes",episodeId,"serviceAgreements"));
    const planRef=doc(collection(db,"privateCareEpisodes",episodeId,"servicePlans"));
    batch.set(agreementRef,{effectiveDate:$("agreementDate").value,charges,paymentTerms,servicesFrequency,confirmed:true,status:"active",createdAt:now,updatedAt:now});
    batch.set(planRef,{serviceLines:episode.serviceLines||[],functionalNeeds,servicesFrequency,goals,dischargePlan,clinicalDetails:$("clinicalDetails").value.trim(),approved:true,status:"active",createdAt:now,updatedAt:now});
    batch.update(doc(db,"privateCareEpisodes",episodeId),{status:"active",serviceAgreementId:agreementRef.id,activeServicePlanId:planRef.id,activatedAt:now,updatedAt:now});
    await batch.commit();
    e.target.reset(); notice("Service Agreement and Service Plan saved. Episode activated.");
  }catch(err){console.error(err);notice(err.message||"Unable to save the service plan.","error");return;}
  finally{planSaving=false;if(btn)btn.disabled=false;}
  try{await load();}catch(err){console.error(err);notice("Plan saved and episode activated, but the census could not refresh. Use Refresh.","error");}
});

function populateScheduling(){
  const episodeSelect=$("visitEpisode"); if(episodeSelect){
    const cur=episodeSelect.value; episodeSelect.innerHTML='<option value="">Select…</option>'+episodes.filter(x=>x.status==="active").map(x=>`<option value="${esc(x.id)}">${esc(x.clientName||x.clientId)}</option>`).join(""); if(episodes.some(x=>x.id===cur&&x.status==="active"))episodeSelect.value=cur;
  }
  refreshStaffChoices();
  const body=$("visitsBody"); if(body)body.innerHTML=visits.length?visits.sort((a,b)=>(a.scheduledAt?.seconds||0)-(b.scheduledAt?.seconds||0)).map(v=>`<tr><td>${esc(v.clientName||"")}</td><td>${esc((v.serviceLine||"").replaceAll("_"," "))}</td><td>${esc(v.staffName||"")}</td><td>${esc(dateText(v.scheduledAt))} ${esc(v.scheduledTime||"")}</td><td>${esc(v.status||"scheduled")}</td></tr>`).join(""):'<tr><td colspan="5" class="muted">No visits scheduled.</td></tr>';
}
function refreshStaffChoices(){
  const service=$("visitService")?.value,select=$("visitStaff"); if(!select)return;
  const eligible=staff.filter(s=>s.active!==false&&s.qualified===true&&(!service||(s.serviceLines||[]).includes(service)));
  select.innerHTML='<option value="">Select qualified staff…</option>'+eligible.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} — ${esc(s.role)}</option>`).join("");
}
$("visitService")?.addEventListener("change",refreshStaffChoices);
$("staffForm")?.addEventListener("submit",async e=>{
  e.preventDefault(); const name=$("staffName").value.trim(),role=$("staffRole").value,serviceLines=[...document.querySelectorAll('input[name="staffService"]:checked')].map(x=>x.value);
  if(!name||!serviceLines.length||!$("staffQualified").checked){notice("Complete staff identity, permitted services and qualification verification.","error");return;}
  if(serviceLines.includes("NURSING")&&!["RN","LPN"].includes(role)){notice("Nursing service can only be assigned to an RN/LPN staff profile.","error");return;}
  const ref=doc(collection(db,"privateCareStaff")); const batch=writeBatch(db); batch.set(ref,{name,role,credential:$("staffCredential").value.trim(),serviceLines,qualified:true,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  try{await batch.commit();e.target.reset();notice("Staff member added.");await load();}catch(err){console.error(err);notice(err.message||"Unable to add staff.","error");}
});
$("visitForm")?.addEventListener("submit",async e=>{
  e.preventDefault(); const episode=episodes.find(x=>x.id===$("visitEpisode").value),service=$("visitService").value,person=staff.find(x=>x.id===$("visitStaff").value);
  if(!episode||episode.status!=="active"){notice("Select an active episode.","error");return;}
  if(!(episode.serviceLines||[]).includes(service)){notice("This service is not included in the active episode.","error");return;}
  if(!person||person.qualified!==true||!(person.serviceLines||[]).includes(service)){notice("Select staff verified for this service.","error");return;}
  if(service==="NURSING"&&!["RN","LPN"].includes(person.role)){notice("Nursing visits require an RN/LPN assignment.","error");return;}
  const rawDate=$("visitDate").value,time=$("visitTime").value;if(!rawDate||!time)return;
  const scheduled=new Date(rawDate+"T"+time+":00"); const visitRef=doc(collection(db,"privateCareVisits"));
  const batch=writeBatch(db);batch.set(visitRef,{episodeId:episode.id,clientId:episode.clientId,clientName:episode.clientName,serviceLine:service,staffId:person.id,staffName:person.name,staffRole:person.role,scheduledAt:Timestamp.fromDate(scheduled),scheduledTime:time,durationHours:Number($("visitDuration").value),status:"scheduled",evvStatus:"not_started",documentationStatus:"not_started",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  try{await batch.commit();e.target.reset();notice("Private Care visit scheduled.");await load();}catch(err){console.error(err);notice(err.message||"Unable to schedule visit.","error");}
});

function populateEvvAndSupervision(){
  const evv=$("evvVisit"); if(evv){const cur=evv.value;evv.innerHTML='<option value="">Select visit…</option>'+visits.filter(v=>v.status!=="completed").map(v=>`<option value="${esc(v.id)}">${esc(v.clientName)} — ${esc((v.serviceLine||"").replaceAll("_"," "))} — ${esc(dateText(v.scheduledAt))}</option>`).join("");if(visits.some(v=>v.id===cur&&v.status!=="completed"))evv.value=cur;}
  const sup=$("supervisionEpisode");if(sup){const cur=sup.value;sup.innerHTML='<option value="">Select…</option>'+episodes.filter(x=>x.status==="active").map(x=>`<option value="${esc(x.id)}">${esc(x.clientName||x.clientId)}</option>`).join("");if(episodes.some(x=>x.id===cur&&x.status==="active"))sup.value=cur;}
}
$("clockInBtn")?.addEventListener("click",async()=>{
  const visit=visits.find(v=>v.id===$("evvVisit").value);if(!visit){notice("Select a scheduled visit.","error");return;}if(visit.evvStatus!=="not_started"){notice("This visit has already been clocked in.","error");return;}
  try{await updateDoc(doc(db,"privateCareVisits",visit.id),{evvStatus:"in_progress",status:"in_progress",clockInAt:serverTimestamp(),updatedAt:serverTimestamp()});notice("Clock-in recorded.");await load();}catch(err){console.error(err);notice(err.message||"Clock-in failed.","error");}
});
$("clockOutBtn")?.addEventListener("click",async()=>{
  const visit=visits.find(v=>v.id===$("evvVisit").value);if(!visit){notice("Select a visit.","error");return;}if(visit.evvStatus!=="in_progress"){notice("Clock in before clocking out.","error");return;}
  try{await updateDoc(doc(db,"privateCareVisits",visit.id),{evvStatus:"completed",clockOutAt:serverTimestamp(),updatedAt:serverTimestamp()});notice("Clock-out recorded. Complete the visit documentation.");await load();}catch(err){console.error(err);notice(err.message||"Clock-out failed.","error");}
});
$("evvForm")?.addEventListener("submit",async e=>{
  e.preventDefault();const visit=visits.find(v=>v.id===$("evvVisit").value);if(!visit){notice("Select a visit.","error");return;}
  const tasks=$("visitTasks").value.trim(),response=$("visitResponse").value.trim(),concerns=$("visitConcerns").value.trim(),complete=$("visitCompleted").checked;
  if(complete&&visit.evvStatus!=="completed"){notice("Clock-out must be recorded before completing documentation.","error");return;}
  if(complete&&(!tasks||!response)){notice("Services/tasks and client response are required to complete documentation.","error");return;}
  const noteRef=doc(collection(db,"privateCareVisits",visit.id,"documentation"));const batch=writeBatch(db);
  batch.set(noteRef,{serviceLine:visit.serviceLine,tasks,response,concerns,status:complete?"complete":"draft",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  batch.update(doc(db,"privateCareVisits",visit.id),{documentationStatus:complete?"complete":"draft",status:complete?"completed":visit.status,completedAt:complete?serverTimestamp():null,updatedAt:serverTimestamp()});
  try{await batch.commit();e.target.reset();notice(complete?"Visit documentation completed.":"Visit documentation saved as draft.");await load();}catch(err){console.error(err);notice(err.message||"Unable to save documentation.","error");}
});
$("supervisionForm")?.addEventListener("submit",async e=>{
  e.preventDefault();const episode=episodes.find(x=>x.id===$("supervisionEpisode").value);if(!episode||episode.status!=="active"){notice("Select an active episode.","error");return;}
  const findings=$("supervisionFindings").value.trim(),supervisor=$("supervisionBy").value.trim();if(!findings||!supervisor||!$("supervisionComplete").checked){notice("Complete the supervisory review fields.","error");return;}
  const raw=$("supervisionDate").value;if(!raw)return;const performed=new Date(raw+"T12:00:00");
  const days=episode.supervisionIntervalDays;let next=null;if(days){next=new Date(performed);next.setDate(next.getDate()+days);}
  const supRef=doc(collection(db,"privateCareEpisodes",episode.id,"supervisoryVisits")),batch=writeBatch(db);
  batch.set(supRef,{performedAt:Timestamp.fromDate(performed),supervisor,findings,actions:$("supervisionActions").value.trim(),completed:true,createdAt:serverTimestamp()});
  batch.update(doc(db,"privateCareEpisodes",episode.id),{lastSupervisionAt:Timestamp.fromDate(performed),nextSupervisionDue:next?Timestamp.fromDate(next):null,updatedAt:serverTimestamp()});
  try{await batch.commit();e.target.reset();notice(next?"Supervisory visit recorded and next due date updated.":"Supervisory visit recorded. Medicaid/program-specific next due date remains unset.");await load();}catch(err){console.error(err);notice(err.message||"Unable to record supervision.","error");}
});

$("refreshBtn").addEventListener("click",load);
load().catch(e=>notice(e.message,"error"));
