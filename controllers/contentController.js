const { rewriteContent: rewriteGroq } = require("../utils/groqClient");

const rewriteContent = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    const rewritten = await rewriteGroq(content);
    res.json({ success: true, rewritten });
  } catch (err) {
    res.status(500).json({ message: "Rewriting failed", error: err.message });
  }
};

module.exports = {
  rewriteContent
};
