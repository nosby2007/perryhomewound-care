// PHWC Referral Intake hotfix: safely opens a blank referral drawer.
// Loaded before referrals.js so the Add Referral click is handled before the
// legacy openDrawer(null) path can dereference a null referral record.
const addBtn = document.getElementById('addReferralBtn');

if (addBtn) {
  addBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const $ = (id) => document.getElementById(id);
    const form = $('referralForm');
    if (!form) return;

    form.reset();

    const today = new Date().toISOString().slice(0, 10);
    const setValue = (id, value) => { const el = $(id); if (el) el.value = value ?? ''; };
    const setChecked = (id, value) => { const el = $(id); if (el) el.checked = Boolean(value); };

    setValue('referralId', '');
    if ($('drawerTitle')) $('drawerTitle').textContent = 'New Referral';
    if ($('drawerSubtitle')) $('drawerSubtitle').textContent = 'Referral intake';

    setValue('receivedDate', today);
    setValue('receivedTime', '');
    setValue('referralSource', 'Hospital');
    setValue('receivedMethod', 'Fax');
    setValue('requestedService', 'Wound Care');
    setValue('urgency', 'Routine');
    setValue('eligibilityStatus', 'Not Checked');
    setValue('authorizationStatus', 'Not Required');
    setValue('status', 'received');
    setValue('dispositionStatus', '');
    setValue('dispositionReportedBy', '');

    setChecked('medicarePartA', false);
    setChecked('medicarePartB', false);
    setChecked('medicareAdvantage', false);
    setChecked('admitted', false);
    setChecked('servicesRendered', false);

    if ($('contactHistory')) $('contactHistory').innerHTML = '<div class="muted2">No contact attempts recorded.</div>';
    if ($('statusHistory')) $('statusHistory').innerHTML = '<div class="muted2">New referral — no status history yet.</div>';
    if ($('makeTaskBtn')) $('makeTaskBtn').style.display = 'none';

    $('drawerBackdrop')?.classList.add('open');
    $('refDrawer')?.classList.add('open');
    $('refDrawer')?.setAttribute('aria-hidden', 'false');
  }, true);
}
