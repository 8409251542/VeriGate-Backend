const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { isAdmin } = require("../middleware/auth");

router.post("/login", authController.login);
router.post("/register", authController.register);
router.post("/add-user", isAdmin, authController.addUser);
router.post("/get-users", isAdmin, authController.getUsers);
router.post("/change-password", authController.changePassword);
router.post("/get-user-details", authController.getUserDetails);

module.exports = router;
