const path = require("path");

const COST_PER_VERIFICATION = 0.0011;
const DEBUG_DIR = path.join(__dirname, "..", "uploads", "verified-data", "debug");

module.exports = {
  COST_PER_VERIFICATION,
  DEBUG_DIR
};
