"use strict";

const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {randomBytes} = require("crypto");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({maxInstances: 10});

const db = admin.firestore();

/**
 * Throws unless the given Auth context belongs to an active PHWC admin,
 * mirroring the isAdmin() check in firestore.rules.
 * @param {object} auth Callable function auth context (request.auth).
 * @return {Promise<void>}
 */
async function requireAdmin(auth) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const uid = auth.uid;
  const [adminSnap, userSnap] = await Promise.all([
    db.doc(`admins/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  const adminData = adminSnap.exists ? adminSnap.data() : {};
  const userData = userSnap.exists ? userSnap.data() : {};
  const isAdminDoc = adminSnap.exists && adminData.active === true;
  const isAdminRole = userSnap.exists && userData.active === true &&
    userData.role === "admin";
  if (!isAdminDoc && !isAdminRole) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }
}

/**
 * Generates a random, URL-safe temporary password for a new portal account.
 * @return {string} A temporary password meeting Firebase Auth's minimum length.
 */
function generateTempPassword() {
  return `${randomBytes(9).toString("base64").replace(/[+/=]/g, "")}-Aa1`;
}

// Creates a Firebase Auth account for a patient and links it to their portal
// record, so admins never have to hand-copy a UID between the Firebase
// Console and the app. Called from public/admin/patient-portal.js.
exports.createPatientPortalAccount = onCall(async (request) => {
  await requireAdmin(request.auth);

  const data = request.data || {};
  const patientId = String(data.patientId || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const displayName = String(data.displayName || "").trim();
  const primaryPayer = String(data.primaryPayer || "").trim();
  const nextVisitIso = data.nextVisit || null;

  if (!patientId) {
    throw new HttpsError(
        "invalid-argument", "Select a patient before creating an account.",
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError(
        "invalid-argument", "Enter a valid patient email address.");
  }

  const referralSnap = await db.doc(`patientReferal/${patientId}`).get();
  if (!referralSnap.exists) {
    throw new HttpsError("not-found", "Selected patient record was not found.");
  }

  const existingLink = await db.collection("portalUsers")
      .where("patientId", "==", patientId)
      .limit(1).get();
  if (!existingLink.empty) {
    throw new HttpsError(
        "already-exists", "This patient already has a portal account linked.");
  }

  const tempPassword = generateTempPassword();
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: displayName || undefined,
      emailVerified: false,
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError(
          "already-exists", "A Firebase account with this email exists.");
    }
    throw new HttpsError("internal", "Unable to create the patient account.");
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const nextVisit = nextVisitIso ?
    admin.firestore.Timestamp.fromDate(new Date(nextVisitIso)) : null;

  const batch = db.batch();
  batch.set(db.doc(`portalUsers/${userRecord.uid}`), {
    patientId,
    active: true,
    displayName,
    createdAt: now,
    createdBy: request.auth.uid,
    updatedAt: now,
    updatedBy: request.auth.uid,
  });
  batch.set(db.doc(`patientPortal/${patientId}`), {
    displayName,
    primaryPayer,
    nextVisit,
    createdAt: now,
    createdBy: request.auth.uid,
    updatedAt: now,
    updatedBy: request.auth.uid,
  }, {merge: true});
  await batch.commit();

  return {uid: userRecord.uid, patientId, email, tempPassword};
});
