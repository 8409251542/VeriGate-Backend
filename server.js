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


const app = express();
app.use(cors());
app.use(bodyParser.json());

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
  const { userId } = req.body;
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
  if (userData.used >= userData.max_limit) return res.status(403).json({ message: "Limit exceeded" });

  // 2️⃣ Parse file into numbers
  let numbers = [];

  if (ext === "csv") {
    numbers = await new Promise((resolve, reject) => {
      const arr = [];
      fs.createReadStream(filePath)
        .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase() }))
        .on("data", row => arr.push(row["phone"]))
        .on("end", () => resolve(arr))
        .on("error", reject);
    });
  } else if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    numbers = sheet.map(row => row["phone"]);
  } else if (ext === "txt") {
    const content = fs.readFileSync(filePath, "utf8");
    numbers = content.split(/\r?\n/).map(line => line.trim());
  } else {
    return res.status(400).json({ message: "Unsupported file type. Use CSV, XLSX, or TXT." });
  }

  // 3️⃣ Deduplicate
  const uniqueNumbers = [...new Set(numbers.filter(Boolean))];
  const duplicates = numbers.length - uniqueNumbers.length;

  let verifiedRows = [];
  let processed = 0;

  for (let phone of uniqueNumbers) {
    if (!phone) continue;
    if (userData.used + processed >= userData.max_limit) break;

    try {
      const url = `http://apilayer.net/api/validate?access_key=${process.env.NUMVERIFY_API_KEY}&number=${phone}`;
      const apiRes = await axios.get(url);

      if (apiRes.data.valid) {
        processed++;
        verifiedRows.push({
          valid: apiRes.data.valid || false,
          local_format: apiRes.data.local_format || "",
          country_code: apiRes.data.country_code || "",
          country_name: apiRes.data.country_name || "",
          location: apiRes.data.location || "",
          carrier: apiRes.data.carrier || "",
          line_type: apiRes.data.line_type || "",
        });
      }
    } catch (err) {
      console.error("❌ Error verifying", phone, err.message);
    }
    await new Promise(r => setTimeout(r, 1000)); // throttle API
  }

  // 4️⃣ Update DB usage
  await supabase
    .from("user_limits")
    .update({ used: userData.used + processed })
    .eq("id", userId);

  // 5️⃣ Save history
  const { data: saved } = await supabase.from("verification_history").insert([
    {
      user_id: userId,
      total_uploaded: numbers.length,
      duplicates,
      unique_count: uniqueNumbers.length,
      verified_count: processed,
      created_at: new Date(),
    },
  ]).select("id");

  // 6️⃣ Save CSV output locally
  const outputPath = path.join(__dirname, `output-${Date.now()}.csv`);
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(outputPath);
    fastcsv.write(verifiedRows, { headers: true }).pipe(ws).on("finish", resolve).on("error", reject);
  });

  // 7️⃣ Upload to Supabase Storage
  const fileBuffer = fs.readFileSync(outputPath);
  const storageFileName = `verified/output-${Date.now()}.csv`;

  const { error: uploadError } = await supabase.storage
    .from("csv-outputs")
    .upload(storageFileName, fileBuffer, { contentType: "text/csv", upsert: true });

  if (uploadError) return res.status(500).json({ message: "File upload failed" });

  // 8️⃣ Signed URL
  const { data: signedUrl } = await supabase.storage
    .from("csv-outputs")
    .createSignedUrl(storageFileName, 60 * 60);

  // 9️⃣ Update DB with file path
  await supabase.from("verification_history").update({ file_path: storageFileName }).eq("id", saved[0].id);

  res.json({
    message: "Verification completed",
    total_uploaded: numbers.length,
    duplicates,
    unique_count: uniqueNumbers.length,
    verified_count: processed,
    fileUrl: signedUrl.signedUrl,
  });
});

// Register user with extra fields
app.post("/register", async (req, res) => {
  const { name, mobile, email, company, password } = req.body;

  // 1️⃣ Create Supabase Auth user
  const { data: user, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) return res.status(400).json({ message: error.message });

  const userId = user.user.id;

  // 2️⃣ Insert into profiles table
  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    name,
    mobile,
    company,
  });

  if (profileError) return res.status(500).json({ message: profileError.message });

  // 3️⃣ Insert into user_limits table
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
      name,
      mobile,
      email,
      company,
    },
  });
});

// Submit a purchase (user side)
app.post("/purchase", upload.single("screenshot"), async (req, res) => {
  try {
    // Multer handles text fields + file uploads
    const { userId, network, usdt_amount, tx_hash } = req.body;
    const screenshot = req.file ? req.file.filename : null;

    console.log("👉 Purchase received:", req.body, req.file);

    if (!userId || !usdt_amount || !tx_hash) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const { data, error } = await supabase
      .from("purchases")
      .insert({
        user_id: userId,
        network,
        usdt_amount,
        tx_hash,
        screenshot,
        status: "pending",
      })
      .select();

    if (error) return res.status(400).json({ message: error.message });

    res.json({ message: "Purchase submitted", purchase: data[0] });
  } catch (err) {
    console.error("Purchase error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// Get all purchases (admin only)
app.get("/purchases", async (req, res) => {
  const { data, error } = await supabase
    .from("purchases")
    .select("id, user_id, network, usdt_amount, tx_hash, screenshot, status, created_at");

  if (error) return res.status(400).json({ message: error.message });

  res.json({ purchases: data });
});

// Approve a purchase (admin)
app.post("/approve-purchase", async (req, res) => {
  const { purchaseId, tokenRate } = req.body;

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

  // 2️⃣ Calculate tokens to add
  const tokensToAdd = purchase.usdt_amount * (tokenRate || 100);

  // 3️⃣ Update user_limits
  const { error: updateError } = await supabase.rpc("increment_user_limit", {
    user_uuid: purchase.user_id,
    tokens: tokensToAdd,
  });

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

  res.json({ message: "Purchase approved", tokensAdded: tokensToAdd });
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
      .select("max_limit, used")
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
      tokens_left: (limits?.max_limit || 0) - (limits?.used || 0),
      max_limit: limits?.max_limit || 0,
      used: limits?.used || 0,
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

  // 3️⃣ Generate signed URLs for file_path
  const enhanced = await Promise.all(
    data.map(async (item) => {
      if (item.file_path) {
        const { data: signed, error: signedErr } = await supabase.storage
          .from("csv-outputs")
          .createSignedUrl(item.file_path, 60 * 60); // 1 hour

        if (!signedErr && signed?.signedUrl) {
          item.downloadUrl = signed.signedUrl;
        }
      }
      return item;
    })
  );

  res.json(enhanced);
});


app.get("/user-history", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  try {
    // 1️⃣ Fetch history from DB
    const { data, error } = await supabase
      .from("verification_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });

    // 2️⃣ Generate signed URLs for each stored file
    const results = await Promise.all(
      data.map(async (item) => {
        if (!item.file_path) return item;

        const { data: signedUrl, error: urlError } = await supabase.storage
          .from("csv-outputs") // 👈 your bucket name
          .createSignedUrl(item.file_path, 60 * 60); // 1 hour expiry

        if (urlError) {
          console.error("❌ Signed URL error:", urlError.message);
          return { ...item, downloadUrl: null };
        }

        return { ...item, downloadUrl: signedUrl.signedUrl };
      })
    );

    res.json(results);
  } catch (err) {
    console.error("🔥 /user-history error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});


app.listen(5000, () => console.log("Server running on http://localhost:5000"));
