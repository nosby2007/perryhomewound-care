import { db, adminReady, esc, mailto } from "/admin/admin-shared.js";
import {
  collection, getDocs, doc, getDoc, setDoc, updateDoc, addDoc, writeBatch,
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { CRM_SEED_1 } from "/admin/crm-seed-1.js";
import { CRM_SEED_2 } from "/admin/crm-seed-2.js";
import { CRM_SEED_3 } from "/admin/crm-seed-3.js";
import { CRM_SEED_4 } from "/admin/crm-seed-4.js";
const CRM_SEED_LEADS=[...CRM_SEED_1,...CRM_SEED_2,...CRM_SEED_3,...CRM_SEED_4];

const COL="crmLeads";
const ACT="crmActivities";
let leads=[];
let currentUser=null;
let quickFilter="all";
let currentEmailLead=null;

const $=id=>document.getElementById(id);
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const plusDays=(n)=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const toDateInput=(v)=>{if(!v)return "";if(typeof v==="string")return v;const d=v?.toDate?.();if(!d)return "";return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const cleanEmails=(v)=>[...new Set((String(v||"").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(x=>x.toLowerCase()))];
const firstName=(n)=>{let s=String(n||"").trim().replace(/^(mr|mrs|ms|dr)\.?\s+/i,"");if(!s)return "there";if(s===s.toUpperCase())s=s.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase());return s.split(/\s+/)[0];};
const normalize=(d)=>({status:"New",notes:"",lastContact:"",nextFollowUp:"",assignedTo:"",preferred:"Both",...d,id:d.id});
const dateValue=(v)=>{const s=toDateInput(v);return s||"";};

async function load(){
  $("syncState").textContent="Syncing Firestore…";
  const snap=await getDocs(collection(db,COL));
  leads=snap.docs.map(s=>normalize({id:s.id,...s.data()}));
  $("syncState").textContent=`Firestore synced · ${leads.length} records`;
  render();
}

function filtered(){
  const q=$("q").value.trim().toLowerCase(), type=$("fType").value, status=$("fStatus").value, owner=$("fOwner").value, sort=$("fSort").value;
  const now=todayISO();
  let arr=leads.filter(l=>{
    const hay=[l.name,l.administrator,l.city,l.county,l.type,l.email,l.phone,l.opportunity,l.assignedTo].join(" ").toLowerCase();
    if(q&&!hay.includes(q))return false;
    if(type&&l.type!==type)return false;
    if(status&&l.status!==status)return false;
    if(owner==="mine"&&String(l.assignedTo||"").toLowerCase()!==String(currentUser?.email||"").toLowerCase())return false;
    if(owner==="unassigned"&&l.assignedTo)return false;
    const f=dateValue(l.nextFollowUp);
    if(quickFilter==="overdue"&&!(f&&f<now))return false;
    if(quickFilter==="today"&&f!==now)return false;
    if(quickFilter==="interested"&&l.status!=="Interested")return false;
    if(quickFilter==="meeting"&&l.status!=="Meeting")return false;
    if(quickFilter==="partner"&&l.status!=="Partner")return false;
    if(quickFilter==="high"&&l.tier!=="High")return false;
    if(quickFilter==="email"&&cleanEmails(l.email).length===0)return false;
    return true;
  });
  arr.sort((a,b)=>{
    if(sort==="name")return String(a.name).localeCompare(String(b.name));
    if(sort==="followup")return (dateValue(a.nextFollowUp)||"9999-99-99").localeCompare(dateValue(b.nextFollowUp)||"9999-99-99")||((b.score||0)-(a.score||0));
    if(sort==="updated")return (b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0);
    return (b.score||0)-(a.score||0)||String(a.name).localeCompare(String(b.name));
  });
  return arr;
}

function metrics(){
  const now=todayISO();
  $("mOverdue").textContent=leads.filter(l=>{const d=dateValue(l.nextFollowUp);return d&&d<now}).length;
  $("mToday").textContent=leads.filter(l=>dateValue(l.nextFollowUp)===now).length;
  $("mInterested").textContent=leads.filter(l=>l.status==="Interested").length;
  $("mMeetings").textContent=leads.filter(l=>l.status==="Meeting").length;
  $("mPartners").textContent=leads.filter(l=>l.status==="Partner").length;
}

function nextAction(l){
  const d=dateValue(l.nextFollowUp), t=todayISO();
  if(l.status==="Partner")return "Maintain relationship and referral pathway";
  if(l.status==="Not Interested")return "No active follow-up";
  if(l.status==="Meeting")return "Prepare meeting and partnership proposal";
  if(l.status==="Interested")return "Call to secure a 10-minute meeting";
  if(d&&d<t)return "Follow up now — overdue";
  if(d===t)return "Follow up today";
  if(["Contacted","Email Sent","SMS Sent"].includes(l.status))return "Follow up in 2–3 business days";
  if(cleanEmails(l.email).length)return "Send personalized introduction email";
  if(l.phoneUri||l.phone)return "Call decision maker";
  return "Verify contact information";
}

function cardClass(l){const d=dateValue(l.nextFollowUp),t=todayISO();if(d&&d<t)return "overdue";if(d===t)return "due";if(l.status==="Interested")return "interested";return "";}
function followChip(l){const d=dateValue(l.nextFollowUp),t=todayISO();if(!d)return `<span class="follow-chip">No follow-up</span>`;if(d<t)return `<span class="follow-chip danger">Overdue ${esc(d)}</span>`;if(d===t)return `<span class="follow-chip warn">Due today</span>`;return `<span class="follow-chip">Follow-up ${esc(d)}</span>`;}
function statusClass(s){return `status-${String(s||"New").replaceAll(" ","-")}`;}

function render(){
  metrics();
  const arr=filtered();
  $("visibleCount").textContent=arr.length;
  $("leadList").innerHTML=arr.map(l=>{
    const emails=cleanEmails(l.email), phone=l.phoneUri||String(l.phone||"").replace(/[^+\d]/g,"");
    const mail=emails[0]||"";
    const smsBody=encodeURIComponent(`Hi ${firstName(l.administrator)}, this is Jepthe with Perry Home Wound Care. We provide mobile wound care and NP support in Middle Georgia. Would you be open to a quick 10-minute call? 478-310-4446`);
    return `<article class="lead-card ${cardClass(l)}">
      <div class="lead-top"><div><div class="lead-name">${esc(l.name)}</div><div class="lead-type">${esc(l.type)} · ${esc(l.city)}, ${esc(l.county)} County</div></div><span class="tier tier-${String(l.tier||"Standard").toLowerCase()}">${esc(l.tier||"Standard")}</span></div>
      <div class="lead-person"><strong>${esc(l.administrator||"Decision maker not listed")}</strong><div class="contactline">${esc(l.email||"No email")} · ${esc(l.phone||"No phone")}</div>${l.assignedTo?`<div class="contactline">Owner: ${esc(l.assignedTo)}</div>`:""}</div>
      <div class="status-row"><span class="status-chip ${statusClass(l.status)}">${esc(l.status)}</span>${followChip(l)}</div>
      <div class="next-action"><b>Next action:</b> ${esc(nextAction(l))}</div>
      <div class="crm-actions">
        ${phone?`<a class="action-btn call" href="tel:${esc(phone)}" data-action="call" data-id="${esc(l.id)}">☎ CALL</a>`:`<span class="action-btn call">No phone</span>`}
        ${phone?`<a class="action-btn sms" href="sms:${esc(phone)}?body=${smsBody}" data-action="sms" data-id="${esc(l.id)}">💬 SMS</a>`:`<span class="action-btn sms">No SMS</span>`}
        ${mail?`<button class="action-btn email" data-action="email" data-id="${esc(l.id)}">✉ EMAIL</button>`:`<span class="action-btn email">No email</span>`}
        ${mail?`<button class="action-btn gmail" data-action="gmail" data-id="${esc(l.id)}">G GMAIL</button>`:`<span class="action-btn gmail">No Gmail</span>`}
      </div>
      <div class="quick-actions"><button class="positive" data-status="Interested" data-id="${esc(l.id)}">Interested</button><button class="meeting" data-status="Meeting" data-id="${esc(l.id)}">Meeting</button><button data-follow="3" data-id="${esc(l.id)}">Follow-up +3d</button></div>
      <div class="card-footer"><span class="score">Score ${esc(l.score||0)} · ${esc(l.opportunity||"General outreach")}</span><button class="btn" data-edit="${esc(l.id)}">Update / Notes</button></div>
    </article>`;
  }).join("");
  $("emptyState").hidden=arr.length>0;
}

async function patchLead(id, patch, activity){
  patch={...patch,updatedAt:serverTimestamp(),updatedBy:currentUser?.email||currentUser?.uid||"admin"};
  await updateDoc(doc(db,COL,id),patch);
  const idx=leads.findIndex(x=>x.id===id);if(idx>=0)leads[idx]={...leads[idx],...patch,updatedAt:Timestamp.now()};
  if(activity)await addDoc(collection(db,ACT),{leadId:id,organization:leads[idx]?.name||"",...activity,actor:currentUser?.email||currentUser?.uid||"admin",createdAt:serverTimestamp()});
  render();
}

async function seedLeads(){
  if(!confirm(`Import ${CRM_SEED_LEADS.length} PHWC leads into Firestore? Existing CRM records with the same ID will be preserved where possible.`))return;
  $("btnSeed").disabled=true;$("btnSeed").textContent="Importing…";
  let batch=writeBatch(db), count=0, total=0;
  for(const raw of CRM_SEED_LEADS){
    const ref=doc(db,COL,raw.id);const existing=await getDoc(ref);
    if(existing.exists())continue;
    batch.set(ref,{...raw,status:"New",notes:"",lastContact:"",nextFollowUp:"",assignedTo:"",preferred:"Both",createdAt:serverTimestamp(),createdBy:currentUser?.email||currentUser?.uid||"admin",updatedAt:serverTimestamp()});count++;total++;
    if(count>=350){await batch.commit();batch=writeBatch(db);count=0;}
  }
  if(count)await batch.commit();
  await addDoc(collection(db,ACT),{leadId:"SYSTEM",organization:"PHWC CRM",channel:"IMPORT",status:"Seeded",details:`Imported ${total} legacy leads`,actor:currentUser?.email||currentUser?.uid||"admin",createdAt:serverTimestamp()});
  $("btnSeed").disabled=false;$("btnSeed").textContent="Import PHWC leads";await load();
}

function emailTemplate(l){
  const t=String(l.type||"").toUpperCase();
  let middle="PHWC provides mobile RN wound care and NP-led clinical management for patients with pressure injuries, diabetic wounds, vascular wounds, surgical wounds, and other complex or non-healing wounds.";
  let value="We work alongside existing clinical teams to provide additional wound-care support when needed, including wound assessments and follow-up, NP evaluation and treatment management, wound-care nursing support, and clear clinical communication.";
  let ask=`Would you be available for a brief 10-minute call or meeting next week to discuss whether PHWC could support ${l.name}?`;
  if(t.includes("NURSING HOME")){value="We can work alongside your existing wound team through wound assessments, NP wound evaluation and treatment management, complex wound support, medically indicated debridement, nursing support, and clear documentation with facility staff.";}
  else if(t.includes("HOME HEALTH AGENCY")){middle="PHWC provides specialty wound-care support for home health organizations that need additional wound expertise, provider oversight, or coverage for complex cases.";value="Our goal is to complement your home-health team, not replace it, while supporting difficult or non-healing wounds and clinical escalation.";ask=`Would you be available for a brief 10-minute call to discuss a specialty wound-care partnership pathway for ${l.name}?`;}
  else if(t.includes("HOSPITAL")){middle="PHWC provides mobile RN wound care and NP-led clinical management for patients who need continued wound follow-up after discharge.";value="We focus on timely home follow-up, patient education, treatment coordination, and communication with referring providers.";ask=`Would you be available for a brief call to discuss whether PHWC could serve as a local wound-care follow-up resource for patients discharged from ${l.name}?`;}
  else if(t.includes("HOSPICE")){middle="PHWC provides mobile wound-care support and NP-led clinical management for patients with complex wounds, aligned with the hospice plan of care and comfort-focused goals.";value="We can support wound assessment, symptom-focused wound management, nursing expertise, and provider collaboration when additional wound support is needed.";}
  else if(t.includes("DIALYSIS")){middle="PHWC provides mobile RN wound care and NP-led clinical management for diabetic, vascular, pressure, surgical, and other complex wounds.";value="We are building local referral relationships for patients who need wound evaluation and follow-up outside the dialysis clinic.";}
  return {subject:"Wound Care Partnership | Perry Home Wound Care",body:`Hi ${firstName(l.administrator)},\n\nI’m Jepthe Nkwanmen, RN, Administrator of Perry Home Wound Care LLC (PHWC), serving Middle Georgia.\n\n${middle}\n\n${value}\n\nOur goal is not to replace your clinical team, but to provide additional wound-care support when needed.\n\n${ask}\n\nBest regards,\nJepthe Nkwanmen, RN\nAdministrator | Perry Home Wound Care LLC\n478-310-4446\nsupport@perryhomewoundcare.network\nwww.perryhomewoundcare.network`};
}
function emailHtml(l){const e=emailTemplate(l);const paras=e.body.split(/\n\n/).map(p=>`<p>${esc(p).replaceAll("\n","<br>")}</p>`).join("");return `<div class="email-shell"><div class="email-head"><strong>Perry Home Wound Care</strong><div>Advanced Wound Care at Home.</div></div><div class="email-body">${paras}<div class="email-contact"><strong>Quick contact</strong><br>478-310-4446 · support@perryhomewoundcare.network<br>www.perryhomewoundcare.network</div></div></div>`;}
function openEmail(l, gmail=false){currentEmailLead=l;const e=emailTemplate(l),to=cleanEmails(l.email)[0]||"";$("emailMeta").innerHTML=`<b>To:</b> ${esc(to)}<br><b>Subject:</b> ${esc(e.subject)}`;$("emailPreview").innerHTML=emailHtml(l);$("emailDialog").showModal();if(gmail)setTimeout(()=>openGmail(),100);}
function openGmail(){if(!currentEmailLead)return;const e=emailTemplate(currentEmailLead),to=cleanEmails(currentEmailLead.email)[0];window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}`,"_blank","noopener");patchLead(currentEmailLead.id,{status:"Email Sent",lastContact:todayISO()},{channel:"EMAIL",status:"Email Sent",details:"Opened Gmail compose"}).catch(console.error);}
async function copyFormatted(){if(!currentEmailLead)return;const plain=emailTemplate(currentEmailLead).body,html=emailHtml(currentEmailLead);try{if(navigator.clipboard&&window.ClipboardItem){await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([html],{type:"text/html"}),"text/plain":new Blob([plain],{type:"text/plain"})})]);}else await navigator.clipboard.writeText(plain);alert("Email copied. Paste it into Gmail.");}catch{await navigator.clipboard.writeText(plain);alert("Plain-text email copied.");}}

function populateTypes(){const types=[...new Set(leads.map(x=>x.type).filter(Boolean))].sort();$("fType").innerHTML='<option value="">All facility types</option>'+types.map(x=>`<option>${esc(x)}</option>`).join("");}
function openLeadDialog(l=null){$("leadForm").reset();$("leadDialogTitle").textContent=l?"Update lead":"Add lead";$("leadId").value=l?.id||"";$("leadName").value=l?.name||"";$("leadType").value=l?.type||"";$("leadAdmin").value=l?.administrator||"";$("leadAssigned").value=l?.assignedTo||"";$("leadEmail").value=l?.email||"";$("leadPhone").value=l?.phone||"";$("leadCity").value=l?.city||"";$("leadCounty").value=l?.county||"";$("leadAddress").value=l?.address||"";$("leadTier").value=l?.tier||"Medium";$("leadScore").value=l?.score||90;$("leadOpportunity").value=l?.opportunity||"";$("leadNotes").value=l?.notes||"";$("leadDialog").showModal();}
async function saveLead(e){e.preventDefault();const existingId=$("leadId").value;const id=existingId||`CRM-${Date.now()}`;const data={name:$("leadName").value.trim(),type:$("leadType").value.trim(),administrator:$("leadAdmin").value.trim(),assignedTo:$("leadAssigned").value.trim(),email:$("leadEmail").value.trim(),phone:$("leadPhone").value.trim(),phoneUri:String($("leadPhone").value||"").replace(/[^+\d]/g,""),city:$("leadCity").value.trim(),county:$("leadCounty").value.trim(),address:$("leadAddress").value.trim(),tier:$("leadTier").value,score:Number($("leadScore").value||0),opportunity:$("leadOpportunity").value.trim(),notes:$("leadNotes").value.trim(),updatedAt:serverTimestamp(),updatedBy:currentUser?.email||"admin"};if(existingId){await updateDoc(doc(db,COL,id),data);const i=leads.findIndex(x=>x.id===id);leads[i]={...leads[i],...data,updatedAt:Timestamp.now()};}else{await setDoc(doc(db,COL,id),{...data,status:"New",lastContact:"",nextFollowUp:"",preferred:"Both",createdAt:serverTimestamp(),createdBy:currentUser?.email||"admin"});leads.push(normalize({id,...data,status:"New"}));}await addDoc(collection(db,ACT),{leadId:id,organization:data.name,channel:"CRM",status:existingId?"Updated":"Created",actor:currentUser?.email||"admin",createdAt:serverTimestamp()});$("leadDialog").close();populateTypes();render();}
function exportJson(){const blob=new Blob([JSON.stringify(leads.map(({updatedAt,createdAt,...x})=>x),null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`PHWC_CRM_${todayISO()}.json`;a.click();URL.revokeObjectURL(a.href);}

$("leadList").addEventListener("click",async e=>{const el=e.target.closest("[data-id],[data-edit]");if(!el)return;const id=el.dataset.id||el.dataset.edit,l=leads.find(x=>x.id===id);if(!l)return;if(el.dataset.action==="call")patchLead(id,{status:"Contacted",lastContact:todayISO()},{channel:"CALL",status:"Contacted"}).catch(console.error);else if(el.dataset.action==="sms")patchLead(id,{status:"SMS Sent",lastContact:todayISO()},{channel:"SMS",status:"SMS Sent"}).catch(console.error);else if(el.dataset.action==="email")openEmail(l,false);else if(el.dataset.action==="gmail")openEmail(l,true);else if(el.dataset.status){await patchLead(id,{status:el.dataset.status,lastContact:todayISO(),nextFollowUp:el.dataset.status==="Interested"?plusDays(2):l.nextFollowUp},{channel:"CRM",status:el.dataset.status});}else if(el.dataset.follow){await patchLead(id,{nextFollowUp:plusDays(Number(el.dataset.follow))},{channel:"CRM",status:"Follow-up scheduled",details:`+${el.dataset.follow} days`});}else if(el.dataset.edit)openLeadDialog(l);});

["q"].forEach(id=>$(id).addEventListener("input",render));["fType","fStatus","fOwner","fSort"].forEach(id=>$(id).addEventListener("change",render));document.querySelectorAll("[data-quick]").forEach(b=>b.addEventListener("click",()=>{quickFilter=b.dataset.quick;document.querySelectorAll(".quick").forEach(x=>x.classList.toggle("active",x.dataset.quick===quickFilter));render();}));
$("btnSeed").addEventListener("click",seedLeads);$("emptySeed").addEventListener("click",seedLeads);$("btnAddLead").addEventListener("click",()=>openLeadDialog());$("leadForm").addEventListener("submit",e=>{if(e.submitter?.value==="cancel")return;saveLead(e).catch(err=>alert(err.message));});$("btnExport").addEventListener("click",exportJson);$("copyEmailBtn").addEventListener("click",copyFormatted);$("openGmailBtn").addEventListener("click",openGmail);

currentUser=await adminReady;$("todayLabel").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});await load();populateTypes();render();
