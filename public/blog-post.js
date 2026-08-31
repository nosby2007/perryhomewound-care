import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const app=initializeApp({apiKey:"AIzaSyCdIpeMxhFMRpzNxmngoP3QY8ZZl2ABG_s",authDomain:"credential-4f22b.firebaseapp.com",projectId:"credential-4f22b",storageBucket:"credential-4f22b.firebasestorage.app",messagingSenderId:"107240797765",appId:"1:107240797765:web:9ae5b37760081911ad952c"});
const db=getFirestore(app),$=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const slug=new URLSearchParams(location.search).get("slug")||"";
const date=ts=>ts?.toDate?.()?.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})||"";
const readingTime=text=>Math.max(1,Math.round(String(text||"").trim().split(/\s+/).filter(Boolean).length/220));

function mediaImages(block){
  if(!block)return[];
  if(block.type==="image"||block.type==="infographic")return [block];
  if(block.type==="gallery")return block.items||[];
  return [block.before,block.after].filter(Boolean);
}

function mediaCaption(block){
  const caption=esc(block.caption||"");
  const credit=esc(block.credit||"");
  if(!caption&&!credit)return"";
  return `<figcaption>${caption}${credit?`<span class="article-media-credit">${credit}</span>`:""}</figcaption>`;
}

function mediaBadge(block){return block.clinical?'<span class="article-media-badge">Clinical image</span>':"";}
function zoomable(img,label="Open image"){
  return `<button type="button" class="article-media-zoom" data-lightbox="${esc(img.url||"")}" aria-label="${esc(label)}"><img loading="lazy" src="${esc(img.url||"")}" alt="${esc(img.alt||"")}"/></button>`;
}

function mediaHtml(block){
  if(!block)return"";
  const type=block.type||"image",badge=mediaBadge(block),cap=mediaCaption(block);
  if(type==="image")return `<figure class="article-media article-media-single">${badge}${zoomable(block)}${cap}</figure>`;
  if(type==="infographic")return `<figure class="article-media article-media-infographic">${badge}${zoomable(block,"Open infographic")}${cap}</figure>`;
  if(type==="gallery"){
    const items=mediaImages(block);
    return `<figure class="article-media article-media-gallery">${badge}<div class="article-media-grid">${items.map((i,n)=>zoomable(i,`Open gallery image ${n+1}`)).join("")}</div>${cap}</figure>`;
  }
  const before=block.before,after=block.after;
  if(!before||!after)return"";
  return `<figure class="article-media article-media-compare">${badge}<div class="article-media-grid"><div class="article-media-compare-item"><span class="article-media-compare-label">Before</span>${zoomable(before,"Open before image")}</div><div class="article-media-compare-item"><span class="article-media-compare-label">After</span>${zoomable(after,"Open after image")}</div></div>${cap}</figure>`;
}

function bodyHtml(text,media=[]){
  const map=new Map((media||[]).map(m=>[m.id,m]));
  const lines=String(text||"").split(/\r?\n/),out=[];let list=false;
  const close=()=>{if(list){out.push("</ul>");list=false;}};
  for(const raw of lines){
    const line=raw.trim();
    if(!line){close();continue;}
    const marker=line.match(/^\[\[media:([a-zA-Z0-9_-]+)\]\]$/);
    if(marker){close();out.push(mediaHtml(map.get(marker[1])));continue;}
    if(line.startsWith("### ")){close();out.push(`<h3>${esc(line.slice(4))}</h3>`);continue;}
    if(line.startsWith("## ")){close();out.push(`<h3>${esc(line.slice(3))}</h3>`);continue;}
    if(line.startsWith("> ")){close();out.push(`<blockquote>${esc(line.slice(2))}</blockquote>`);continue;}
    if(line.startsWith("- ")){if(!list){out.push("<ul>");list=true;}out.push(`<li>${esc(line.slice(2))}</li>`);continue;}
    close();out.push(`<p>${esc(line)}</p>`);
  }
  close();return out.join("");
}

function ensureLightbox(){
  let box=$("mediaLightbox");
  if(box)return box;
  box=document.createElement("div");box.id="mediaLightbox";box.className="media-lightbox";box.hidden=true;
  box.innerHTML='<div class="media-lightbox-inner"><button type="button" class="media-lightbox-close" aria-label="Close image">×</button><img alt="Expanded article image"/></div>';
  document.body.append(box);
  const close=()=>{box.hidden=true;box.querySelector("img").removeAttribute("src");document.body.style.overflow="";};
  box.addEventListener("click",e=>{if(e.target===box||e.target.closest(".media-lightbox-close"))close();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!box.hidden)close();});
  return box;
}

function bindMediaLightbox(){
  const box=ensureLightbox(),img=box.querySelector("img");
  document.querySelectorAll("[data-lightbox]").forEach(btn=>btn.addEventListener("click",()=>{const url=btn.dataset.lightbox;if(!url)return;img.src=url;img.alt=btn.querySelector("img")?.alt||"Expanded article image";box.hidden=false;document.body.style.overflow="hidden";}));
}

function share(platform,title){
  const url=location.href,text=`${title}\n${url}`;
  const target=platform==="whatsapp"?`https://wa.me/?text=${encodeURIComponent(text)}`:platform==="linkedin"?`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`:`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  window.open(target,"_blank","noopener");
}

function bindReadingProgress(){
  const progress=$("readingProgress");if(!progress)return;
  const update=()=>{const article=$("article");if(!article||article.hidden)return;const start=article.offsetTop,max=Math.max(1,article.offsetHeight-window.innerHeight),pct=Math.min(100,Math.max(0,((window.scrollY-start)/max)*100));progress.style.width=`${pct}%`;};
  window.addEventListener("scroll",update,{passive:true});window.addEventListener("resize",update);update();
}

function coverFrom(post){const nested=post.cover&&typeof post.cover==="object"?post.cover:{};return post.coverUrl||nested.url||post.imageUrl||post.featuredImage||post.heroImage||"";}
function coverAltFrom(post){const nested=post.cover&&typeof post.cover==="object"?post.cover:{};return post.coverAlt||nested.alt||post.imageAlt||post.title||"PHWC blog article image";}
function showCover(post){
  const url=coverFrom(post),wrap=$("coverWrap"),img=$("cover"),fallback=$("coverFallback");
  if(url){img.src=url;img.alt=coverAltFrom(post);img.addEventListener("error",()=>{wrap.hidden=true;fallback.hidden=false;},{once:true});wrap.hidden=false;fallback.hidden=true;return;}
  $("coverFallbackCategory").textContent=(post.category||"PHWC Clinical Education").toUpperCase();$("coverFallbackTitle").textContent=post.title||"Wound Care Education";fallback.hidden=false;
}

try{
  if(!slug)throw new Error("Missing article slug");
  const snap=await getDoc(doc(db,"blogPosts",slug));
  if(!snap.exists()||snap.data().status!=="Published")throw new Error("Article not found");
  const p={id:snap.id,...snap.data()};
  const published=date(p.publishedAt||p.updatedAt),minutes=readingTime(p.body);
  document.title=`${p.seoTitle||p.title} | Perry Home Wound Care`;
  $("metaDescription").setAttribute("content",p.seoDescription||p.excerpt||"Wound care education from Perry Home Wound Care.");
  $("category").textContent=p.category||"Wound Education";$("title").textContent=p.title||"PHWC Wound Care Article";$("excerpt").textContent=p.excerpt||"";$("articleMeta").textContent=published||"Perry Home Wound Care";$("readTime").textContent=`${minutes} min read`;$("authorName").textContent=p.author||"Perry Home Wound Care";
  $("articleBody").innerHTML=bodyHtml(p.body||"",Array.isArray(p.media)?p.media:[]);
  showCover(p);
  if(p.sponsorDisclosure){$("sponsorDisclosure").textContent=p.sponsorDisclosure;$("sponsorDisclosure").hidden=false;}
  document.querySelectorAll("[data-share]").forEach(b=>b.addEventListener("click",()=>share(b.dataset.share,p.title||"PHWC Wound Care Article")));
  bindMediaLightbox();$("article").hidden=false;$("loading").hidden=true;bindReadingProgress();
}catch(e){console.error(e);$("loading").innerHTML='<div class="loading-mark">PH</div><span>This article is unavailable or has not been published.</span><a href="/blog" style="font-weight:800;color:#0d2f3f">Return to Clinical Education</a>';}
