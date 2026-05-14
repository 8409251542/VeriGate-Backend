const axios = require("axios");

const rewriteContent = async (content) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const prompt = `Rewrite this content in about same length, change amount, website, and somewords and sentences as well to look new, but message conveyed should be same:

${content}`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      },
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Groq API error:", error.response ? error.response.data : error.message);
    throw new Error("Failed to rewrite content using Groq API");
  }
};

module.exports = { rewriteContent };
