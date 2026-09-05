"use strict";

const {setGlobalOptions} = require("firebase-functions/v2");
const {onRequest} = require("firebase-functions/v2/https");
const {randomBytes} = require("crypto");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({maxInstances: 10});

const db = admin.firestore();

/** An error carrying the HTTP status code the response should use. */
class ApiError extends Error {
  /**
   * @param {number} status HTTP status code to respond with.
   * @param {string} message User-facing error message.
   */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Verifies the Firebase ID token in an Authorization: Bearer header.
 * @param {string} authorizationHeader The request's Authorization header.
 * @return {Promise<string>} The verified caller uid.
 */
async function requireUid(authorizationHeader) {
  const match = /^Bearer (.+)$/.exec(authorizationHeader || "");
  if (!match) {
    throw new ApiError(401, "Sign in required.");
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch (error) {
    throw new ApiError(401, "Invalid or expired session.");
  }
}

/**
 * Throws unless the given uid belongs to an active PHWC admin, mirroring
 * the isAdmin() check in firestore.rules.
 * @param {string} uid Firebase Auth uid to check.
 * @return {Promise<void>}
 */
async function requireAdmin(uid) {
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
    throw new ApiError(403, "Administrator access required.");
  }
}

/**
 * Generates a random, URL-safe temporary password for a new portal account.
 * @return {string} A temporary password meeting Firebase Auth's minimum length.
 */
function generateTempPassword() {
  return `${randomBytes(9).toString("base64").replace(/[+/=]/g, "")}-Aa1`;
}

/**
 * Handles POST /api/createPatientPortalAccount: verifies the caller is an
 * active admin, then creates the patient's Firebase Auth account and links
 * portalUsers/patientPortal for them.
 * @param {object} req Express-style request from onRequest.
 * @param {object} res Express-style response from onRequest.
 * @return {Promise<void>}
 */
async function handleCreatePatientPortalAccount(req, res) {
  try {
    if (req.method !== "POST") {
      throw new ApiError(405, "Method not allowed.");
    }
    const uid = await requireUid(req.get("Authorization"));
    await requireAdmin(uid);

    const data = req.body || {};
    const patientId = String(data.patientId || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const displayName = String(data.displayName || "").trim();
    const primaryPayer = String(data.primaryPayer || "").trim();
    const nextVisitIso = data.nextVisit || null;

    if (!patientId) {
      throw new ApiError(400, "Select a patient before creating an account.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError(400, "Enter a valid patient email address.");
    }

    const referralSnap = await db.doc(`patientReferal/${patientId}`).get();
    if (!referralSnap.exists) {
      throw new ApiError(404, "Selected patient record was not found.");
    }

    const existingLink = await db.collection("portalUsers")
        .where("patientId", "==", patientId)
        .limit(1).get();
    if (!existingLink.empty) {
      throw new ApiError(409, "This patient already has a portal account.");
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
        throw new ApiError(409, "A Firebase account with this email exists.");
      }
      throw new ApiError(500, "Unable to create the patient account.");
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
      createdBy: uid,
      updatedAt: now,
      updatedBy: uid,
    });
    batch.set(db.doc(`patientPortal/${patientId}`), {
      displayName,
      primaryPayer,
      nextVisit,
      createdAt: now,
      createdBy: uid,
      updatedAt: now,
      updatedBy: uid,
    }, {merge: true});
    await batch.commit();

    res.status(200).json({uid: userRecord.uid, patientId, email, tempPassword});
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    res.status(status).json({error: error.message || "Unexpected error."});
  }
}

// Creates a Firebase Auth account for a patient and links it to their portal
// record, so admins never have to hand-copy a UID between the Firebase
// Console and the app.
//
// This is a plain onRequest function, not onCall: the project's Google Cloud
// organization enforces the "Domain Restricted Sharing" policy, which blocks
// granting allUsers the Cloud Run Invoker role that onCall/httpsCallable
// depends on. invoker:"private" stops Firebase from even attempting that
// public grant on deploy (which otherwise fails outright under the policy).
// The function is reached only through the Firebase Hosting rewrite at
// /api/createPatientPortalAccount (see firebase.json), which Firebase is
// allowed to invoke internally without a public IAM grant. Called from
// public/admin/patient-portal.js via fetch() with a Firebase Auth ID token
// in the Authorization header.
exports.createPatientPortalAccount = onRequest(
    {invoker: "private"}, handleCreatePatientPortalAccount);
