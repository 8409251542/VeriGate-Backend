// backend/server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const fastcsv = require("fast-csv");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
const path = require("path");
const XLSX = require("xlsx");
const JSZip = require("jszip");
const NumlookupapiModule = require("@everapi/numlookupapi-js");
const app = express();
app.use(cors());
app.use(bodyParser.json());
const puppeteer = require('puppeteer');

const Numlookup = NumlookupapiModule.default; // get the default class



const SUPABASE_URL = "https://fnnurbqyyhabwmquntlm.supabase.co"; // replace
const SUPABASE_KEY = process.env.SUPABASE_KEY; // use service_role for backend
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


// Storage for uploaded files
const upload = multer({ dest: "uploads/" });

// Master admin credentials
async function isAdmin(userId) {
  const { data, error } = await supabase
    .from("admins")
    .select("id")
    .eq("id", userId)
    .maybeSingle(); // safer than .single()

  console.log("isAdmin check:", { userId, data, error }); // 👈 debug

  return !!data && !error;
}


// User store (in-memory for now, can move to DB later)
// Login route
// Login route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const email = username; // alias if needed


  // Step 1: Authenticate with Supabase
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ message: error.message });
  }

  const user = data.user;

  // Step 2: Check if user is admin
  const { data: adminData, error: adminError } = await supabase
    .from("admins")
    .select("email")
    .eq("id", user.id)
    .single();

  if (adminError && adminError.code !== "PGRST116") {
    // any unexpected error
    return res.status(500).json({ message: "Error checking admin status" });
  }

  res.json({
    role: adminData ? "admin" : "user",
    token: data.session.access_token,
    user,
  });
});



// Add user
// Add user (admin only)
app.post("/add-user", async (req, res) => {
  const { requesterId, email, password, max_limit } = req.body;
console.log("👉 /add-user request body:", req.body);
  // 1️⃣ Check if requester is admin
  const { data: admin, error: adminError } = await supabase
    .from("admins")
    .select("id")
    .eq("id", requesterId)
    .maybeSingle();
      console.log("👉 Admin lookup result:", { admin, adminError });

  if (adminError || !admin) {
    return res.status(403).json({ message: "Only admin can add users" });
  }

  // 2️⃣ Create user in Supabase Auth
  const { data: user, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  console.log("👉 Supabase auth.createUser result:", { user, error });
  if (error) {
    return res.status(400).json({ message: error.message });
  }


  // 3️⃣ Insert into user_limits
  const { error: dbError } = await supabase.from("user_limits").insert({
    id: user.user.id,
    max_limit: max_limit || 10000, // default 10k if not passed
    used: 0,
  });
console.log("👉 Insert into user_limits:", { dbError });
  if (dbError) {
    return res.status(500).json({ message: dbError.message });
  }

  // 4️⃣ Return updated users list
  const { data: users, error: usersError } = await supabase
    .from("user_limits")
    .select("id, max_limit, used");
console.log("👉 Users fetch:", { users, usersError });

  if (usersError) {
    return res.status(500).json({ message: usersError.message });
  }

  res.json({ message: "User added successfully", users });
});


app.post("/get-users", async (req, res) => {
  const { requesterId } = req.body;
  if (!(await isAdmin(requesterId))) {
    return res.status(403).json({ message: "Only admin can add users" });
  }
  const { data, error } = await supabase
    .from("user_limits")
    .select("id, max_limit, used");

  if (error) return res.status(400).json({ message: error.message });
  res.json({ users: data });
});



// Verify single number (demo)
// Verify single number using NumVerify
app.post("/verify-number", async (req, res) => {
  const { userId, number } = req.body;

  // 🔹 Check user limit in Supabase
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
    // 🔹 Call NumVerify API
    const apiRes = await axios.get(
      `http://apilayer.net/api/validate?access_key=${process.env.NUMVERIFY_API_KEY}&number=${number}`
    );

    if (!apiRes.data.valid) {
      return res.status(400).json({ message: "Invalid number" });
    }

    const lineType = apiRes.data.line_type; // "mobile" or "landline"

    // 🔹 Update usage count
    await supabase
      .from("user_limits")
      .update({ used: userData.used + 1 })
      .eq("id", userId);

    res.json({
      message: `Number ${number} verified`,
      lineType,
      carrier: apiRes.data.carrier,
      country: apiRes.data.country_name,
      used: userData.used + 1,
      limit: userData.limit,
    });
  } catch (err) {
    res.status(500).json({ message: "Error verifying number", error: err.message });
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// Upload CSV + Verify with NumVerify + User Limit Check
// Upload CSV + Verify with NumVerify + User Limit Check
// add at top
app.post("/upload-csv", upload.single("file"), async (req, res) => {
  const { userId, countryCode } = req.body;
const defaultCountryCode = countryCode || "+1"; // fallback USA

  const filePath = req.file.path;
  const ext = req.file.originalname.split(".").pop().toLowerCase();

  console.log("👉 Upload request:", req.file.originalname);

  // 1️⃣ Validate user
  const { data: userData, error } = await supabase
    .from("user_limits")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !userData) return res.status(404).json({ message: "User not found" });
  if (userData.used >= userData.max_limit)
    return res.status(403).json({ message: "Limit exceeded" });

  // 2️⃣ Parse file into numbers
  let numbers = [];

if (ext === "csv") {
  numbers = await new Promise((resolve, reject) => {
    const arr = [];
    fs.createReadStream(filePath)
      .pipe(csv({ headers: false })) // treat everything as raw rows
      .on("data", (row) => {
        // row = { field1: "8410000000", field2: ... }
        let phone = row[Object.keys(row)[0]]; // always first column
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
  // header:1 → rows as arrays

  numbers = sheet.map((row, i) => {
    let phone = row[0]; // always first column
    // skip first row if not numeric
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
    if (i === 0 && isNaN(Number(phone))) return null; // skip header-like first row
    return phone;
  }).filter(Boolean);
}
 else {
    return res
      .status(400)
      .json({ message: "Unsupported file type. Use CSV, XLSX, or TXT." });
  }

  // 3️⃣ Deduplicate
const uniqueNumbers = [
  ...new Set(
    numbers
      .filter(n => n !== null && n !== undefined) // remove null/undefined
      .map(n => n.toString().trim())              // ensure string
      .filter(n => n && !isNaN(Number(n))) // only keep numeric-like values
   // remove header
  )
];


  const duplicates = numbers.length - uniqueNumbers.length;

  // 4️⃣ Setup multi-API clients (EverAPI Numlookup as example)
const clients = [
  new Numlookup(process.env.NUMLOOKUP_API_KEY_1), 
  new Numlookup(process.env.NUMLOOKUP_API_KEY_2),
  new Numlookup(process.env.NUMLOOKUP_API_KEY_3),
  new Numlookup(process.env.NUMLOOKUP_API_KEY_4), // 👈 new 
  // new Numlookup(process.env.NUMLOOKUP_API_KEY_5), // 👈 new
];

 // make sure you initialize these
  let apiIndex = 0;

  async function validatePhone(phone) {
    const client = clients[apiIndex];
    apiIndex = (apiIndex + 1) % clients.length; // rotate between APIs

    try {
      const apiRes = await client.validate(phone);
      return apiRes;
    } catch (err) {
      console.error("❌ API error:", err.message);
      return null;
    }
  }

function formatPhone(phone) {
  if (!phone) return null;
  phone = phone.replace(/\D/g, ""); // remove non-digits

  // If exactly 10 digits → assume selected country code
  if (phone.length === 10) {
    return `${defaultCountryCode}${phone}`;
  }

  // If already has 11–13 digits → ensure it starts with +
  if (phone.length >= 11 && phone.length <= 13) {
    return phone.startsWith("+") ? phone : `+${phone}`;
  }

  return null; // invalid
}




  // 5️⃣ Batch processing
  const batchSize = 50; // process 50 at a time to avoid overload
  let verifiedRows = [];
  let processed = 0;

  for (let i = 0; i < uniqueNumbers.length; i += batchSize) {
    const batch = uniqueNumbers.slice(i, i + batchSize);

    const promises = batch.map(async (phone) => {
      if (!phone) return null;
      if (userData.used + processed >= userData.max_limit) return null;

      const formattedPhone = formatPhone(phone);
      console.log("📞 Checking:", phone, "→ formatted:", formattedPhone);
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
      } else {
        console.log("❌ Invalid number:", phone);
        return null;
      }
    });

    const results = await Promise.all(promises);
    verifiedRows.push(...results.filter(Boolean));
  }

  // 6️⃣ Update DB usage (only valid numbers count)
 // 🟢 new code: deduct USDT based on verified numbers
const costPerVerification = 0.0011;
const totalCost = processed * costPerVerification;

if (userData.usdt_balance < totalCost) {
  return res.status(403).json({ message: "Not enough USDT balance" });
}

await supabase
  .from("user_limits")
  .update({ usdt_balance: userData.usdt_balance - totalCost })
  .eq("id", userId);


  // 7️⃣ Save history
  const { data: saved } = await supabase
    .from("verification_history")
    .insert([
      {
        user_id: userId,
        total_uploaded: numbers.length,
        duplicates,
        unique_count: uniqueNumbers.length,
        verified_count: processed,
        created_at: new Date(),
      },
    ])
    .select("id");

  // 8️⃣ Create CSV in memory
const fileName = `output-${Date.now()}.csv`;

// Make CSV string from verifiedRows
const csvString = await new Promise((resolve, reject) => {
  fastcsv
    .writeToString(verifiedRows, { headers: true })
    .then(resolve)
    .catch(reject);
});

// 9️⃣ Upload CSV to Supabase Storage (bucket: csv-outputs, folder: verified/)
const { data: storageData, error: storageError } = await supabase.storage
  .from("csv-outputs")
  .upload(`verified/${fileName}`, Buffer.from(csvString), {
    contentType: "text/csv",
    upsert: true,
  });

if (storageError) {
  console.error("❌ Supabase upload error:", storageError.message);
  return res
    .status(500)
    .json({ message: "Failed to upload file to storage" });
}

// 🔟 Get public URL from Supabase
const { data: publicData } = supabase.storage
  .from("csv-outputs")
  .getPublicUrl(`verified/${fileName}`);

const fileUrl = publicData.publicUrl;

// 1️⃣1️⃣ Update DB with Supabase URL
await supabase
  .from("verification_history")
  .update({ file_path: fileUrl })
  .eq("id", saved[0].id);


  // 🔟 Response
  res.json({
    message: "Verification completed",
    total_uploaded: numbers.length,
    duplicates,
    unique_count: uniqueNumbers.length,
    verified_count: processed,
    fileUrl,
  });
});


// Register user with extra fields
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  // 1️⃣ Create Supabase Auth user
  const { data: user, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) return res.status(400).json({ message: error.message });

  const userId = user.user.id;

  // 2️⃣ Insert into user_limits table (optional, if you still want limits)
  const { error: limitError } = await supabase.from("user_limits").insert({
    id: userId,
    max_limit: 10, // default limit
    used: 0,
  });

  if (limitError) return res.status(500).json({ message: limitError.message });

  res.json({
    message: "User registered successfully",
    user: {
      id: userId,
      email,
    },
  });
});


// Submit a purchase (user side)
app.post("/purchase", upload.single("screenshot"), async (req, res) => {
  try {
    console.log("👉 Incoming purchase:", req.body);
    console.log("👉 File received:", req.file);

    const { userId, network, usdt_amount, tx_hash } = req.body;
    if (!userId || !usdt_amount || !tx_hash) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Upload file to Supabase Storage
    let screenshotUrl = null;
    if (req.file) {
      try {
        const buffer = fs.readFileSync(req.file.path);
        const storageFileName = `${Date.now()}-${req.file.originalname}`;

        console.log("📂 Uploading file:", storageFileName);

        const { error: uploadError } = await supabase.storage
          .from("purchase-screenshots")
          .upload(storageFileName, buffer, {
            contentType: req.file.mimetype,
            upsert: true,
          });

        if (uploadError) {
          console.error("❌ Storage upload error:", uploadError);
          return res.status(500).json({ message: "Failed to upload screenshot" });
        }

        const { data: signedUrl, error: signedError } = await supabase.storage
          .from("purchase-screenshots")
          .createSignedUrl(storageFileName, 60 * 60 * 24 * 7);

        if (signedError) {
          console.error("❌ Signed URL error:", signedError);
        } else {
          screenshotUrl = signedUrl?.signedUrl;
        }
      } catch (err) {
        console.error("🔥 File handling error:", err);
      }
    } else {
      console.warn("⚠️ No file uploaded in request");
    }

    // Save to DB
    const { data, error } = await supabase
      .from("purchases")
      .insert({
        user_id: userId,
        network,
        usdt_amount,
        tx_hash,
        screenshot: screenshotUrl,
        status: "pending",
      })
      .select();

    if (error) {
      console.error("❌ DB insert error:", error);
      return res.status(400).json({ message: error.message });
    }

    res.json({ message: "✅ Purchase submitted", purchase: data[0] });
  } catch (err) {
    console.error("🔥 Purchase error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all purchases (admin only)
app.get("/purchases", async (req, res) => {
  let { data, error } = await supabase
    .from("purchases")
    .select("id, user_id, network, usdt_amount, tx_hash, screenshot, status, created_at");

  if (error) return res.status(400).json({ message: error.message });

  // If screenshot stored as path, generate signed URLs
  data = await Promise.all(
    data.map(async (p) => {
      if (p.screenshot && !p.screenshot.startsWith("http")) {
        const { data: signed } = await supabase.storage
          .from("purchase-screenshots")
          .createSignedUrl(p.screenshot, 60 * 60);
        p.screenshot = signed?.signedUrl || null;
      }
      return p;
    })
  );

  res.json({ purchases: data });
});


// Approve a purchase (admin)
app.post("/approve-purchase", async (req, res) => {
  const { purchaseId,adminId } = req.body;
if (!(await isAdmin(adminId))) {
    return res.status(403).json({ message: "Only admin can add users" });
  }
  // 1️⃣ Fetch purchase
  const { data: purchase, error: fetchError } = await supabase
    .from("purchases")
    .select("*")
    .eq("id", purchaseId)
    .maybeSingle();

  if (fetchError || !purchase) {
    return res.status(404).json({ message: "Purchase not found" });
  }

  if (purchase.status !== "pending") {
    return res.status(400).json({ message: "Already processed" });
  }

  // 2️⃣ Match plan based on amount
  // 🟢 new code: directly credit USDT
const { data: userLimit, error: fetchLimitError } = await supabase
  .from("user_limits")
  .select("usdt_balance")
  .eq("id", purchase.user_id)
  .single();

if (fetchLimitError || !userLimit) {
  return res.status(404).json({ message: "User balance not found" });
}

const newBalance = (userLimit.usdt_balance || 0) + parseFloat(purchase.usdt_amount);

await supabase
  .from("user_limits")
  .update({ usdt_balance: newBalance })
  .eq("id", purchase.user_id);


  if (updateError) {
    return res.status(500).json({ message: updateError.message });
  }

  // 4️⃣ Mark purchase approved
  const { error: updatePurchaseError } = await supabase
    .from("purchases")
    .update({ status: "approved" })
    .eq("id", purchaseId);

  if (updatePurchaseError) {
    return res.status(500).json({ message: updatePurchaseError.message });
  }

  res.json({ message: "✅ Purchase approved", tokensAdded: tokensToAdd, newLimit });
});

// Reject a purchase (admin)
app.post("/reject-purchase", async (req, res) => {
  const { purchaseId, reason } = req.body;

  const { data: purchase, error: fetchError } = await supabase
    .from("purchases")
    .select("*")
    .eq("id", purchaseId)
    .maybeSingle();

  if (fetchError || !purchase) {
    return res.status(404).json({ message: "Purchase not found" });
  }

  if (purchase.status !== "pending") {
    return res.status(400).json({ message: "Already processed" });
  }

  const { error: updateError } = await supabase
    .from("purchases")
    .update({ status: "rejected", rejection_reason: reason || "No reason provided" })
    .eq("id", purchaseId);

  if (updateError) {
    return res.status(500).json({ message: updateError.message });
  }

  res.json({ message: "❌ Purchase rejected" });
});
// 📌 Get User Details by ID
app.post("/get-user-details", async (req, res) => {
  const { userId } = req.body;
  console.log("👉 /get-user-details request:", userId);

  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  try {
    // 1️⃣ Get user from Auth
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError) {
      console.error("❌ Error fetching user:", userError.message);
      return res.status(400).json({ message: userError.message });
    }

    // 2️⃣ Get user limits
    const { data: limits, error: limitError } = await supabase
      .from("user_limits")
      .select("max_limit, used,usdt_balance")
      .eq("id", userId)
      .maybeSingle();

    if (limitError) {
      console.error("❌ Error fetching limits:", limitError.message);
      return res.status(400).json({ message: limitError.message });
    }

    // 3️⃣ Get last recharge
    const { data: purchases, error: purchaseError } = await supabase
      .from("purchases")
      .select("usdt_amount, created_at, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (purchaseError) {
      console.error("❌ Error fetching purchases:", purchaseError.message);
      return res.status(400).json({ message: purchaseError.message });
    }

   res.json({
  email: user.user.email,
  usdt_balance: limits?.usdt_balance || 0,   // current balance
  last_recharge: purchases?.length > 0 ? purchases[0] : null,
});

  } catch (err) {
    console.error("🔥 Server error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/admin/history", async (req, res) => {
  const { requesterId, start, end } = req.query;

  // 1️⃣ Verify requester is an admin
  const { data: admin, error: adminError } = await supabase
    .from("admins")
    .select("id")
    .eq("id", requesterId)
    .maybeSingle();

  if (adminError || !admin) {
    console.warn("❌ Unauthorized access attempt to /admin/history");
    return res.status(403).json({ message: "Only admin can access history" });
  }

  // 2️⃣ Fetch history
  let query = supabase
    .from("verification_history")
    .select("*")
    .order("created_at", { ascending: false });

  if (start && end) {
    query = query.gte("created_at", start).lte("created_at", end);
  }

  const { data, error } = await query;

  if (error) {
    console.error("❌ Error fetching history:", error.message);
    return res.status(500).json({ message: error.message });
  }

  // 3️⃣ Attach direct file URL (no signed URL logic)
  const enhanced = data.map(item => ({
    ...item,
    downloadUrl: item.file_url || item.file_path || null, // use whichever column you have
  }));

  res.json(enhanced);
});


app.get("/user-history", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: "userId is required" });

  try {
    // Fetch verification history including file_path
    const { data, error } = await supabase
      .from("verification_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ message: error.message });

    // Directly use file_path as downloadUrl
    const results = data.map(item => ({
      ...item,
      downloadUrl: item.file_path || null,
    }));

    res.json(results);
  } catch (err) {
    console.error("🔥 /user-history error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short" });
  return day + month;
}

app.post("/api/generate-report", upload.single("file"), async (req, res) => {
  try {
    const { userId, reportDate } = req.body;
    const filePath = req.file.path;

    if (!reportDate) {
      return res.status(400).json({ message: "Report date required" });
    }

   // 🟢 new code: USDT cost (1 per report)
const reportCost = 1;

const { data: userData, error: userError } = await supabase
  .from("user_limits")
  .select("usdt_balance")
  .eq("id", userId)
  .maybeSingle();

if (userError || !userData) {
  return res.status(404).json({ message: "User not found" });
}

if (userData.usdt_balance < reportCost) {
  return res.status(403).json({ message: "Not enough USDT. Requires 1 USDT." });
}

// Deduct 1 USDT
await supabase
  .from("user_limits")
  .update({ usdt_balance: userData.usdt_balance - reportCost })
  .eq("id", userId);


    const dateStr = formatDate(reportDate);
    if (!dateStr) {
      return res.status(400).json({ message: "Invalid date" });
    }

    // 2️⃣ Generate report (existing logic)
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const callerIdx = headers.findIndex(h => h && h.toString().toLowerCase().includes("caller"));
    const fwdIdx = headers.findIndex(h => h && h.toString().toLowerCase().includes("forward"));
    const buyerIdx = headers.findIndex(h => h && h.toString().toLowerCase().includes("buyer"));

    if (callerIdx === -1 || buyerIdx === -1 || fwdIdx === -1) {
      return res.status(400).json({ message: "Required columns missing (CallerID, BuyerName, ForwardedNumber)" });
    }

    const buyers = {};
    dataRows.forEach(row => {
      const buyer = row[buyerIdx];
      if (!buyer) return;
      if (!buyers[buyer]) buyers[buyer] = [];
      buyers[buyer].push(row);
    });

    const zip = new JSZip();
    const masterSummary = [];

   function excelSerialToJSDate(serial) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60;
  total_seconds -= seconds;
  const hours = Math.floor(total_seconds / (60 * 60));
  const minutes = Math.floor(total_seconds / 60) % 60;
  date_info.setHours(hours, minutes, seconds);
  return date_info;
}

function formatDT(dt) {
  const d = dt.getDate().toString().padStart(2, '0');
  const m = (dt.getMonth() + 1).toString().padStart(2, '0');
  const y = dt.getFullYear();
  const hh = dt.getHours().toString().padStart(2, '0');
  const mm = dt.getMinutes().toString().padStart(2, '0');
  const ss = dt.getSeconds().toString().padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
}

const campIdx = headers.findIndex(h => h && h.toString().toLowerCase().includes("camp"));
const dateCols = headers
  .map((h, i) => (h && h.toString().toLowerCase().includes("call_start") ? i : -1))
  .filter(i => i >= 0);

for (const buyer in buyers) {
  let calls = buyers[buyer];

  // Remove duplicates by caller
  const seen = new Set();
  calls = calls.filter(row => {
    const caller = row[callerIdx];
    if (seen.has(caller)) return false;
    seen.add(caller);
    return true;
  });

  // Convert call_start columns
  calls = calls.map(row => {
    for (const dc of dateCols) {
      const v = row[dc];
      if (v !== null && v !== undefined && v !== "") {
        if (!isNaN(Number(v)) && Number(v) > 30000) {
          const dt = excelSerialToJSDate(Number(v));
          row[dc] = formatDT(dt);
        } else {
          const dtStr = new Date(v);
          if (!isNaN(dtStr.getTime())) {
            row[dc] = formatDT(dtStr);
          }
        }
      }
    }
    return row;
  });

  const uniqueCalls = calls.length;
  const sampleFwd = calls.length ? String(calls[0][fwdIdx]) : "";
  const suffix = sampleFwd.slice(-4);
  const prefix = buyer.split(" ")[0];

  let camp = calls.length && campIdx >= 0 ? String(calls[0][campIdx]) : "";
  if (camp.length > 10) {
    camp = camp.split(" ").map(w => w.slice(0, 3)).join("");
  }

  const fileName = `${prefix} ${dateStr} ${suffix} - (${uniqueCalls}) ${camp}.xlsx`;

  const sheetData = [headers, ...calls];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Calls");

  const wbout = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  zip.file(fileName, wbout);

  masterSummary.push({ buyer, uniqueCalls, fileName });
}


    const summarySheet = [["Buyer Name", "Unique Calls", "File Name"]];
    masterSummary.forEach(s => summarySheet.push([s.buyer, s.uniqueCalls, s.fileName]));
    const totalCalls = masterSummary.reduce((a, b) => a + b.uniqueCalls, 0);
    summarySheet.push(["TOTAL", totalCalls, ""]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summarySheet);
    const wbSummary = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbSummary, wsSummary, "Summary");
    const summaryOut = XLSX.write(wbSummary, { type: "buffer", bookType: "xlsx" });
    zip.file("Master_Report.xlsx", summaryOut);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // 3️⃣ Save ZIP permanently
    const reportsDir = path.join(__dirname, "uploads/reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const fileName = `buyer_reports_${Date.now()}.zip`;
    const outputPath = path.join(reportsDir, fileName);
    fs.writeFileSync(outputPath, zipBuffer);

    // 4️⃣ Save metadata in DB (optional, for history)
    await supabase.from("report_history").insert([
      {
        user_id: userId,
        file_name: fileName,
        file_path: `/uploads/reports/${fileName}`,
        // 🟢 new code
        usdt_used: reportCost,
        created_at: new Date(),
      },
    ]);

    // 5️⃣ Respond with file link instead of deleting
    res.json({
      message: "✅ Report generated successfully",
      downloadUrl: `http://localhost:5000/uploads/reports/${fileName}`,
      tokens_used: 2000,
    });
  } catch (err) {
    console.error("❌ Report generation failed:", err);
    res.status(500).json({ message: "Report generation failed", error: err.message });
  }
});

// Add this to your server.js file

// Invoice Generator API - Costs 2 USDT per generation
app.post("/api/generate-invoice", async (req, res) => {
  try {
    const { 
      userId, 
      companyName,
      phoneNumber, 
      supportPhone, 
      date, 
      amount,          // can be "189.25", "$189.25", "189.25 USDT" etc.
      transactionId, 
      invoiceNumber,
      logoUrl 
    } = req.body;

    console.log("📝 Invoice generation request:", { userId, companyName, amount });

    // Validate required fields
    if (!userId || !companyName || !phoneNumber || amount == null) {
      return res.status(400).json({ 
        message: "Missing required fields: userId, companyName, phoneNumber, amount" 
      });
    }

    // 1️⃣ Check user USDT balance
    const invoiceCost = 2;
    const { data: userData, error: userError } = await supabase
      .from("user_limits")
      .select("usdt_balance")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !userData) {
      return res.status(404).json({ message: "User not found" });
    }

    if (userData.usdt_balance < invoiceCost) {
      return res.status(403).json({ 
        message: `Insufficient USDT balance. Required: ${invoiceCost} USDT` 
      });
    }

    // 2️⃣ Safely parse & format amount (fix NaN)
    const rawAmount = amount;
    const numericAmount = parseFloat(String(rawAmount).replace(/[^\d.]/g, ""));
    const amountNumber = isNaN(numericAmount) ? 0 : numericAmount;
    const amountDisplay = `$${amountNumber.toFixed(2)}`;   // e.g. "$189.25"

    // 3️⃣ Generate invoice HTML (your function)
    const invoiceHTML = generateInvoiceHTML({
      companyName: companyName || "PAY PAL",
      phoneNumber: phoneNumber || "+1 858 426 0634",
      supportPhone: supportPhone || "+1 800 123 4567",
      date: date || new Date().toISOString().split("T")[0],
      amount: amountDisplay,   // 👈 ALWAYS a nice string now
      transactionId:
        transactionId ||
        `TRX-${Math.floor(100000000 + Math.random() * 900000000)}`,
      invoiceNumber: invoiceNumber || generateRandomInvoice(),
      logoUrl:
        logoUrl ||
        "https://upload.wikimedia.org/wikipedia/commons/b/b7/PayPal_Logo_Icon_2014.svg",
    });

    // 4️⃣ Launch headless browser and capture screenshot (bigger & higher quality)
    const puppeteer = require("puppeteer");

const browser = await puppeteer.launch({
  headless: true,
  executablePath: puppeteer.executablePath(), // 👈 let Puppeteer figure it out
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});


    
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 650 }); // a bit bigger → larger file
    await page.setContent(invoiceHTML, { waitUntil: "networkidle0" });

    const element = await page.$("#invoice-root");
    let screenshotBuffer;

    if (element) {
      const box = await element.boundingBox();
      screenshotBuffer = await page.screenshot({
        type: "jpeg",
        quality: 93,  // 🔺 higher quality → roughly 45–50 KB
        clip: {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
        },
      });
    } else {
      // fallback if #invoice-root not found
      screenshotBuffer = await page.screenshot({
        type: "jpeg",
        quality: 93,
        fullPage: false,
      });
    }

    await browser.close();

    // 5️⃣ Upload invoice image to Supabase Storage (bucket: Invoice)
    const fileName = `invoice_${Date.now()}_${userId}.jpg`;

    const { error: storageError } = await supabase.storage
      .from("Invoice")
      .upload(fileName, screenshotBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (storageError) {
      console.error("❌ Supabase invoice upload error:", storageError);
      return res
        .status(500)
        .json({ message: "Failed to upload invoice image" });
    }

    const { data: publicData } = supabase.storage
      .from("Invoice")
      .getPublicUrl(fileName);

    const downloadUrl = publicData.publicUrl;

    // 6️⃣ Deduct USDT from user balance
    const newBalance = userData.usdt_balance - invoiceCost;

    await supabase
      .from("user_limits")
      .update({ usdt_balance: newBalance })
      .eq("id", userId);

    // 7️⃣ Save invoice history (store numeric amount + Supabase URL)
    await supabase.from("invoice_history").insert([
      {
        user_id: userId,
        company_name: companyName,
        amount: amountNumber,            // numeric for DB
        file_path: downloadUrl,
        usdt_used: invoiceCost,
        created_at: new Date(),
      },
    ]);

    // 8️⃣ Response
    res.json({
      message: "✅ Invoice generated successfully",
      downloadUrl,
      amount: amountDisplay,
      usdt_used: invoiceCost,
      remaining_balance: newBalance,
    });

  } catch (err) {
    console.error("❌ Invoice generation failed:", err);
    res.status(500).json({ 
      message: "Invoice generation failed", 
      error: err.message 
    });
  }
});



// Helper function to generate random invoice number
function generateRandomInvoice() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const r = (n) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      s += letters[Math.floor(Math.random() * letters.length)];
    }
    return s;
  };
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${r(2)}${Math.floor(10 + Math.random() * 89)}-${digits}-${r(2)}`;
}

// Helper function to generate invoice HTML
function generateInvoiceHTML(data) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
:root{
  --pp-blue:#003087;
  --pp-accent:#009cde;
  --muted:#6b7280;
  --card-bg:#ffffff;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{
  margin:0;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
  background:#f3f6ff;
  padding:24px 0;
}
#invoice-root{
  background:linear-gradient(180deg,#ffffff 0%,#f9fbff 100%);
  border-radius:16px;
  padding:24px 28px;
  max-width:780px;
  margin:0 auto;
  box-shadow:0 10px 30px rgba(15,23,42,.12);
}
.inv-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:20px;
}
.brand{
  display:flex;
  align-items:center;
  gap:12px;
}
.brand img{
  height:40px;
  width:auto;
  border-radius:8px;
}
.company{
  font-weight:700;
  color:var(--pp-blue);
  font-size:18px;
}
.company-sub{
  font-size:12px;
  color:var(--muted);
  letter-spacing:.08em;
  text-transform:uppercase;
}
.inv-top-right{
  text-align:right;
}
.inv-top-right .heading{
  font-size:13px;
  color:var(--pp-blue);
  margin-bottom:4px;
}
.status-badge{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:5px 12px;
  border-radius:999px;
  background:#e9fff2;
  color:#16a34a;
  font-weight:600;
  font-size:13px;
}
.status-badge span.icon{
  font-size:14px;
}
.summary{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  padding:16px 18px;
  border-radius:12px;
  background:linear-gradient(90deg,rgba(0,156,222,0.06),rgba(0,48,135,0.03));
  border:1px solid rgba(15,23,42,0.06);
  margin-bottom:20px;
}
.label{
  font-size:12px;
  color:var(--muted);
  margin-bottom:6px;
}
.big-amount{
  font-size:26px;
  font-weight:700;
  color:#020617;
}
.service{
  font-size:12px;
  color:var(--muted);
  margin-top:4px;
}
.details{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:16px;
  margin-bottom:18px;
}
.card .k{
  font-size:11px;
  color:var(--muted);
  margin-bottom:4px;
  text-transform:uppercase;
  letter-spacing:.08em;
}
.card .v{
  font-weight:600;
  color:#111827;
  font-size:14px;
}
.refund{
  font-size:11px;
  color:var(--muted);
  padding:10px 0;
  border-top:1px dashed #e5e7eb;
}
</style>
</head>
<body>
<div id="invoice-root">
  <div class="inv-top">
    <div class="brand">
      <img src="${data.logoUrl}" alt="Logo">
      <div>
        <div class="company">${data.companyName}</div>
        <div class="company-sub">INVOICE</div>
      </div>
    </div>
    <div class="inv-top-right">
      <div class="heading">Payment Confirmation</div>
      <div class="status-badge">
        <span class="icon">✔</span>
        <span>Paid</span>
      </div>
    </div>
  </div>
  
  <div class="summary">
    <div>
      <div class="label">Amount</div>
      <div class="big-amount">${data.amount}</div>
      <div class="service">Service: Digital Assets &amp; Cryptocurrency Services</div>
    </div>
    <div style="text-align:right"></div>
  </div>
  
  <div class="details">
    <div class="card">
      <div class="k">Transaction ID</div>
      <div class="v">${data.transactionId}</div>
    </div>
    <div class="card">
      <div class="k">Date</div>
      <div class="v">${data.date}</div>
    </div>
    <div class="card">
      <div class="k">Invoice No</div>
      <div class="v">${data.invoiceNumber}</div>
    </div>
    <div class="card">
      <div class="k">Contact - 24/7</div>
      <div class="v">${data.phoneNumber}</div>
    </div>
  </div>
  
  <div class="refund">
    Refund requests within <strong>12 hours</strong> of payment will be reviewed. 
    Contact support if you notice an unrecognized charge.
  </div>
  <div class="refund">
    This is an automated notification. For assistance call <strong>${data.supportPhone}</strong> 
    in working hours. Both numbers are alternate — you can use any.
  </div>
</div>
</body>
</html>
`;
}


// Serve invoices directory
app.use("/uploads/invoices", express.static(path.join(__dirname, "uploads/invoices")));

// Serve local uploads so frontend can access them directly
app.use("/uploads/screenshots", express.static(path.join(__dirname, "uploads/ScreenShots")));
app.use("/uploads/verified-data", express.static(path.join(__dirname, "uploads/verified-data")));
app.use("/uploads/reports", express.static(path.join(__dirname, "uploads/reports")));
app.use("/reports", express.static(path.join(__dirname, "uploads/reports")));

//frontend


const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on http://localhost:${PORT}`)
);