const axios = require("axios");

const rewriteContent = async (content) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const prompt = `Rewrite the following content while keeping the overall meaning, tone, and approximate length similar.

Rules:
- ONLY return the rewritten content.
- DO NOT add introductions, explanations, notes, bullet points, summaries, or closing remarks.
- DO NOT say things like "Here’s the rewritten version" or "Note:".
- DO NOT mention what was changed.
- Change:
  - Amounts/prices
  - Website names (use only: bestbuy.com, alibaba.com, newegg.com)
  - Products (use premium products such as laptops, smartphones, headphones, watches, shoes, bags, etc.)
  - Locations (use locations from Bangladesh, Russia, Pakistan, India, or Vietnam)
  - Some wording, sentence structure, and phrasing so the content looks naturally rewritten.
- Preserve the original intent and format as closely as possible.
- Keep phone numbers, OTPs, codes, email formats, or transaction/reference styles realistic if present.
- Output must contain ONLY the rewritten text and nothing else.

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
