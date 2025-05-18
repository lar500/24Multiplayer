// scripts/migrate-leaderboard.js

/**
 * Run with:
 *   npm install firebase-admin
 *   node scripts/migrate-leaderboard.js
 *
 * Make sure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 * and FIREBASE_DATABASE_URL are set in your environment.
 */

import admin from "firebase-admin";

// Init Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // restore newlines in the key
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();
const rootRef = db.ref("leaderboard");

async function migrate() {
  console.log("📥 Reading existing /leaderboard entries…");
  const snapshot = await rootRef.once("value");
  const data = snapshot.val() || {};

  for (const key of Object.keys(data)) {
    const node = data[key];

    // Case A: node is a record itself (has totalTime)
    if (node && typeof node === "object" && "totalTime" in node) {
      console.log(`• Re-pushing flat record from /${key}`);
      await rootRef.push(node);
      await rootRef.child(key).remove();
    }
    // Case B: node is an object of pushed children
    else if (node && typeof node === "object") {
      console.log(`• Flattening nested under /${key}…`);
      for (const childKey of Object.keys(node)) {
        const record = node[childKey];
        if (record && typeof record === "object" && "totalTime" in record) {
          console.log(`    – pushing child /${key}/${childKey}`);
          await rootRef.push(record);
        }
        // remove the nested child
        await rootRef.child(`${key}/${childKey}`).remove();
      }
      // remove the now-empty parent key
      await rootRef.child(key).remove();
    } else {
      console.warn(`• Unexpected format at /leaderboard/${key}, skipping.`);
    }
  }

  console.log("✅ Migration complete!");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
