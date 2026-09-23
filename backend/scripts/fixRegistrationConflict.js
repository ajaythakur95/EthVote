

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const { ethers } = require("ethers");

const User = require("../models/User");
const blockchainService = require("../services/blockchainService");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i++;
  }
  return args;
}

function normalizeWalletAddress(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  try {
    return ethers.getAddress(trimmed).toLowerCase();
  } catch {
    throw new Error("Invalid wallet address. Use a valid 0x... address.");
  }
}

function normalizeAadhaarHash(value) {
  return String(value || "").trim().toLowerCase();
}

function printUser(prefix, user) {
  if (!user) {
    console.log(`${prefix}: not found`);
    return;
  }
  console.log(`${prefix}:`);
  console.log(`  id: ${user._id}`);
  console.log(`  role: ${user.role}`);
  console.log(`  name: ${user.name}`);
  console.log(`  verificationStatus: ${user.verificationStatus}`);
  console.log(`  walletAddress: ${user.walletAddress || "-"}`);
  console.log(`  aadhaarHash: ${user.aadhaarHash || "-"}`);
  console.log(`  registrationPath: ${user.registrationPath || "-"}`);
  console.log(`  createdAt: ${user.createdAt}`);
  console.log(`  updatedAt: ${user.updatedAt}`);
}

async function connectMongoIfNeeded(shouldConnect) {
  if (!shouldConnect) return false;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing in backend/.env");
  await mongoose.connect(uri);
  return true;
}

async function inspectMongo(wallet, aadhaarHash) {
  const byWallet = wallet ? await User.findOne({ walletAddress: wallet }) : null;
  const byAadhaar = aadhaarHash ? await User.findOne({ aadhaarHash }) : null;

  printUser("Mongo by wallet", byWallet);
  if (aadhaarHash) printUser("Mongo by aadhaarHash", byAadhaar);

  return { byWallet, byAadhaar };
}

async function inspectChain(wallet, aadhaarHash) {
  await blockchainService.init();
  const contract = blockchainService.voterIdentityContract;

  let tokenId = 0n;
  if (wallet) {
    tokenId = await contract.walletToTokenId(wallet);
    console.log(`Chain walletToTokenId: ${tokenId.toString()}`);
  }

  if (aadhaarHash) {
    if (!ethers.isHexString(aadhaarHash, 32)) {
      console.log("Chain isAadhaarRegistered: skipped (aadhaarHash is not 32-byte hex)");
    } else {
      const isRegistered = await contract.isAadhaarRegistered(aadhaarHash);
      console.log(`Chain isAadhaarRegistered: ${isRegistered}`);
    }
  }

  if (wallet && tokenId !== 0n) {
    const voter = await contract.getVoterByWallet(wallet);
    console.log("Chain voter record:");
    console.log(`  tokenId: ${voter.tokenId.toString()}`);
    console.log(`  wallet: ${voter.wallet}`);
    console.log(`  aadhaarHash: ${voter.aadhaarHash}`);
    console.log(`  status(enum): ${voter.status.toString()}`);
    console.log(`  metadataURI: ${voter.metadataURI}`);
  }

  return { tokenId };
}

async function revokeOnChain({ wallet, explicitTokenId, reason }) {
  await blockchainService.init();
  const contract = blockchainService.voterIdentityContract;

  let tokenId;
  if (explicitTokenId) {
    tokenId = BigInt(explicitTokenId);
  } else if (wallet) {
    tokenId = await contract.walletToTokenId(wallet);
  } else {
    throw new Error("Provide --wallet or --tokenId for --revoke-chain");
  }

  if (!tokenId || tokenId === 0n) {
    console.log("Revoke skipped: wallet/tokenId is not registered on-chain.");
    return;
  }

  const revokeReason = String(reason || "Registration conflict cleanup");
  const receipt = await blockchainService.revokeVoterIdentity(tokenId, revokeReason);
  console.log("On-chain revoke successful:");
  console.log(`  tokenId: ${tokenId.toString()}`);
  console.log(`  txHash: ${receipt.txHash}`);
  console.log(`  blockNumber: ${receipt.blockNumber}`);
}

async function deleteMongoRecords({ wallet, aadhaarHash, force, includeAllRoles }) {
  if (!force) {
    throw new Error("Refusing delete without --force. Add --force to proceed.");
  }

  const query = {};
  if (wallet) query.walletAddress = wallet;
  if (aadhaarHash) query.aadhaarHash = aadhaarHash;
  if (!includeAllRoles) query.role = "voter";

  if (!query.walletAddress && !query.aadhaarHash) {
    throw new Error("Provide --wallet or --aadhaarHash with --delete-mongo");
  }

  const matched = await User.find(query).select("_id role name walletAddress aadhaarHash");
  if (!matched.length) {
    console.log("Mongo delete: no matching records.");
    return;
  }

  console.log("Mongo delete targets:");
  for (const doc of matched) {
    console.log(`  ${doc._id} | role=${doc.role} | name=${doc.name} | wallet=${doc.walletAddress || "-"} | aadhaarHash=${doc.aadhaarHash || "-"}`);
  }

  const result = await User.deleteMany(query);
  console.log(`Mongo delete done. Deleted count: ${result.deletedCount}`);
}

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/fixRegistrationConflict.js --wallet <0x...> [--aadhaarHash <0x...>]");
  console.log("  node scripts/fixRegistrationConflict.js --wallet <0x...> --revoke-chain [--reason \"...\"]");
  console.log("  node scripts/fixRegistrationConflict.js --wallet <0x...> --delete-mongo --force [--include-all-roles]");
  console.log("Options:");
  console.log("  --wallet <0x...>           Wallet address");
  console.log("  --aadhaarHash <hash>       Aadhaar hash (DB hash or 32-byte chain hash)");
  console.log("  --revoke-chain             Revoke on-chain voter identity");
  console.log("  --tokenId <id>             Explicit tokenId for chain revoke");
  console.log("  --reason \"text\"            Reason for chain revoke");
  console.log("  --delete-mongo             Delete matching Mongo records");
  console.log("  --include-all-roles        Delete all roles (default: only role=voter)");
  console.log("  --force                    Required for delete");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const wallet = normalizeWalletAddress(args.wallet);
  const aadhaarHash = normalizeAadhaarHash(args.aadhaarHash);
  const wantsChain = !!args["revoke-chain"] || !!wallet || !!aadhaarHash;
  const wantsMongo = !!wallet || !!aadhaarHash || !!args["delete-mongo"];

  if (!wallet && !aadhaarHash && !args["tokenId"]) {
    printUsage();
    throw new Error("Provide at least --wallet or --aadhaarHash.");
  }

  let mongoConnected = false;
  try {
    mongoConnected = await connectMongoIfNeeded(wantsMongo);

    console.log("=== Inspecting registration state ===");
    if (mongoConnected) {
      await inspectMongo(wallet, aadhaarHash);
    } else {
      console.log("Mongo inspect skipped.");
    }

    if (wantsChain) {
      try {
        await inspectChain(wallet, aadhaarHash);
      } catch (chainErr) {
        console.log(`Chain inspect failed: ${chainErr.message}`);
      }
    }

    if (args["revoke-chain"]) {
      await revokeOnChain({
        wallet,
        explicitTokenId: args.tokenId,
        reason: args.reason,
      });
    }

    if (args["delete-mongo"]) {
      if (!mongoConnected) {
        throw new Error("Mongo connection required for --delete-mongo");
      }
      await deleteMongoRecords({
        wallet,
        aadhaarHash,
        force: !!args.force,
        includeAllRoles: !!args["include-all-roles"],
      });
    }

    console.log("=== Done ===");
  } finally {
    if (mongoConnected) {
      await mongoose.disconnect();
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});