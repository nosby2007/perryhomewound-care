import { db, storage, adminReady, esc } from "/admin/admin-shared.js";
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

const COL="blogPosts";
const $=id=>document.getElementById(id);
let posts=[];
let currentUser=null;
let coverUrl="";
let coverPath="";

const slugify=s=>String(s||"").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120);
const safeFileName=name=>String(name||"image").toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").slice(-90);
const clean=(value,max=10000)=>String(value??"").trim().slice(0,max);

function articleHtml(text){
  const lines=String(text||"").split(/\r?\n/),out=[];let list=false;
  const closeList=()=>{if(list){out.push("</ul>");list=false;}};
  for(const raw of lines){
    const line=raw.trim();
    if(!line){closeList();continue;}
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
  $("previewBody").innerHTML=articleHtml($("blogBody").value);
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
  if(!file){alert("Choose an image first.");return;}
  if(!file.type.startsWith("image/")){alert("Please choose an image file.");return;}
  if(file.size>8*1024*1024){alert("Image must be 8 MB or smaller.");return;}
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

function currentData(status){
  const title=$("blogTitle").value.trim();
  const slug=slugify($("blogSlug").value||title);
  return {
    title,slug,category:$("blogCategory").value,excerpt:$("blogExcerpt").value.trim(),body:$("blogBody").value.trim(),
    seoTitle:$("seoTitle").value.trim()||title,seoDescription:$("seoDescription").value.trim()||$("blogExcerpt").value.trim(),
    coverUrl,coverPath,coverAlt:$("blogImageAlt").value.trim(),status
  };
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

async function loadPosts(){
  const snap=await getDocs(collection(db,COL));posts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));renderLibrary();
}

function renderLibrary(){
  $("blogDrafts").textContent=posts.filter(x=>x.status==="Draft").length;$("blogPublished").textContent=posts.filter(x=>x.status==="Published").length;
  const status=$("blogStatusFilter").value,list=posts.filter(p=>!status||p.status===status);$("blogEmpty").hidden=!!list.length;
  $("blogLibrary").innerHTML=list.map(p=>`<article class="blog-card">${p.coverUrl?`<img src="${esc(p.coverUrl)}" alt="${esc(p.coverAlt||p.title||"PHWC blog image")}"/>`:""}<div class="blog-card-body"><span class="status-pill status-${esc(p.status||"Draft")}">${esc(p.status||"Draft")}</span><h4>${esc(p.title||p.id)}</h4><div class="blog-card-meta">${esc(p.category||"Wound Education")} · /blog/post?slug=${esc(p.slug||p.id)}</div><div class="blog-card-excerpt">${esc(p.excerpt||"")}</div><div class="blog-actions"><button class="btn" data-edit-blog="${esc(p.id)}">Edit</button>${p.status==="Published"?`<a class="btn primary" target="_blank" rel="noopener" href="/blog/post?slug=${encodeURIComponent(p.slug||p.id)}">Open article</a>`:`<button class="btn primary" data-publish-blog="${esc(p.id)}">Publish</button>`}</div></div></article>`).join("");
}

function editArticle(id){
  const p=posts.find(x=>x.id===id);if(!p)return;
  $("editingSlug").value=p.slug||p.id;$("blogTitle").value=p.title||"";$("blogSlug").value=p.slug||p.id;setCategory(p.category||"Wound Education");$("blogExcerpt").value=p.excerpt||"";$("blogBody").value=p.body||"";$("seoTitle").value=p.seoTitle||"";$("seoDescription").value=p.seoDescription||"";setCover(p.coverUrl||"",p.coverPath||"",p.coverAlt||"");syncPreview();window.scrollTo({top:0,behavior:"smooth"});
}

function reset(){
  $("blogForm").reset();$("editingSlug").value="";$("blogImage").value="";setCover("","","");syncPreview();
}

function setCategory(value){
  const category=clean(value,80)||"Wound Education";
  const select=$("blogCategory");
  if(![...select.options].some(o=>o.value===category)){
    const option=document.createElement("option");option.value=category;option.textContent=category;select.append(option);
  }
  select.value=category;
}

function sectionsToBody(sections){
  if(!Array.isArray(sections))return "";
  const out=[];
  for(const section of sections){
    if(typeof section==="string"){if(section.trim())out.push(section.trim());continue;}
    if(!section||typeof section!=="object")continue;
    const heading=clean(section.heading||section.title,180);if(heading)out.push(`## ${heading}`);
    const paragraphValues=[];
    if(typeof section.paragraph==="string")paragraphValues.push(section.paragraph);
    if(typeof section.content==="string")paragraphValues.push(section.content);
    if(Array.isArray(section.paragraphs))paragraphValues.push(...section.paragraphs);
    if(Array.isArray(section.content))paragraphValues.push(...section.content);
    paragraphValues.map(x=>clean(x,12000)).filter(Boolean).forEach(x=>out.push(x));
    if(Array.isArray(section.bullets))section.bullets.map(x=>clean(x,2000)).filter(Boolean).forEach(x=>out.push(`- ${x}`));
    out.push("");
  }
  return out.join("\n").trim();
}

function validCoverUrl(value){
  const url=clean(value,1200);if(!url)return "";
  if(url.startsWith("/")||/^https?:\/\//i.test(url))return url;
  return "";
}

function normalizeImportedArticle(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Each article must be a JSON object.");
  const source=raw.article&&typeof raw.article==="object"?raw.article:raw;
  const title=clean(source.title,160);
  const slug=slugify(source.slug||title);
  const body=typeof source.body==="string"?clean(source.body,100000):sectionsToBody(source.sections);
  if(!title)throw new Error("Every imported article needs a title.");
  if(!slug)throw new Error(`Could not create a slug for: ${title}`);
  if(!body)throw new Error(`Article \"${title}\" needs body text or a sections array.`);
  const seo=source.seo&&typeof source.seo==="object"?source.seo:{};
  const cover=source.cover&&typeof source.cover==="object"?source.cover:{};
  const excerpt=clean(source.excerpt||source.summary,320);
  return {
    title,
    slug,
    category:clean(source.category,80)||"Wound Education",
    excerpt,
    body,
    seoTitle:clean(source.seoTitle||seo.title||title,65),
    seoDescription:clean(source.seoDescription||seo.description||excerpt,160),
    coverUrl:validCoverUrl(source.coverUrl||cover.url),
    coverPath:"",
    coverAlt:clean(source.coverAlt||cover.alt,180)
  };
}

function parseJsonArticles(){
  const text=$("blogJsonInput").value.trim();
  if(!text)throw new Error("Paste JSON or choose a JSON file first.");
  let parsed;
  try{parsed=JSON.parse(text);}catch(e){throw new Error(`Invalid JSON: ${e.message}`);}
  let items;
  if(Array.isArray(parsed))items=parsed;
  else if(Array.isArray(parsed?.articles))items=parsed.articles;
  else items=[parsed];
  if(!items.length)throw new Error("The JSON does not contain any articles.");
  return items.map(normalizeImportedArticle);
}

function setJsonStatus(message,type="success"){
  const el=$("jsonImportStatus");el.textContent=message||"";el.className=`json-status ${type}`;
}

function populateEditorFromImport(article){
  reset();
  $("blogTitle").value=article.title;
  $("blogSlug").value=article.slug;
  setCategory(article.category);
  $("blogExcerpt").value=article.excerpt;
  $("blogBody").value=article.body;
  $("seoTitle").value=article.seoTitle;
  $("seoDescription").value=article.seoDescription;
  setCover(article.coverUrl,"",article.coverAlt);
  syncPreview();
  document.querySelector(".editor-grid")?.scrollIntoView({behavior:"smooth",block:"start"});
}

function loadJsonIntoEditor(){
  try{
    const articles=parseJsonArticles();
    populateEditorFromImport(articles[0]);
    setJsonStatus(articles.length===1?"JSON validated and loaded into the editor. Review it, then save or publish.":`JSON contains ${articles.length} articles. The first article was loaded into the editor; use “Import as draft(s)” to create all of them.`,articles.length===1?"success":"warn");
  }catch(e){console.error(e);setJsonStatus(e.message||"Could not import JSON.","error");}
}

async function importJsonDrafts(){
  try{
    if(!currentUser)throw new Error("Blog Studio is still loading your admin session.");
    const articles=parseJsonArticles();
    $("importJsonDraftsBtn").disabled=true;
    let created=0,skipped=0;
    for(const article of articles){
      const ref=doc(db,COL,article.slug);
      const existing=await getDoc(ref);
      if(existing.exists()){skipped++;continue;}
      const actor=currentUser.email||currentUser.uid||"admin";
      await setDoc(ref,{...article,status:"Draft",createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:actor,updatedBy:actor});
      created++;
    }
    await loadPosts();
    setJsonStatus(`Import complete: ${created} draft${created===1?"":"s"} created${skipped?`; ${skipped} skipped because the slug already exists`:""}.`,skipped?"warn":"success");
  }catch(e){console.error(e);setJsonStatus(e.message||"Could not import JSON drafts.","error");}
  finally{$("importJsonDraftsBtn").disabled=false;}
}

function insertJsonExample(){
  const example={
    title:"Choosing the Right Dressing for Exudative Wounds",
    category:"Wound Education",
    excerpt:"A practical clinical overview of exudate assessment, periwound protection, and dressing-selection considerations.",
    sections:[
      {heading:"Why exudate assessment matters",paragraphs:["Exudate is one part of the overall wound assessment. Its amount, character, and change over time can influence dressing selection and follow-up."],bullets:["Assess the wound and periwound skin","Consider drainage amount and change over time","Reassess when the clinical picture changes"]},
      {heading:"Clinical takeaway",paragraphs:["Dressing selection should be individualized to the wound, the patient, and the broader plan of care."]}
    ],
    seo:{title:"Dressing Selection for Exudative Wounds",description:"Clinical considerations for assessing exudate and selecting wound dressings."},
    cover:{url:"",alt:"Clinician preparing wound care supplies"}
  };
  $("blogJsonInput").value=JSON.stringify(example,null,2);setJsonStatus("Example JSON inserted. Edit it or load it into the article editor.","success");
}

async function loadJsonFile(file){
  if(!file)return;
  if(file.size>2*1024*1024)throw new Error("JSON file must be 2 MB or smaller.");
  const text=await file.text();
  JSON.parse(text);
  $("blogJsonInput").value=text;
  setJsonStatus(`Loaded ${file.name}. Click “Load into editor” or “Import as draft(s)”.`,"success");
}

$("blogTitle").addEventListener("input",()=>{if(!$("editingSlug").value)$("blogSlug").value=slugify($("blogTitle").value);if(!$("seoTitle").value)$("seoTitle").value=$("blogTitle").value.slice(0,65);syncPreview();});
for(const id of ["blogExcerpt","blogBody","blogCategory"])$(id).addEventListener(id==="blogCategory"?"change":"input",syncPreview);
$("blogExcerpt").addEventListener("input",()=>{if(!$("seoDescription").value)$("seoDescription").value=$("blogExcerpt").value.slice(0,160);});
$("blogImageAlt").addEventListener("input",()=>{if(coverUrl)$("coverPreview").alt=$("blogImageAlt").value||"Blog cover image";});
$("uploadBlogImageBtn").addEventListener("click",()=>uploadCover().catch(e=>{console.error(e);$("blogUploadState").textContent="Upload failed";alert("Could not upload the cover image. Check Firebase Storage deployment.");}));
$("clearBlogImageBtn").addEventListener("click",()=>clearCover().catch(console.error));
$("saveBlogDraftBtn").addEventListener("click",()=>saveArticle("Draft").catch(e=>{console.error(e);alert("Could not save article.");}));
$("publishBlogBtn").addEventListener("click",()=>saveArticle("Published").catch(e=>{console.error(e);alert("Could not publish article.");}));
$("resetBlogBtn").addEventListener("click",reset);$("newBlogBtn").addEventListener("click",reset);$("blogStatusFilter").addEventListener("change",renderLibrary);
$("blogLibrary").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.editBlog)editArticle(b.dataset.editBlog);if(b.dataset.publishBlog){const p=posts.find(x=>x.id===b.dataset.publishBlog);if(p){editArticle(p.id);saveArticle("Published").catch(console.error);}}});
$("loadJsonBtn").addEventListener("click",loadJsonIntoEditor);
$("importJsonDraftsBtn").addEventListener("click",()=>importJsonDrafts());
$("exampleJsonBtn").addEventListener("click",insertJsonExample);
$("clearJsonBtn").addEventListener("click",()=>{$("blogJsonInput").value="";$("blogJsonFile").value="";setJsonStatus("");});
$("blogJsonFile").addEventListener("change",e=>loadJsonFile(e.target.files?.[0]).catch(err=>{console.error(err);setJsonStatus(err.message||"Could not read JSON file.","error");}));

adminReady.then(async user=>{currentUser=user;reset();await loadPosts();}).catch(console.error);
