const PincodeMapping = require("../models/PincodeMapping");
const { normalizePincode } = require("../services/pincodeMappingService");

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = String(req.query.search || "").replace(/\D/g, "").slice(0, 6);

    const query = {};
    if (search) query.pincode = new RegExp(`^${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      PincodeMapping.find(query).sort({ pincode: 1 }).skip(skip).limit(limit).lean(),
      PincodeMapping.countDocuments(query),
    ]);

    res.json({
      success: true,
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    next(err);
  }
};

exports.getOne = async (req, res, next) => {
  try {
    const pincode = normalizePincode(req.params.pincode);
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ error: "Invalid pincode (6 digits required)" });
    }
    const mapping = await PincodeMapping.findOne({ pincode }).lean();
    if (!mapping) return res.status(404).json({ error: "Pincode mapping not found" });
    res.json({ success: true, mapping });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { pincode, vidhanSabhaAC, lokSabhaPC, state } = req.body;
    const pc = normalizePincode(pincode);
    if (!/^\d{6}$/.test(pc)) {
      return res.status(400).json({ error: "pincode must be 6 digits" });
    }
    if (!vidhanSabhaAC || !lokSabhaPC) {
      return res.status(400).json({ error: "vidhanSabhaAC and lokSabhaPC are required" });
    }

    const mapping = await PincodeMapping.create({
      pincode: pc,
      vidhanSabhaAC: String(vidhanSabhaAC).trim(),
      lokSabhaPC: String(lokSabhaPC).trim(),
      state: String(state || "").trim(),
    });

    res.status(201).json({ success: true, mapping });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "This pincode already exists" });
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const pincode = normalizePincode(req.params.pincode);
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ error: "Invalid pincode (6 digits required)" });
    }

    const { vidhanSabhaAC, lokSabhaPC, state } = req.body;
    const updates = {};
    if (vidhanSabhaAC !== undefined) updates.vidhanSabhaAC = String(vidhanSabhaAC).trim();
    if (lokSabhaPC !== undefined) updates.lokSabhaPC = String(lokSabhaPC).trim();
    if (state !== undefined) updates.state = String(state).trim();

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Provide at least one of vidhanSabhaAC, lokSabhaPC, state" });
    }

    const mapping = await PincodeMapping.findOneAndUpdate(
      { pincode },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!mapping) return res.status(404).json({ error: "Pincode mapping not found" });
    res.json({ success: true, mapping });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const pincode = normalizePincode(req.params.pincode);
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ error: "Invalid pincode (6 digits required)" });
    }

    const mapping = await PincodeMapping.findOneAndDelete({ pincode }).lean();
    if (!mapping) return res.status(404).json({ error: "Pincode mapping not found" });

    res.json({ success: true, deleted: true, pincode });
  } catch (err) {
    next(err);
  }
};
