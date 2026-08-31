import { db, storage, adminReady, esc } from "/admin/admin-shared.js";
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

const COL="blogPosts";
const $=id=>document.getElementById(id);
let posts=[];
let currentUser=null;
let coverUrl="";
let coverPath="";
let articleMedia=[];

const slugify=s=>String(s||"").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120);
const safeFileName=name=>String(name||"image").toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").slice(-90);
const clean=(value,max=10000)=>String(value??"").trim().slice(0,max);
const mediaId=()=>`m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const validMediaUrl=value=>{const url=clean(value,1400);return url&&(url.startsWith("/")||/^https?:\/\//i.test(url))?url:"";};

function normalizeImage(raw={}){
  if(typeof raw==="string")raw={url:raw};
  const url=validMediaUrl(raw.url||raw.src||raw.imageUrl);
  if(!url)return null;
  return {url,path:clean(raw.path,900),alt:clean(raw.alt||raw.altText,180),caption:clean(raw.caption,320),credit:clean(raw.credit||raw.source,160),clinical:raw.clinical===true,consentConfirmed:raw.consentConfirmed===true};
}

function normalizeMediaBlock(raw={},strictClinical=false){
  if(!raw||typeof raw!=="object")return null;
  const type=["image","infographic","gallery","before_after"].includes(raw.type)?raw.type:"image";
  const id=clean(raw.id,80)||mediaId();
  const clinical=raw.clinical===true;
  const consentConfirmed=raw.consentConfirmed===true;
  if(strictClinical&&clinical&&!consentConfirmed)throw new Error("Clinical wound media must include consentConfirmed: true after de-identification and publication authorization are confirmed.");
  const common={id,type,caption:clean(raw.caption,320),credit:clean(raw.credit||raw.source,160),clinical,consentConfirmed};
  if(type==="image"||type==="infographic"){
    const item=normalizeImage({...raw,clinical,consentConfirmed});
    return item?{...common,...item,type,id}:null;
  }
  if(type==="gallery"){
    const items=(raw.items||raw.images||[]).map(normalizeImage).filter(Boolean);
    return items.length?{...common,items}:null;
  }
  const before=normalizeImage(raw.before||(raw.items||[])[0]);
  const after=normalizeImage(raw.after||(raw.items||[])[1]);
  return before&&after?{...common,before,after}:null;
}

function mediaMarkup(block){
  if(!block)return "";
  const badge=block.clinical?'<span class="preview-media-badge">Clinical image</span>':"";
  const cap=block.caption?`<figcaption>${esc(block.caption)}${block.credit?` · ${esc(block.credit)}`:""}</figcaption>`:(block.credit?`<figcaption>${esc(block.credit)}</figcaption>`:"");
  if(block.type==="image"||block.type==="infographic")return `<figure class="preview-media">${badge}<img src="${esc(block.url)}" alt="${esc(block.alt||"")}"/>${cap}</figure>`;
  if(block.type==="gallery")return `<figure class="preview-media">${badge}<div class="preview-media-grid">${block.items.map(i=>`<img src="${esc(i.url)}" alt="${esc(i.alt||"")}"/>`).join("")}</div>${cap}</figure>`;
  return `<figure class="preview-media">${badge}<div class="preview-media-grid"><img src="${esc(block.before.url)}" alt="${esc(block.before.alt||"Before")}"/><img src="${esc(block.after.url)}" alt="${esc(block.after.alt||"After")}"/></div>${cap}</figure>`;
}

function articleHtml(text,media=articleMedia){
  const map=new Map((media||[]).map(m=>[m.id,m]));
  const lines=String(text||"").split(/\r?\n/),out=[];let list=false;
  const closeList=()=>{if(list){out.push("</ul>");list=false;}};
  for(const raw of lines){
    const line=raw.trim();
    if(!line){closeList();continue;}
    const marker=line.match(/^\[\[media:([a-zA-Z0-9_-]+)\]\]$/);
    if(marker){closeList();out.push(mediaMarkup(map.get(marker[1])));continue;}
    if(line.startsWith("## ")){closeList();out.push(`<h3>${esc(line.slice(3))}</h3>`);continue;}
    if(line.startsWith("- ")){if(!list){out.push("<ul>");list=true;}out.push(`<li>${esc(line.slice(2))}</li>`);continue;}
    closeList();out.push(`<p>${esc(line)}</p>`);
  }
  closeList();return out.join("");
}

function syncPreview(){
  $("previewTitle").textContent=$("blogTitle").value.trim()||"Article title";
  $("previewExcerpt").textContent=$("blogExcerpt").value.trim()||"Your excerpt will appear here.";
  $("previewCategory").textContent=$("blogCategory").value;
  $("previewBody").innerHTML=articleHtml($("blogBody").value,articleMedia);
}

function setCover(url,path="",alt=""){
  coverUrl=url||"";coverPath=path||"";
  if(alt!==undefined)$("blogImageAlt").value=alt||"";
  const wrap=$("coverPreviewWrap"),img=$("coverPreview");
  if(url){wrap.hidden=false;img.src=url;img.alt=$("blogImageAlt").value||"Blog cover image";$("blogUploadState").textContent="Image ready";}
  else{wrap.hidden=true;img.removeAttribute("src");$("blogUploadState").textContent="No image";}
}

async function uploadCover(){
  const file=$("blogImage").files?.[0];
  if(!file)throw new Error("Choose an image first.");
  if(!file.type.startsWith("image/"))throw new Error("Please choose an image file.");
  if(file.size>8*1024*1024)throw new Error("Image must be 8 MB or smaller.");
  $("uploadBlogImageBtn").disabled=true;$("blogUploadState").textContent="Uploading…";
  try{
    const path=`blog/covers/${currentUser?.uid||"admin"}/${Date.now()}-${safeFileName(file.name)}`;
    const r=storageRef(storage,path);
    await uploadBytes(r,file,{contentType:file.type,customMetadata:{purpose:"phwc-blog-cover"}});
    setCover(await getDownloadURL(r),path,$("blogImageAlt").value.trim());
  }finally{$("uploadBlogImageBtn").disabled=false;}
}

async function clearCover(){
  const old=coverPath;setCover("","","");$("blogImage").value="";
  if(old){try{await deleteObject(storageRef(storage,old));}catch(e){console.warn(e);}}
}

function insertMarker(id){
  const box=$("blogBody"),marker=`[[media:${id}]]`;
  const start=box.selectionStart??box.value.length,end=box.selectionEnd??start;
  const before=box.value.slice(0,start),after=box.value.slice(end);
  const prefix=before&&!before.endsWith("\n")?"\n\n":"";
  const suffix=after&&!after.startsWith("\n")?"\n\n":"";
  const inserted=`${prefix}${marker}${suffix}`;
  box.value=before+inserted+after;
  const pos=before.length+inserted.length;box.focus();box.setSelectionRange(pos,pos);syncPreview();
}

function mediaImages(block){
  if(block.type==="image"||block.type==="infographic")return [block];
  if(block.type==="gallery")return block.items||[];
  return [block.before,block.after].filter(Boolean);
}

function renderInlineMediaLibrary(){
  $("inlineMediaCount").textContent=`${articleMedia.length} media`;
  $("inlineMediaLibrary").innerHTML=articleMedia.map(m=>{
    const imgs=mediaImages(m);
    const thumb=imgs.length===1?`<img class="inline-media-thumb" src="${esc(imgs[0].url)}" alt=""/>`:`<div class="inline-media-stack">${imgs.slice(0,4).map(i=>`<img src="${esc(i.url)}" alt=""/>`).join("")}</div>`;
    return `<div class="inline-media-item" data-media-id="${esc(m.id)}">${thumb}<div class="inline-media-copy"><strong>${esc(m.type.replace("_"," "))}${m.clinical?" · clinical":""}</strong><span>${esc(m.caption||imgs[0]?.alt||"Inline article media")}</span></div><div class="inline-media-actions"><button type="button" class="btn" data-insert-media="${esc(m.id)}">Insert marker</button><button type="button" class="btn" data-remove-media="${esc(m.id)}">Remove</button></div></div>`;
  }).join("");
}

function resetInlineForm(){
  $("inlineMediaFiles").value="";$("inlineMediaAlt").value="";$("inlineMediaCaption").value="";$("inlineMediaCredit").value="";$("clinicalMediaConsent").checked=false;$("inlineMediaStatus").textContent="";
}

async function uploadInlineMedia(){
  if(!currentUser)throw new Error("Blog Studio is still loading your admin session.");
  const files=[...($("inlineMediaFiles").files||[])];
  const type=$("inlineMediaType").value;
  const clinical=$("inlineMediaClass").value==="clinical";
  const consentConfirmed=$("clinicalMediaConsent").checked;
  if(!files.length)throw new Error("Choose at least one image.");
  if(type==="gallery"&&files.length<2)throw new Error("A gallery needs at least two images.");
  if(type==="before_after"&&files.length!==2)throw new Error("Before & after requires exactly two images, in before-then-after order.");
  if((type==="image"||type==="infographic")&&files.length>1)throw new Error("Choose one image for this layout, or select Gallery.");
  if(clinical&&!consentConfirmed)throw new Error("Confirm that the clinical image is de-identified and authorized for publication before uploading.");
  files.forEach(f=>{if(!f.type.startsWith("image/"))throw new Error("All selected files must be images.");if(f.size>8*1024*1024)throw new Error("Each image must be 8 MB or smaller.");});
  const slug=slugify($("blogSlug").value||$("blogTitle").value)||"draft";
  const baseAlt=clean($("inlineMediaAlt").value,180);
  const caption=clean($("inlineMediaCaption").value,320),credit=clean($("inlineMediaCredit").value,160);
  $("uploadInlineMediaBtn").disabled=true;$("inlineMediaStatus").className="json-status";$("inlineMediaStatus").textContent="Uploading media…";
  try{
    const uploaded=[];
    for(let i=0;i<files.length;i++){
      const file=files[i],path=`blog/articles/${slug}/media/${Date.now()}-${i}-${safeFileName(file.name)}`,r=storageRef(storage,path);
      await uploadBytes(r,file,{contentType:file.type,customMetadata:{purpose:"phwc-blog-inline-media",clinical:String(clinical)}});
      uploaded.push({url:await getDownloadURL(r),path,alt:files.length>1&&baseAlt?`${baseAlt} ${i+1}`:baseAlt,caption:"",credit:"",clinical,consentConfirmed});
    }
    const id=mediaId();let block;
    if(type==="image"||type==="infographic")block={id,type,...uploaded[0],caption,credit,clinical,consentConfirmed};
    else if(type==="gallery")block={id,type,items:uploaded,caption,credit,clinical,consentConfirmed};
    else block={id,type,before:uploaded[0],after:uploaded[1],caption,credit,clinical,consentConfirmed};
    articleMedia.push(block);renderInlineMediaLibrary();insertMarker(id);resetInlineForm();$("inlineMediaStatus").className="json-status success";$("inlineMediaStatus").textContent="Media uploaded and inserted at the cursor.";
  }finally{$("uploadInlineMediaBtn").disabled=false;}
}

async function removeInlineMedia(id){
  const block=articleMedia.find(m=>m.id===id);if(!block)return;
  articleMedia=articleMedia.filter(m=>m.id!==id);
  const marker=new RegExp(`\\s*\\[\\[media:${id.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\]\\]\\s*`,`g`);
  $("blogBody").value=$("blogBody").value.replace(marker,"\n\n").replace(/\n{3,}/g,"\n\n").trim();
  renderInlineMediaLibrary();syncPreview();
  for(const item of mediaImages(block)){if(item?.path){try{await deleteObject(storageRef(storage,item.path));}catch(e){console.warn(e);}}}
}

function currentData(status){
  const title=$("blogTitle").value.trim();
  const slug=slugify($("blogSlug").value||title);
  return {title,slug,category:$("blogCategory").value,excerpt:$("blogExcerpt").value.trim(),body:$("blogBody").value.trim(),media:articleMedia,seoTitle:$("seoTitle").value.trim()||title,seoDescription:$("seoDescription").value.trim()||$("blogExcerpt").value.trim(),coverUrl,coverPath,coverAlt:$("blogImageAlt").value.trim(),status};
}

async function saveArticle(status){
  const data=currentData(status);
  if(!data.title||!data.slug||!data.body){alert("Title, slug and article body are required.");return;}
  const original=$("editingSlug").value;
  if(original&&original!==data.slug){const old=await getDoc(doc(db,COL,original));if(old.exists()){alert("To protect published URLs, the slug cannot be changed after the article is first saved.");$("blogSlug").value=original;data.slug=original;}}
  const existing=await getDoc(doc(db,COL,data.slug));
  const payload={...data,updatedAt:serverTimestamp(),updatedBy:currentUser?.email||currentUser?.uid||"admin",...(existing.exists()?{}:{createdAt:serverTimestamp(),createdBy:currentUser?.email||currentUser?.uid||"admin"}),...(status==="Published"?{publishedAt:serverTimestamp()}: {})};
  await setDoc(doc(db,COL,data.slug),payload,{merge:true});
  $("editingSlug").value=data.slug;await loadPosts();alert(status==="Published"?"Article published to the PHWC blog.":"Blog draft saved.");
}

async function loadPosts(){const snap=await getDocs(collection(db,COL));posts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));renderLibrary();}

function renderLibrary(){
  $("blogDrafts").textContent=posts.filter(x=>x.status==="Draft").length;$("blogPublished").textContent=posts.filter(x=>x.status==="Published").length;
  const status=$("blogStatusFilter").value,list=posts.filter(p=>!status||p.status===status);$("blogEmpty").hidden=!!list.length;
  $("blogLibrary").innerHTML=list.map(p=>`<article class="blog-card">${p.coverUrl?`<img src="${esc(p.coverUrl)}" alt="${esc(p.coverAlt||p.title||"PHWC blog image")}"/>`:""}<div class="blog-card-body"><span class="status-pill status-${esc(p.status||"Draft")}">${esc(p.status||"Draft")}</span><h4>${esc(p.title||p.id)}</h4><div class="blog-card-meta">${esc(p.category||"Wound Education")} · ${(p.media||[]).length} inline media · /blog/post?slug=${esc(p.slug||p.id)}</div><div class="blog-card-excerpt">${esc(p.excerpt||"")}</div><div class="blog-actions"><button class="btn" data-edit-blog="${esc(p.id)}">Edit</button>${p.status==="Published"?`<a class="btn primary" target="_blank" rel="noopener" href="/blog/post?slug=${encodeURIComponent(p.slug||p.id)}">Open article</a>`:`<button class="btn primary" data-publish-blog="${esc(p.id)}">Publish</button>`}</div></div></article>`).join("");
}

function editArticle(id){
  const p=posts.find(x=>x.id===id);if(!p)return;
  $("editingSlug").value=p.slug||p.id;$("blogTitle").value=p.title||"";$("blogSlug").value=p.slug||p.id;setCategory(p.category||"Wound Education");$("blogExcerpt").value=p.excerpt||"";$("blogBody").value=p.body||"";$("seoTitle").value=p.seoTitle||"";$("seoDescription").value=p.seoDescription||"";setCover(p.coverUrl||"",p.coverPath||"",p.coverAlt||"");articleMedia=(p.media||[]).map(m=>normalizeMediaBlock(m,false)).filter(Boolean);renderInlineMediaLibrary();syncPreview();window.scrollTo({top:0,behavior:"smooth"});
}

function reset(){
  $("blogForm").reset();$("editingSlug").value="";$("blogImage").value="";articleMedia=[];setCover("","","");renderInlineMediaLibrary();resetInlineForm();$("clinicalMediaConsentWrap").hidden=true;syncPreview();
}

function setCategory(value){const category=clean(value,80)||"Wound Education",select=$("blogCategory");if(![...select.options].some(o=>o.value===category)){const option=document.createElement("option");option.value=category;option.textContent=category;select.append(option);}select.value=category;}

function sectionsToArticle(sections,strictClinical=true){
  if(!Array.isArray(sections))return {body:"",media:[]};
  const out=[],media=[];
  for(const section of sections){
    if(typeof section==="string"){if(section.trim())out.push(section.trim());continue;}
    if(!section||typeof section!=="object")continue;
    const heading=clean(section.heading||section.title,180);if(heading)out.push(`## ${heading}`);
    const paragraphs=[];if(typeof section.paragraph==="string")paragraphs.push(section.paragraph);if(typeof section.content==="string")paragraphs.push(section.content);if(Array.isArray(section.paragraphs))paragraphs.push(...section.paragraphs);if(Array.isArray(section.content))paragraphs.push(...section.content);
    paragraphs.map(x=>clean(x,12000)).filter(Boolean).forEach(x=>out.push(x));
    if(Array.isArray(section.bullets))section.bullets.map(x=>clean(x,2000)).filter(Boolean).forEach(x=>out.push(`- ${x}`));
    const blocks=[];if(section.media)blocks.push(...(Array.isArray(section.media)?section.media:[section.media]));if(section.image)blocks.push({type:"image",...(typeof section.image==="string"?{url:section.image}:section.image)});
    for(const raw of blocks){const block=normalizeMediaBlock(raw,strictClinical);if(block){media.push(block);out.push(`[[media:${block.id}]]`);}}
    out.push("");
  }
  return {body:out.join("\n").trim(),media};
}

function normalizeImportedArticle(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Each article must be a JSON object.");
  const source=raw.article&&typeof raw.article==="object"?raw.article:raw,title=clean(source.title,160),slug=slugify(source.slug||title);
  if(!title)throw new Error("Every imported article needs a title.");if(!slug)throw new Error(`Could not create a slug for: ${title}`);
  let body="",media=[];
  if(typeof source.body==="string"){body=clean(source.body,100000);media=(Array.isArray(source.media)?source.media:source.media?[source.media]:[]).map(m=>normalizeMediaBlock(m,true)).filter(Boolean);for(const m of media){if(!body.includes(`[[media:${m.id}]]`))body+=`\n\n[[media:${m.id}]]`;}}
  else {const built=sectionsToArticle(source.sections,true);body=built.body;media=built.media;}
  if(!body)throw new Error(`Article \"${title}\" needs body text or a sections array.`);
  const seo=source.seo&&typeof source.seo==="object"?source.seo:{},cover=source.cover&&typeof source.cover==="object"?source.cover:{},excerpt=clean(source.excerpt||source.summary,320);
  return {title,slug,category:clean(source.category,80)||"Wound Education",excerpt,body,media,seoTitle:clean(source.seoTitle||seo.title||title,65),seoDescription:clean(source.seoDescription||seo.description||excerpt,160),coverUrl:validMediaUrl(source.coverUrl||cover.url),coverPath:"",coverAlt:clean(source.coverAlt||cover.alt,180)};
}

function parseJsonArticles(){const text=$("blogJsonInput").value.trim();if(!text)throw new Error("Paste JSON or choose a JSON file first.");let parsed;try{parsed=JSON.parse(text);}catch(e){throw new Error(`Invalid JSON: ${e.message}`);}const items=Array.isArray(parsed)?parsed:Array.isArray(parsed?.articles)?parsed.articles:[parsed];if(!items.length)throw new Error("The JSON does not contain any articles.");return items.map(normalizeImportedArticle);}
function setJsonStatus(message,type="success"){const el=$("jsonImportStatus");el.textContent=message||"";el.className=`json-status ${type}`;}

function populateEditorFromImport(article){reset();$("blogTitle").value=article.title;$("blogSlug").value=article.slug;setCategory(article.category);$("blogExcerpt").value=article.excerpt;$("blogBody").value=article.body;$("seoTitle").value=article.seoTitle;$("seoDescription").value=article.seoDescription;articleMedia=article.media||[];renderInlineMediaLibrary();setCover(article.coverUrl,"",article.coverAlt);syncPreview();document.querySelector(".editor-grid")?.scrollIntoView({behavior:"smooth",block:"start"});}
function loadJsonIntoEditor(){try{const articles=parseJsonArticles();populateEditorFromImport(articles[0]);setJsonStatus(articles.length===1?"JSON validated and loaded into the editor. Review it, then save or publish.":`JSON contains ${articles.length} articles. The first article was loaded into the editor; use “Import as draft(s)” to create all of them.`,articles.length===1?"success":"warn");}catch(e){console.error(e);setJsonStatus(e.message||"Could not import JSON.","error");}}

async function importJsonDrafts(){
  try{if(!currentUser)throw new Error("Blog Studio is still loading your admin session.");const articles=parseJsonArticles();$("importJsonDraftsBtn").disabled=true;let created=0,skipped=0;for(const article of articles){const ref=doc(db,COL,article.slug),existing=await getDoc(ref);if(existing.exists()){skipped++;continue;}const actor=currentUser.email||currentUser.uid||"admin";await setDoc(ref,{...article,status:"Draft",createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:actor,updatedBy:actor});created++;}await loadPosts();setJsonStatus(`Import complete: ${created} draft${created===1?"":"s"} created${skipped?`; ${skipped} skipped because the slug already exists`:""}.`,skipped?"warn":"success");}
  catch(e){console.error(e);setJsonStatus(e.message||"Could not import JSON drafts.","error");}finally{$("importJsonDraftsBtn").disabled=false;}
}

function insertJsonExample(){const example={title:"Choosing the Right Dressing for Exudative Wounds",category:"Wound Education",excerpt:"A practical clinical overview of exudate assessment and dressing selection.",sections:[{heading:"Why exudate assessment matters",paragraphs:["Exudate is one part of the overall wound assessment."],bullets:["Assess the wound and periwound skin","Reassess when the clinical picture changes"],media:[{type:"infographic",url:"https://example.com/wound-care-infographic.jpg",alt:"Wound dressing selection infographic",caption:"Clinical dressing-selection framework",credit:"Perry Home Wound Care"}]}],seo:{title:"Dressing Selection for Exudative Wounds",description:"Clinical considerations for assessing exudate and selecting wound dressings."},cover:{url:"",alt:"Clinician preparing wound care supplies"}};$("blogJsonInput").value=JSON.stringify(example,null,2);setJsonStatus("Example JSON inserted. Edit it or load it into the article editor.","success");}
async function loadJsonFile(file){if(!file)return;if(file.size>2*1024*1024)throw new Error("JSON file must be 2 MB or smaller.");const text=await file.text();JSON.parse(text);$("blogJsonInput").value=text;setJsonStatus(`Loaded ${file.name}. Click “Load into editor” or “Import as draft(s)”.`,"success");}

$("blogTitle").addEventListener("input",()=>{if(!$("editingSlug").value)$("blogSlug").value=slugify($("blogTitle").value);if(!$("seoTitle").value)$("seoTitle").value=$("blogTitle").value.slice(0,65);syncPreview();});
for(const id of ["blogExcerpt","blogBody","blogCategory"])$(id).addEventListener(id==="blogCategory"?"change":"input",syncPreview);
$("blogExcerpt").addEventListener("input",()=>{if(!$("seoDescription").value)$("seoDescription").value=$("blogExcerpt").value.slice(0,160);});
$("blogImageAlt").addEventListener("input",()=>{if(coverUrl)$("coverPreview").alt=$("blogImageAlt").value||"Blog cover image";});
$("uploadBlogImageBtn").addEventListener("click",()=>uploadCover().catch(e=>{console.error(e);$("blogUploadState").textContent="Upload failed";alert(e.message||"Could not upload the cover image.");}));
$("clearBlogImageBtn").addEventListener("click",()=>clearCover().catch(console.error));
$("saveBlogDraftBtn").addEventListener("click",()=>saveArticle("Draft").catch(e=>{console.error(e);alert("Could not save article.");}));
$("publishBlogBtn").addEventListener("click",()=>saveArticle("Published").catch(e=>{console.error(e);alert("Could not publish article.");}));
$("resetBlogBtn").addEventListener("click",reset);$("newBlogBtn").addEventListener("click",reset);$("blogStatusFilter").addEventListener("change",renderLibrary);
$("blogLibrary").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.editBlog)editArticle(b.dataset.editBlog);if(b.dataset.publishBlog){const p=posts.find(x=>x.id===b.dataset.publishBlog);if(p){editArticle(p.id);saveArticle("Published").catch(console.error);}}});
$("loadJsonBtn").addEventListener("click",loadJsonIntoEditor);$("importJsonDraftsBtn").addEventListener("click",()=>importJsonDrafts());$("exampleJsonBtn").addEventListener("click",insertJsonExample);$("clearJsonBtn").addEventListener("click",()=>{$("blogJsonInput").value="";$("blogJsonFile").value="";setJsonStatus("");});$("blogJsonFile").addEventListener("change",e=>loadJsonFile(e.target.files?.[0]).catch(err=>{console.error(err);setJsonStatus(err.message||"Could not read JSON file.","error");}));
$("inlineMediaClass").addEventListener("change",()=>{$("clinicalMediaConsentWrap").hidden=$("inlineMediaClass").value!=="clinical";if($("inlineMediaClass").value!=="clinical")$("clinicalMediaConsent").checked=false;});
$("uploadInlineMediaBtn").addEventListener("click",()=>uploadInlineMedia().catch(e=>{console.error(e);$("inlineMediaStatus").className="json-status error";$("inlineMediaStatus").textContent=e.message||"Could not upload inline media.";}));
$("inlineMediaLibrary").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.insertMedia)insertMarker(b.dataset.insertMedia);if(b.dataset.removeMedia)removeInlineMedia(b.dataset.removeMedia).catch(console.error);});

adminReady.then(async user=>{currentUser=user;reset();await loadPosts();}).catch(console.error);
