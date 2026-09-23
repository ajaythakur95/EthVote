const axios = require("axios");

const IDFY_ENDPOINT = "https://eve.idfy.com/v3/tasks/sync/verify/voter_id";
const EPIC_NOT_FOUND_MESSAGE = "EPIC not found in Election Commission records";

function buildEpicNotFoundError() {
  const err = new Error(EPIC_NOT_FOUND_MESSAGE);
  err.status = 422;
  err.code = "IDFY_EPIC_NOT_FOUND";
  return err;
}

function normalizeEpic(epicNumber) {
  return String(epicNumber || "").trim().toUpperCase();
}

function toGuidLikeSeed() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function deepFindFirstString(obj, candidateKeys = []) {
  const targetKeys = new Set(candidateKeys.map((k) => String(k).toLowerCase()));
  const queue = [obj];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== "object") continue;

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }

    for (const [key, value] of Object.entries(node)) {
      if (
        targetKeys.has(String(key).toLowerCase()) &&
        typeof value === "string" &&
        value.trim()
      ) {
        return value.trim();
      }
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return "";
}

function normalizeDateString(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const nums = raw.match(/\d+/g);
  if (!nums || nums.length < 3) return "";

  let day = "";
  let month = "";
  let year = "";

  if (nums[0].length === 4) {
    [year, month, day] = nums;
  } else if (nums[2].length === 4) {
    [day, month, year] = nums;
  } else {
    return "";
  }

  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d) ||
    y < 1900 ||
    y > 2100 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {
    return "";
  }

  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalizeGender(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "M" || raw === "MALE") return "M";
  if (raw === "F" || raw === "FEMALE") return "F";
  if (raw === "T" || raw === "TG" || raw === "TRANSGENDER" || raw === "OTHER" || raw === "O") {
    return "T";
  }
  return raw;
}

async function verifyEpicWithIdfy(epicNumber) {
  const apiKey = String(process.env.IDFY_API_KEY || "").trim();
  const accountId = String(process.env.IDFY_ACCOUNT_ID || "").trim();
  const normalizedEpic = normalizeEpic(epicNumber);

  if (!normalizedEpic) {
    throw buildEpicNotFoundError();
  }
  if (!apiKey || !accountId) {
    const err = new Error("IDFY_API_KEY and IDFY_ACCOUNT_ID must be configured");
    err.status = 500;
    err.code = "IDFY_CONFIG_MISSING";
    throw err;
  }

  try {
    const payload = {
      task_id: `epic-${toGuidLikeSeed()}`,
      group_id: `ethvote-${toGuidLikeSeed()}`,
      data: {
        id_number: normalizedEpic,
        epic_number: normalizedEpic,
      },
    };

    const response = await axios.post(IDFY_ENDPOINT, payload, {
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
        "account-id": accountId,
      },
      timeout: 15000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw buildEpicNotFoundError();
    }

    const body = response.data || {};

    const assemblyConstituency = deepFindFirstString(body, [
      "assembly_constituency",
      "assemblyConstituency",
      "assembly",
      "ac",
      "ac_name",
    ]);
    const parliamentaryConstituency = deepFindFirstString(body, [
      "parliamentary_constituency",
      "parliamentaryConstituency",
      "parliamentary",
      "pc",
      "pc_name",
    ]);
    const state = deepFindFirstString(body, ["state", "state_name"]);
    const district = deepFindFirstString(body, ["district", "district_name"]);
    const voterName = deepFindFirstString(body, [
      "name",
      "full_name",
      "voter_name",
      "elector_name",
      "epic_name",
      "applicant_name",
    ]);
    const dobRaw = deepFindFirstString(body, [
      "dob",
      "date_of_birth",
      "dateofbirth",
      "birth_date",
      "voter_dob",
    ]);
    const genderRaw = deepFindFirstString(body, ["gender", "sex"]);
    const dateOfBirth = normalizeDateString(dobRaw);
    const gender = normalizeGender(genderRaw);

    if (!assemblyConstituency || !parliamentaryConstituency || !state || !district) {
      throw buildEpicNotFoundError();
    }

    return {
      epicNumber: normalizedEpic,
      assembly_constituency: assemblyConstituency,
      parliamentary_constituency: parliamentaryConstituency,
      state,
      district,
      name: voterName,
      dateOfBirth,
      gender,
    };
  } catch (error) {
    if (error.code === "IDFY_EPIC_NOT_FOUND") throw error;
    if (axios.isAxiosError?.(error)) {
      throw buildEpicNotFoundError();
    }
    throw error;
  }
}

module.exports = {
  verifyEpicWithIdfy,
  EPIC_NOT_FOUND_MESSAGE,
};