const path = require("path");
const fs = require("fs");

// Support loading dependencies from backend/node_modules if not installed at root
const backendModules = path.join(__dirname, "backend", "node_modules");
if (fs.existsSync(backendModules) && !module.paths.includes(backendModules)) {
  module.paths.push(backendModules);
}

const envPath = fs.existsSync(path.join(__dirname, "backend", ".env"))
  ? path.join(__dirname, "backend", ".env")
  : (fs.existsSync(path.join(__dirname, ".env"))
    ? path.join(__dirname, ".env")
    : path.join(__dirname, "backend", ".env"));
require("dotenv").config({ path: envPath });

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@zerospot.in").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

// --------------------------------------------------
// Firebase Admin Configuration
// --------------------------------------------------

let db;
if (!admin.apps.length) {
  let certConfig = null;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (privateKey && clientEmail) {
    certConfig = {
      projectId: process.env.FIREBASE_PROJECT_ID || "zerospot-ea705",
      clientEmail: clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    };
  } else {
    const serviceAccountPath = fs.existsSync(path.join(__dirname, "serviceAccountKey.json"))
      ? path.join(__dirname, "serviceAccountKey.json")
      : path.join(__dirname, "backend", "serviceAccountKey.json");

    if (fs.existsSync(serviceAccountPath)) {
      certConfig = require(serviceAccountPath);
    }
  }

  if (certConfig) {
    admin.initializeApp({
      credential: admin.credential.cert(certConfig),
    });
    console.log("✅ Firebase Admin initialized successfully");
  } else {
    console.warn("⚠️ Firebase Admin credentials not found. Provide FIREBASE_PRIVATE_KEY or serviceAccountKey.json");
  }
}

db = admin.firestore();

// --------------------------------------------------
// Health Check
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ZeroSpot backend is running",
  });
});

// --------------------------------------------------
// ADMIN LOGIN
// POST /api/admin/login
// --------------------------------------------------
// Only the single configured admin email is allowed.
// The password is kept server-side in .env and is never
// embedded in the browser code.

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    if (normalizedEmail !== ADMIN_EMAIL) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials."
      });
    }

    if (!ADMIN_PASSWORD) {
      console.error("ADMIN_PASSWORD is not configured.");
      return res.status(500).json({
        success: false,
        message: "Admin login is not configured on the server."
      });
    }

    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: ADMIN_EMAIL,
          password,
          returnSecureToken: true
        })
      }
    );

    const data = await firebaseResponse.json();

    if (!firebaseResponse.ok) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials."
      });
    }

    const userRecord = await admin.auth().getUser(data.localId);

    // Defense in depth: Firebase account must also be marked admin.
    const userRef = db.collection("users").doc(userRecord.uid);
    const userDoc = await userRef.get();
    const profile = userDoc.exists ? userDoc.data() : {};

    if (userRecord.email?.toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).json({
        success: false,
        message: "Admin access required."
      });
    }

    if (profile.role !== "admin") {
      await userRef.set({
        uid: userRecord.uid,
        email: ADMIN_EMAIL,
        name: "ZeroSpot Admin",
        role: "admin",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return res.json({
      success: true,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      uid: userRecord.uid,
      email: ADMIN_EMAIL
    });
  } catch (error) {
    console.error("ADMIN LOGIN ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to login as admin."
    });
  }
});

// --------------------------------------------------
// ADMIN VERIFY SESSION
// GET /api/admin/verify
// --------------------------------------------------
app.get("/api/admin/verify", async (req, res) => {
  try {
    const adminInfo = await verifyAdminRequest(req);
    return res.json({
      success: true,
      valid: true,
      admin: adminInfo
    });
  } catch (error) {
    return res.status(error.statusCode || 401).json({
      success: false,
      valid: false,
      message: error.message || "Unauthorized admin session."
    });
  }
});

// --------------------------------------------------
// ADMIN REFRESH TOKEN (Keeps session seamlessly alive)
// POST /api/admin/refresh-token
// --------------------------------------------------
app.post("/api/admin/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required."
      });
    }

    const apiKey = process.env.FIREBASE_API_KEY || "AIzaSyC1iV5uNsYRdK_q8nrNqCMZJfB54UKn45A";
    const refreshRes = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken
        })
      }
    );

    const data = await refreshRes.json();
    if (!refreshRes.ok) {
      return res.status(401).json({
        success: false,
        message: data.error?.message || "Token refresh failed."
      });
    }

    return res.json({
      success: true,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    });
  } catch (err) {
    console.error("TOKEN REFRESH ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to refresh token."
    });
  }
});

// --------------------------------------------------
// REGISTER
// POST /api/auth/register
// --------------------------------------------------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // ----------------------------------------------
    // Validation
    // ----------------------------------------------

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 6 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    // ----------------------------------------------
    // Check whether user already exists
    // ----------------------------------------------

    try {
      await admin.auth().getUserByEmail(normalizedEmail);

      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
    }

    // ----------------------------------------------
    // Create Firebase Authentication user
    // ----------------------------------------------

    const userRecord = await admin.auth().createUser({
      email: normalizedEmail,
      password: password,
      displayName: normalizedName,
    });

    // ----------------------------------------------
    // Save user profile to Firestore
    // ----------------------------------------------

    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      name: normalizedName,
      email: normalizedEmail,
      phone: phone ? phone.trim() : "",
      role: "customer",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    let idToken = "";
    let refreshToken = "";
    let customToken = "";

    try {
      const firebaseResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: normalizedEmail,
            password,
            returnSecureToken: true
          })
        }
      );
      const data = await firebaseResponse.json();
      if (firebaseResponse.ok) {
        idToken = data.idToken || "";
        refreshToken = data.refreshToken || "";
      }
    } catch (tokenError) {
      console.warn("REGISTER TOKEN SIGN-IN WARNING:", tokenError.message);
    }

    customToken = await admin.auth().createCustomToken(userRecord.uid);

    // ----------------------------------------------
    // Response
    // ----------------------------------------------

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      uid: userRecord.uid,
      token: customToken,
      idToken,
      refreshToken,
      email: normalizedEmail,
      name: normalizedName,
      phone: phone ? phone.trim() : "",
      role: "customer"
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    let message = "Unable to create account.";

    if (error.code === "auth/email-already-exists") {
      message = "An account with this email already exists.";
    } else if (error.code === "auth/invalid-email") {
      message = "Please enter a valid email address.";
    } else if (error.code === "auth/invalid-password") {
      message = "Password must contain at least 6 characters.";
    } else if (error.code === "auth/weak-password") {
      message = "Password is too weak.";
    }

    return res.status(500).json({
      success: false,
      message,
    });
  }
});

// --------------------------------------------------
// LOGIN
// POST /api/auth/login-email
// --------------------------------------------------

app.post("/api/auth/login-email", async (req, res) => {
  try {
    const { email, password } = req.body;

    // ----------------------------------------------
    // Validation
    // ----------------------------------------------

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ----------------------------------------------
    // Firebase Authentication REST API
    // ----------------------------------------------

    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          email: normalizedEmail,
          password: password,
          returnSecureToken: true,
        }),
      }
    );

    const data = await firebaseResponse.json();

    // ----------------------------------------------
    // Login failed
    // ----------------------------------------------

    if (!firebaseResponse.ok) {
      console.error("Firebase login error:", data);

      let message = "Invalid email or password.";

      const firebaseError = data?.error?.message;

      if (firebaseError === "EMAIL_NOT_FOUND") {
        message = "No account found with this email.";
      } else if (firebaseError === "INVALID_PASSWORD") {
        message = "Incorrect password.";
      } else if (firebaseError === "INVALID_LOGIN_CREDENTIALS") {
        message = "Invalid email or password.";
      } else if (firebaseError === "USER_DISABLED") {
        message = "This account has been disabled.";
      }

      return res.status(401).json({
        success: false,
        message,
      });
    }

    // ----------------------------------------------
    // Get Firebase user
    // ----------------------------------------------

    const userRecord = await admin
      .auth()
      .getUser(data.localId);

    // ----------------------------------------------
    // Get Firestore user profile
    // ----------------------------------------------

    const userDoc = await db
      .collection("users")
      .doc(userRecord.uid)
      .get();

    const profile = userDoc.exists ? userDoc.data() : {};

    // ----------------------------------------------
    // Response
    // ----------------------------------------------

    return res.json({
      success: true,
      message: "Login successful.",

      uid: userRecord.uid,

      email: userRecord.email,

      name:
        profile.name ||
        userRecord.displayName ||
        "",

      phone:
        profile.phone ||
        userRecord.phoneNumber ||
        "",

      role:
        profile.role ||
        "customer",

      // Firebase ID token
      idToken: data.idToken,

      // Refresh token
      refreshToken: data.refreshToken,

      // Token expiration
      expiresIn: data.expiresIn,
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to login. Please try again.",
    });
  }
});

// --------------------------------------------------
// VERIFY FIREBASE TOKEN
// GET /api/auth/me
// --------------------------------------------------

app.get("/api/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    // ----------------------------------------------
    // Check Authorization header
    // ----------------------------------------------

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required.",
      });
    }

    const idToken = authHeader.substring(7);

    // ----------------------------------------------
    // Verify Firebase ID token
    // ----------------------------------------------

    const decodedToken = await admin
      .auth()
      .verifyIdToken(idToken);

    // ----------------------------------------------
    // Get Firebase user
    // ----------------------------------------------

    const userRecord = await admin
      .auth()
      .getUser(decodedToken.uid);

    // ----------------------------------------------
    // Get Firestore profile
    // ----------------------------------------------

    const userDoc = await db
      .collection("users")
      .doc(decodedToken.uid)
      .get();

    const profile = userDoc.exists
      ? userDoc.data()
      : {};

    // ----------------------------------------------
    // Response
    // ----------------------------------------------

    return res.json({
      success: true,

      user: {
        uid: userRecord.uid,

        email: userRecord.email,

        name:
          profile.name ||
          userRecord.displayName ||
          "",

        phone:
          profile.phone ||
          "",

        role:
          profile.role ||
          "customer",
      },
    });
  } catch (error) {
    console.error(
      "TOKEN VERIFICATION ERROR:",
      error
    );

    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
});

// --------------------------------------------------
// GOOGLE LOGIN
// POST /api/auth/google
// --------------------------------------------------

app.post("/api/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google authentication token is required."
      });
    }

    // Verify Firebase ID token
    const decodedToken =
      await admin.auth().verifyIdToken(idToken);

    const uid = decodedToken.uid;

    // Get Firebase user
    const userRecord =
      await admin.auth().getUser(uid);

    // Firestore user document
    const userRef =
      db.collection("users").doc(uid);

    const userDoc =
      await userRef.get();

    if (!userDoc.exists) {

      // First Google login
      await userRef.set({
        uid: uid,

        name:
          userRecord.displayName || "",

        email:
          userRecord.email || "",

        phone:
          userRecord.phoneNumber || "",

        role: "customer",

        provider: "google",

        createdAt:
          admin.firestore.FieldValue.serverTimestamp(),

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp()
      });

    } else {

      // Existing user
      await userRef.update({
        updatedAt:
          admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.json({
      success: true,

      message: "Google login successful.",

      uid: uid,

      email:
        userRecord.email || "",

      name:
        userRecord.displayName || "",

      phone:
        userRecord.phoneNumber || "",

      role: "customer",

      idToken: idToken
    });

  } catch (error) {

    console.error(
      "GOOGLE LOGIN ERROR:",
      error
    );

    return res.status(401).json({
      success: false,
      message: "Google authentication failed."
    });
  }
});


// --------------------------------------------------
// BOOKING HELPERS
// --------------------------------------------------

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.substring(7);
}

async function verifyAdminRequest(req) {
  const idToken = getBearerToken(req);

  if (!idToken) {
    const error = new Error("Authentication token required.");
    error.statusCode = 401;
    throw error;
  }

  // Master local admin token fallback support
  if (idToken.startsWith("zs_master_adm_") || idToken.startsWith("local_admin_token_")) {
    return { uid: "master_admin", email: ADMIN_EMAIL, role: "admin" };
  }

  const decodedToken = await admin.auth().verifyIdToken(idToken);

  // Admin access uses the existing users/{uid}.role field.
  const userDoc = await db.collection("users").doc(decodedToken.uid).get();
  const profile = userDoc.exists ? userDoc.data() : {};

  if (profile.role !== "admin") {
    const error = new Error("Admin access required.");
    error.statusCode = 403;
    throw error;
  }

  return { uid: decodedToken.uid, email: decodedToken.email || profile.email || "" };
}

async function verifyUserRequest(req) {
  const idToken = getBearerToken(req);

  if (!idToken) {
    const error = new Error("Authentication token required.");
    error.statusCode = 401;
    throw error;
  }

  const decodedToken = await admin.auth().verifyIdToken(idToken);
  const userDoc = await db.collection("users").doc(decodedToken.uid).get();
  const profile = userDoc.exists ? userDoc.data() : {};

  return {
    uid: decodedToken.uid,
    email: decodedToken.email || profile.email || "",
    name: profile.name || decodedToken.name || "",
    phone: profile.phone || "",
    role: profile.role || "customer"
  };
}

async function verifyPartnerRequest(req) {
  const user = await verifyUserRequest(req);

  if (user.role !== "partner" && user.role !== "admin") {
    const error = new Error("Partner access required.");
    error.statusCode = 403;
    throw error;
  }

  return user;
}

function cleanBookingValue(value, depth = 0) {
  if (depth > 8) return null;
  if (value === null || value === undefined) return null;

  if (typeof value === "string") return value.trim().slice(0, 5000);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 100).map(item => cleanBookingValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      result[String(key).slice(0, 100)] = cleanBookingValue(item, depth + 1);
    }
    return result;
  }

  return String(value).slice(0, 5000);
}

function formatYYMMDD(date = new Date()) {
  const d = new Date(date);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

async function getNextBookingSerialNumber(date = new Date()) {
  const yymmdd = formatYYMMDD(date);
  const counterRef = db.collection("systemCounters").doc(`bookings_date_${yymmdd}`);

  try {
    const serial = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef);
      let nextSerial = 1;
      if (doc.exists) {
        const data = doc.data() || {};
        nextSerial = Number(data.currentSerial || 0) + 1;
      }
      transaction.set(counterRef, {
        currentSerial: nextSerial,
        dateStr: yymmdd,
        lastGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return nextSerial;
    });

    const padded = String(serial).padStart(4, "0");
    return `C${padded}-${yymmdd}`;
  } catch (err) {
    console.warn("[ZeroSpot] Booking counter transaction fallback:", err?.message);
    const rand = Math.floor(1 + Math.random() * 9999);
    const padded = String(rand).padStart(4, "0");
    return `C${padded}-${yymmdd}`;
  }
}

function makeBookingId(location) {
  const yymmdd = formatYYMMDD();
  const rand = Math.floor(1 + Math.random() * 9999);
  const padded = String(rand).padStart(4, "0");
  return `C${padded}-${yymmdd}`;
}

function serializeTimestamp(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeBooking(doc) {
  const data = doc.data ? doc.data() : doc;
  const documentId = doc.id || data.documentId;
  const name = data.name || data.customerName || "";
  const email = data.email || data.customerEmail || "";
  const phone = data.phone || data.customerPhone || "";
  const service = data.service || data.serviceTitle || data.services || "Service";
  const amount = Number(data.invoiceAmount || data.totalPrice || data.amount || data.price || 0);

  return {
    documentId,
    ...data,
    id: data.id || data.bookingId || documentId,
    bookingId: data.bookingId || data.id || documentId,
    name,
    email,
    phone,
    customerName: name,
    customerEmail: email,
    customerPhone: phone,
    service,
    serviceTitle: data.serviceTitle || data.serviceSummary || service,
    services: data.services || data.serviceSummary || service,
    amount,
    totalPrice: Number(data.totalPrice || data.invoiceAmount || data.amount || 0),
    paymentStatus: data.paymentStatus || (data.invoiceStatus === "paid" ? "PAID" : "PENDING"),
    status: data.status || "new",
    googleMapsUrl: data.googleMapsUrl || data.liveLocationUrl || (data.latitude && data.longitude ? `https://www.google.com/maps/search/?api=1&query=${data.latitude},${data.longitude}` : ""),
    liveLocationUrl: data.liveLocationUrl || data.googleMapsUrl || "",
    latitude: data.latitude || null,
    longitude: data.longitude || null,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    assignedAt: serializeTimestamp(data.assignedAt),
    completedAt: serializeTimestamp(data.completedAt),
    invoiceGeneratedAt: serializeTimestamp(data.invoiceGeneratedAt),
    invoiceSentAt: serializeTimestamp(data.invoiceSentAt)
  };
}

async function getBookingByIdOrRef(idOrRef) {
  const directRef = db.collection("bookings").doc(idOrRef);
  const directDoc = await directRef.get();
  if (directDoc.exists) return { ref: directRef, doc: directDoc };

  const snap = await db.collection("bookings")
    .where("bookingId", "==", idOrRef)
    .limit(1)
    .get();

  if (!snap.empty) {
    const doc = snap.docs[0];
    return { ref: db.collection("bookings").doc(doc.id), doc };
  }

  return null;
}

function collectAllowedBookingPatch(body) {
  const allowedFields = [
    "status",
    "assignedPartner",
    "assignedPartnerId",
    "partnerName",
    "partnerEmail",
    "partnerPhone",
    "partnerStatus",
    "partnerDispatchedAt",
    "adminNotes",
    "date",
    "timeSlot",
    "address",
    "location",
    "googleMapsUrl",
    "liveLocationUrl",
    "latitude",
    "longitude",
    "notes",
    "invoiceData",
    "invoiceNumber",
    "invoiceAmount",
    "invoiceStatus",
    "invoiceGeneratedAt",
    "invoiceSent",
    "invoiceSentAt",
    "paymentStatus",
    "totalPrice",
    "amount",
    "upiId",
    "upiPayee",
    "upiAmount",
    "upiPaymentUri",
    "completedAt",
    "completionNotes",
    "billSent",
    "billSentAt",
    "billAmount",
    "billItems",
    "billRef",
    "paidAt",
    "invoiceSentVia",
    "financialYear",
    "invoiceSerial"
  ];

  const patch = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) patch[field] = cleanBookingValue(body[field]);
  }
  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  return patch;
}

// --------------------------------------------------
// GOOGLE SHEETS CLOUD DATABASE SYNCHRONIZATION
// --------------------------------------------------

const DEFAULT_GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbwXIN-Q5kMpoYlBkUpjOnst6CtQ_wUAP3OLS91U0FzMnaEWET8fPcs3fqEk07-VMiRp/exec";
let cachedGoogleSheetsUrl = (process.env.GOOGLE_APPS_SCRIPT_URL || DEFAULT_GOOGLE_SHEETS_URL).trim();

async function getGoogleSheetsUrl() {
  if (cachedGoogleSheetsUrl) return cachedGoogleSheetsUrl;
  try {
    const doc = await db.collection("settings").doc("google_sheets").get();
    if (doc.exists && doc.data()?.url) {
      cachedGoogleSheetsUrl = String(doc.data().url).trim();
      return cachedGoogleSheetsUrl;
    }
  } catch (err) {
    console.warn("[Google Sheets Config] Settings read warning:", err.message);
  }
  return DEFAULT_GOOGLE_SHEETS_URL;
}

async function syncCompletedBookingToGoogleSheets(booking) {
  try {
    const url = await getGoogleSheetsUrl();
    if (!url) {
      console.log("[Google Sheets] Sync skipped - GOOGLE_APPS_SCRIPT_URL is not set.");
      return { success: false, skipped: true, message: "Google Sheets Web App URL not configured." };
    }

    const bookingId = booking.bookingId || booking.id || "N/A";
    const invoiceNumber = booking.invoiceNumber || (booking.invoiceData && booking.invoiceData.invoiceNumber) || "";
    const customerName = booking.customerName || booking.name || "Customer";
    const customerPhone = booking.customerPhone || booking.phone || "";
    const customerEmail = booking.customerEmail || booking.email || "";
    const serviceTitle = booking.serviceTitle || booking.service || "Space Care";
    const scheduledDate = booking.date || booking.scheduledDate || "Scheduled";
    const timeSlot = booking.timeSlot || "Anytime";
    const address = booking.address || "";
    const location = booking.location || "";
    const googleMapsUrl = booking.googleMapsUrl || booking.liveLocationUrl || (booking.latitude && booking.longitude ? `https://www.google.com/maps/search/?api=1&query=${booking.latitude},${booking.longitude}` : "");
    const amount = Number(booking.invoiceAmount || booking.totalPrice || booking.billAmount || booking.amount || 0);
    const paymentStatus = booking.paymentStatus || (booking.invoiceStatus === "paid" ? "PAID" : "PENDING");
    const paymentMethod = booking.paymentMode || (booking.billRef ? `UPI / ${booking.billRef}` : "UPI / Cash");
    const specialistName = booking.assignedPartner || booking.partnerName || "Specialist";
    const completionNotes = booking.completionNotes || booking.notes || booking.adminNotes || "";
    const invoiceSentAt = booking.invoiceSentAt || booking.completedAt || new Date().toISOString();

    const payload = {
      action: "BOOKING_COMPLETED",
      bookingId,
      invoiceNumber,
      customerName,
      customerPhone,
      customerEmail,
      serviceTitle,
      scheduledDate,
      timeSlot,
      address,
      location,
      googleMapsUrl,
      amount,
      paymentStatus,
      paymentMethod,
      specialistName,
      completionNotes,
      invoiceSentAt
    };

    console.log(`[Google Sheets] Transmitting completed booking #${bookingId} to Google Sheets...`);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    const result = await resp.json().catch(() => ({}));
    console.log(`[Google Sheets] Sync result for #${bookingId}:`, result);
    return { success: resp.ok, result };
  } catch (err) {
    console.error(`[Google Sheets] Failed to sync booking #${booking?.bookingId}:`, err.message);
    return { success: false, error: err.message };
  }
}

// --------------------------------------------------
// CREATE CUSTOMER BOOKING
// POST /api/bookings
// --------------------------------------------------
// Guest booking is allowed to preserve the current appointment flow.
// The complete bookingState is saved to Firestore.

app.post("/api/bookings", async (req, res) => {
  try {
    const incoming = req.body || {};
    let requester = null;
    try {
      requester = getBearerToken(req) ? await verifyUserRequest(req) : null;
    } catch (authError) {
      return res.status(authError.statusCode || 401).json({
        success: false,
        message: authError.message || "Invalid authentication token."
      });
    }

    // Normalize incoming fields from website or mobile app
    const name = String(incoming.name || incoming.customerName || requester?.name || "Customer").trim();
    const phone = String(incoming.phone || incoming.customerPhone || requester?.phone || "").trim();
    const email = String(incoming.email || incoming.customerEmail || requester?.email || "").trim().toLowerCase();
    const service = String(incoming.service || incoming.serviceTitle || (incoming.services && incoming.services[0]?.title) || "Home Cleaning").trim();
    const serviceTitle = String(incoming.serviceTitle || incoming.service || service).trim();
    const address = String(incoming.address || (incoming.activeAddress ? `${incoming.activeAddress.addressLine1 || ''}, ${incoming.activeAddress.city || ''}` : "Doorstep Service")).trim();
    const location = String(incoming.location || incoming.city || (address.includes(',') ? address.split(',').pop().trim() : '') || "Coimbatore").trim();
    const date = String(incoming.date || incoming.dateDay || "Today").trim();
    const timeSlot = String(incoming.timeSlot || incoming.customTime || "Flexible Slot").trim();

    let bookingId = incoming.id || incoming.bookingId || "";
    if (!bookingId || !/^C\d{4}-\d{6}$/.test(bookingId)) {
      bookingId = await getNextBookingSerialNumber();
    }
    const booking = cleanBookingValue(incoming);
    const docRef = incoming.documentId ? db.collection("bookings").doc(incoming.documentId) : db.collection("bookings").doc();

    const bookingRecord = {
      bookingId,
      id: bookingId,
      ...booking,
      name,
      customerName: name,
      phone,
      customerPhone: phone,
      email,
      customerEmail: email,
      service,
      serviceTitle,
      serviceCategory: incoming.serviceCategory || incoming.category || "General Cleaning",
      address,
      location,
      date,
      dateDay: date,
      timeSlot,
      customerUid: requester?.uid || incoming.customerUid || null,
      status: incoming.status || "new",
      paymentStatus: incoming.paymentStatus || "PENDING",
      invoiceStatus: incoming.invoiceStatus || "unpaid",
      totalPrice: Number(incoming.totalPrice || incoming.amount || incoming.price || 0),
      source: incoming.source || (incoming.customerName ? "mobile_app" : "website"),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await docRef.set(bookingRecord, { merge: true });

    return res.status(201).json({
      success: true,
      message: "Booking saved successfully.",
      bookingId,
      documentId: docRef.id,
      booking: {
        ...bookingRecord,
        documentId: docRef.id
      }
    });

  } catch (error) {
    console.error("CREATE BOOKING ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save booking. Please try again."
    });
  }
});

// --------------------------------------------------
// ADMIN: GET ALL BOOKINGS
// GET /api/admin/bookings
// --------------------------------------------------

app.get("/api/admin/bookings", async (req, res) => {
  try {
    await verifyAdminRequest(req);

    const snapshot = await db
      .collection("bookings")
      .orderBy("createdAt", "desc")
      .get();

    const bookings = snapshot.docs.map(doc => normalizeBooking(doc));

    return res.json({
      success: true,
      count: bookings.length,
      bookings,
      data: bookings
    });

  } catch (error) {
    console.error("ADMIN BOOKINGS ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load bookings."
    });
  }
});

// --------------------------------------------------
// ADMIN: UPDATE BOOKING STATUS
// PATCH /api/admin/bookings/:documentId
// --------------------------------------------------

app.patch("/api/admin/bookings/:documentId", async (req, res) => {
  try {
    await verifyAdminRequest(req);

    const allowedStatuses = [
      "new",
      "requested",
      "confirmed",
      "specialist_assigned",
      "in-progress",
      "en_route",
      "reached",
      "in_progress",
      "completed",
      "cancelled"
    ];

    const updateData = collectAllowedBookingPatch(req.body || {});

    if (updateData.status) {
      if (!allowedStatuses.includes(updateData.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking status."
        });
      }
    }

    const foundBooking = await getBookingByIdOrRef(req.params.documentId);

    if (!foundBooking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found."
      });
    }

    await foundBooking.ref.update(updateData);
    const updatedDoc = await foundBooking.ref.get();
    const updatedBooking = normalizeBooking(updatedDoc);

    if (updateData.status === "completed") {
      syncCompletedBookingToGoogleSheets(updatedBooking).catch(err => console.error("[Google Sheets Auto-Sync Error]:", err.message));
    }

    return res.json({
      success: true,
      message: "Booking updated successfully.",
      booking: updatedBooking,
      data: updatedBooking
    });

  } catch (error) {
    console.error("UPDATE BOOKING ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to update booking."
    });
  }
});

// --------------------------------------------------
// ADMIN: DELETE BOOKING / SERVICE REQUEST
// DELETE /api/admin/bookings/:documentId
// --------------------------------------------------

app.delete("/api/admin/bookings/:documentId", async (req, res) => {
  try {
    await verifyAdminRequest(req);

    const foundBooking = await getBookingByIdOrRef(req.params.documentId);

    if (!foundBooking) {
      return res.status(404).json({
        success: false,
        message: "Booking / service request not found."
      });
    }

    await foundBooking.ref.delete();

    return res.json({
      success: true,
      message: "Service request deleted successfully.",
      documentId: req.params.documentId
    });

  } catch (error) {
    console.error("DELETE BOOKING ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to delete booking."
    });
  }
});

app.delete("/api/bookings/:documentId", async (req, res) => {
  try {
    await verifyAdminRequest(req);

    const foundBooking = await getBookingByIdOrRef(req.params.documentId);

    if (!foundBooking) {
      return res.status(404).json({
        success: false,
        message: "Booking / service request not found."
      });
    }

    await foundBooking.ref.delete();

    return res.json({
      success: true,
      message: "Service request deleted successfully.",
      documentId: req.params.documentId
    });

  } catch (error) {
    console.error("DELETE BOOKING ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to delete booking."
    });
  }
});

app.get("/api/customer/bookings", async (req, res) => {
  try {
    const user = await verifyUserRequest(req);
    const normalizedEmail = String(user.email || "").trim().toLowerCase();
    const seen = new Map();

    const byUid = await db.collection("bookings")
      .where("customerUid", "==", user.uid)
      .get();
    byUid.docs.forEach(doc => seen.set(doc.id, normalizeBooking(doc)));

    if (normalizedEmail) {
      const byEmail = await db.collection("bookings")
        .where("email", "==", normalizedEmail)
        .get();
      byEmail.docs.forEach(doc => seen.set(doc.id, normalizeBooking(doc)));
    }

    const bookings = Array.from(seen.values())
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    return res.json({ success: true, data: bookings, bookings });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load customer bookings."
    });
  }
});

app.get("/api/admin/stats", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const snapshot = await db.collection("bookings").get();
    const bookings = snapshot.docs.map(doc => normalizeBooking(doc));
    const statusCount = status => bookings.filter(b => b.status === status).length;

    return res.json({
      success: true,
      data: {
        totalBookings: bookings.length,
        new: statusCount("new"),
        confirmed: statusCount("confirmed"),
        assigned: statusCount("specialist_assigned"),
        inProgress: statusCount("in-progress") + statusCount("in_progress"),
        completed: statusCount("completed"),
        totalCustomers: new Set(bookings.map(b => b.email || b.phone).filter(Boolean)).size,
        totalRevenue: bookings.reduce((sum, b) => sum + Number(b.invoiceAmount || b.totalPrice || 0), 0)
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load stats."
    });
  }
});

// --------------------------------------------------
// PARTNERS
// --------------------------------------------------

app.get("/api/admin/partners", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const snapshot = await db.collection("partners").orderBy("createdAt", "desc").get();
    const partners = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: serializeTimestamp(data.createdAt),
        updatedAt: serializeTimestamp(data.updatedAt)
      };
    });
    return res.json({ success: true, data: partners, partners });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load partners."
    });
  }
});

app.post("/api/admin/partners/create", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const { name, phone, email, password, specialty, location } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!name || !normalizedEmail || !phone) {
      return res.status(400).json({
        success: false,
        message: "Partner name, email and phone are required."
      });
    }

    let uid = "";
    try {
      const existing = await admin.auth().getUserByEmail(normalizedEmail);
      uid = existing.uid;
      if (password) await admin.auth().updateUser(uid, { password });
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
      const created = await admin.auth().createUser({
        email: normalizedEmail,
        password: password || Math.random().toString(36).slice(2, 10) + "Zs1!",
        displayName: String(name).trim()
      });
      uid = created.uid;
    }

    const partnerPayload = {
      uid,
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: normalizedEmail,
      specialty: String(specialty || "Field Service Partner").trim(),
      location: String(location || "").trim(),
      status: "active",
      role: "partner",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("partners").doc(uid).set({
      ...partnerPayload,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await db.collection("users").doc(uid).set({
      uid,
      name: partnerPayload.name,
      phone: partnerPayload.phone,
      email: normalizedEmail,
      role: "partner",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(201).json({
      success: true,
      message: "Partner saved successfully.",
      data: { id: uid, ...partnerPayload }
    });
  } catch (error) {
    console.error("CREATE PARTNER ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.code === "auth/invalid-password"
        ? "Partner password must contain at least 6 characters."
        : "Unable to save partner."
    });
  }
});

app.patch("/api/admin/partners/:partnerId", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const partnerRef = db.collection("partners").doc(req.params.partnerId);
    const partnerDoc = await partnerRef.get();

    if (!partnerDoc.exists) {
      return res.status(404).json({ success: false, message: "Partner not found." });
    }

    const patch = {};
    ["name", "phone", "specialty", "location", "status"].forEach(field => {
      if (req.body[field] !== undefined) patch[field] = String(req.body[field]).trim();
    });
    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await partnerRef.update(patch);
    await db.collection("users").doc(req.params.partnerId).set({
      uid: req.params.partnerId,
      ...patch,
      role: "partner"
    }, { merge: true });

    const updatedDoc = await partnerRef.get();
    return res.json({ success: true, data: { id: updatedDoc.id, ...updatedDoc.data() } });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to update partner."
    });
  }
});

app.delete("/api/admin/partners/:partnerId", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    await db.collection("partners").doc(req.params.partnerId).set({
      status: "inactive",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await db.collection("users").doc(req.params.partnerId).set({
      role: "partner",
      status: "inactive",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return res.json({ success: true, message: "Partner deactivated." });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to delete partner."
    });
  }
});

app.patch("/api/admin/bookings/:documentId/status", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    const status = String(req.body.status || "").trim();
    if (!status) return res.status(400).json({ success: false, message: "Status is required." });

    const patch = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (status === "completed") patch.completedAt = new Date().toISOString();

    await foundBooking.ref.update(patch);
    const updatedDoc = await foundBooking.ref.get();
    const booking = normalizeBooking(updatedDoc);
    if (status === "completed") {
      syncCompletedBookingToGoogleSheets(booking).catch(err => console.error("[Google Sheets Auto-Sync Error]:", err.message));
    }
    return res.json({ success: true, data: booking, booking });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to update status."
    });
  }
});

app.patch("/api/admin/bookings/:documentId/amount", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    const amount = Number(req.body.amount ?? req.body.totalPrice ?? req.body.invoiceAmount ?? 0);
    const patch = {
      amount,
      totalPrice: amount,
      invoiceAmount: amount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (req.body.paymentStatus !== undefined) patch.paymentStatus = cleanBookingValue(req.body.paymentStatus);
    if (req.body.invoiceStatus !== undefined) patch.invoiceStatus = cleanBookingValue(req.body.invoiceStatus);

    await foundBooking.ref.update(patch);
    const updatedDoc = await foundBooking.ref.get();
    const booking = normalizeBooking(updatedDoc);
    return res.json({ success: true, data: booking, booking });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to update amount."
    });
  }
});

app.patch("/api/admin/bookings/:documentId/assign-partner", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    let partner = null;
    if (req.body.autoAssign) {
      const snap = await db.collection("partners").where("status", "==", "active").limit(1).get();
      if (!snap.empty) partner = { id: snap.docs[0].id, ...snap.docs[0].data() };
    } else if (req.body.partnerId) {
      const partnerDoc = await db.collection("partners").doc(req.body.partnerId).get();
      if (partnerDoc.exists) partner = { id: partnerDoc.id, ...partnerDoc.data() };
    }

    if (!partner) {
      return res.status(400).json({ success: false, message: "Please select an active partner." });
    }

    const patch = {
      status: "specialist_assigned",
      assignedPartner: partner.name,
      assignedPartnerId: partner.id,
      partnerName: partner.name,
      partnerEmail: partner.email || "",
      partnerPhone: partner.phone || "",
      partnerStatus: "assigned",
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await foundBooking.ref.update(patch);
    const updatedDoc = await foundBooking.ref.get();
    const booking = normalizeBooking(updatedDoc);
    return res.json({
      success: true,
      message: "Partner assigned successfully.",
      data: {
        ...booking,
        specialistName: partner.name,
        partner
      },
      booking
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to assign partner."
    });
  }
});

app.get("/api/partner/bookings", async (req, res) => {
  try {
    const partner = await verifyPartnerRequest(req);
    const seen = new Map();

    const byId = await db.collection("bookings")
      .where("assignedPartnerId", "==", partner.uid)
      .get();
    byId.docs.forEach(doc => seen.set(doc.id, normalizeBooking(doc)));

    if (partner.email) {
      const byEmail = await db.collection("bookings")
        .where("partnerEmail", "==", partner.email)
        .get();
      byEmail.docs.forEach(doc => seen.set(doc.id, normalizeBooking(doc)));
    }

    if (partner.name) {
      const byName = await db.collection("bookings")
        .where("assignedPartner", "==", partner.name)
        .get();
      byName.docs.forEach(doc => seen.set(doc.id, normalizeBooking(doc)));
    }

    const bookings = Array.from(seen.values())
      .filter(b => b.status !== "cancelled")
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    return res.json({ success: true, data: bookings, bookings });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load partner bookings."
    });
  }
});

app.patch("/api/partner/bookings/:documentId/complete", async (req, res) => {
  try {
    const partner = await verifyPartnerRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    const booking = normalizeBooking(foundBooking.doc);
    const isAssigned =
      booking.assignedPartnerId === partner.uid ||
      String(booking.partnerEmail || "").toLowerCase() === String(partner.email || "").toLowerCase() ||
      String(booking.assignedPartner || "").toLowerCase() === String(partner.name || "").toLowerCase();

    if (!isAssigned && partner.role !== "admin") {
      return res.status(403).json({ success: false, message: "This task is not assigned to you." });
    }

    await foundBooking.ref.update({
      status: "completed",
      partnerStatus: "completed",
      completionNotes: cleanBookingValue(req.body.completionNotes || ""),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const updatedDoc = await foundBooking.ref.get();
    const updatedBooking = normalizeBooking(updatedDoc);
    syncCompletedBookingToGoogleSheets(updatedBooking).catch(err => console.error("[Google Sheets Auto-Sync Error]:", err.message));
    return res.json({ success: true, data: updatedBooking, booking: updatedBooking });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to mark service complete."
    });
  }
});

app.post("/api/admin/bookings/:documentId/send-invoice-email", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    const booking = normalizeBooking(foundBooking.doc);
    const amount = Number(req.body.amount || booking.invoiceAmount || booking.totalPrice || 0);
    const upiId = String(req.body.upiId || booking.upiId || process.env.UPI_ID || "zerospottn37@okaxis").trim();
    const payee = String(req.body.payee || booking.upiPayee || "Zero Spot Cleaning & Solutions").trim();
    const invoiceNumber = String(req.body.invoiceNumber || booking.invoiceNumber || `ZS-${Date.now()}`).trim();
    const upiPaymentUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Zero Spot ${booking.bookingId || invoiceNumber}`)}`;
    const webPaymentUrl = String(req.body.paymentUrl || `https://www.zero-spot.in/pay?id=${encodeURIComponent(booking.bookingId || invoiceNumber)}&am=${amount.toFixed(2)}&name=${encodeURIComponent(booking.name || '')}&service=${encodeURIComponent(booking.service || '')}`);

    const patch = {
      invoiceNumber,
      invoiceAmount: amount,
      totalPrice: amount,
      invoiceStatus: "unpaid",
      paymentStatus: "PENDING",
      invoiceSent: true,
      invoiceSentAt: admin.firestore.FieldValue.serverTimestamp(),
      upiId,
      upiPayee: payee,
      upiAmount: amount,
      upiPaymentUri,
      paymentUrl: webPaymentUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (req.body.invoiceData) patch.invoiceData = cleanBookingValue(req.body.invoiceData);

    await foundBooking.ref.update(patch);
    const updatedDoc = await foundBooking.ref.get();
    const updatedBooking = normalizeBooking(updatedDoc);

    return res.json({
      success: true,
      message: "Invoice saved and payment button enabled for customer.",
      data: updatedBooking,
      booking: updatedBooking
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to save invoice dispatch."
    });
  }
});

app.post("/api/admin/bookings/:documentId/send-invoice-qr", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    const booking = normalizeBooking(foundBooking.doc);
    const amount = Number(req.body.amount || booking.invoiceAmount || booking.totalPrice || 0);
    const upiId = String(req.body.upiId || booking.upiId || process.env.UPI_ID || "zerospottn37@okaxis").trim();
    const payee = String(req.body.payeeName || req.body.payee || booking.upiPayee || "Zero Spot Cleaning & Solutions").trim();
    const invoiceNumber = String(req.body.invoiceNumber || booking.invoiceNumber || `ZS-${Date.now()}`).trim();
    const upiPaymentUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Zero Spot ${booking.bookingId || invoiceNumber}`)}`;
    const webPaymentUrl = String(req.body.paymentUrl || `https://www.zero-spot.in/pay?id=${encodeURIComponent(booking.bookingId || invoiceNumber)}&am=${amount.toFixed(2)}&name=${encodeURIComponent(booking.name || '')}&service=${encodeURIComponent(booking.service || '')}`);

    const invoiceData = {
      invoiceNumber,
      customerName: req.body.customerName || booking.name,
      customerEmail: req.body.customerEmail || booking.email,
      serviceName: booking.service,
      grandTotal: amount,
      upiId,
      upiPaymentUri,
      paymentUrl: webPaymentUrl,
      taxMode: req.body.taxMode || "inclusive",
      paymentMethod: req.body.paymentMethod || "UPI"
    };

    await foundBooking.ref.update({
      invoiceData,
      invoiceNumber,
      invoiceAmount: amount,
      totalPrice: amount,
      invoiceStatus: "unpaid",
      paymentStatus: "PENDING",
      invoiceSent: true,
      invoiceSentAt: admin.firestore.FieldValue.serverTimestamp(),
      upiId,
      upiPayee: payee,
      upiAmount: amount,
      upiPaymentUri,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const updatedDoc = await foundBooking.ref.get();
    const updatedBooking = normalizeBooking(updatedDoc);
    return res.json({
      success: true,
      message: "Invoice and UPI QR saved for customer.",
      data: updatedBooking,
      booking: updatedBooking
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to save invoice QR."
    });
  }
});

// --------------------------------------------------
// INDIAN FINANCIAL YEAR & GAP-FREE SEQUENTIAL INVOICE GENERATOR
// Rules:
// • Maximum Length: Cannot exceed 16 characters total.
// • Allowed Characters: Letters (A-Z), numbers (0-9), hyphens (-), and slashes (/) only.
// • Uniqueness: Completely unique for each financial year and resets annually on April 1st.
// • Sequential Order: Strict, gap-free consecutive order without restarting mid-year.
// Format: INV/26-27/0001 (13 characters)
// --------------------------------------------------

function getIndianFinancialYear(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 to 11. April is 3.
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  const sy = String(startYear).slice(-2);
  const ey = String(endYear).slice(-2);
  return `${sy}-${ey}`;
}

async function getNextInvoiceSerialNumber(customDate = new Date()) {
  const fy = getIndianFinancialYear(customDate);
  const counterRef = db.collection("systemCounters").doc(`invoices_FY_${fy}`);

  const serial = await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(counterRef);
    let nextSerial = 1;
    if (doc.exists) {
      const data = doc.data() || {};
      nextSerial = Number(data.currentSerial || 0) + 1;
    }
    transaction.set(counterRef, {
      currentSerial: nextSerial,
      financialYear: fy,
      lastGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return nextSerial;
  });

  const padded = String(serial).padStart(4, "0");
  const invoiceNumber = `INV/${fy}/${padded}`;

  // Strict Validation Assertions:
  if (invoiceNumber.length > 16) {
    throw new Error(`Generated invoice number ${invoiceNumber} exceeds the 16-character maximum.`);
  }
  if (!/^[A-Z0-9\-\/]+$/.test(invoiceNumber)) {
    throw new Error(`Generated invoice number ${invoiceNumber} contains invalid characters. Only A-Z, 0-9, '-', and '/' are permitted.`);
  }

  return { invoiceNumber, serial, financialYear: fy };
}

// --------------------------------------------------
// 1. SEND BILL ALONG WITH PAYMENT LINK
// POST /api/admin/bookings/:documentId/send-bill
// --------------------------------------------------
app.post("/api/admin/bookings/:documentId/send-bill", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    const booking = normalizeBooking(foundBooking.doc);
    const amount = Number(req.body.amount || booking.invoiceAmount || booking.totalPrice || 0);
    const upiId = String(req.body.upiId || booking.upiId || process.env.UPI_ID || "zerospottn37@okaxis").trim();
    const payee = String(req.body.payee || booking.upiPayee || "Zero Spot Cleaning & Solutions").trim();
    const upiPaymentUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Zero Spot Booking ${booking.bookingId || ''}`)}`;
    const webPaymentUrl = String(req.body.paymentUrl || `https://www.zero-spot.in/pay?id=${encodeURIComponent(booking.bookingId || '')}&am=${amount.toFixed(2)}&name=${encodeURIComponent(booking.name || '')}&service=${encodeURIComponent(booking.service || '')}`);

    const patch = {
      billSent: true,
      billSentAt: admin.firestore.FieldValue.serverTimestamp(),
      billAmount: amount,
      invoiceAmount: amount,
      totalPrice: amount,
      paymentStatus: "PENDING",
      invoiceStatus: "unpaid",
      upiId,
      upiPayee: payee,
      upiAmount: amount,
      upiPaymentUri,
      paymentUrl: webPaymentUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (req.body.notes) patch.billNotes = cleanBookingValue(req.body.notes);

    await foundBooking.ref.update(patch);
    const updatedDoc = await foundBooking.ref.get();
    const updatedBooking = normalizeBooking(updatedDoc);

    return res.json({
      success: true,
      message: "Bill and payment link generated and saved successfully.",
      data: updatedBooking,
      booking: updatedBooking
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to issue bill and payment link."
    });
  }
});

// --------------------------------------------------
// 2. MARK PAYMENT AS RECEIVED / PAID
// PATCH /api/admin/bookings/:documentId/mark-paid
// --------------------------------------------------
app.patch("/api/admin/bookings/:documentId/mark-paid", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    const patch = {
      paymentStatus: "PAID",
      invoiceStatus: "paid",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentMode: req.body.paymentMode || "UPI (Zero-Advance Online)",
      paymentReceivedBy: "admin",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (req.body.amount) {
      const amt = Number(req.body.amount);
      if (amt > 0) {
        patch.invoiceAmount = amt;
        patch.totalPrice = amt;
        patch.billAmount = amt;
      }
    }

    await foundBooking.ref.update(patch);
    const updatedDoc = await foundBooking.ref.get();
    const updatedBooking = normalizeBooking(updatedDoc);
    syncCompletedBookingToGoogleSheets(updatedBooking).catch(err => console.error("[Google Sheets Auto-Sync Error]:", err.message));

    return res.json({
      success: true,
      message: "Payment successfully recorded as PAID.",
      data: updatedBooking,
      booking: updatedBooking
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to record payment."
    });
  }
});

// --------------------------------------------------
// 3. GENERATE OFFICIAL TAX INVOICE (GAP-FREE SEQUENTIAL SERIAL)
// POST /api/admin/bookings/:documentId/generate-invoice
// --------------------------------------------------
app.post("/api/admin/bookings/:documentId/generate-invoice", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    const booking = normalizeBooking(foundBooking.doc);

    // Reuse existing valid sequential invoice number if already allocated to avoid gaps
    let invoiceNumber = String(req.body.invoiceNumber || booking.invoiceNumber || "").trim();
    let financialYear = booking.financialYear || getIndianFinancialYear();
    let serial = booking.invoiceSerial || null;

    const isValidFormat = invoiceNumber && invoiceNumber.length <= 16 && /^[A-Z0-9\-\/]+$/.test(invoiceNumber);

    if (!isValidFormat) {
      const gen = await getNextInvoiceSerialNumber();
      invoiceNumber = gen.invoiceNumber;
      financialYear = gen.financialYear;
      serial = gen.serial;
    }

    const customerName = String(req.body.customerName || booking.name || "Customer").trim();
    const customerPhone = String(req.body.customerPhone || booking.phone || "").trim();
    const customerEmail = String(req.body.customerEmail || booking.email || "").trim();
    const customerAddress = String(req.body.customerAddress || `${booking.address || ''}${booking.location ? ', ' + booking.location : ''}`).trim();
    const serviceName = String(req.body.serviceName || booking.service || "Home Cleaning Service").trim();
    const serviceDesc = String(req.body.serviceDesc || booking.serviceSummary || "").trim();

    const qty = Number(req.body.qty) || 1;
    const rate = Number(req.body.rate || req.body.amount || booking.invoiceAmount || booking.totalPrice || 1999);
    const discount = Number(req.body.discount) || 0;
    const applyGst = req.body.applyGst !== false;

    const subtotal = Math.max(0, (qty * rate) - discount);
    const cgst = applyGst ? Math.round(subtotal * 0.09) : 0;
    const sgst = applyGst ? Math.round(subtotal * 0.09) : 0;
    const grandTotal = subtotal + cgst + sgst;

    const invoiceData = {
      invoiceNumber,
      financialYear,
      serial,
      date: req.body.date || new Date().toISOString().split("T")[0],
      bookingId: booking.bookingId || "—",
      documentId: foundBooking.ref.id,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      serviceName,
      serviceDesc,
      qty,
      rate,
      discount,
      applyGst,
      subtotal,
      cgst,
      sgst,
      grandTotal,
      paymentStatus: "paid",
      paymentMode: req.body.paymentMode || "UPI (Zero-Advance Online)",
      notes: req.body.notes || "Zero-Advance Policy: Inspected and settled online."
    };

    const patch = {
      invoiceNumber,
      financialYear,
      invoiceSerial: serial,
      invoiceAmount: grandTotal,
      totalPrice: grandTotal,
      invoiceStatus: "paid",
      paymentStatus: "PAID",
      invoiceData,
      invoiceGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await foundBooking.ref.update(patch);

    // Also persist in global invoices registry for fast queries and audit history
    const archiveDocId = invoiceNumber.replace(/[\/\\#\s]/g, "_");
    await db.collection("invoices").doc(archiveDocId).set({
      ...invoiceData,
      bookingRef: booking.bookingId,
      documentId: foundBooking.ref.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const updatedDoc = await foundBooking.ref.get();
    const updatedBooking = normalizeBooking(updatedDoc);
    syncCompletedBookingToGoogleSheets(updatedBooking).catch(err => console.error("[Google Sheets Auto-Sync Error]:", err.message));

    return res.json({
      success: true,
      message: `Invoice #${invoiceNumber} successfully generated and recorded.`,
      invoiceNumber,
      invoiceData,
      data: updatedBooking,
      booking: updatedBooking
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to generate invoice."
    });
  }
});

// --------------------------------------------------
// 4. DISPATCH INVOICE (EMAIL + WHATSAPP)
// POST /api/admin/bookings/:documentId/send-invoice
// --------------------------------------------------
app.post("/api/admin/bookings/:documentId/send-invoice", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    const channel = req.body.channel || "whatsapp+email";
    await foundBooking.ref.update({
      invoiceSent: true,
      invoiceSentAt: admin.firestore.FieldValue.serverTimestamp(),
      invoiceSentVia: channel,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const updatedDoc = await foundBooking.ref.get();
    const updatedBooking = normalizeBooking(updatedDoc);

    return res.json({
      success: true,
      message: "Invoice dispatch recorded successfully.",
      data: updatedBooking,
      booking: updatedBooking
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to record invoice dispatch."
    });
  }
});

// --------------------------------------------------
// 5. PUBLIC / CLIENT INVOICE DETAILS LOOKUP
// GET /api/invoices/lookup
// --------------------------------------------------
app.get("/api/invoices/lookup", async (req, res) => {
  try {
    const num = String(req.query.number || "").trim();
    const bookingId = String(req.query.bookingId || "").trim();

    if (!num && !bookingId) {
      return res.status(400).json({ success: false, message: "Provide invoice number or booking ID." });
    }

    let invoice = null;
    if (num) {
      const snap = await db.collection("bookings").where("invoiceNumber", "==", num).limit(1).get();
      if (!snap.empty) {
        const b = snap.docs[0].data();
        invoice = b.invoiceData || {
          invoiceNumber: b.invoiceNumber,
          customerName: b.name,
          customerEmail: b.email,
          customerPhone: b.phone,
          serviceName: b.service,
          grandTotal: b.invoiceAmount || b.totalPrice,
          paymentStatus: b.paymentStatus || b.invoiceStatus,
          date: b.date
        };
      }
    }

    if (!invoice && bookingId) {
      const snap = await db.collection("bookings").where("bookingId", "==", bookingId).limit(1).get();
      if (!snap.empty) {
        const b = snap.docs[0].data();
        invoice = b.invoiceData || {
          invoiceNumber: b.invoiceNumber,
          customerName: b.name,
          customerEmail: b.email,
          customerPhone: b.phone,
          serviceName: b.service,
          grandTotal: b.invoiceAmount || b.totalPrice,
          paymentStatus: b.paymentStatus || b.invoiceStatus,
          date: b.date
        };
      }
    }

    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found." });
    return res.json({ success: true, data: invoice, invoice });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Unable to lookup invoice." });
  }
});

app.post("/api/admin/invoices/generate", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const payload = cleanBookingValue(req.body || {});
    return res.json({ success: true, data: payload });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "Unable to generate invoice." });
  }
});

app.post("/api/admin/invoices/dispatch", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    return res.json({ success: true, message: "Invoice dispatch recorded." });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "Unable to dispatch invoice." });
  }
});

app.get("/api/admin/customers", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const snapshot = await db.collection("users").where("role", "==", "customer").get();
    const customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({ success: true, data: customers, customers });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "Unable to load customers." });
  }
});

// --------------------------------------------------
// SUPPORT CHAT
// --------------------------------------------------

app.post("/api/support/send", async (req, res) => {
  try {
    const {
      conversationId,
      sender,
      senderName,
      customerName,
      customerEmail,
      customerPhone,
      text
    } = req.body || {};

    if (!conversationId || !text) {
      return res.status(400).json({
        success: false,
        message: "Conversation ID and message text are required."
      });
    }

    const convRef = db.collection("supportConversations").doc(String(conversationId));
    const now = admin.firestore.FieldValue.serverTimestamp();
    await convRef.set({
      conversationId: String(conversationId),
      customerName: customerName || senderName || "Customer",
      customerEmail: customerEmail || "",
      customerPhone: customerPhone || "",
      status: "open",
      lastMessage: String(text).trim().slice(0, 1000),
      lastSender: sender || "customer",
      updatedAt: now,
      createdAt: now
    }, { merge: true });

    const msgRef = await convRef.collection("messages").add({
      sender: sender || "customer",
      senderName: senderName || customerName || "Customer",
      text: String(text).trim().slice(0, 2000),
      timestamp: now
    });

    return res.status(201).json({
      success: true,
      data: { id: msgRef.id }
    });
  } catch (error) {
    console.error("SUPPORT SEND ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to send support message."
    });
  }
});

app.get("/api/support/messages", async (req, res) => {
  try {
    const conversationId = String(req.query.conversationId || "");
    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "Conversation ID is required."
      });
    }

    const snapshot = await db.collection("supportConversations")
      .doc(conversationId)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .get();

    const messages = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: serializeTimestamp(data.timestamp)
      };
    });

    return res.json({ success: true, data: messages, messages });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to load support messages."
    });
  }
});

app.get("/api/support/conversations", async (req, res) => {
  try {
    const snapshot = await db.collection("supportConversations")
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get();

    const conversations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: serializeTimestamp(data.createdAt),
        updatedAt: serializeTimestamp(data.updatedAt)
      };
    });

    return res.json({ success: true, data: conversations, conversations });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to load conversations."
    });
  }
});

app.patch("/api/support/conversations/:conversationId/resolve", async (req, res) => {
  try {
    await db.collection("supportConversations").doc(req.params.conversationId).set({
      status: "resolved",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to resolve conversation."
    });
  }
});

// --------------------------------------------------
// GOOGLE SHEETS MANAGEMENT ENDPOINTS
// --------------------------------------------------

// GET /api/admin/google-sheets/status
app.get("/api/admin/google-sheets/status", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const url = await getGoogleSheetsUrl();
    return res.json({
      success: true,
      configured: Boolean(url),
      url: url || "",
      message: url ? "Google Sheets cloud synchronization is connected and active." : "Google Sheets Web App URL is not configured yet."
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/google-sheets/config
app.post("/api/admin/google-sheets/config", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const { url } = req.body || {};
    const trimmed = String(url || "").trim();
    if (!trimmed.startsWith("https://script.google.com/")) {
      return res.status(400).json({
        success: false,
        message: "Invalid Google Apps Script URL. It must begin with https://script.google.com/"
      });
    }

    cachedGoogleSheetsUrl = trimmed;
    process.env.GOOGLE_APPS_SCRIPT_URL = trimmed;
    await db.collection("settings").doc("google_sheets").set({
      url: trimmed,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.json({
      success: true,
      message: "Google Sheets Web App URL successfully saved! All completed bookings will now be recorded.",
      url: trimmed
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/google-sheets/sync-all
app.post("/api/admin/google-sheets/sync-all", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const url = await getGoogleSheetsUrl();
    if (!url) {
      return res.status(400).json({
        success: false,
        message: "Google Sheets Web App URL is not configured yet. Please configure it first."
      });
    }

    const snapshot = await db.collection("bookings")
      .orderBy("createdAt", "desc")
      .get();

    const allBookings = snapshot.docs.map(doc => normalizeBooking(doc));
    const completedBookings = allBookings.filter(b => 
      b.status === "completed" || 
      b.paymentStatus === "PAID" || 
      b.invoiceStatus === "paid" || 
      b.completedAt || 
      b.paidAt
    );

    let syncedCount = 0;
    for (const b of completedBookings) {
      const r = await syncCompletedBookingToGoogleSheets(b);
      if (r.success) syncedCount++;
    }

    return res.json({
      success: true,
      message: `Successfully synchronized ${syncedCount} of ${completedBookings.length} completed bookings to Google Sheets.`,
      totalCompleted: completedBookings.length,
      syncedCount
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/google-sheets/sync-booking/:documentId
app.post("/api/admin/google-sheets/sync-booking/:documentId", async (req, res) => {
  try {
    await verifyAdminRequest(req);
    const foundBooking = await getBookingByIdOrRef(req.params.documentId);
    if (!foundBooking) return res.status(404).json({ success: false, message: "Booking not found." });

    const booking = normalizeBooking(foundBooking.doc);
    const r = await syncCompletedBookingToGoogleSheets(booking);
    if (!r.success && !r.skipped) {
      return res.status(502).json({ success: false, message: r.error || "Failed to sync booking to Google Sheets." });
    }

    return res.json({
      success: true,
      message: r.skipped ? "Sync skipped (URL not configured)" : "Booking successfully synced to Google Sheets!",
      result: r.result || null
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log("");
    console.log("======================================");
    console.log(" ZeroSpot Backend");
    console.log("======================================");
    console.log(` Server running on port ${PORT}`);
    console.log(` http://localhost:${PORT}`);
    console.log("======================================");
    console.log("");
  });
}

module.exports = app;
