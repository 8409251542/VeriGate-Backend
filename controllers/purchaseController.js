const fs = require("fs");
const supabase = require("../config/supabase");

const submitPurchase = async (req, res) => {
  try {
    const { userId, network, usdt_amount, tx_hash } = req.body;
    if (!userId || !usdt_amount || !tx_hash) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    let screenshotUrl = null;
    if (req.file) {
      try {
        const buffer = fs.readFileSync(req.file.path);
        const storageFileName = `${Date.now()}-${req.file.originalname}`;

        const { error: uploadError } = await supabase.storage
          .from("purchase-screenshots")
          .upload(storageFileName, buffer, {
            contentType: req.file.mimetype,
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { data: signedUrl, error: signedError } = await supabase.storage
          .from("purchase-screenshots")
          .createSignedUrl(storageFileName, 60 * 60 * 24 * 7);

        if (signedError) throw signedError;
        
        screenshotUrl = signedUrl?.signedUrl;
      } catch (err) {
        console.error("🔥 File handling error:", err);
      }
    }

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

    if (error) return res.status(400).json({ message: error.message });

    res.json({ message: "✅ Purchase submitted", purchase: data[0] });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

const getPurchases = async (req, res) => {
  try {
    let { data, error } = await supabase
      .from("purchases")
      .select("id, user_id, network, usdt_amount, tx_hash, screenshot, status, created_at");

    if (error) return res.status(400).json({ message: error.message });

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
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

const approvePurchase = async (req, res) => {
  const { purchaseId } = req.body;

  try {
    const { data: purchase, error: fetchError } = await supabase
      .from("purchases")
      .select("*")
      .eq("id", purchaseId)
      .maybeSingle();

    if (fetchError || !purchase) return res.status(404).json({ message: "Purchase not found" });
    if (purchase.status !== "pending") return res.status(400).json({ message: "Already processed" });

    const { data: userLimit, error: fetchLimitError } = await supabase
      .from("user_limits")
      .select("usdt_balance")
      .eq("id", purchase.user_id)
      .single();

    if (fetchLimitError || !userLimit) return res.status(404).json({ message: "User balance not found" });

    const newBalance = (userLimit.usdt_balance || 0) + parseFloat(purchase.usdt_amount);

    const { error: updateLimitError } = await supabase
      .from("user_limits")
      .update({ usdt_balance: newBalance })
      .eq("id", purchase.user_id);

    if (updateLimitError) return res.status(500).json({ message: updateLimitError.message });

    const { error: updatePurchaseError } = await supabase
      .from("purchases")
      .update({ status: "approved" })
      .eq("id", purchaseId);

    if (updatePurchaseError) return res.status(500).json({ message: updatePurchaseError.message });

    res.json({ message: "✅ Purchase approved", newBalance });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

const rejectPurchase = async (req, res) => {
  const { purchaseId, reason } = req.body;

  try {
    const { data: purchase, error: fetchError } = await supabase
      .from("purchases")
      .select("*")
      .eq("id", purchaseId)
      .maybeSingle();

    if (fetchError || !purchase) return res.status(404).json({ message: "Purchase not found" });
    if (purchase.status !== "pending") return res.status(400).json({ message: "Already processed" });

    const { error: updateError } = await supabase
      .from("purchases")
      .update({ status: "rejected", rejection_reason: reason || "No reason provided" })
      .eq("id", purchaseId);

    if (updateError) return res.status(500).json({ message: updateError.message });

    res.json({ message: "❌ Purchase rejected" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  submitPurchase,
  getPurchases,
  approvePurchase,
  rejectPurchase
};
