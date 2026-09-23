

require("dotenv").config();
const mongoose = require("mongoose");

async function fixIndexes() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("ERROR: MONGODB_URI .env mein set nahi hai");
    process.exit(1);
  }

  console.log("MongoDB se connect ho raha hai...");
  await mongoose.connect(uri);
  console.log("Connected!");

  const db = mongoose.connection.db;
  const collection = db.collection("elections");

  // Existing indexes dekho
  const indexes = await collection.indexes();
  console.log("\nExisting indexes on 'elections' collection:");
  indexes.forEach(idx => console.log(" -", idx.name, "| keys:", JSON.stringify(idx.key), "| unique:", !!idx.unique, "| sparse:", !!idx.sparse));

  // Stale indexes jo drop karne hain
  const toDrop = ["contractElectionId_1"];

  for (const indexName of toDrop) {
    const exists = indexes.find(i => i.name === indexName);
    if (exists) {
      try {
        await collection.dropIndex(indexName);
        console.log(`\n✓ Dropped stale index: ${indexName}`);
      } catch (err) {
        console.error(`✗ Failed to drop ${indexName}:`, err.message);
      }
    } else {
      console.log(`\n- Index "${indexName}" nahi mila (already clean)`);
    }
  }

  // Verify
  const afterIndexes = await collection.indexes();
  console.log("\nIndexes after fix:");
  afterIndexes.forEach(idx => console.log(" -", idx.name));

  await mongoose.disconnect();
  console.log("\nDone! Ab election create karo — duplicate key error nahi aayega.");
}

fixIndexes().catch(err => {
  console.error("Script failed:", err.message);
  process.exit(1);
});