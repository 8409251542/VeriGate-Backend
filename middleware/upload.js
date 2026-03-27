const multer = require("multer");
const os = require("os");

const upload = multer({ dest: os.tmpdir() });
const uploadMemory = multer({ storage: multer.memoryStorage() });

module.exports = {
  upload,
  uploadMemory
};
