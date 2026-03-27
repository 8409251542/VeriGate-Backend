const supabase = require("../config/supabase");

async function isAdmin(req, res, next) {
  const userId = req.body.requesterId || req.body.adminId || req.query.requesterId;
  
  if (!userId) {
    return res.status(403).json({ message: "User ID required for admin check" });
  }

  const { data, error } = await supabase
    .from("admins")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    console.warn(`[Auth] Unauthorized admin access attempt by ${userId}`);
    return res.status(403).json({ message: "Only admin can perform this action" });
  }

  next();
}

module.exports = { isAdmin };
