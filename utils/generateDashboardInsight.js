
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function generateDashboardInsight(metrics) {
  const prompt = `
Generate a short, helpful admin dashboard summary using the following:

Users: ${metrics.users}
Posts: ${metrics.posts}
Views: ${metrics.views}
Earnings: $${metrics.earnings}
Top City: ${metrics.topCity}
Top Device: ${metrics.topDevice}
Top Role: ${metrics.topRole}

Summary format: 3–5 sentences starting with "🧠 Weekly Insight:"
`;

  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a helpful analytics assistant." },
      { role: "user", content: prompt }
    ],
    temperature: 0.7
  });

  return response.data.choices[0].message.content.trim();
}

module.exports = generateDashboardInsight;
