import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const app=initializeApp({apiKey:"AIzaSyCdIpeMxhFMRpzNxmngoP3QY8ZZl2ABG_s",authDomain:"credential-4f22b.firebaseapp.com",projectId:"credential-4f22b",storageBucket:"credential-4f22b.firebasestorage.app",messagingSenderId:"107240797765",appId:"1:107240797765:web:9ae5b37760081911ad952c"});
const db=getFirestore(app),$=id=>document.getElementById(id);let posts=[];let activeCategory="all";
const esc=x=>String(x??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const date=ts=>ts?.toDate?.()?.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})||"";
const readingTime=text=>Math.max(1,Math.round(String(text||"").trim().split(/\s+/).filter(Boolean).length/220));

function mediaHtml(post){
  if(post.coverUrl)return `<div class="blog-card-media"><img src="${esc(post.coverUrl)}" alt="${esc(post.coverAlt||post.title||"PHWC wound care article")}" loading="lazy"/></div>`;
  return `<div class="blog-card-media"><div class="blog-card-placeholder" aria-hidden="true">PH</div></div>`;
}

function render(){
  const q=$("blogSearch").value.trim().toLowerCase();
  const list=posts.filter(p=>{
    const matchesSearch=[p.title,p.excerpt,p.category,p.body].join(" ").toLowerCase().includes(q);
    const matchesCategory=activeCategory==="all"||(p.category||"Wound Education")===activeCategory;
    return matchesSearch&&matchesCategory;
  });
  $("blogEmpty").hidden=!!list.length;
  $("blogGrid").innerHTML=list.map((p,index)=>{
    const published=date(p.publishedAt||p.updatedAt);
    const minutes=readingTime(p.body);
    return `<a class="blog-card${index===0?" featured":""}" href="/blog/post?slug=${encodeURIComponent(p.slug||p.id)}">
      ${mediaHtml(p)}
      <div class="blog-card-body">
        <span class="category">${esc(p.category||"Wound Education")}</span>
        <h3>${esc(p.title||"PHWC Wound Care Article")}</h3>
        <p>${esc(p.excerpt||"")}</p>
        <div class="card-footer">
          <div class="meta">${esc(published)}${published?" · ":""}${minutes} min read</div>
          <span class="read-more">Read article <span aria-hidden="true">→</span></span>
        </div>
      </div>
    </a>`;
  }).join("");
}

function bindFilters(){
  $("categoryFilters")?.addEventListener("click",event=>{
    const button=event.target.closest("[data-category]");if(!button)return;
    activeCategory=button.dataset.category||"all";
    document.querySelectorAll("[data-category]").forEach(x=>x.classList.toggle("active",x===button));
    render();
  });
}

try{
  const snap=await getDocs(query(collection(db,"blogPosts"),where("status","==","Published")));
  posts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.publishedAt?.seconds||b.updatedAt?.seconds||0)-(a.publishedAt?.seconds||a.updatedAt?.seconds||0));
  if($("articleCount"))$("articleCount").textContent=String(posts.length);
  render();
}catch(e){
  console.error(e);
  $("blogEmpty").hidden=false;
  $("blogEmpty").querySelector("h3")?.replaceChildren("Articles are temporarily unavailable.");
  const p=$("blogEmpty").querySelector("p");if(p)p.textContent="Please try again later or contact Perry Home Wound Care for assistance.";
}
$("blogSearch").addEventListener("input",render);
bindFilters();
