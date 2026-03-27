const express = require("express");
const router = express.Router();
const verificationController = require("../controllers/verificationController");
const { upload } = require("../middleware/upload");
const { isAdmin } = require("../middleware/auth");

router.get("/admin/verification-mode", isAdmin, verificationController.getVerificationMode);
router.post("/admin/verification-mode", isAdmin, verificationController.setVerificationMode);
router.post("/verify-number", verificationController.verifyNumber);
router.post("/upload-csv", upload.single("file"), verificationController.uploadCsv);
router.post("/api/verify-batch", verificationController.verifyBatch);
router.post("/api/finalize-verification", verificationController.finalizeVerification);
router.post("/api/get-upload-url", verificationController.getUploadUrl);

module.exports = router;
