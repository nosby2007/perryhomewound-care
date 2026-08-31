import { adminReady, db, esc } from "/admin/admin-shared.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

await adminReady;

const $ = (id) => document.getElementById(id);
const terminal = new Set(["admitted","declined","unable_to_contact","insurance_network_issue","authorization_denied","outside_service_area","hospitalized","duplicate","withdrawn","not_clinically_appropriate","other_not_admitted","archived"]);
function norm(v){const s=String(v||"new").trim().toLowerCase().replace(/[\s/-]+/g,"_");return ({new:"received",reviewed:"under_review",converted:"accepted_scheduled"})[s]||s;}
function bucket(s){s=norm(s);if(["received","under_review"].includes(s))return"New / Received";if(s==="insurance_verification")return"Verification";if(["contact_attempt","contacted"].includes(s))return"Contacting";if(["scheduling","accepted_scheduled"].includes(s))return"Scheduling";if(s==="admitted")return"Admitted";if(terminal.has(s))return"Not Admitted";return"New / Received";}
function needsAction(r){const s=norm(r.status);return ["received","under_review","insurance_verification","contact_attempt","contacted","scheduling","accepted_scheduled"].includes(s);}
function text(v){return String(v??"").trim();}

onSnapshot(collection(db,"patientReferal"),(snap)=>{
  const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
  const counts={"New / Received":0,"Verification":0,"Contacting":0,"Scheduling":0,"Admitted":0,"Not Admitted":0};
  rows.forEach(r=>counts[bucket(r.status)]++);
  if($("mReferrals")) $("mReferrals").textContent=String(rows.filter(needsAction).length);
  if($("referralPipeline")) $("referralPipeline").innerHTML=Object.entries(counts).map(([label,count])=>`<div class="pipeline-step"><strong>${count}</strong><span>${esc(label)}</span></div>`).join("");
  if($("latestReferrals")){
    const latest=[...rows].sort((a,b)=>{const av=a.updatedAt?.toMillis?.()||a.createdAt?.toMillis?.()||0;const bv=b.updatedAt?.toMillis?.()||b.createdAt?.toMillis?.()||0;return bv-av;}).slice(0,4);
    $("latestReferrals").innerHTML=latest.length?latest.map(r=>`<div class="feed-item"><div class="feed-copy"><strong>${esc(text(r.requestedService||r.serviceTitle)||"Wound care referral")}</strong><span>${esc(text(r.refOrg||r.refName)||"Referring source")} · ${esc(norm(r.status).replaceAll("_"," "))}</span></div><a href="/admin/referrals.html">Open →</a></div>`).join(""):`<div class="empty-command">No referrals yet.</div>`;
  }
});