const supabase = require("../config/supabase");

const login = async (req, res) => {
  const { username, password } = req.body;
  const email = username;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ message: error.message });
  }

  const user = data.user;

  const { data: adminData } = await supabase
    .from("admins")
    .select("email")
    .eq("id", user.id)
    .single();

  res.json({
    role: adminData ? "admin" : "user",
    token: data.session.access_token,
    user,
  });
};

const register = async (req, res) => {
  const { email, password } = req.body;

  const { data: user, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) return res.status(400).json({ message: error.message });

  const userId = user.user.id;

  const { error: limitError } = await supabase.from("user_limits").insert({
    id: userId,
    max_limit: 10,
    used: 0,
  });

  if (limitError) return res.status(500).json({ message: limitError.message });

  res.json({
    message: "User registered successfully",
    user: { id: userId, email },
  });
};

const addUser = async (req, res) => {
  const { email, password, max_limit } = req.body;

  const { data: user, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  const { error: dbError } = await supabase.from("user_limits").insert({
    id: user.user.id,
    max_limit: max_limit || 10000,
    used: 0,
  });

  if (dbError) {
    return res.status(500).json({ message: dbError.message });
  }

  const { data: users, error: usersError } = await supabase
    .from("user_limits")
    .select("id, max_limit, used");

  if (usersError) {
    return res.status(500).json({ message: usersError.message });
  }

  res.json({ message: "User added successfully", users });
};

const getUsers = async (req, res) => {
  const { data, error } = await supabase
    .from("user_limits")
    .select("id, max_limit, used");

  if (error) return res.status(400).json({ message: error.message });
  res.json({ users: data });
};

const changePassword = async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ message: "email, currentPassword and newPassword are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError || !signInData?.user) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const userId = signInData.user.id;

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });

    if (updateError) {
      return res.status(500).json({ message: updateError.message });
    }

    res.json({ message: "✅ Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const getUserDetails = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  try {
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError) {
      return res.status(400).json({ message: userError.message });
    }

    const { data: limits, error: limitError } = await supabase
      .from("user_limits")
      .select("max_limit, used, usdt_balance")
      .eq("id", userId)
      .maybeSingle();

    if (limitError) {
      return res.status(400).json({ message: limitError.message });
    }

    const { data: purchases } = await supabase
      .from("purchases")
      .select("usdt_amount, created_at, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    res.json({
      email: user.user.email,
      usdt_balance: limits?.usdt_balance || 0,
      last_recharge: purchases?.length > 0 ? purchases[0] : null,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  login,
  register,
  addUser,
  getUsers,
  changePassword,
  getUserDetails
};
