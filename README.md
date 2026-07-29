# Perry Home Wound Care website

Public website and staff portal for `perryhomewoundcare.network`.

## Architecture

- Static HTML, CSS, and JavaScript in `public/`
- Firebase Hosting
- Firebase Authentication
- Cloud Firestore
- Firebase project: `credential-4f22b`
- Optional Cloud Functions package in `functions/` (currently no production functions)

## Main surfaces

- Public homepage and wound-care education
- Service catalogue and appointment request
- Contact and patient referral forms
- Hospice and SNF partner pages
- Administrator dashboard
- Clinician task and note portal

## Authorization model

The canonical staff profile is `users/{uid}` with:

- `active: true`
- `role: "admin" | "nurse" | "lpn" | "np" | "caregiver"`

Existing administrators may also be bootstrapped through an active
`admins/{uid}` document. Client-side checks improve navigation, but
`firestore.rules` is the authoritative access-control layer.

Clinicians can read only top-level tasks assigned to their Firebase UID and
the notes under those tasks. Public booking and referral records remain
administrator-only until intake assigns work.

## Local verification

Run from PowerShell:

```powershell
.\scripts\check-site.ps1
firebase.cmd emulators:exec --only firestore "cmd /c echo rules-ok"
```

The site check validates JSON, JavaScript module syntax, HTML document roots,
and local `href`/`src` references.

## Compliance gate

`compliance-drafts/notice-of-privacy-practices.html` and
`compliance-drafts/terms.html` are
implementation drafts. They must be reviewed by the organization’s
privacy/compliance lead and legal counsel before production publication.

Before accepting electronic protected health information in production,
confirm the organization’s risk analysis, applicable Business Associate
Agreements, retention policy, incident response, MFA policy, audit controls,
and approved Firebase/Google Cloud service configuration.

## Deployment

Deployment is intentionally separate from implementation. Verify the active
Firebase account and project before releasing Hosting, Firestore rules, or
indexes. Do not deploy the legal drafts until their review gates are closed.
