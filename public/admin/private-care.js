import {adminReady,db,esc} from "/admin/admin-shared.js";
import {collection,doc,getDocs,serverTimestamp,Timestamp,writeBatch} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

await adminReady;
const $=id=>document.getElementById(id);
let episodes=[],clients=[],saving=false;

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
  const [episodeSnap,clientSnap]=await Promise.all([
    getDocs(collection(db,"privateCareEpisodes")),
    getDocs(collection(db,"privateCareClients"))
  ]);
  episodes=episodeSnap.docs.map(d=>({id:d.id,...d.data()}));
  clients=clientSnap.docs.map(d=>({id:d.id,...d.data()}));
  render();
  populatePlanEpisodes();
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
  select.innerHTML='<option value="">Select episode…</option>'+episodes.filter(x=>x.status!=="discharged").map(x=>`<option value="${esc(x.id)}">${esc(x.clientName||x.clientId)} — ${esc(x.status)}</option>`).join("");
  if(episodes.some(x=>x.id===current))select.value=current;
}
let planSaving=false;
$("planForm")?.addEventListener("submit",async e=>{
  e.preventDefault(); if(planSaving)return;
  const episodeId=$("planEpisode").value;
  const episode=episodes.find(x=>x.id===episodeId);
  if(!episode){notice("Select a valid Private Care episode.","error");return;}
  const servicesFrequency=$("servicesFrequency").value.trim(),functionalNeeds=$("functionalNeeds").value.trim(),goals=$("goals").value.trim(),dischargePlan=$("dischargePlan").value.trim();
  if(!servicesFrequency||!functionalNeeds||!goals||!dischargePlan||!$("agreementConfirmed").checked||!$("planApproved").checked){notice("Complete the required agreement and service-plan fields before activation.","error");return;}
  planSaving=true; const btn=$("savePlanBtn"); if(btn)btn.disabled=true;
  try{
    const batch=writeBatch(db),now=serverTimestamp();
    const agreementRef=doc(collection(db,"privateCareEpisodes",episodeId,"serviceAgreements"));
    const planRef=doc(collection(db,"privateCareEpisodes",episodeId,"servicePlans"));
    batch.set(agreementRef,{effectiveDate:$("agreementDate").value,charges:$("charges").value.trim(),paymentTerms:$("paymentTerms").value.trim(),servicesFrequency,confirmed:true,status:"active",createdAt:now,updatedAt:now});
    batch.set(planRef,{serviceLines:episode.serviceLines||[],functionalNeeds,servicesFrequency,goals,dischargePlan,clinicalDetails:$("clinicalDetails").value.trim(),approved:true,status:"active",createdAt:now,updatedAt:now});
    batch.update(doc(db,"privateCareEpisodes",episodeId),{status:"active",serviceAgreementId:agreementRef.id,activeServicePlanId:planRef.id,activatedAt:now,updatedAt:now});
    await batch.commit();
    e.target.reset(); notice("Service Agreement and Service Plan saved. Episode activated.");
  }catch(err){console.error(err);notice(err.message||"Unable to save the service plan.","error");return;}
  finally{planSaving=false;if(btn)btn.disabled=false;}
  try{await load();}catch(err){console.error(err);notice("Plan saved and episode activated, but the census could not refresh. Use Refresh.","error");}
});
$("refreshBtn").addEventListener("click",load);
load().catch(e=>notice(e.message,"error"));
