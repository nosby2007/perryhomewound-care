import { adminReady, auth, db, esc, fmt } from "/admin/admin-shared.js";
import {
  addDoc, arrayUnion, collection, doc, getDoc, limit, onSnapshot, orderBy,
  query, serverTimestamp, Timestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

await adminReady;

const $ = (id) => document.getElementById(id);
const tbody = document.querySelector("#tblRef tbody");
let allReferrals = [];
let filteredReferrals = [];
let activeReferral = null;
let unsubscribe = null;

const SOURCES = ["Hospital","Primary Care / PCP","Skilled Nursing Facility","Home Health","Hospice","Specialist","Family/Caregiver","Self referral","Other"];
const METHODS = ["Fax","Portal","Secure Email","Phone","In person","Other"];
const STATUSES = [
  "received","under_review","insurance_verification","contact_attempt","contacted","scheduling",
  "accepted_scheduled","admitted","declined","unable_to_contact","insurance_network_issue",
  "authorization_denied","outside_service_area","hospitalized","duplicate","withdrawn",
  "not_clinically_appropriate","other_not_admitted","archived"
];
const ELIGIBILITY = ["Not Checked","Pending","Verified","Coverage Issue","Out of Network","Authorization Required","Authorization Pending","Authorization Approved","Authorization Denied"];
const AUTH_STATUS = ["Not Required","Unknown","Required","Pending","Approved","Denied"];
const REPORTED_BY = ["","Patient","Family/Caregiver","Referring Facility","Referring Provider","Insurance/Payer","PHWC Staff","Other"];
const CONTACT_METHODS = ["Call","Voicemail","SMS if authorized","Secure Email","Referring Facility","Other"];
const FINAL_STATUSES = ["","Admitted","Declined","Unable to Contact","Insurance / Network Issue","Authorization Denied","Outside Service Area","Hospitalized","Duplicate","Withdrawn","Not Clinically Appropriate","Other / Not Admitted"];
const CLOSED = new Set(["admitted","declined","unable_to_contact","insurance_network_issue","authorization_denied","outside_service_area","hospitalized","duplicate","withdrawn","not_clinically_appropriate","other_not_admitted","archived"]);
const NOT_ADMITTED = new Set(["declined","unable_to_contact","insurance_network_issue","authorization_denied","outside_service_area","hospitalized","duplicate","withdrawn","not_clinically_appropriate","other_not_admitted"]);

function text(v){ return String(v ?? "").trim(); }
function lower(v){ return text(v).toLowerCase(); }
function dateKey(v){
  if(!v) return "";
  const d = v?.toDate ? v.toDate() : new Date(v);
  if(Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dateLabel(v){
  if(!v) return "—";
  const d = v?.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}
function dateTimeLabel(v){
  if(!v) return "—";
  const d = v?.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
function normalizeStatus(value){
  const s = lower(value).replace(/[\s/-]+/g,"_");
  const legacy = {new:"received",reviewed:"under_review",converted:"accepted_scheduled"};
  return legacy[s] || s || "received";
}
function statusLabel(value){ return normalizeStatus(value).split("_").map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(" "); }
function statusClass(status){ const s=normalizeStatus(status); return s==="admitted"?"good":(NOT_ADMITTED.has(s)||s==="archived")?"closed":(["insurance_verification","scheduling","accepted_scheduled"].includes(s)?"warn":""); }
function receivedValue(d){ return d.receivedAt || d.createdAt || ""; }
function lastActivity(d){
  const history = Array.isArray(d.statusHistory) ? d.statusHistory : [];
  const contacts = Array.isArray(d.contactAttempts) ? d.contactAttempts : [];
  const candidates = [d.updatedAt,d.createdAt,history.at(-1)?.changedAt,contacts.at(-1)?.date].filter(Boolean);
  return candidates.sort((a,b)=>{
    const av=a?.toMillis?a.toMillis():new Date(a).getTime(); const bv=b?.toMillis?b.toMillis():new Date(b).getTime(); return bv-av;
  })[0] || "";
}
function outcome(d){
  const s=normalizeStatus(d.status);
  if(d.admitted===true || s==="admitted") return "admitted";
  if(d.admitted===false && (d.dispositionStatus || NOT_ADMITTED.has(s))) return "not_admitted";
  if(NOT_ADMITTED.has(s)) return "not_admitted";
  return "pending";
}
function outcomeLabel(d){ const o=outcome(d); return o==="admitted"?"Admitted":o==="not_admitted"?"Not admitted":"Pending"; }
function optionize(select, values, includeBlank=false){ select.innerHTML=(includeBlank?`<option value="">Select…</option>`:"")+values.map(v=>`<option value="${esc(v)}">${esc(statusLabel(v))}</option>`).join(""); }
function setValue(id,v){ if($(id)) $(id).value = v ?? ""; }
function setCheck(id,v){ if($(id)) $(id).checked = v === true; }
function checked(id){ return $(id)?.checked === true; }
function uid(){ return auth.currentUser?.uid || ""; }
function safePercent(n,d){ return d ? Math.round((n/d)*100) : 0; }

optionize($("referralSource"),SOURCES);
optionize($("receivedMethod"),METHODS);
optionize($("status"),STATUSES);
optionize($("eligibilityStatus"),ELIGIBILITY);
optionize($("authorizationStatus"),AUTH_STATUS);
optionize($("dispositionReportedBy"),REPORTED_BY);
optionize($("contactMethod"),CONTACT_METHODS);
optionize($("dispositionStatus"),FINAL_STATUSES);
$("fSource").innerHTML += SOURCES.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
$("fStatus").innerHTML += STATUSES.map(v=>`<option value="${esc(v)}">${esc(statusLabel(v))}</option>`).join("");

function openDrawer(d=null){
  activeReferral = d;
  $("referralForm").reset();
  $("referralId").value = d?.id || "";
  $("drawerTitle").textContent = d ? "Referral Details" : "New Referral";
  $("drawerSubtitle").textContent = d ? `Received ${dateLabel(receivedValue(d))}` : "Referral intake";
  const today = new Date().toISOString().slice(0,10);
  setValue("receivedDate", dateKey(receivedValue(d)) || today);
  setValue("receivedTime", d?.receivedTime || "");
  setValue("referralSource", d?.referralSource || mapLegacySource(d?.refType) || "Hospital");
  setValue("receivedMethod", d?.receivedMethod || "Fax");
  setValue("refOrg",d?.refOrg); setValue("referringProvider",d?.referringProvider); setValue("refName",d?.refName); setValue("refPhone",d?.refPhone); setValue("refEmail",d?.refEmail);
  setValue("patientName",d?.patientName); setValue("patientDob", normalizeDob(d?.patientDob)); setValue("patientPhone",d?.patientPhone); setValue("patientArea",d?.patientArea);
  setValue("requestedService",d?.requestedService || d?.serviceTitle || "Wound Care"); setValue("urgency", titleCase(d?.urgency || "Routine")); setValue("diagnosis",d?.diagnosis);
  setValue("primaryPayer",d?.primaryPayer); setValue("secondaryPayer",d?.secondaryPayer); setCheck("medicarePartA",d?.medicarePartA); setCheck("medicarePartB",d?.medicarePartB); setCheck("medicareAdvantage",d?.medicareAdvantage);
  setValue("eligibilityStatus",d?.eligibilityStatus || "Not Checked"); setValue("authorizationStatus",d?.authorizationStatus || "Not Required"); setValue("authorizationNumber",d?.authorizationNumber); setValue("eligibilityCheckedDate",dateKey(d?.eligibilityCheckedAt)); setValue("eligibilityCheckedBy",d?.eligibilityCheckedBy);
  setValue("status",normalizeStatus(d?.status)); setValue("assignedTo",d?.assignedTo); setValue("scheduledDate",dateKey(d?.scheduledAt)); setValue("firstVisitDate",dateKey(d?.firstVisitDate)); setCheck("admitted",d?.admitted); setCheck("servicesRendered",d?.servicesRendered);
  setValue("dispositionStatus",d?.dispositionStatus); setValue("dispositionDate",dateKey(d?.dispositionDate)); setValue("dispositionReason",d?.dispositionReason); setValue("dispositionReportedBy",d?.dispositionReportedBy); setValue("dispositionNotes",d?.dispositionNotes); setValue("adminNotes",d?.adminNotes || d?.notes);
  renderHistories(d);
  $("makeTaskBtn").style.display = d ? "inline-flex" : "none";
  $("drawerBackdrop").classList.add("open"); $("refDrawer").classList.add("open"); $("refDrawer").setAttribute("aria-hidden","false");
}
function closeDrawer(){ $("drawerBackdrop").classList.remove("open"); $("refDrawer").classList.remove("open"); $("refDrawer").setAttribute("aria-hidden","true"); activeReferral=null; }
function mapLegacySource(v){ const x=lower(v); if(x.includes("facility")||x.includes("hospital")) return "Hospital"; if(x.includes("provider")||x.includes("pcp")) return "Primary Care / PCP"; return "Other"; }
function normalizeDob(v){ return /^\d{4}-\d{2}-\d{2}$/.test(text(v)) ? v : ""; }
function titleCase(v){ const s=text(v); return s ? s.charAt(0).toUpperCase()+s.slice(1).toLowerCase() : ""; }

function formPayload(){
  const receivedDate=$("receivedDate").value; const receivedTime=$("receivedTime").value;
  const receivedAt = receivedDate ? new Date(`${receivedDate}T${receivedTime || "12:00"}:00`) : new Date();
  const eligibilityCheckedAt = $("eligibilityCheckedDate").value ? new Date(`${$("eligibilityCheckedDate").value}T12:00:00`) : null;
  const scheduledAt = $("scheduledDate").value ? new Date(`${$("scheduledDate").value}T12:00:00`) : null;
  const firstVisitDate = $("firstVisitDate").value ? new Date(`${$("firstVisitDate").value}T12:00:00`) : null;
  const dispositionDate = $("dispositionDate").value ? new Date(`${$("dispositionDate").value}T12:00:00`) : null;
  return {
    receivedAt, receivedTime, referralSource:$("referralSource").value, receivedMethod:$("receivedMethod").value,
    refOrg:text($("refOrg").value), referringProvider:text($("referringProvider").value), refName:text($("refName").value), refPhone:text($("refPhone").value), refEmail:text($("refEmail").value),
    patientName:text($("patientName").value), patientDob:$("patientDob").value, patientPhone:text($("patientPhone").value), patientArea:text($("patientArea").value),
    requestedService:text($("requestedService").value), diagnosis:text($("diagnosis").value), urgency:$("urgency").value,
    primaryPayer:text($("primaryPayer").value), secondaryPayer:text($("secondaryPayer").value), medicarePartA:checked("medicarePartA"), medicarePartB:checked("medicarePartB"), medicareAdvantage:checked("medicareAdvantage"),
    eligibilityStatus:$("eligibilityStatus").value, eligibilityCheckedAt, eligibilityCheckedBy:text($("eligibilityCheckedBy").value), authorizationStatus:$("authorizationStatus").value, authorizationNumber:text($("authorizationNumber").value),
    status:$("status").value, assignedTo:text($("assignedTo").value), scheduledAt, firstVisitDate, admitted:checked("admitted"), servicesRendered:checked("servicesRendered"),
    dispositionStatus:$("dispositionStatus").value, dispositionDate, dispositionReason:text($("dispositionReason").value), dispositionReportedBy:$("dispositionReportedBy").value, dispositionNotes:text($("dispositionNotes").value),
    adminNotes:text($("adminNotes").value), updatedAt:serverTimestamp(), updatedBy:uid()
  };
}

async function saveReferral(e){
  e.preventDefault();
  const payload=formPayload();
  if(!payload.referralSource || !payload.receivedAt) return alert("Referral source and received date are required.");
  if(payload.status==="declined" && !payload.dispositionReason) return alert("Enter a disposition reason before marking this referral declined.");
  if(NOT_ADMITTED.has(payload.status)) payload.admitted=false;
  if(payload.status==="admitted") payload.admitted=true;
  const id=$("referralId").value;
  try{
    if(id){
      const previous=normalizeStatus(activeReferral?.status);
      const next=normalizeStatus(payload.status);
      if(previous!==next){ payload.statusHistory=arrayUnion({from:previous,to:next,changedAt:Timestamp.now(),changedBy:uid(),note:text(payload.dispositionReason)}); }
      await updateDoc(doc(db,"patientReferal",id),payload);
    }else{
      await addDoc(collection(db,"patientReferal"),{...payload,createdAt:serverTimestamp(),createdBy:uid(),statusHistory:[{from:"",to:payload.status,changedAt:Timestamp.now(),changedBy:uid(),note:"Referral created by PHWC Admin"}],contactAttempts:[],source:"admin"});
    }
    closeDrawer();
  }catch(err){ alert("Unable to save referral. Please verify your access and try again."); }
}

async function addContactAttempt(){
  const id=$("referralId").value;
  if(!id) return alert("Save the referral before adding contact history.");
  const outcomeText=text($("contactOutcome").value); const note=text($("contactNote").value);
  if(!outcomeText && !note) return alert("Enter the contact outcome or a note.");
  const entry={date:Timestamp.now(),method:$("contactMethod").value,outcome:outcomeText,staffUid:uid(),note};
  await updateDoc(doc(db,"patientReferal",id),{contactAttempts:arrayUnion(entry),updatedAt:serverTimestamp(),updatedBy:uid()});
  $("contactOutcome").value=""; $("contactNote").value="";
}

function renderHistories(d){
  const contacts=Array.isArray(d?.contactAttempts)?[...d.contactAttempts].reverse():[];
  $("contactHistory").innerHTML=contacts.length?contacts.map(x=>`<div class="activity-item"><strong>${esc(x.method||"Contact")}</strong> · ${esc(x.outcome||"")}<div class="muted2">${esc(dateTimeLabel(x.date))}${x.note?` · ${esc(x.note)}`:""}</div></div>`).join(""):`<div class="muted2">No contact attempts recorded.</div>`;
  const hist=Array.isArray(d?.statusHistory)?[...d.statusHistory].reverse():[];
  $("statusHistory").innerHTML=hist.length?hist.map(x=>`<div class="activity-item"><strong>${esc(statusLabel(x.to))}</strong><div class="muted2">${esc(dateTimeLabel(x.changedAt))}${x.note?` · ${esc(x.note)}`:""}</div></div>`).join(""):`<div class="muted2">No status history recorded for this legacy referral.</div>`;
}

async function makeTask(){
  const id=$("referralId").value; if(!id) return;
  const snap=await getDoc(doc(db,"patientReferal",id)); if(!snap.exists()) return alert("Referral not found.");
  const r=snap.data();
  const task=await addDoc(collection(db,"tasks"),{
    createdAt:serverTimestamp(),createdBy:uid(),source:{type:"referral",id},
    patient:{name:r.patientName||"",phone:r.patientPhone||"",address:r.patientArea||"",email:""},
    service:{title:r.requestedService||r.serviceTitle||"Wound Care",slug:r.serviceSlug||""},scheduledAt:r.scheduledAt||null,status:"assigned",assignedTo:r.assignedTo||"",notes:r.adminNotes||r.notes||""
  });
  await updateDoc(doc(db,"patientReferal",id),{linkedTaskId:task.id,updatedAt:serverTimestamp(),updatedBy:uid()});
  alert("Task created. The referral admission status was not changed.");
}

function payerOf(d){ return text(d.primaryPayer) || (d.medicarePartB?"Medicare":"—"); }
function sourceOf(d){ return text(d.referralSource) || mapLegacySource(d.refType) || "Other"; }
function serviceOf(d){ return text(d.requestedService || d.serviceTitle) || "Wound Care"; }
function dispositionOf(d){ return text(d.dispositionStatus || d.dispositionReason) || (outcome(d)==="pending"?"—":outcomeLabel(d)); }

function applyFilters(){
  const from=$("fFrom").value,to=$("fTo").value,source=$("fSource").value,payer=$("fPayer").value,status=$("fStatus").value,out=$("fOutcome").value,needle=lower($("qRef").value);
  filteredReferrals=allReferrals.filter(d=>{
    const dk=dateKey(receivedValue(d)); if(from&&dk<from)return false; if(to&&dk>to)return false;
    if(source&&sourceOf(d)!==source)return false; if(payer&&payerOf(d)!==payer)return false; if(status&&normalizeStatus(d.status)!==status)return false; if(out&&outcome(d)!==out)return false;
    if(needle){const hay=lower(`${sourceOf(d)} ${d.refOrg||""} ${d.refName||""} ${d.patientName||""} ${payerOf(d)} ${d.status||""} ${serviceOf(d)}`);if(!hay.includes(needle))return false;}
    return true;
  });
  renderTable(); renderSummary(); renderSurvey();
}

function renderTable(){
  tbody.innerHTML=filteredReferrals.length?filteredReferrals.map(d=>`<tr class="ref-row" data-id="${esc(d.id)}">
    <td>${esc(dateLabel(receivedValue(d)))}</td><td><strong>${esc(sourceOf(d))}</strong><div class="muted2">${esc(d.refOrg||d.refName||"—")}</div></td>
    <td>${esc(serviceOf(d))}</td><td>${esc(payerOf(d))}</td><td><span class="status-pill ${statusClass(d.status)}">${esc(statusLabel(d.status))}</span></td>
    <td>${esc(d.assignedTo||"Unassigned")}</td><td>${esc(dateTimeLabel(lastActivity(d)))}</td><td>${esc(dateLabel(d.firstVisitDate))}</td><td>${esc(outcomeLabel(d))}</td>
    <td><button class="btn" data-act="open" data-id="${esc(d.id)}">Open</button></td></tr>`).join(""):`<tr><td colspan="10" class="empty-state">No referrals match these filters.</td></tr>`;
}
function counts(){
  const x={received:filteredReferrals.length,admitted:0,notAdmitted:0,declined:0,pending:0,unable:0,insurance:0,firstVisit:0};
  filteredReferrals.forEach(d=>{const o=outcome(d),s=normalizeStatus(d.status);if(o==="admitted")x.admitted++;else if(o==="not_admitted")x.notAdmitted++;else x.pending++;if(s==="declined")x.declined++;if(s==="unable_to_contact")x.unable++;if(["insurance_network_issue","authorization_denied"].includes(s)||["Coverage Issue","Out of Network","Authorization Denied"].includes(d.eligibilityStatus))x.insurance++;if(d.firstVisitDate)x.firstVisit++;}); return x;
}
function renderSummary(){const c=counts();[["sumReceived",c.received],["sumAdmitted",c.admitted],["sumNotAdmitted",c.notAdmitted],["sumDeclined",c.declined],["sumPending",c.pending],["sumUnable",c.unable],["sumInsurance",c.insurance]].forEach(([id,v])=>$(id).textContent=v);}
function renderSurvey(){
  const c=counts(); const conv=safePercent(c.admitted,c.received),fv=safePercent(c.firstVisit,c.received),decl=safePercent(c.declined,c.received);
  [["pReceived",c.received],["pAdmitted",c.admitted],["pNotAdmitted",c.notAdmitted],["pPending",c.pending],["pDeclined",c.declined],["pUnable",c.unable],["pInsurance",c.insurance]].forEach(([id,v])=>$(id).textContent=v);
  $("pConversion").textContent=`${conv}%`; $("surveyRates").textContent=`Referral-to-first-visit: ${fv}% · Decline rate: ${decl}%`;
  $("surveyPeriod").textContent=`Reporting period: ${$("fFrom").value||"Beginning"} — ${$("fTo").value||"Present"}`; $("surveyGenerated").textContent=`Generated ${new Date().toLocaleString()}`;
  $("surveyBody").innerHTML=filteredReferrals.map(d=>`<tr><td>${esc(dateLabel(receivedValue(d)))}</td><td>${esc(sourceOf(d))}${d.refOrg?` — ${esc(d.refOrg)}`:""}</td><td>${esc(serviceOf(d))}</td><td>${esc(payerOf(d))}</td><td>${esc(statusLabel(d.status))}</td><td>${esc(dispositionOf(d))}</td><td>${esc(dateLabel(d.firstVisitDate))}</td><td>${esc(outcomeLabel(d))}</td></tr>`).join("")||`<tr><td colspan="8">No referrals in selected period.</td></tr>`;
}
function refreshPayers(){const current=$("fPayer").value;const payers=[...new Set(allReferrals.map(payerOf).filter(x=>x&&x!=="—"))].sort();$("fPayer").innerHTML=`<option value="">All payers</option>`+payers.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");$("fPayer").value=current;}

function bind(){
  unsubscribe?.();
  const qy=query(collection(db,"patientReferal"),orderBy("createdAt","desc"),limit(500));
  unsubscribe=onSnapshot(qy,snap=>{allReferrals=snap.docs.map(s=>({id:s.id,...s.data()}));refreshPayers();applyFilters();},()=>{tbody.innerHTML=`<tr><td colspan="10" class="empty-state">Unable to load referrals.</td></tr>`;});
}

$("addReferralBtn").addEventListener("click",()=>openDrawer()); $("closeDrawerBtn").addEventListener("click",closeDrawer); $("drawerBackdrop").addEventListener("click",closeDrawer);
$("referralForm").addEventListener("submit",saveReferral); $("addContactBtn").addEventListener("click",addContactAttempt); $("makeTaskBtn").addEventListener("click",makeTask);
$("printSurveyBtn").addEventListener("click",()=>{renderSurvey();window.print();});
["fFrom","fTo","fSource","fPayer","fStatus","fOutcome"].forEach(id=>$(id).addEventListener("change",applyFilters)); $("qRef").addEventListener("input",applyFilters);
$("clearFiltersBtn").addEventListener("click",()=>{["fFrom","fTo","fSource","fPayer","fStatus","fOutcome","qRef"].forEach(id=>$(id).value="");applyFilters();});
document.addEventListener("click",e=>{const el=e.target.closest("[data-id]");if(!el)return;const d=allReferrals.find(x=>x.id===el.dataset.id);if(d)openDrawer(d);});

bind();