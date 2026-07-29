// ---- Data (edit as needed) ----
const SERVICES = [
  {
    slug: 'comprehensive-wound-management',
    title: 'Comprehensive Wound Management',
    blurb: 'Assessment, dressing selection, moisture balance, infection control, debridement planning, and pain management.',
    bullets: ['Pressure injuries (I–IV)', 'Diabetic foot ulcers', 'Venous & arterial ulcers', 'Surgical/traumatic wounds'],
    category: 'wound',
    image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1747103827/Nurse_at_Home_Wound_Care_Entrance_wradxx.png',
    duration: '60–90 min initial · 30–45 min follow-ups'
  },
  {
    slug: 'ostomy-care-and-education',
    title: 'Ostomy Care & Education',
    blurb: 'Appliance fitting, skin protection, predictable pouching, leakage troubleshooting, and caregiver training.',
    bullets: ['Colostomy', 'Ileostomy', 'Urostomy', 'Peristomal skin care'],
    category: 'ostomy',
    image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1747103827/Home_Care_Nurse_Assisting_Patient_rhswsi.png',
    duration: '45–60 min visit · virtual check-ins available'
  },
  {
    slug: 'telewound-prevention-programs',
    title: 'Tele-Wound & Prevention Programs',
    blurb: 'Virtual follow-ups, supply guidance, and early-warning checks to prevent deterioration and readmissions.',
    bullets: ['Video follow-ups', 'Caregiver coaching', 'Supply guidance', 'Early warnings'],
    category: 'virtual',
    image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1747100901/ChatGPT_Image_10_mai_2025_16_05_17_uecx7c.png',
    duration: '20–30 min virtual · flexible cadence'
  },
  {
    slug: 'mobile-lab-collection',
    title: 'Mobile Lab Collection',
    blurb: 'At-home specimen collection coordinated with the ordering provider and laboratory.',
    bullets: ['Blood draws', 'Specimen collection', 'Provider coordination', 'Convenient scheduling'],
    category: 'lab',
    image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1747103827/Nurse_at_Home_Wound_Care_Entrance_wradxx.png',
    duration: 'Scheduling depends on the laboratory order'
  },
  {
    slug: 'infection-monitoring',
    title: 'Infection Monitoring',
    blurb: 'Structured observation, symptom education, and timely escalation when wound changes are identified.',
    bullets: ['Symptom monitoring', 'Red-flag education', 'Clinical assessment', 'Provider escalation'],
    category: 'wound',
    image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1747103827/Home_Care_Nurse_Assisting_Patient_rhswsi.png',
    duration: 'Visit cadence follows the care plan'
  },
  {
    slug: 'private-duty-nursing',
    title: 'Private Duty Nursing',
    blurb: 'One-on-one skilled nursing support based on an individualized plan of care and eligibility.',
    bullets: ['Skilled nursing', 'Medication support', 'Health monitoring', 'Care coordination'],
    category: 'nursing',
    image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1767039754/K3HQGLbFsNL4CcnP_55EC-_Hn5gHrFDzY_uj8rxl.jpg',
    duration: 'Schedule tailored after clinical review'
  },
    {
      slug: 'companion-care',
      title: 'Companion Care',
      blurb: 'Friendly companionship, conversation, and support for daily activities to reduce isolation and improve well-being.',
      bullets: ['Social visits', 'Errands & shopping', 'Meal prep', 'Light housekeeping'],
      category: 'companion',
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1767295088/Making-a-Difference-iStock-1473162545-640x462_laesjp.jpg',
      duration: 'Flexible scheduling · hourly or daily'
    },
    {
      slug: 'nursing-care',
      title: 'Nursing Care',
      blurb: 'Skilled nursing services including medication management, injections, monitoring, and health assessments.',
      bullets: ['Medication administration', 'Vital signs monitoring', 'Injections', 'Health assessments'],
      category: 'nursing',
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1767039754/K3HQGLbFsNL4CcnP_55EC-_Hn5gHrFDzY_uj8rxl.jpg',
      duration: '30–60 min per visit · custom plans'
    },
    {
      slug: 'personal-care',
      title: 'Personal Care',
      blurb: 'Assistance with bathing, grooming, dressing, mobility, and toileting to support independence and dignity.',
      bullets: ['Bathing & grooming', 'Dressing', 'Mobility assistance', 'Toileting'],
      category: 'personal',
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1767047077/XQGso4umvc2fvbqz_cFpH30I_nks7lS-B_xbpvu7.jpg',
      duration: 'Hourly or daily · tailored to needs'
    },
];

// ---- DOM wires ----
const grid = document.getElementById('serviceGrid');
const q = document.getElementById('q');
const cat = document.getElementById('category');
const clr = document.getElementById('clear');

// footer year
document.getElementById('yr')?.append(new Date().getFullYear());

// initial render
render(SERVICES);

// events
q.addEventListener('input', applyFilters);
cat.addEventListener('change', applyFilters);
clr.addEventListener('click', () => { q.value=''; cat.value=''; applyFilters(); });

function applyFilters(){
  const term = q.value.trim().toLowerCase();
  const c = cat.value;
  const filtered = SERVICES.filter(s => {
    const hitTerm = !term || [s.title, s.blurb, ...(s.bullets||[])].join(' ').toLowerCase().includes(term);
    const hitCat  = !c || s.category === c;
    return hitTerm && hitCat;
  });
  render(filtered);
}

function render(list){
  grid.innerHTML = '';
  if(list.length === 0){
    grid.innerHTML = `<p class="muted">No services match your search. Try clearing filters.</p>`;
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach(s => frag.appendChild(serviceCard(s)));
  grid.appendChild(frag);
}

function serviceCard(svc){
  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `
    <figure class="service-media">
      <img src="${svc.image}" alt="${escapeHtml(svc.title)}">
    </figure>
    <div>
      <h3>${escapeHtml(svc.title)}</h3>
      <p>${escapeHtml(svc.blurb)}</p>
      <div class="meta">
        ${svc.bullets.slice(0,3).map(b=>`<span class="badge">${escapeHtml(b)}</span>`).join('')}
        <span class="badge">${escapeHtml(svc.duration)}</span>
      </div>
      <div class="cta-row">
        <a class="btn" href="./service-details.html?slug=${encodeURIComponent(svc.slug)}">View details</a>
        <a class="btn primary"
          href="../booking/bookings.html?service=${encodeURIComponent(svc.slug)}&title=${encodeURIComponent(svc.title)}"
          aria-label="Book ${escapeHtml(svc.title)}">
          Book this service
        </a>
      </div>
    </div>
  `;
  return el;
}

function escapeHtml(x){ return x.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }


