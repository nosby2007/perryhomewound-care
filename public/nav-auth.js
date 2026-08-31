// nav-auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
// Optionnel App Check en prod :
// import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyCdIpeMxhFMRpzNxmngoP3QY8ZZl2ABG_s",
  authDomain: "credential-4f22b.firebaseapp.com",
  projectId: "credential-4f22b",
  storageBucket: "credential-4f22b.firebasestorage.app", // vérifie: souvent c'est *.appspot.com
  messagingSenderId: "107240797765",
  appId: "1:107240797765:web:9ae5b37760081911ad952c",
  measurementId: "G-XKYX4WC53E"
};

const app  = initializeApp(firebaseConfig);
// initializeAppCheck(app, { provider: new ReCaptchaV3Provider("YOUR_RECAPTCHA_V3_SITE_KEY"), isTokenAutoRefreshEnabled: true });

const auth = getAuth(app);
const db   = getFirestore(app);

function ensureStylesheet(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

// Keep public blog navigation independent from the homepage anchor layout.
function fixBlogNavigation() {
  document.querySelectorAll('a.nav-link[href="#blog"]').forEach(link => {
    link.setAttribute('href', '/blog');
  });

  // Static homepage education cards are a fallback. Until a matching post is
  // published, they should at least open the real blog instead of href="#".
  document.querySelectorAll('.pc-article-card .pc-article-body a').forEach(link => {
    if ((link.textContent || '').toLowerCase().includes('read article')) {
      link.setAttribute('href', '/blog');
    }
  });

  // Keep the "Recent Blog" footer useful even before individual slugs exist.
  document.querySelectorAll('footer h6').forEach(heading => {
    if ((heading.textContent || '').trim().toLowerCase() !== 'recent blog') return;
    const column = heading.closest('.col-md-3');
    column?.querySelectorAll('a[href="#"]').forEach(link => {
      if (link.querySelector('img')) link.setAttribute('href', '/blog');
    });
  });
}

// The original homepage used referral query strings as placeholders for several
// partner pages. Replace those placeholders with the dedicated partner landing pages.
function fixPartnerNavigation() {
  const partnerRoutes = [
    ['home-health-partnership', '/publics/partener/home-health'],
    ['primary-care-partnership', '/publics/partener/pcp'],
    ['assisted-living-partnership', '/publics/partener/acf'],
    ['hospital-discharge-referral', '/publics/partener/hospitals']
  ];

  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href') || '';
    for (const [service, destination] of partnerRoutes) {
      if (href.includes(`service=${service}`)) {
        link.setAttribute('href', destination);
        break;
      }
    }
  });
}

// Hospice already has its own clinical content and working Firestore form.
// Apply the shared homepage design as a late visual layer instead of replacing
// that functionality or duplicating the form implementation.
function applyHospiceUnifiedDesign() {
  if (!window.location.pathname.toLowerCase().includes('/publics/hospice/')) return;
  document.body.classList.add('phwc-public', 'phwc-hospice');
  ensureStylesheet('phwc-public-styles', '/phwc-public.css');
  ensureStylesheet('phwc-hospice-styles', '/publics/hospice/hospice-unified.css');
}

function postTime(post) {
  return post?.publishedAt?.seconds || post?.updatedAt?.seconds || 0;
}

async function hydrateHomepageBlog() {
  const cards = [...document.querySelectorAll('.pc-article-card')].slice(0, 3);
  if (!cards.length) return;

  const snap = await getDocs(
    query(collection(db, 'blogPosts'), where('status', '==', 'Published'))
  );

  const published = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => postTime(b) - postTime(a))
    .slice(0, cards.length);

  if (!published.length) return;

  published.forEach((post, index) => {
    const card = cards[index];
    const image = card.querySelector('.pc-article-img');
    const category = card.querySelector('.pc-article-body > span');
    const title = card.querySelector('.pc-article-body h3');
    const excerpt = card.querySelector('.pc-article-body p');
    const link = card.querySelector('.pc-article-body a');
    const slug = post.slug || post.id;

    if (image && post.coverUrl) {
      image.style.backgroundImage = `url("${String(post.coverUrl).replace(/"/g, '%22')}")`;
      image.setAttribute('role', 'img');
      image.setAttribute('aria-label', post.coverAlt || post.title || 'PHWC wound care article');
    }
    if (category) category.textContent = post.category || 'Wound Education';
    if (title) title.textContent = post.title || 'PHWC Wound Care Article';
    if (excerpt) excerpt.textContent = post.excerpt || '';
    if (link) link.setAttribute('href', `/blog/post?slug=${encodeURIComponent(slug)}`);
  });
}

fixBlogNavigation();
fixPartnerNavigation();
applyHospiceUnifiedDesign();
hydrateHomepageBlog().catch(err => {
  // Navigation still works if Firestore is temporarily unavailable.
  console.warn('Homepage blog preview unavailable:', err);
});

const el = document.getElementById("navAuth");
if (el) el.innerHTML = `<a class="btn" href="./admin/login/admin-login.html">Sign in</a>`; // état initial

onAuthStateChanged(auth, async (user) => {
  if (!el) return;

  if (!user) {
    // Déconnecté → bouton Sign in
    el.innerHTML = `<a class="btn" href="./admin/login/admin-login.html">Sign in</a>`;
    return;
  }

  // Connecté → check rôle admin
  const adminSnap = await getDoc(doc(db, "admins", user.uid));
  const isAdmin = adminSnap.exists() && adminSnap.data().active === true;
  const who = user.email || user.uid.slice(0, 6);

  if (isAdmin) {
    // Admin → bouton Admin + Sign out
    el.innerHTML = `
      <span class="small muted" style="margin-right:10px; color:#888; font-size:0.95em; vertical-align:middle;">${escapeHtml(who)}</span>
      <a class="btn" href="/admin/admin-dashboard.html" style="background:#1976d2; color:#fff; margin-right:6px; padding:6px 14px; border-radius:4px; text-decoration:none;">Admin</a>
      <a class="btn" href="#" id="navSignOut" style="background:#e53935; color:#fff; padding:6px 14px; border-radius:4px; text-decoration:none;">Sign out</a>
    `;
    document.getElementById("navSignOut")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await signOut(auth);
      location.href = "/admin/login/admin-login.html";
    });
  } else {
    // Connecté mais non-admin → juste Sign out
    el.innerHTML = `
      <span class="small muted" style="margin-right:6px;">${escapeHtml(who)}</span>
      <a class="btn" href="#" id="navSignOut">Sign out</a>
    `;
    document.getElementById("navSignOut")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await signOut(auth);
      // on reste sur la page courante
      location.reload();
    });
  }
});

function escapeHtml(x){
  return String(x).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#039;'}[m]));
}
