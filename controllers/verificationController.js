const axios = require("axios");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const fastcsv = require("fast-csv");
const XLSX = require("xlsx");
const supabase = require("../config/supabase");
const { COST_PER_VERIFICATION, DEBUG_DIR } = require("../config/constants");
const { formatPhone, localVerify } = require("../utils/phone");

let Numlookup;
async function getNumlookup() {
    if (Numlookup) return Numlookup;
    try {
        const module = await import("@everapi/numlookupapi-js");
        Numlookup = module.default;
        return Numlookup;
    } catch (err) {
        console.error("Failed to load Numlookup API module:", err);
        return null;
    }
}

// Pre-load
getNumlookup();

// Vercel friendly debug helper
function saveToDebug(fileName, content) {
  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
    }
    const filePath = path.join(DEBUG_DIR, fileName);
    fs.writeFileSync(filePath, content);
  } catch (err) {
    console.warn(`[Debug] Failed to save ${fileName}:`, err.message);
  }
}

let globalSettings = {
  verificationMode: "hybrid",
};

const getVerificationMode = (req, res) => {
  res.json({ mode: globalSettings.verificationMode });
};

const setVerificationMode = (req, res) => {
  const { mode } = req.body;
  if (!["api", "hybrid", "local"].includes(mode)) return res.status(400).json({ message: "Invalid mode" });
  globalSettings.verificationMode = mode;
  res.json({ success: true, mode });
};

const verifyNumber = async (req, res) => {
  const { userId, number } = req.body;

  const { data: userData, error } = await supabase
    .from("user_limits")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !userData) return res.status(404).json({ message: "User not found" });

  if (userData.used >= userData.limit) {
    return res.status(403).json({ message: "Limit exceeded" });
  }

  try {
    const apiRes = await axios.get(
      `http://apilayer.net/api/validate?access_key=${process.env.NUMVERIFY_API_KEY}&number=${number}`
    );

    if (!apiRes.data.valid) {
      return res.status(400).json({ message: "Invalid number" });
    }

    const lineType = apiRes.data.line_type;
    const newBalance = (userData.usdt_balance || 0) - COST_PER_VERIFICATION;
    
    await supabase
      .from("user_limits")
      .update({
        usdt_balance: newBalance,
        used: (userData.used || 0) + 1
      })
      .eq("id", userId);

    res.json({
      message: `Number ${number} verified`,
      lineType,
      carrier: apiRes.data.carrier,
      country: apiRes.data.country_name,
      used: (userData.used || 0) + 1,
      newBalance
    });
  } catch (err) {
    res.status(500).json({ message: "Error verifying number", error: err.message });
  }
};

const uploadCsv = async (req, res) => {
  const { userId, countryCode } = req.body;
  const defaultCountryCode = countryCode || "+1";

  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const filePath = req.file.path;
  const ext = req.file.originalname.split(".").pop().toLowerCase();

  const { data: userData, error } = await supabase
    .from("user_limits")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !userData) return res.status(404).json({ message: "User not found" });
  if (userData.used >= userData.max_limit)
    return res.status(403).json({ message: "Limit exceeded" });

  let numbers = [];

  try {
    if (ext === "csv") {
        numbers = await new Promise((resolve, reject) => {
          const arr = [];
          fs.createReadStream(filePath)
            .pipe(csv({ headers: false }))
            .on("data", (row) => {
              let phone = row[Object.keys(row)[0]];
              if (typeof phone === "number") phone = phone.toFixed(0);
              if (typeof phone === "string" && phone.includes("E")) {
                const num = Number(phone);
                if (!isNaN(num)) phone = num.toFixed(0);
              }
              arr.push(phone);
            })
            .on("end", () => resolve(arr))
            .on("error", reject);
        });
      }
      else if (ext === "xlsx" || ext === "xls") {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    
        numbers = sheet.map((row, i) => {
          let phone = row[0];
          if (i === 0 && (phone === null || phone === undefined || isNaN(Number(phone)))) {
            return null;
          }
          if (typeof phone === "number") phone = phone.toFixed(0);
          if (typeof phone === "string" && phone.includes("E")) {
            const num = Number(phone);
            if (!isNaN(num)) phone = num.toFixed(0);
          }
          return phone ? phone.toString().trim() : null;
        }).filter(Boolean);
      } else if (ext === "txt") {
        const content = fs.readFileSync(filePath, "utf8");
        numbers = content.split(/\r?\n/).map((line, i) => {
          const phone = line.trim();
          if (i === 0 && isNaN(Number(phone))) return null;
          return phone;
        }).filter(Boolean);
      } else {
        return res.status(400).json({ message: "Unsupported file type. Use CSV, XLSX, or TXT." });
      }
  } catch (err) {
      return res.status(500).json({ message: "Processing failed", error: err.message });
  }

  const uniqueNumbers = [...new Set(numbers.filter(n => n).map(n => n.toString().trim()).filter(n => !isNaN(Number(n))))];
  const duplicates = numbers.length - uniqueNumbers.length;
  const estimatedCost = uniqueNumbers.length * COST_PER_VERIFICATION;

  if (userData.usdt_balance < estimatedCost) {
    return res.status(403).json({
      message: `Insufficient balance. Required: ${estimatedCost.toFixed(4)} USDT, Available: ${userData.usdt_balance.toFixed(4)} USDT`
    });
  }

  const NumlookupLib = await getNumlookup();
  const clients = NumlookupLib ? [
    process.env.NUMLOOKUP_API_KEY_1,
    process.env.NUMLOOKUP_API_KEY_2,
    process.env.NUMLOOKUP_API_KEY_3,
    process.env.NUMLOOKUP_API_KEY_4,
  ].filter(Boolean).map(key => new NumlookupLib(key)) : [];

  let apiIndex = 0;

  async function validatePhone(phone) {
    if (clients.length === 0) return null;
    const client = clients[apiIndex % clients.length];
    apiIndex++;
    try {
      return await client.validate(phone);
    } catch (err) {
      return null;
    }
  }

  const batchSize = 50;
  let verifiedRows = [];
  let processed = 0;

  for (let i = 0; i < uniqueNumbers.length; i += batchSize) {
    const batch = uniqueNumbers.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (phone) => {
      const formattedPhone = formatPhone(phone, defaultCountryCode);
      const apiRes = await validatePhone(formattedPhone);

      if (apiRes && apiRes.valid) {
        processed++;
        return {
          number: apiRes.number || formattedPhone,
          valid: apiRes.valid || false,
          local_format: apiRes.local_format || "",
          international_format: apiRes.international_format || "",
          country_code: apiRes.country_code || "",
          country_name: apiRes.country_name || "",
          location: apiRes.location || "",
          carrier: apiRes.carrier || "",
          line_type: apiRes.line_type || "",
        };
      }
      return null;
    }));
    verifiedRows.push(...results.filter(Boolean));
  }

  const totalCost = processed * COST_PER_VERIFICATION;
  await supabase.from("user_limits").update({ usdt_balance: userData.usdt_balance - totalCost }).eq("id", userId);

  const { data: saved } = await supabase.from("verification_history").insert([{
    user_id: userId,
    total_uploaded: numbers.length,
    duplicates,
    unique_count: uniqueNumbers.length,
    verified_count: processed,
    created_at: new Date(),
  }]).select("id");

  const csvString = await new Promise((resolve, reject) => {
    fastcsv.writeToString(verifiedRows, { headers: true }).then(resolve).catch(reject);
  });

  const fileName = `output-${Date.now()}.csv`;
  const { error: storageError } = await supabase.storage.from("csv-outputs").upload(`verified/${fileName}`, Buffer.from(csvString), {
    contentType: "text/csv",
    upsert: true,
  });

  if (storageError) return res.status(500).json({ message: "Failed to upload file to storage" });

  const { data: publicData } = supabase.storage.from("csv-outputs").getPublicUrl(`verified/${fileName}`);
  await supabase.from("verification_history").update({ file_path: publicData.publicUrl }).eq("id", saved[0].id);

  res.json({
    message: "Verification completed",
    total_uploaded: numbers.length,
    duplicates,
    unique_count: uniqueNumbers.length,
    verified_count: processed,
    fileUrl: publicData.publicUrl,
  });
};

const verifyBatch = async (req, res) => {
  const { userId, numbers, countryCode } = req.body;
  const defaultCountryCode = countryCode || "+1";

  if (!userId || !numbers || !Array.isArray(numbers)) {
    return res.status(400).json({ message: "userId and numbers (array) required" });
  }

  try {
    const { data: userData } = await supabase.from("user_limits").select("*").eq("id", userId).single();
    if (!userData) return res.status(404).json({ message: "User not found" });

    const totalCost = numbers.length * COST_PER_VERIFICATION;
    if (userData.usdt_balance < totalCost) return res.status(403).json({ message: "Insufficient balance" });

    const NumlookupLib = await getNumlookup();
    const clients = NumlookupLib ? [
      process.env.NUMLOOKUP_API_KEY_1,
      process.env.NUMLOOKUP_API_KEY_2,
      process.env.NUMLOOKUP_API_KEY_3,
      process.env.NUMLOOKUP_API_KEY_4,
    ].filter(Boolean).map(key => new NumlookupLib(key)) : [];

    let apiIndex = 0;

    const results = await Promise.all(numbers.map(async (phone) => {
      let formatted = String(phone).replace(/\D/g, "");
      if (formatted.length === 10) formatted = `${defaultCountryCode.replace("+", "")}${formatted}`;
      if (!formatted.startsWith("+")) formatted = `+${formatted}`;

      if (globalSettings.verificationMode === "local") return localVerify(formatted, defaultCountryCode.replace("+", ""));

      if (clients.length === 0) {
        if (globalSettings.verificationMode === "hybrid") return localVerify(formatted, defaultCountryCode.replace("+", ""));
        return null;
      }

      const client = clients[apiIndex % clients.length];
      apiIndex++;

      try {
        const apiRes = await client.validate(formatted);
        if (apiRes && apiRes.valid) return apiRes;
        if (globalSettings.verificationMode === "hybrid") return localVerify(formatted, defaultCountryCode.replace("+", ""));
        return null;
      } catch (err) {
        if (globalSettings.verificationMode === "hybrid") return localVerify(formatted, defaultCountryCode.replace("+", ""));
        return null;
      }
    }));

    const verifiedOnes = results.filter(Boolean);
    const costToDeduct = verifiedOnes.length * COST_PER_VERIFICATION;

    if (costToDeduct > 0) {
      await supabase.from("user_limits").update({ usdt_balance: userData.usdt_balance - costToDeduct }).eq("id", userId);
    }

    res.json({ success: true, results: verifiedOnes, count: verifiedOnes.length });
  } catch (err) {
    res.status(500).json({ message: "Batch processing failed" });
  }
};

const finalizeVerification = async (req, res) => {
  const { userId, verifiedFilePath, totalUploaded, uniqueCount, verifiedCount, unverifiedFilePath } = req.body;

  if (!userId || !verifiedFilePath) return res.status(400).json({ message: "Missing data" });

  try {
    const { data: saved } = await supabase.from("verification_history").insert([{
      user_id: userId,
      total_uploaded: totalUploaded || 0,
      unique_count: uniqueCount || 0,
      verified_count: verifiedCount || 0,
      file_path: verifiedFilePath,
      unverified_file_path: unverifiedFilePath,
      created_at: new Date(),
    }]).select("id");

    saveToDebug(`${Date.now()}-summary.json`, JSON.stringify({ userId, totalUploaded, uniqueCount, verifiedCount, verifiedFilePath, unverifiedFilePath, timestamp: new Date().toISOString() }, null, 2));

    res.json({ success: true, fileUrl: verifiedFilePath, historyId: saved?.[0]?.id });
  } catch (err) {
    res.status(500).json({ message: "Finalization failed" });
  }
};

const getUploadUrl = async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ message: "fileName is required" });

  try {
    const { data, error } = await supabase.storage.from("csv-outputs").createSignedUploadUrl(`unverified/${Date.now()}-${fileName}`);
    if (error) throw error;

    const { data: publicData } = supabase.storage.from("csv-outputs").getPublicUrl(data.path);
    res.json({ uploadUrl: data.signedUrl, publicUrl: publicData.publicUrl });
  } catch (err) {
    res.status(500).json({ message: "Failed to generate upload URL" });
  }
};

module.exports = {
  getVerificationMode,
  setVerificationMode,
  verifyNumber,
  uploadCsv,
  verifyBatch,
  finalizeVerification,
  getUploadUrl
};
