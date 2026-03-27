const path = require("path");
const os = require("os");

const COST_PER_VERIFICATION = 0.0011;
const DEBUG_DIR = path.join(os.tmpdir(), "nexauth-debug");

module.exports = {
  COST_PER_VERIFICATION,
  DEBUG_DIR
};
