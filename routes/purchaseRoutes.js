const express = require("express");
const router = express.Router();
const purchaseController = require("../controllers/purchaseController");
const { upload } = require("../middleware/upload");
const { isAdmin } = require("../middleware/auth");

router.post("/purchase", upload.single("screenshot"), purchaseController.submitPurchase);
router.get("/purchases", purchaseController.getPurchases);
router.post("/approve-purchase", isAdmin, purchaseController.approvePurchase);
router.post("/reject-purchase", isAdmin, purchaseController.rejectPurchase);

module.exports = router;
