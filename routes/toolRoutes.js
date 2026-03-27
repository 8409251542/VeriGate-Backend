const express = require("express");
const router = express.Router();
const toolController = require("../controllers/toolController");
const { uploadMemory } = require("../middleware/upload");

router.post("/api/generate-invoice", toolController.generateInvoice);
router.post("/api/generate-report", uploadMemory.single("file"), toolController.generateReport);
router.post("/api/deduct-image-cost", toolController.deductImageCost);
router.get("/api/tools/:toolName", toolController.serveTool);

module.exports = router;
