/**
 * AI Generate Routes - Content Generation
 * CYBEV Studio v2.0
 * GitHub: https://github.com/cybev1/cybev-backend/routes/ai-generate.routes.js
 * 
 * Providers:
 * - DeepSeek (default) - Most cost-effective
 * - OpenAI (fallback 1) - GPT-4o-mini
 * - Claude (fallback 2) - Claude 3 Haiku
 */

const express = require('express');
const router = express.Router();

// ============================================
// PROVIDER CONFIGURATION
// ============================================
const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
  },
  claude: {
    name: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-haiku-20240307',
    apiKey: process.env.ANTHROPIC_API_KEY
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

async function generateWithProvider(provider, prompt, options = {}) {
  const config = PROVIDERS[provider];
  
  if (!config?.apiKey) {
    throw new Error(`${provider} API key not configured`);
  }

  // Claude uses a different API format
  if (provider === 'claude') {
    const response = await fetch(`${config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: options.maxTokens || 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  // OpenAI-compatible API (DeepSeek, OpenAI)
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature || 0.7,
      messages: [
        { role: 'system', content: options.systemPrompt || 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`${provider} API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateWithFallback(prompt, options = {}) {
  const providerOrder = ['deepseek', 'openai', 'claude'];
  
  for (const provider of providerOrder) {
    if (PROVIDERS[provider].apiKey) {
      try {
        return await generateWithProvider(provider, prompt, options);
      } catch (error) {
        console.error(`${provider} failed:`, error.message);
        continue;
      }
    }
  }
  
  // All providers failed, return template response
  return null;
}

// ============================================
// ROUTES
// ============================================

// Get available providers
router.get('/providers', (req, res) => {
  const providers = Object.entries(PROVIDERS).map(([key, value]) => ({
    id: key,
    name: value.name,
    available: !!value.apiKey
  }));
  
  res.json({ providers });
});

// Generate campaign content
router.post('/generate-campaign', async (req, res) => {
  try {
    const { type, topic, tone = 'professional', audience, length = 'medium' } = req.body;

    const prompt = `Create a ${type} campaign about "${topic}" for ${audience || 'general audience'}.
Tone: ${tone}
Length: ${length}

Generate:
1. A compelling subject line (for email) or headline
2. The main content
3. A call-to-action

Format as JSON with keys: subject, content, cta`;

    const result = await generateWithFallback(prompt, {
      systemPrompt: 'You are an expert marketing copywriter. Always respond with valid JSON.',
      maxTokens: 1024
    });

    if (!result) {
      // Template fallback
      return res.json({
        subject: `Discover ${topic} Today`,
        content: `We're excited to share information about ${topic} with you. This is designed specifically for ${audience || 'you'}.`,
        cta: 'Learn More',
        generated: false
      });
    }

    try {
      const parsed = JSON.parse(result);
      res.json({ ...parsed, generated: true });
    } catch {
      res.json({ content: result, generated: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate social media content
router.post('/generate-social', async (req, res) => {
  try {
    const { platform = 'facebook', topic, style = 'engaging', includeHashtags = true } = req.body;

    const prompt = `Create a ${platform} post about "${topic}".
Style: ${style}
${includeHashtags ? 'Include relevant hashtags.' : 'No hashtags.'}

Make it engaging and optimized for ${platform}.`;

    const result = await generateWithFallback(prompt, {
      systemPrompt: 'You are a social media expert. Create engaging posts optimized for each platform.',
      maxTokens: 512
    });

    if (!result) {
      return res.json({
        content: `Check out our latest update about ${topic}! 🚀`,
        hashtags: includeHashtags ? ['#trending', '#viral', '#mustread'] : [],
        generated: false
      });
    }

    res.json({ content: result, generated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate comment variations
router.post('/generate-comments', async (req, res) => {
  try {
    const { postTopic, count = 5, style = 'friendly' } = req.body;

    const prompt = `Generate ${count} unique, ${style} comments for a social media post about "${postTopic}".

Make them natural, varied, and engaging. Each should be different in length and approach.

Return as a JSON array of strings.`;

    const result = await generateWithFallback(prompt, {
      systemPrompt: 'You are a social media engagement expert. Generate natural, human-like comments.',
      maxTokens: 1024
    });

    if (!result) {
      return res.json({
        comments: [
          'This is amazing! Thanks for sharing! 🙌',
          'Love this content! Keep it up!',
          'Exactly what I needed to see today!',
          'Great post! Very informative.',
          'This is so helpful, thank you!'
        ],
        generated: false
      });
    }

    try {
      const comments = JSON.parse(result);
      res.json({ comments, generated: true });
    } catch {
      const comments = result.split('\n').filter(c => c.trim());
      res.json({ comments, generated: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate message template
router.post('/generate-message', async (req, res) => {
  try {
    const { purpose, recipientType, tone = 'friendly', includePersonalization = true } = req.body;

    const prompt = `Create a direct message template for ${purpose} to send to ${recipientType}.
Tone: ${tone}
${includePersonalization ? 'Include {name} placeholder for personalization.' : ''}

Make it natural and not spammy. Keep it concise.`;

    const result = await generateWithFallback(prompt, {
      systemPrompt: 'You are an expert at writing personal, engaging direct messages that get responses.',
      maxTokens: 512
    });

    if (!result) {
      return res.json({
        message: `Hey ${includePersonalization ? '{name}' : 'there'}! I came across your profile and thought we might have some common interests. Would love to connect!`,
        generated: false
      });
    }

    res.json({ message: result, generated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Improve/rewrite text
router.post('/improve-text', async (req, res) => {
  try {
    const { text, goal = 'improve', tone } = req.body;

    const goalInstructions = {
      improve: 'Make it clearer and more engaging',
      shorten: 'Make it more concise while keeping the main points',
      expand: 'Add more detail and context',
      formal: 'Make it more professional and formal',
      casual: 'Make it more casual and friendly',
      persuasive: 'Make it more persuasive and compelling'
    };

    const prompt = `${goalInstructions[goal] || goalInstructions.improve}:

"${text}"

${tone ? `Target tone: ${tone}` : ''}`;

    const result = await generateWithFallback(prompt, {
      systemPrompt: 'You are an expert editor. Improve text while maintaining the original meaning.',
      maxTokens: 1024
    });

    if (!result) {
      return res.json({ improved: text, generated: false });
    }

    res.json({ improved: result, generated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
