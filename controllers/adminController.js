const supabase = require("../config/supabase");

const getAdminHistory = async (req, res) => {
  const { start, end } = req.query;

  try {
    let query = supabase.from("verification_history").select("*").order("created_at", { ascending: false });

    if (start && end) {
      query = query.gte("created_at", start).lte("created_at", end);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ message: error.message });

    const enhanced = data.map(item => ({
      ...item,
      downloadUrl: item.file_url || item.file_path || null,
    }));

    res.json(enhanced);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getUserHistory = async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: "userId is required" });

  try {
    // Increased window to 7 days for better user experience
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("verification_history")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });

    const results = data.map(item => ({
      ...item,
      downloadUrl: item.file_path || null,
    }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAdminHistory,
  getUserHistory,
};
