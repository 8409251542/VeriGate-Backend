const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { isAdmin } = require("../middleware/auth");

router.get("/admin/history", isAdmin, adminController.getAdminHistory);
router.get("/user-history", adminController.getUserHistory);

module.exports = router;
