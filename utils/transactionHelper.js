const supabase = require("../config/supabase");

/**
 * Records a transaction in the transactions table.
 * @param {string} userId - UUID of the user
 * @param {'credit' | 'debit'} type - Type of transaction
 * @param {number} amount - Amount in USDT
 * @param {string} description - Description of the transaction
 * @param {string} status - Status (completed, pending, failed)
 */
async function recordTransaction(userId, type, amount, description, status = "completed") {
  try {
    if (!userId) {
      console.error("❌ recordTransaction: userId is missing");
      return null;
    }

    // Ensure amount is a number
    const numericAmount = typeof amount === "number" ? amount : parseFloat(amount);
    if (isNaN(numericAmount)) {
      console.error("❌ recordTransaction: Invalid amount:", amount);
      return null;
    }

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type,
        amount: numericAmount,
        description,
        status
      })
      .select()
      .single();

    if (error) {
      console.error("❌ recordTransaction Error:", error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error("❌ recordTransaction Unexpected Error:", err.message);
    return null;
  }
}

module.exports = { recordTransaction };
