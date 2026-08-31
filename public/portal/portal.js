import { auth, db, storage, esc, fmtDate, portalReady, portalSignOut } from "/portal/portal-shared.js";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getBlob, ref as storageRef } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

const $=(id)=>document.getElementById(id); const TERMS_VERSION="2026-08-31-v1";
const ctx=await portalReady; const patientId=ctx.patientId;
$("logoutBtn").addEventListener("click",portalSignOut);

async function safeDocs(pathSegments, sortField){
  try{const base=collection(db,...pathSegments);const snap=sortField?await getDocs(query(base,orderBy(sortField,"desc"))):await getDocs(base);return snap.docs.map(d=>({id:d.id,...d.data()}));}catch(error){console.error("Portal data load failed",error?.code||error?.message||error);return[];}
}

function showTab(name){document.querySelectorAll(".tab-panel").forEach(p=>p.classList.add("hidden"));document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));$("tab-"+name)?.classList.remove("hidden");}
$("tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(b)showTab(b.dataset.tab);});

async function secureOpen(path){
  if(!path)return;
  try{const blob=await getBlob(storageRef(storage,path));const url=URL.createObjectURL(blob);window.open(url,"_blank","noopener,noreferrer");setTimeout(()=>URL.revokeObjectURL(url),60000);}catch{alert("This document is not available to your portal account.");}
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-storage-path]");if(b){e.preventDefault();secureOpen(b.dataset.storagePath);}});

async function enforceTerms(){
  if(ctx.profile?.termsVersion===TERMS_VERSION&&ctx.profile?.termsAcceptedAt)return;
  $("termsGate").classList.remove("hidden");
  $("acceptTerms").addEventListener("change",()=>$("acceptTermsBtn").disabled=!$("acceptTerms").checked);
  $("acceptTermsBtn").addEventListener("click",async()=>{if(!$("acceptTerms").checked)return;$("acceptTermsBtn").disabled=true;try{await updateDoc(doc(db,"portalUsers",ctx.user.uid),{termsVersion:TERMS_VERSION,termsAcceptedAt:serverTimestamp()});$("termsGate").classList.add("hidden");}catch{$("acceptTermsBtn").disabled=false;alert("Unable to record portal acceptance. Please contact PHWC.");}});
}
await enforceTerms();

const summarySnap=await getDoc(doc(db,"patientPortal",patientId));const summary=summarySnap.exists()?summarySnap.data():{};
$("welcomeName").textContent=summary.displayName?`Welcome, ${summary.displayName}`:"My wound care";
$("nextVisit").textContent=fmtDate(summary.nextVisit);

let wounds=await safeDocs(["patientPortal",patientId,"wounds"],"updatedAt");
let visits=await safeDocs(["patientPortal",patientId,"visits"],"visitDate");
let labs=await safeDocs(["patientPortal",patientId,"labs"],"orderedAt");
let bills=await safeDocs(["patientPortal",patientId,"billing"],"serviceDate");
let docs=await safeDocs(["patientPortal",patientId,"documents"],"publishedAt");
$("activeWounds").textContent=String(wounds.filter(w=>w.active!==false).length);
$("lastVisit").textContent=visits[0]?fmtDate(visits[0].visitDate):"—";
$("billingStatus").textContent=bills[0]?.status||"—";

function renderWoundList(){
  $("woundList").innerHTML=wounds.length?wounds.map((w,i)=>`<button type="button" class="item" data-wound-id="${esc(w.id)}" style="text-align:left;background:#fff;cursor:pointer"><div class="item-head"><strong>${esc(w.location||w.label||`Wound ${i+1}`)}</strong><span class="pill ${w.active===false?"":"good"}">${w.active===false?"Closed":"Active"}</span></div><div class="muted">${esc(w.stage||w.type||"")}</div></button>`).join(""):`<div class="empty">No wound records have been released to the portal.</div>`;
}
function drawChart(points){
  const canvas=$("woundChart"),ctx2=canvas.getContext("2d");const w=canvas.width,h=canvas.height;ctx2.clearRect(0,0,w,h);ctx2.strokeStyle="#cdd8e3";ctx2.lineWidth=1;ctx2.beginPath();ctx2.moveTo(42,15);ctx2.lineTo(42,h-34);ctx2.lineTo(w-14,h-34);ctx2.stroke();
  if(!points.length){ctx2.fillStyle="#637083";ctx2.font="14px Arial";ctx2.fillText("No measurements released yet.",60,100);return;}
  const vals=points.map(p=>Number(p.area??((Number(p.length)||0)*(Number(p.width)||0))));const max=Math.max(...vals,1);ctx2.strokeStyle="#123b61";ctx2.lineWidth=3;ctx2.beginPath();points.forEach((p,i)=>{const x=42+(i*(w-70)/Math.max(points.length-1,1));const y=(h-34)-(vals[i]/max)*(h-65);if(i===0)ctx2.moveTo(x,y);else ctx2.lineTo(x,y);ctx2.fillStyle="#123b61";ctx2.beginPath();ctx2.arc(x,y,4,0,Math.PI*2);ctx2.fill();});ctx2.stroke();ctx2.fillStyle="#637083";ctx2.font="11px Arial";ctx2.fillText("Area (cm²) over time",50,18);
}
async function selectWound(id){
  const w=wounds.find(x=>x.id===id);if(!w)return;$("woundTitle").textContent=`${w.location||w.label||"Wound"} — progression`;
  $("woundTreatment").innerHTML=`<div class="item"><strong>Current treatment</strong><div style="margin-top:6px">${esc(w.currentTreatment||"No treatment instructions have been released to the portal.")}</div>${w.lastMeasuredAt?`<div class="muted" style="margin-top:6px">Last measurement: ${esc(fmtDate(w.lastMeasuredAt))}</div>`:""}</div>`;
  let points=await safeDocs(["patientPortal",patientId,"wounds",id,"measurements"],"measuredAt");points=points.reverse();drawChart(points);
}
$("woundList").addEventListener("click",e=>{const b=e.target.closest("[data-wound-id]");if(b)selectWound(b.dataset.woundId);});
renderWoundList(); if(wounds[0])selectWound(wounds[0].id);else drawChart([]);

$("visitList").innerHTML=visits.length?visits.map(v=>`<div class="item"><div class="item-head"><strong>${esc(fmtDate(v.visitDate))} · ${esc(v.visitType||"Wound care visit")}</strong>${v.reportStoragePath?`<button class="button secondary" data-storage-path="${esc(v.reportStoragePath)}">View report</button>`:""}</div><div style="margin-top:7px">${esc(v.summary||"Visit report available when released by your care team.")}</div></div>`).join(""):`<div class="empty">No visit reports have been released.</div>`;

$("labBody").innerHTML=labs.length?labs.map(l=>`<tr><td>${esc(fmtDate(l.orderedAt||l.resultedAt))}</td><td>${esc(l.name||l.orderName||"Lab / order")}</td><td><span class="pill ${String(l.status||"").toLowerCase()==="resulted"?"good":""}">${esc(l.status||"Ordered")}</span></td><td>${esc(l.resultSummary||"—")}${l.resultStoragePath?` <button class="button secondary" data-storage-path="${esc(l.resultStoragePath)}">Report</button>`:""}</td></tr>`).join(""):`<tr><td colspan="4" class="empty">No labs or orders have been released.</td></tr>`;

function money(v){const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n):"—";}
function validPay(url){try{const u=new URL(url);return u.protocol==="https:"?u.href:"";}catch{return"";}}
$("billingList").innerHTML=bills.length?bills.map(b=>{const pay=validPay(b.paymentUrl);return`<div class="item"><div class="item-head"><div><strong>${esc(fmtDate(b.serviceDate))} · ${esc(b.description||"Wound care service")}</strong><div class="muted">Insurance: ${esc(b.payer||"—")} · Claim: ${esc(b.claimStatus||b.status||"Pending")}</div></div><span class="pill">${esc(b.status||"Pending")}</span></div><div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px"><span>Insurance billed: <strong>${money(b.insuranceBilled)}</strong></span><span>Patient responsibility: <strong>${money(b.patientResponsibility)}</strong></span>${pay?`<a class="button" href="${esc(pay)}" target="_blank" rel="noopener noreferrer">Pay securely</a>`:""}</div></div>`;}).join(""):`<div class="empty">No billing records have been released.</div>`;

$("documentList").innerHTML=docs.length?docs.map(d=>`<div class="item"><div class="item-head"><div><strong>${esc(d.title||d.documentType||"Document")}</strong><div class="muted">${esc(fmtDate(d.publishedAt))}</div></div>${d.storagePath?`<button class="button secondary" data-storage-path="${esc(d.storagePath)}">Open</button>`:""}</div></div>`).join(""):`<div class="empty">No documents have been released.</div>`;
