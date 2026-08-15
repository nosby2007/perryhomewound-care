import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const app=initializeApp({apiKey:"AIzaSyCdIpeMxhFMRpzNxmngoP3QY8ZZl2ABG_s",authDomain:"credential-4f22b.firebaseapp.com",projectId:"credential-4f22b",storageBucket:"credential-4f22b.firebasestorage.app",messagingSenderId:"107240797765",appId:"1:107240797765:web:9ae5b37760081911ad952c"});
const db=getFirestore(app),$=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));
const slug=new URLSearchParams(location.search).get("slug")||"";
const date=ts=>ts?.toDate?.()?.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})||"";

function bodyHtml(text){
  const lines=String(text||"").split(/\r?\n/),out=[];let list=false;
  const close=()=>{if(list){out.push("</ul>");list=false;}};
  for(const raw of lines){const line=raw.trim();if(!line){close();continue;}if(line.startsWith("## ")){close();out.push(`<h3>${esc(line.slice(3))}</h3>`);continue;}if(line.startsWith("- ")){if(!list){out.push("<ul>");list=true;}out.push(`<li>${esc(line.slice(2))}</li>`);continue;}close();out.push(`<p>${esc(line)}</p>`);}close();return out.join("");
}

function share(platform,title){
  const url=location.href,text=`${title}\n${url}`;
  const target=platform==="whatsapp"?`https://wa.me/?text=${encodeURIComponent(text)}`:platform==="linkedin"?`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`:`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  window.open(target,"_blank","noopener");
}

try{
  if(!slug)throw new Error("Missing article slug");
  const snap=await getDoc(doc(db,"blogPosts",slug));
  if(!snap.exists()||snap.data().status!=="Published")throw new Error("Article not found");
  const p={id:snap.id,...snap.data()};
  document.title=`${p.seoTitle||p.title} | Perry Home Wound Care`;
  $("metaDescription").setAttribute("content",p.seoDescription||p.excerpt||"Wound care education from Perry Home Wound Care.");
  $("category").textContent=p.category||"Wound Education";$("title").textContent=p.title||"PHWC Wound Care Article";$("excerpt").textContent=p.excerpt||"";$("articleMeta").textContent=`Perry Home Wound Care · ${date(p.publishedAt||p.updatedAt)}`;$("articleBody").innerHTML=bodyHtml(p.body||"");
  if(p.coverUrl){$("cover").src=p.coverUrl;$("cover").alt=p.coverAlt||p.title||"PHWC blog article image";$("cover").hidden=false;}
  document.querySelectorAll("[data-share]").forEach(b=>b.addEventListener("click",()=>share(b.dataset.share,p.title||"PHWC Wound Care Article")));
  $("article").hidden=false;$("loading").hidden=true;
}catch(e){console.error(e);$("loading").textContent="This article is unavailable or has not been published.";}
