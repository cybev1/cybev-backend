
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function generateInsightSummary(data) {
  const prompt = `
You are an analytics AI assistant for a Web3 social media platform called CYBEV.
Given the following weekly analytics data, generate a brief summary with insights.
Make it sound professional, helpful, and exciting.

Data:
- New Users: ${data.users}
- Posts: ${data.posts}
- Views: ${data.views}
- Earnings: $${data.earnings}
- Top City: ${data.topCity} (${data.topCityViews} views)
- Top Device: ${data.topDevice} (${data.topDeviceCount} sessions)
- Highest Source of Earnings: ${data.topEarningSource} ($${data.topEarningAmount})

Write the summary in 3–5 sentences. Begin with "💡 Weekly Insight:"`;

  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a helpful analytics assistant." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  return response.data.choices[0].message.content.trim();
}

module.exports = generateInsightSummary;
