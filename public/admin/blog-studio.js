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
  $("editingSlug").value=p.slug||p.id;$("blogTitle").value=p.title||"";$("blogSlug").value=p.slug||p.id;$("blogCategory").value=p.category||"Wound Education";$("blogExcerpt").value=p.excerpt||"";$("blogBody").value=p.body||"";$("seoTitle").value=p.seoTitle||"";$("seoDescription").value=p.seoDescription||"";setCover(p.coverUrl||"",p.coverPath||"",p.coverAlt||"");syncPreview();window.scrollTo({top:0,behavior:"smooth"});
}

function reset(){
  $("blogForm").reset();$("editingSlug").value="";$("blogImage").value="";setCover("","","");syncPreview();
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

adminReady.then(async user=>{currentUser=user;reset();await loadPosts();}).catch(console.error);
