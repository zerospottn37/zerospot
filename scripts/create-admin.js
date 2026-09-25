const path = require("path");
const fs = require("fs");

// Support loading dependencies from backend/node_modules if not installed at root
const backendModules = path.join(__dirname, "..", "backend", "node_modules");
if (fs.existsSync(backendModules) && !module.paths.includes(backendModules)) {
  module.paths.push(backendModules);
}

const envPath = fs.existsSync(path.join(__dirname, "..", "backend", ".env"))
  ? path.join(__dirname, "..", "backend", ".env")
  : (fs.existsSync(path.join(__dirname, "..", ".env"))
    ? path.join(__dirname, "..", ".env")
    : path.join(__dirname, ".env"));
require("dotenv").config({ path: envPath });

const admin = require("firebase-admin");

const serviceAccountPath = fs.existsSync(path.join(__dirname, "..", "backend", "serviceAccountKey.json"))
  ? path.join(__dirname, "..", "backend", "serviceAccountKey.json")
  : (fs.existsSync(path.join(__dirname, "..", "serviceAccountKey.json"))
    ? path.join(__dirname, "..", "serviceAccountKey.json")
    : path.join(__dirname, "serviceAccountKey.json"));
const serviceAccount = require(serviceAccountPath);

const email = (process.env.ADMIN_EMAIL || "admin@zerospot.in").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!password) {
  console.error("ADMIN_PASSWORD is required in .env");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  try {
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
      user = await admin.auth().updateUser(user.uid, {
        password,
        disabled: false,
        emailVerified: true,
        displayName: "ZeroSpot Admin"
      });
      console.log("Updated existing admin Firebase account:", user.uid);
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
      user = await admin.auth().createUser({
        email,
        password,
        emailVerified: true,
        displayName: "ZeroSpot Admin"
      });
      console.log("Created admin Firebase account:", user.uid);
    }

    await db.collection("users").doc(user.uid).set({
      uid: user.uid,
      email,
      name: "ZeroSpot Admin",
      role: "admin",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log("Admin role saved successfully.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await admin.app().delete();
  }
})();
