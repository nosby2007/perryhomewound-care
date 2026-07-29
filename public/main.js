// Footer year
const footerYear = document.getElementById('yr');
if (footerYear) footerYear.textContent = new Date().getFullYear();

// Outcomes animation (circles + linear)
(() => {
  const EASE = t => 1 - Math.pow(1 - t, 3); // easeOutCubic
  const DURATION = 1400;

  const cards = document.querySelectorAll('.out-card');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      animate(en.target);
      io.unobserve(en.target);
    });
  }, { threshold: 0.35 });
  cards.forEach(c => io.observe(c));

  function animate(card) {
    const kind = card.dataset.kind || 'circle';
    const target = clamp(parseFloat(card.dataset.target || '0'), 0, 100);

    if (kind === 'circle') {
      const fg = card.querySelector('.fg');
      const txt = card.querySelector('.value');
      const r = parseFloat(fg.getAttribute('r'));
      const C = 2 * Math.PI * r;
      fg.setAttribute('stroke-dasharray', C.toFixed(2));
      fg.setAttribute('stroke-dashoffset', C.toFixed(2));
      const start = performance.now();
      requestAnimationFrame(function step(now) {
        const t = clamp((now - start) / DURATION, 0, 1);
        const e = EASE(t);
        const pct = Math.round(target * e);
        const off = C * (1 - (target / 100) * e);
        fg.setAttribute('stroke-dashoffset', off.toFixed(2));
        txt.textContent = pct + '%';
        if (t < 1) requestAnimationFrame(step);
        else txt.textContent = (card.dataset.label || target + '%');
      });
    } else {
      const bar = card.querySelector('.linear > i');
      const start = performance.now();
      requestAnimationFrame(function step(now) {
        const t = clamp((now - start) / (DURATION * 0.9), 0, 1);
        const e = EASE(t);
        bar.style.width = Math.round(target * e) + '%';
        if (t < 1) requestAnimationFrame(step);
      });
    }
  }

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
})();
