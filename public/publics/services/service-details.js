// Mini service catalog (keeps page standalone)
const MINI = {
    'comprehensive-wound-management': {
      title: 'Comprehensive Wound Management',
      blurb: 'Assessment, dressing selection, moisture balance, infection control, debridement planning, and pain management.',
      bullets: ['Pressure injuries (I–IV)','Diabetic foot ulcers','Venous & arterial ulcers','Surgical/traumatic wounds'],
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1747103827/Nurse_at_Home_Wound_Care_Entrance_wradxx.png',
      duration: '60–90 min initial · 30–45 min follow-ups'
    },
    'ostomy-care-and-education': {
      title: 'Ostomy Care & Education',
      blurb: 'Appliance fitting, skin protection, predictable pouching, leakage troubleshooting, and caregiver training.',
      bullets: ['Colostomy','Ileostomy','Urostomy','Peristomal skin care'],
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1747103827/Home_Care_Nurse_Assisting_Patient_rhswsi.png',
      duration: '45–60 min visit · virtual check-ins available'
    },
    'telewound-prevention-programs': {
      title: 'Tele-Wound & Prevention Programs',
      blurb: 'Virtual follow-ups, supply guidance, and early-warning checks to prevent deterioration and readmissions.',
      bullets: ['Video follow-ups','Caregiver coaching','Supply guidance','Early warnings'],
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1747100901/ChatGPT_Image_10_mai_2025_16_05_17_uecx7c.png',
      duration: '20–30 min virtual · flexible cadence'
    },
    'companion-care': {
      title: 'Companion Care',
      blurb: 'Friendly companionship, conversation, and support for daily activities to reduce isolation and improve well-being.',
      bullets: ['Social visits','Errands & shopping','Meal prep','Light housekeeping'],
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1767295088/Making-a-Difference-iStock-1473162545-640x462_laesjp.jpg',
      duration: 'Flexible scheduling · hourly or daily'
    },
    'nursing-care': {
      title: 'Nursing Care',
      blurb: 'Skilled nursing services including medication management, injections, monitoring, and health assessments.',
      bullets: ['Medication administration','Vital signs monitoring','Injections','Health assessments'],
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1767039754/K3HQGLbFsNL4CcnP_55EC-_Hn5gHrFDzY_uj8rxl.jpg',
      duration: '30–60 min per visit · custom plans'
    },
    'personal-care': {
      title: 'Personal Care',
      blurb: 'Assistance with bathing, grooming, dressing, mobility, and toileting to support independence and dignity.',
      bullets: ['Bathing & grooming','Dressing','Mobility assistance','Toileting'],
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1767047077/XQGso4umvc2fvbqz_cFpH30I_nks7lS-B_xbpvu7.jpg',
      duration: 'Hourly or daily · tailored to needs'
    },
    'mobile-lab-collection': {
      title: 'Mobile Lab Collection',
      blurb: 'Convenient at-home phlebotomy services for blood draws, specimen collection, and laboratory testing without clinic visits.',
      bullets: ['Blood draws','Specimen collection','Lab testing','Convenient scheduling'],
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1747103827/Nurse_at_Home_Wound_Care_Entrance_wradxx.png',
      duration: '15–30 min visit · same-day results'
    },
    'infection-monitoring': {
      title: 'Infection Monitoring',
      blurb: 'Proactive surveillance and early detection of infections to prevent complications and ensure timely intervention.',
      bullets: ['Vital monitoring','Infection screening','Early detection','Clinical assessment'],
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1747103827/Home_Care_Nurse_Assisting_Patient_rhswsi.png',
      duration: '30–45 min per visit · regular intervals'
    },
    'private-duty-nursing': {
      title: 'Private Duty Nursing',
      blurb: 'One-on-one skilled nursing care tailored to individual health needs, available on flexible schedules including overnight support.',
      bullets: ['24/7 availability','Skilled nursing','Personalized care','Medication management'],
      image: 'https://res.cloudinary.com/dtdpx59sc/image/upload/v1767039754/K3HQGLbFsNL4CcnP_55EC-_Hn5gHrFDzY_uj8rxl.jpg',
      duration: 'Hourly, daily, or overnight · custom plans'
    },
  };
  
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');
  const svc = MINI[slug] || Object.values(MINI)[0];
  
  document.getElementById('yr').textContent = new Date().getFullYear();
  document.getElementById('svcTitle').textContent = svc.title;
  document.getElementById('svcShort').textContent = svc.title;
  document.getElementById('svcBlurb').textContent = svc.blurb;
  document.getElementById('svcImage').src = svc.image;
  document.getElementById('svcImage').alt = svc.title;
  document.getElementById('svcDuration').textContent = svc.duration;
  document.getElementById('svcBullets').innerHTML = svc.bullets.map(x=>`<li>${x}</li>`).join('');
  document.getElementById('crumbs').innerHTML = `<a href="./Service.html">Services</a> · ${svc.title}`;
  
  // Build booking link carrying the current service
  const bookingHref = `../booking/bookings.html?service=${encodeURIComponent(slug || 'comprehensive-wound-management')}&title=${encodeURIComponent(svc.title)}`;
  
  const setBookingLink = (elemId) => {
    const elem = document.getElementById(elemId);
    if (elem) {
      elem.href = bookingHref;
      elem.setAttribute('data-service', slug);
      elem.setAttribute('data-title', svc.title);
      elem.setAttribute('data-duration', svc.duration);
    }
  };
  
  setBookingLink('bookBtn');
  setBookingLink('bookBtn2');
  setBookingLink('stickyBtn');
  
  document.getElementById('stickySvc').textContent = svc.title;
  
  // Enable bottom padding when sticky bar is visible (mobile)
  if (window.matchMedia('(max-width: 900px)').matches) {
    document.body.classList.add('has-sticky');
  }
  
