

const csv = require("csv-parse/sync");
const Candidate = require("../models/Candidate");
const Election = require("../models/Election");
const User = require("../models/User");
const { getAdminHierarchyRole } = require("../utils/adminHierarchy");

const REQUIRED_COLS = ["name", "partyName", "constituency", "state", "district", "candidateRole"];
const VALID_ROLES = ["PM", "CM", "MP", "MLA"];
const MAX_ROWS = 500;

function normalizeRow(raw) {
  const row = {};
  for (const key of Object.keys(raw)) {
    row[key.trim().toLowerCase()] = String(raw[key] || "").trim();
  }
  return row;
}

function validateRow(row, idx) {
  const errors = [];

  for (const col of REQUIRED_COLS) {
    if (!row[col]) errors.push(`Column '${col}' required hai`);
  }

  if (row.candidaterole && !VALID_ROLES.includes(row.candidaterole?.toUpperCase())) {
    errors.push(`candidateRole must be one of: ${VALID_ROLES.join(", ")}`);
  }

  if (["CM", "MLA"].includes(row.candidaterole?.toUpperCase()) && !row.state) {
    errors.push("state required hai CM/MLA ke liye");
  }
  if (["MP", "MLA"].includes(row.candidaterole?.toUpperCase()) && !row.district) {
    errors.push("district required hai MP/MLA ke liye");
  }

  return errors;
}

exports.bulkUploadCandidates = async (req, res, next) => {
  try {
    // Sirf admin/superadmin
    const hierarchyRole = getAdminHierarchyRole(req.user);
    if (!["National", "State", "District"].includes(hierarchyRole)) {
      return res.status(403).json({ error: "Only admins can bulk upload candidates" });
    }

    const { electionId } = req.body;
    if (!electionId) return res.status(400).json({ error: "electionId required hai" });

    const election = await Election.findById(electionId);
    if (!election) return res.status(404).json({ error: "Election nahi mili" });

    if (!["CREATED", "ACTIVE"].includes(election.status)) {
      return res.status(400).json({ error: "Is election mein candidate registration band hai" });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "CSV file upload karo (field name: csv)" });
    }

    // CSV parse karo
    let rawRows;
    try {
      rawRows = csv.parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });
    } catch (e) {
      return res.status(400).json({ error: `CSV parse error: ${e.message}` });
    }

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ error: "CSV mein koi data nahi hai" });
    }

    if (rawRows.length > MAX_ROWS) {
      return res.status(400).json({
        error: `Ek baar mein maximum ${MAX_ROWS} candidates upload ho sakte hain. Aapki CSV mein ${rawRows.length} rows hain.`,
      });
    }

    // Headers check
    const firstRow = normalizeRow(rawRows[0]);
    const missingCols = REQUIRED_COLS.filter((c) => !(c in firstRow));
    if (missingCols.length > 0) {
      return res.status(400).json({
        error: `CSV mein required columns nahi hain: ${missingCols.join(", ")}`,
        expectedFormat: "name,partyName,constituency,state,district,candidateRole,manifesto",
      });
    }

    const successRows = [];
    const errorRows = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = normalizeRow(rawRows[i]);
      const rowNum = i + 2; // 1-indexed + header row

      const errors = validateRow(row, rowNum);
      if (errors.length > 0) {
        errorRows.push({ row: rowNum, name: row.name || `Row ${rowNum}`, errors });
        continue;
      }

      // Existing duplicate check
      const alreadyExists = await Candidate.findOne({
        election: electionId,
        name: row.name,
        partyName: row.partyname || row.partyName,
      });
      if (alreadyExists) {
        errorRows.push({
          row: rowNum,
          name: row.name,
          errors: [`'${row.name}' (${row.partyname || row.partyName}) already exists in this election`],
        });
        continue;
      }

      try {
        const candidate = await Candidate.create({
          election: electionId,
          user: req.user._id,       // admin as placeholder user
          name: row.name,
          partyName: row.partyname || row.partyName || "Independent",
          constituency: row.constituency,
          state: row.state || "",
          district: row.district || "",
          candidateRole: (row.candidaterole || row.candidateRole || "MP").toUpperCase(),
          manifesto: row.manifesto || "",
          status: "APPROVED",        // Bulk upload = pre-approved (admin action)
          verificationStatus: "Verified",
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
        });
        successRows.push({ row: rowNum, name: candidate.name, candidateId: candidate._id });
      } catch (dbErr) {
        errorRows.push({
          row: rowNum,
          name: row.name,
          errors: [`Database error: ${dbErr.message}`],
        });
      }
    }

    res.status(201).json({
      success: true,
      summary: {
        total: rawRows.length,
        uploaded: successRows.length,
        failed: errorRows.length,
      },
      uploaded: successRows,
      errors: errorRows,
    });
  } catch (error) {
    next(error);
  }
};