import { adminReady, auth, db } from "/admin/admin-shared.js";
import { doc, getDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

await adminReady;

const $ = id => document.getElementById(id);
const drawer=$("refDrawer");
const ids=["refFaceSheetReady","refOrderReady","refInsuranceReady","refClinicalReady","refContactReady","refHandoffReady"];
let loading=false;

function referralId(){ return String($("referralId")?.value||"").trim(); }
function checklist(){ return {
  faceSheet:$("refFaceSheetReady").checked,
  order:$("refOrderReady").checked,
  insurance:$("refInsuranceReady").checked,
  clinicalRecords:$("refClinicalReady").checked,
  contactConfirmed:$("refContactReady").checked,
  handoffReviewed:$("refHandoffReady").checked
}; }

function readinessItems(){
  const c=checklist();
  const eligibility=$("eligibilityStatus")?.value||"Not Checked";
  const authStatus=$("authorizationStatus")?.value||"Not Required";
  return [
    {ok:!!String($("patientName")?.value||"").trim(),label:"patient identified"},
    {ok:!!String($("primaryPayer")?.value||"").trim(),label:"primary payer entered"},
    {ok:!["Not Checked","Pending"].includes(eligibility),label:"eligibility reviewed"},
    {ok:["Not Required","Approved"].includes(authStatus),label:"authorization resolved"},
    {ok:!!String($("assignedTo")?.value||"").trim(),label:"owner assigned"},
    {ok:c.faceSheet,label:"face sheet"},
    {ok:c.insurance,label:"insurance information"},
    {ok:c.contactConfirmed,label:"contact confirmed"},
    {ok:c.order||authStatus==="Not Required",label:"order/referral requirement"},
    {ok:c.handoffReviewed,label:"handoff reviewed"}
  ];
}

function render(){
  const items=readinessItems(); const done=items.filter(x=>x.ok).length; const pct=Math.round(done/items.length*100); const missing=items.filter(x=>!x.ok).map(x=>x.label);
  $("refReadinessChip").textContent=pct>=90?`Ready · ${pct}%`:`${pct}% complete`;
  $("refReadinessChip").className=pct>=90?"ready-chip":"missing-chip";
  $("refReadinessText").textContent=missing.length?`${missing.length} core intake item${missing.length===1?"":"s"} still need attention: ${missing.slice(0,3).join(", ")}${missing.length>3?"…":""}`:"Core administrative intake is complete for handoff.";
  return pct;
}

function setDisabled(disabled){ ids.forEach(id=>$(id).disabled=disabled); }

async function load(){
  const id=referralId();
  ids.forEach(key=>$(key).checked=false);
  if(!id){ setDisabled(true); $("refReadinessMessage").textContent="Save the referral first, then reopen it to track readiness."; render(); return; }
  setDisabled(false); loading=true;
  try{
    const snap=await getDoc(doc(db,"patientReferal",id));
    const c=snap.data()?.intakeChecklist||{};
    $("refFaceSheetReady").checked=c.faceSheet===true;
    $("refOrderReady").checked=c.order===true;
    $("refInsuranceReady").checked=c.insurance===true;
    $("refClinicalReady").checked=c.clinicalRecords===true;
    $("refContactReady").checked=c.contactConfirmed===true;
    $("refHandoffReady").checked=c.handoffReviewed===true;
    $("refReadinessMessage").textContent="Checklist changes save automatically for this referral.";
  }catch(err){
    console.error("[referral-readiness]",err); $("refReadinessMessage").textContent="Unable to load readiness checklist.";
  }finally{ loading=false; render(); }
}

async function save(){
  if(loading) return;
  const id=referralId(); if(!id) return;
  const pct=render();
  $("refReadinessMessage").textContent="Saving readiness…";
  try{
    await updateDoc(doc(db,"patientReferal",id),{intakeChecklist:checklist(),intakeReadiness:pct,intakeReadinessUpdatedAt:serverTimestamp(),intakeReadinessUpdatedBy:auth.currentUser?.uid||""});
    $("refReadinessMessage").textContent="Readiness saved.";
  }catch(err){
    console.error("[referral-readiness]",err); $("refReadinessMessage").textContent="Unable to save readiness.";
  }
}

ids.forEach(id=>$(id)?.addEventListener("change",save));
["patientName","primaryPayer","eligibilityStatus","authorizationStatus","assignedTo"].forEach(id=>{
  $(id)?.addEventListener("input",render); $(id)?.addEventListener("change",render);
});

const observer=new MutationObserver(()=>{ if(drawer?.getAttribute("aria-hidden")==="false") setTimeout(load,0); });
if(drawer) observer.observe(drawer,{attributes:true,attributeFilter:["aria-hidden"]});
render();
