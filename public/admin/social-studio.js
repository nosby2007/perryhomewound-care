import { db, storage, adminReady, esc } from "/admin/admin-shared.js";
import { collection, getDocs, doc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

const COL="socialPosts";
const $=id=>document.getElementById(id);
let posts=[];
let currentUser=null;
let editingId="";
let variant=0;
let currentImageUrl="";
let currentImagePath="";

const PHWC={phone:"478-310-4446",email:"support@perryhomewoundcare.network",web:"www.perryhomewoundcare.network"};
const topics={
  complex:{label:"complex and non-healing wounds",plain:"Wounds that are slow to improve often need consistent assessment, treatment coordination and follow-up."},
  pressure:{label:"pressure injury support",plain:"Pressure injuries benefit from timely assessment, pressure-relief planning and consistent follow-up based on the individual plan of care."},
  diabetic:{label:"diabetic wound care",plain:"Diabetic wounds deserve early attention, regular assessment and coordinated management to reduce avoidable complications."},
  vascular:{label:"vascular wound care",plain:"Lower-extremity wounds may be influenced by circulation, swelling and other health factors, so coordinated clinical evaluation matters."},
  surgical:{label:"post-surgical wound follow-up",plain:"After a procedure, clear wound instructions and timely follow-up can help patients and families know what to monitor and when to call the treating team."},
  home:{label:"mobile wound care at home",plain:"For patients who have difficulty traveling, mobile wound care can bring assessment, education and follow-up into the home."},
  np:{label:"NP-led wound management",plain:"NP-led wound management can help coordinate evaluation, treatment planning and communication across the care team."},
  facility:{label:"facility wound-care support",plain:"Facilities sometimes need additional wound expertise, provider follow-up or coverage for complex cases without replacing the internal clinical team."},
  prevention:{label:"wound prevention and education",plain:"Skin checks, pressure relief, moisture management, mobility support and early reporting are important parts of wound prevention."}
};
const audiences={patients:"patients and families",caregivers:"family caregivers",hha:"home health agencies",snf:"skilled nursing facilities",alf:"assisted living and personal care homes",hospital:"hospital discharge teams",providers:"NPs, physicians and other providers",community:"the Middle Georgia community"};
const ctas={
  call:`Call Perry Home Wound Care at ${PHWC.phone} to discuss whether our services may be appropriate.`,
  website:`Learn more at ${PHWC.web}.`,
  referral:`Need a local wound-care resource? Send a referral or contact PHWC at ${PHWC.phone}.`,
  meeting:`Let’s discuss a local wound-care partnership. Contact PHWC at ${PHWC.phone} or ${PHWC.email}.`,
  message:`Send Perry Home Wound Care a message to learn more about available wound-care support.`
};
const hooks={
  education:["Wound care is more than changing a dressing.","A wound can tell you a lot about what the patient needs next.","Good wound care starts with a clear assessment and a consistent plan."],
  referral:["Looking for a local wound-care resource in Middle Georgia?","When a wound needs more focused follow-up, a clear referral pathway matters.","Your patients should not have to navigate complex wound care alone."],
  partnership:["Your clinical team does not have to manage every complex wound alone.","PHWC is building stronger wound-care partnerships across Middle Georgia.","Additional wound expertise can strengthen continuity across settings."],
  awareness:["Advanced wound-care support can come to the patient.","Perry Home Wound Care brings focused wound support closer to home.","Local wound-care access matters, especially when travel is difficult."],
  trust:["Clear communication. Consistent follow-up. Local wound-care support.","Families deserve to understand the wound-care plan and what comes next.","Trust in wound care is built through education, follow-up and communication."]
};

function platformHashtags(platform,topic,audience){
  const base=["#PerryHomeWoundCare","#WoundCare","#MiddleGeorgia","#PerryGA"];
  if(topic==="diabetic")base.push("#DiabeticWoundCare");
  if(topic==="pressure")base.push("#PressureInjuryPrevention");
  if(topic==="home")base.push("#HomeWoundCare");
  if(["hha","snf","alf","hospital","providers"].includes(audience))base.push("#HealthcarePartnership");
  if(platform==="LinkedIn")return base.slice(0,5);
  if(platform==="Facebook")return base.slice(0,6);
  return [...base,"#Nursing","#PatientEducation"].slice(0,8);
}

function visualPrompt(topic,audience,platform){
  const t=topics[topic]?.label||"wound care";
  const a=audiences[audience]||"Middle Georgia adults";
  return `Create a clean, realistic healthcare social media image for Perry Home Wound Care. Topic: ${t}. Audience: ${a}. Professional home-health setting in Middle Georgia, diverse adults, natural light, navy/teal PHWC brand accents, no visible wounds, no graphic medical imagery, no patient-identifying information, generous negative space for headline text. Format optimized for ${platform}.`;
}

function buildPost(){
  const platform=$("platform").value,audience=$("audience").value,goal=$("goal").value,topic=$("topic").value,tone=$("tone").value,cta=$("cta").value;
  const custom=$("angle").value.trim(), t=topics[topic]||topics.complex, a=audiences[audience]||"our community";
  const hook=(hooks[goal]||hooks.awareness)[variant%(hooks[goal]||hooks.awareness).length];
  let body="";
  if(tone==="direct")body=`${hook}\n\n${t.plain}\n\nPerry Home Wound Care provides mobile RN wound care and NP-led clinical management across Middle Georgia. ${custom?custom+" ":""}${ctas[cta]}`;
  else if(tone==="warm")body=`${hook}\n\nFor ${a}, wound concerns can feel overwhelming. ${t.plain}\n\nAt Perry Home Wound Care, our goal is to make the next step clearer through mobile wound-care support, education and communication with the care team. ${custom?"Today’s focus: "+custom+" ":""}${ctas[cta]}`;
  else if(tone==="educational")body=`${hook}\n\nClinical focus: ${t.label}. ${t.plain}\n\nFor ${a}, the key is to identify concerns early, follow the ordered plan of care and communicate changes to the treating clinician. ${custom?custom+" ":""}\n\nPHWC supports mobile RN wound care and NP-led clinical management in Middle Georgia. ${ctas[cta]}`;
  else body=`${hook}\n\n${t.plain}\n\nPerry Home Wound Care supports ${a} with mobile RN wound care and NP-led clinical management across Middle Georgia. Our role is to complement the existing care team with focused wound assessment, education, follow-up and communication when appropriate. ${custom?"Focus: "+custom+" ":""}${ctas[cta]}`;
  if(platform==="LinkedIn"&&["partnership","referral"].includes(goal))body+=`\n\nIf your organization is looking for an additional wound-care resource, PHWC is open to discussing referral pathways and clinical partnership needs.`;
  return {platform,audience,goal,topic,tone,cta,text:body,hashtags:platformHashtags(platform,topic,audience),imagePrompt:visualPrompt(topic,audience,platform),angle:custom};
}

function renderPreview(data){
  $("postText").value=data.text||"";
  $("hashtagPreview").textContent=(data.hashtags||[]).join(" ");
  $("imagePrompt").value=data.imagePrompt||"";
  $("previewPlatform").textContent=`${data.platform||$("platform").value} publication`;
  if(data.imageUrl!==undefined)setImage(data.imageUrl||"",data.imagePath||"",data.imageAlt||"");
  updateChars();
}
function updateChars(){$("charCount").textContent=`${$("postText").value.length+$("hashtagPreview").textContent.length} chars`;}
function fullPost(){return [$("postText").value.trim(),$("hashtagPreview").textContent.trim()].filter(Boolean).join("\n\n");}
function safeFileName(name){return String(name||"image").toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").slice(-90);}

function setImage(url,path="",alt=""){
  currentImageUrl=url||"";currentImagePath=path||"";
  $("imageAlt").value=alt||$("imageAlt").value||"";
  const wrap=$("photoPreviewWrap"),img=$("photoPreview"),open=$("openImageBtn");
  if(url){wrap.hidden=false;img.src=url;img.alt=$("imageAlt").value||"Publication photo";open.hidden=false;open.href=url;$("uploadState").textContent="Image ready";}
  else{wrap.hidden=true;img.removeAttribute("src");open.hidden=true;open.removeAttribute("href");$("uploadState").textContent="No image";}
}

async function uploadPhoto(){
  const file=$("postImage").files?.[0];
  if(!file){alert("Choose a photo first.");return;}
  if(!file.type.startsWith("image/")){alert("Please choose an image file.");return;}
  if(file.size>8*1024*1024){alert("Image must be 8 MB or smaller.");return;}
  $("uploadImageBtn").disabled=true;$("uploadState").textContent="Uploading…";
  try{
    const owner=currentUser?.uid||"admin";
    const path=`marketing/social/${owner}/${Date.now()}-${safeFileName(file.name)}`;
    const r=storageRef(storage,path);
    await uploadBytes(r,file,{contentType:file.type,customMetadata:{purpose:"phwc-social-marketing"}});
    const url=await getDownloadURL(r);
    setImage(url,path,$("imageAlt").value.trim());
  }finally{$("uploadImageBtn").disabled=false;}
}

async function removePhoto(){
  const path=currentImagePath;
  setImage("","","");$("postImage").value="";$("imageAlt").value="";
  if(path){try{await deleteObject(storageRef(storage,path));}catch(e){console.warn("Image delete skipped",e);}}
  if(editingId){await updateDoc(doc(db,COL,editingId),{imageUrl:"",imagePath:"",imageAlt:"",updatedAt:serverTimestamp(),updatedBy:currentUser?.email||"admin"});await loadPosts();}
}

async function copyText(text,label){try{await navigator.clipboard.writeText(text);alert(`${label} copied.`);}catch{prompt(`Copy ${label.toLowerCase()}:`,text);}}

async function save(status){
  const content=buildPost();
  content.text=$("postText").value.trim();
  content.hashtags=$("hashtagPreview").textContent.trim().split(/\s+/).filter(Boolean);
  content.imagePrompt=$("imagePrompt").value.trim();
  content.imageUrl=currentImageUrl;
  content.imagePath=currentImagePath;
  content.imageAlt=$("imageAlt").value.trim();
  if(!content.text){alert("Generate or write a publication first.");return;}
  const id=editingId||`SOC-${Date.now()}`, existing=posts.find(x=>x.id===id);
  await setDoc(doc(db,COL,id),{...content,status,updatedAt:serverTimestamp(),updatedBy:currentUser?.email||currentUser?.uid||"admin",...(existing?{}:{createdAt:serverTimestamp(),createdBy:currentUser?.email||currentUser?.uid||"admin"})},{merge:true});
  editingId=id;await loadPosts();alert(status==="Ready"?"Publication marked ready for review.":"Draft saved.");
}

async function loadPosts(){const snap=await getDocs(collection(db,COL));posts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));renderLibrary();}
function statusCounts(){$("draftCount").textContent=posts.filter(x=>x.status==="Draft").length;$("reviewCount").textContent=posts.filter(x=>x.status==="Ready").length;$("publishedCount").textContent=posts.filter(x=>x.status==="Published").length;}
function shortDate(ts){return ts?.toDate?.()?.toLocaleDateString?.()||"";}
function renderLibrary(){
  statusCounts();const sf=$("statusFilter").value,pf=$("platformFilter").value,list=posts.filter(p=>(!sf||p.status===sf)&&(!pf||p.platform===pf));$("libraryEmpty").hidden=list.length>0;
  $("postLibrary").innerHTML=list.map(p=>`<article class="saved-post">${p.imageUrl?`<img class="saved-post-image" src="${esc(p.imageUrl)}" alt="${esc(p.imageAlt||"PHWC publication image")}"/>`:""}<div class="saved-post-top"><div><h4>${esc(p.platform||"Post")} · ${esc(topics[p.topic]?.label||p.topic||"Wound care")}</h4><div class="saved-post-meta">${esc(shortDate(p.updatedAt))} · ${esc(audiences[p.audience]||p.audience||"")}</div></div><span class="status-pill status-${esc(p.status||"Draft")}">${esc(p.status||"Draft")}</span></div><div class="saved-post-text">${esc(p.text||"")}</div><div class="saved-actions"><button class="btn" data-edit="${esc(p.id)}">Edit</button><button class="btn" data-copy="${esc(p.id)}">Copy</button>${p.imageUrl?`<a class="btn" target="_blank" rel="noopener" href="${esc(p.imageUrl)}">Open image</a>`:""}${p.status!=="Published"?`<button class="btn primary" data-publish="${esc(p.id)}">Mark published</button>`:""}${p.publicationUrl?`<a class="btn" target="_blank" rel="noopener" href="${esc(p.publicationUrl)}">Open post</a>`:""}</div></article>`).join("");
}

function editPost(id){const p=posts.find(x=>x.id===id);if(!p)return;editingId=id;for(const k of ["platform","audience","goal","topic","tone","cta"]){if($(k)&&p[k])$(k).value=p[k];}$("angle").value=p.angle||"";renderPreview(p);window.scrollTo({top:0,behavior:"smooth"});}
function resetBuilder(){editingId="";variant=0;currentImageUrl="";currentImagePath="";$("builder").reset();$("postImage").value="";$("imageAlt").value="";renderPreview({platform:"Facebook",text:"",hashtags:[],imagePrompt:"",imageUrl:"",imagePath:"",imageAlt:""});}

$("generateBtn").addEventListener("click",()=>{variant=0;renderPreview({...buildPost(),imageUrl:currentImageUrl,imagePath:currentImagePath,imageAlt:$("imageAlt").value});});
$("variantBtn").addEventListener("click",()=>{variant++;renderPreview({...buildPost(),imageUrl:currentImageUrl,imagePath:currentImagePath,imageAlt:$("imageAlt").value});});
$("resetBtn").addEventListener("click",resetBuilder);$("newPostBtn").addEventListener("click",resetBuilder);$("postText").addEventListener("input",updateChars);$("platform").addEventListener("change",()=>{$("previewPlatform").textContent=`${$("platform").value} publication`;});
$("uploadImageBtn").addEventListener("click",()=>uploadPhoto().catch(e=>{console.error(e);$("uploadState").textContent="Upload failed";alert("Could not upload photo. Check Firebase Storage rules/deployment.");}));
$("clearImageBtn").addEventListener("click",()=>removePhoto().catch(console.error));$("imageAlt").addEventListener("input",()=>{if(currentImageUrl)$("photoPreview").alt=$("imageAlt").value||"Publication photo";});
$("copyPostBtn").addEventListener("click",()=>copyText(fullPost(),"Publication"));$("copyImageBtn").addEventListener("click",()=>copyText($("imagePrompt").value,"Image prompt"));
$("saveDraftBtn").addEventListener("click",()=>save("Draft").catch(e=>{console.error(e);alert("Could not save draft.");}));$("readyBtn").addEventListener("click",()=>save("Ready").catch(e=>{console.error(e);alert("Could not save publication.");}));
$("statusFilter").addEventListener("change",renderLibrary);$("platformFilter").addEventListener("change",renderLibrary);
$("postLibrary").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const id=b.dataset.edit||b.dataset.copy||b.dataset.publish;if(!id)return;const p=posts.find(x=>x.id===id);if(b.dataset.edit)editPost(id);else if(b.dataset.copy)copyText([p.text,(p.hashtags||[]).join(" ")].filter(Boolean).join("\n\n"),"Publication");else if(b.dataset.publish){$("publishId").value=id;$("publishPlatform").value=p.platform||"Facebook";$("publishUrl").value="";$("publishDialog").showModal();}});
$("publishForm").addEventListener("submit",async e=>{if(e.submitter?.value==="cancel")return;e.preventDefault();const id=$("publishId").value;if(!id)return;await updateDoc(doc(db,COL,id),{status:"Published",publishedPlatform:$("publishPlatform").value,publicationUrl:$("publishUrl").value.trim(),publishedAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:currentUser?.email||"admin"});$("publishDialog").close();await loadPosts();});

adminReady.then(async user=>{currentUser=user;resetBuilder();await loadPosts();}).catch(console.error);
