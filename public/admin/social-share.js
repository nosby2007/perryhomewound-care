(() => {
  const PHWC_URL = "https://perryhomewoundcare.network";
  const STYLE_ID = "phwc-social-share-style";

  function injectStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .social-share-box{margin-top:12px;padding:12px;border:1px solid #dfe8f1;border-radius:14px;background:#f8fbff}
      .social-share-head{font-size:11px;font-weight:800;letter-spacing:.08em;color:#5c6d83;margin-bottom:8px;text-transform:uppercase}
      .social-share-buttons{display:flex;gap:8px;flex-wrap:wrap}
      .social-share-btn{border:0;border-radius:10px;padding:9px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:7px}
      .social-share-btn.whatsapp{background:#e9f9ef;color:#147a3f}
      .social-share-btn.linkedin{background:#eaf4ff;color:#0a66c2}
      .social-share-btn.facebook{background:#edf3ff;color:#1877f2}
      .social-share-btn:hover{filter:brightness(.97)}
      .saved-share-btn{border:1px solid #dfe8f1;background:#fff;border-radius:9px;padding:7px 9px;font-size:11px;font-weight:800;cursor:pointer}
      .saved-share-btn.whatsapp{color:#147a3f}.saved-share-btn.linkedin{color:#0a66c2}.saved-share-btn.facebook{color:#1877f2}
      .share-toast{position:fixed;right:18px;bottom:18px;z-index:9999;max-width:360px;background:#0b2d4d;color:#fff;padding:11px 14px;border-radius:12px;box-shadow:0 12px 32px rgb(15 23 42 / .2);font-size:12px;opacity:0;transform:translateY(10px);transition:.18s ease;pointer-events:none}
      .share-toast.show{opacity:1;transform:translateY(0)}
      @media(max-width:760px){.social-share-buttons{display:grid;grid-template-columns:1fr}.social-share-btn{justify-content:center;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function toast(message){
    let el = document.querySelector(".share-toast");
    if(!el){
      el = document.createElement("div");
      el.className = "share-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  async function copyText(text){
    try{
      if(navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(text);
        return true;
      }
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }catch{
      return false;
    }
  }

  function currentPublication(){
    const text = document.getElementById("postText")?.value?.trim() || "";
    const hashtags = document.getElementById("hashtagPreview")?.textContent?.trim() || "";
    return [text, hashtags].filter(Boolean).join("\n\n");
  }

  function savedPublication(button){
    const card = button.closest(".saved-post");
    return card?.querySelector(".saved-post-text")?.textContent?.trim() || "";
  }

  function openPopup(url){
    const popup = window.open("about:blank", "_blank");
    if(popup){
      try{ popup.opener = null; }catch{}
      popup.location.href = url;
      return true;
    }
    return false;
  }

  async function share(platform, text){
    if(!text){
      toast("Generate or select a publication first.");
      return;
    }

    if(platform === "whatsapp"){
      openPopup(`https://wa.me/?text=${encodeURIComponent(text)}`);
      return;
    }

    const copied = await copyText(text);
    if(platform === "linkedin"){
      openPopup(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(PHWC_URL)}`);
      toast(copied ? "Publication copied — paste it into LinkedIn." : "LinkedIn opened. Copy the publication text manually if needed.");
      return;
    }

    if(platform === "facebook"){
      openPopup(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(PHWC_URL)}`);
      toast(copied ? "Publication copied — paste it into Facebook." : "Facebook opened. Copy the publication text manually if needed.");
    }
  }

  function mountPreviewButtons(){
    const previewActions = document.querySelector(".preview-actions");
    if(!previewActions || document.getElementById("socialShareBox")) return;

    const box = document.createElement("div");
    box.id = "socialShareBox";
    box.className = "social-share-box";
    box.innerHTML = `
      <div class="social-share-head">Share publication</div>
      <div class="social-share-buttons">
        <button type="button" class="social-share-btn whatsapp" data-share-current="whatsapp">WhatsApp</button>
        <button type="button" class="social-share-btn linkedin" data-share-current="linkedin">LinkedIn</button>
        <button type="button" class="social-share-btn facebook" data-share-current="facebook">Facebook</button>
      </div>`;
    previewActions.insertAdjacentElement("afterend", box);
  }

  function mountSavedButtons(){
    document.querySelectorAll(".saved-post .saved-actions").forEach(actions => {
      if(actions.querySelector("[data-share-saved]")) return;
      const wa = document.createElement("button");
      wa.type = "button"; wa.className = "saved-share-btn whatsapp"; wa.dataset.shareSaved = "whatsapp"; wa.textContent = "WhatsApp";
      const li = document.createElement("button");
      li.type = "button"; li.className = "saved-share-btn linkedin"; li.dataset.shareSaved = "linkedin"; li.textContent = "LinkedIn";
      const fb = document.createElement("button");
      fb.type = "button"; fb.className = "saved-share-btn facebook"; fb.dataset.shareSaved = "facebook"; fb.textContent = "Facebook";
      actions.append(wa, li, fb);
    });
  }

  function mount(){
    injectStyles();
    mountPreviewButtons();
    mountSavedButtons();

    const library = document.getElementById("postLibrary");
    if(library && !library.dataset.shareObserver){
      library.dataset.shareObserver = "1";
      new MutationObserver(mountSavedButtons).observe(library, {childList:true, subtree:true});
    }
  }

  document.addEventListener("click", (event) => {
    const current = event.target.closest("[data-share-current]");
    if(current){
      event.preventDefault();
      share(current.dataset.shareCurrent, currentPublication());
      return;
    }
    const saved = event.target.closest("[data-share-saved]");
    if(saved){
      event.preventDefault();
      share(saved.dataset.shareSaved, savedPublication(saved));
    }
  });

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
