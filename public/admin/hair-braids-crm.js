(() => {
  const HAIR_TYPE = "hair braids contact";

  const firstName = (name) => {
    const clean = String(name || "").trim();
    return clean ? clean.split(/\s+/)[0] : "there";
  };

  const lastServiceFromCard = (card) => {
    const footer = card.querySelector(".score")?.textContent || "";
    const marker = "Hair Braids Reactivation •";
    const i = footer.indexOf(marker);
    return i >= 0 ? footer.slice(i + marker.length).trim() : "";
  };

  const messageFor = (card) => {
    const name = firstName(card.querySelector(".lead-name")?.textContent);
    const service = lastServiceFromCard(card);
    const styleText = service
      ? `You can book ${service} again or try a new look.`
      : "You can come back for your favorite style or try a fresh new look.";
    return `Hi ${name}! ✨ It’s Sandra. Ready for a fresh braid style? We’d love to have you back. ${styleText} Reply here to check availability and book your next appointment. Reply STOP to opt out.`;
  };

  const whatsappMessageFor = (card) => {
    const name = firstName(card.querySelector(".lead-name")?.textContent);
    const service = lastServiceFromCard(card);
    const styleText = service
      ? `You can choose ${service} again or try something new.`
      : "You can choose your favorite style again or try something new.";
    return `Hi ${name}! ✨ It’s Sandra. Ready for a fresh braid style? We’d love to have you back. ${styleText} Message me here and I’ll help you find an appointment that works for you. 💕`;
  };

  function enhanceCard(card) {
    const type = (card.querySelector(".lead-type")?.textContent || "").toLowerCase();
    if (!type.includes(HAIR_TYPE)) return;

    card.dataset.hairBraidsLead = "1";

    const sms = card.querySelector('a[data-action="sms"]');
    if (sms) {
      const raw = sms.getAttribute("href") || "";
      const phone = raw.replace(/^sms:/i, "").split(/[?&]/)[0];
      const sep = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "&" : "?";
      sms.href = `sms:${phone}${sep}body=${encodeURIComponent(messageFor(card))}`;
      sms.title = "Send Sandra's hair-braiding rebooking message";
    }

    const actions = card.querySelector(".crm-actions");
    if (actions && !actions.querySelector(".hair-wa-btn")) {
      const phone = (sms?.getAttribute("href") || "").replace(/^sms:/i, "").split(/[?&]/)[0].replace(/\D/g, "");
      if (phone) {
        const wa = document.createElement("a");
        wa.className = "action-btn sms hair-wa-btn";
        wa.target = "_blank";
        wa.rel = "noopener";
        wa.textContent = "WHATSAPP";
        wa.href = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessageFor(card))}`;
        actions.appendChild(wa);
      }
    }
  }

  function enhanceAll() {
    document.querySelectorAll("#leadList .lead-card").forEach(enhanceCard);
  }

  const boot = () => {
    enhanceAll();
    const list = document.getElementById("leadList");
    if (list) new MutationObserver(enhanceAll).observe(list, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
