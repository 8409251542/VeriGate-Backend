const express = require("express");
const router = express.Router();
const verificationController = require("../controllers/verificationController");
const { upload } = require("../middleware/upload");
const { isAdmin } = require("../middleware/auth");

router.get("/api/admin/verification-mode", isAdmin, verificationController.getVerificationMode);
router.post("/api/admin/verification-mode", isAdmin, verificationController.setVerificationMode);
router.post("/verify-number", verificationController.verifyNumber);
router.post("/upload-csv", upload.single("file"), verificationController.uploadCsv);
router.post("/api/verify-batch", verificationController.verifyBatch);
router.post("/api/finalize-verification", verificationController.finalizeVerification);
router.post("/api/get-upload-url", verificationController.getUploadUrl);

// Veriphone Bulk API Routes
router.post("/api/v2/file/upload", upload.single("file"), verificationController.bulkUpload);
router.post("/api/v2/file/verify", verificationController.bulkVerify);
router.get("/api/v2/file/status", verificationController.bulkStatus);
router.get("/api/v2/file/get", verificationController.bulkGetDetails);
router.get("/api/v2/file/list", verificationController.bulkList);
router.get("/api/v2/file/download", verificationController.bulkDownload);
router.post("/api/v2/file/delete", verificationController.bulkDelete);

module.exports = router;
