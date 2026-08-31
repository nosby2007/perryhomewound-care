import { adminReady, auth, db, storage, esc } from "/admin/admin-shared.js";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getBlob, ref as storageRef, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

await adminReady;

const $ = (id) => document.getElementById(id);
let stopDocuments = null;
const MAX_SIZE = 15 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf","image/jpeg","image/png","image/webp"]);

function activeReferralId(){ return $("referralId")?.value || ""; }
function safeName(name){ return String(name || "document").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,120); }
function fmt(ts){ return ts?.toDate?.().toLocaleString?.() || "Pending"; }

function watchDocuments(){
  stopDocuments?.(); stopDocuments = null;
  const referralId = activeReferralId();
  const list = $("refDocumentList");
  if(!list) return;
  if(!referralId){ list.innerHTML = `<div class="muted2">Save the referral before attaching documents.</div>`; return; }
  const qy = query(collection(db,"patientReferal",referralId,"documents"), orderBy("createdAt","desc"));
  stopDocuments = onSnapshot(qy,(snap)=>{
    const docs = snap.docs.map(s=>({id:s.id,...s.data()}));
    list.innerHTML = docs.length ? docs.map(d=>`<div class="activity-item" data-refdoc="${esc(d.id)}">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div><strong>${esc(d.documentType || "Document")}</strong><div class="muted2">${esc(d.originalName || "file")} · ${esc(fmt(d.createdAt))}</div></div>
        <div><button class="btn" type="button" data-doc-view="${esc(d.storagePath || "")}">View</button> <button class="btn" type="button" data-doc-print="${esc(d.storagePath || "")}">Print</button></div>
      </div>
    </div>`).join("") : `<div class="muted2">No documents attached.</div>`;
  },()=>{ list.innerHTML = `<div class="muted2">Unable to load documents.</div>`; });
}

async function uploadDocument(){
  const referralId = activeReferralId();
  const file = $("refDocumentFile")?.files?.[0];
  const msg = $("refDocumentMessage");
  if(!referralId) return alert("Save the referral before adding documents.");
  if(!file) return alert("Choose a PDF or image first.");
  if(!ALLOWED.has(file.type)) return alert("Only PDF, JPEG, PNG or WebP files are allowed.");
  if(file.size > MAX_SIZE) return alert("Document is too large. Maximum size is 15 MB.");
  const docId = crypto.randomUUID();
  const path = `referrals/${referralId}/${docId}/${safeName(file.name)}`;
  msg.textContent = "Uploading securely…";
  try{
    await uploadBytes(storageRef(storage,path),file,{contentType:file.type,customMetadata:{referralId,uploadedBy:auth.currentUser?.uid || ""}});
    await addDoc(collection(db,"patientReferal",referralId,"documents"),{
      documentType: $("refDocumentType")?.value || "Other",
      originalName: file.name,
      storagePath: path,
      contentType: file.type,
      size: file.size,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || ""
    });
    $("refDocumentFile").value = "";
    msg.textContent = "Document attached.";
  }catch(error){
    console.error("Referral document upload failed", error?.code || error?.message || error);
    msg.textContent = "Upload failed. Verify access and Storage rules.";
  }
}

async function openSecureFile(path, print=false){
  if(!path) return;
  try{
    const blob = await getBlob(storageRef(storage,path));
    const url = URL.createObjectURL(blob);
    const win = window.open(url,"_blank","noopener,noreferrer");
    if(print && win){
      const timer = setInterval(()=>{ try{ if(win.document?.readyState === "complete"){ clearInterval(timer); win.focus(); win.print(); } }catch{ clearInterval(timer); } },350);
      setTimeout(()=>clearInterval(timer),6000);
    }
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){
    console.error("Secure document open failed", error?.code || error?.message || error);
    alert("Unable to open this document. Verify your access.");
  }
}

function printDocumentList(){
  const referralId = activeReferralId();
  if(!referralId) return alert("Save the referral first.");
  const listHtml = $("refDocumentList")?.innerHTML || "";
  const w = window.open("","_blank","noopener,noreferrer");
  if(!w) return;
  w.document.write(`<!doctype html><html><head><title>Referral Document Index</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#182230}h1{font-size:20px}.activity-item{border-bottom:1px solid #ddd;padding:10px 0}.btn{display:none}.muted2{font-size:12px;color:#555}</style></head><body><h1>Perry Home Wound Care LLC</h1><h2>Referral Document Index</h2><p>Referral record: ${esc(referralId)}</p>${listHtml}<p style="margin-top:28px;font-size:11px">Administrative document index. Attached clinical documents are not automatically included.</p><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

$("uploadReferralDocumentBtn")?.addEventListener("click",uploadDocument);
$("printDocumentListBtn")?.addEventListener("click",printDocumentList);
document.addEventListener("click",(e)=>{
  const view = e.target.closest("[data-doc-view]"); if(view){ e.preventDefault(); e.stopPropagation(); openSecureFile(view.dataset.docView,false); return; }
  const print = e.target.closest("[data-doc-print]"); if(print){ e.preventDefault(); e.stopPropagation(); openSecureFile(print.dataset.docPrint,true); }
},true);

// Refresh when a drawer is opened for a row or a new referral.
document.addEventListener("click",(e)=>{
  if(e.target.closest("#addReferralBtn") || e.target.closest("[data-id]")) setTimeout(watchDocuments,80);
},true);
$("saveReferralBtn")?.addEventListener("click",()=>setTimeout(watchDocuments,700));
watchDocuments();
