// ============================================
// FILE: services/email-ai.service.js
// CYBEV Email AI Service - Subject Lines, Content, Optimization
// VERSION: 1.0.0 - DeepSeek Primary, Claude Fallback
// ============================================

const axios = require('axios');

class EmailAIService {
  constructor() {
    this.deepseekKey = process.env.DEEPSEEK_API_KEY;
    this.claudeKey = process.env.ANTHROPIC_API_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY;
    
    console.log('📧 Email AI Service initialized');
    console.log(`   DeepSeek: ${this.deepseekKey ? '✅' : '❌'}`);
    console.log(`   Claude: ${this.claudeKey ? '✅' : '❌'}`);
    console.log(`   OpenAI: ${this.openaiKey ? '✅' : '❌'}`);
  }

  // ==========================================
  // SUBJECT LINE GENERATION
  // ==========================================

  async generateSubjectLines(options) {
    const { 
      topic, 
      tone = 'professional', 
      industry = 'general',
      emoji = true,
      count = 5,
      existingSubject = '',
      targetAudience = ''
    } = options;

    const prompt = `You are an expert email marketer. Generate ${count} compelling email subject lines.

Topic/Content: ${topic}
${existingSubject ? `Current subject to improve: ${existingSubject}` : ''}
Tone: ${tone}
Industry: ${industry}
Target Audience: ${targetAudience || 'General subscribers'}
Include Emojis: ${emoji ? 'Yes, use relevant emojis strategically' : 'No emojis'}

Requirements:
- Each subject line should be 30-60 characters
- Use proven techniques: curiosity, urgency, personalization, benefit-focused
- Avoid spam trigger words (FREE, ACT NOW, LIMITED TIME in all caps)
- Make them mobile-friendly (front-load key information)
- Vary the approaches (question, statement, how-to, list, etc.)

CRITICAL: Return ONLY valid JSON (no markdown):
{
  "subjectLines": [
    {
      "subject": "Subject line text",
      "technique": "curiosity|urgency|benefit|question|how-to|list|personalized",
      "predictedOpenRate": "high|medium|low",
      "reasoning": "Why this works"
    }
  ],
  "bestPick": 0,
  "tips": ["Tip 1", "Tip 2"]
}`;

    return await this.callAI(prompt);
  }

  // ==========================================
  // EMAIL CONTENT GENERATION
  // ==========================================

  async generateEmailContent(options) {
    const {
      type = 'newsletter', // newsletter, promotional, welcome, announcement, winback
      subject,
      topic,
      tone = 'professional',
      length = 'medium', // short, medium, long
      includeElements = ['header', 'body', 'cta', 'footer'],
      brandName = 'CYBEV',
      ctaText = 'Learn More',
      ctaUrl = '#'
    } = options;

    const lengthGuide = {
      short: '100-200 words',
      medium: '200-400 words',
      long: '400-600 words'
    };

    const prompt = `Generate a professional ${type} email in HTML format.

Subject: ${subject || topic}
Topic: ${topic}
Tone: ${tone}
Length: ${lengthGuide[length]}
Brand Name: ${brandName}
CTA Button Text: ${ctaText}
CTA URL: ${ctaUrl}

Email Type Guidelines:
- Newsletter: Informative, value-driven, multiple sections
- Promotional: Benefit-focused, urgency, clear offer
- Welcome: Warm, helpful, set expectations
- Announcement: Exciting, clear, action-oriented
- Winback: Personal, value reminder, incentive

Include these elements: ${includeElements.join(', ')}

CRITICAL: Return ONLY valid JSON (no markdown):
{
  "html": "<table>Complete responsive HTML email</table>",
  "previewText": "Preview text for inbox (50-100 chars)",
  "sections": [
    {"type": "header|body|cta|footer", "content": "section content"}
  ],
  "suggestedSubjects": ["Alt subject 1", "Alt subject 2"],
  "sendTimeSuggestion": "Best day and time to send"
}`;

    return await this.callAI(prompt);
  }

  // ==========================================
  // A/B TEST SUGGESTIONS
  // ==========================================

  async generateABTestVariants(options) {
    const {
      originalSubject,
      originalContent,
      testElement = 'subject', // subject, cta, content, sendTime
      variantCount = 2
    } = options;

    const prompt = `Create ${variantCount} A/B test variants for email optimization.

Test Element: ${testElement}
${testElement === 'subject' ? `Original Subject: ${originalSubject}` : ''}
${testElement === 'content' ? `Original Content: ${originalContent?.substring(0, 500)}...` : ''}

Requirements:
- Each variant should test ONE specific hypothesis
- Changes should be meaningful but isolated
- Provide expected impact prediction
- Include statistical significance recommendation

CRITICAL: Return ONLY valid JSON:
{
  "testType": "${testElement}",
  "hypothesis": "What we're testing and why",
  "variants": [
    {
      "name": "Variant A (Control)",
      "content": "${testElement === 'subject' ? originalSubject : 'Original'}",
      "changes": "No changes - control",
      "expectedImpact": "Baseline"
    },
    {
      "name": "Variant B",
      "content": "Modified version",
      "changes": "What changed",
      "expectedImpact": "+X% predicted improvement"
    }
  ],
  "recommendedSplit": "50/50",
  "minimumSampleSize": 1000,
  "testDuration": "24-48 hours",
  "successMetric": "Open rate|Click rate|Conversion"
}`;

    return await this.callAI(prompt);
  }

  // ==========================================
  // SEND TIME OPTIMIZATION
  // ==========================================

  async optimizeSendTime(options) {
    const {
      audience = 'general',
      industry = 'general',
      timezone = 'UTC',
      campaignType = 'newsletter',
      historicalData = null
    } = options;

    const prompt = `Recommend optimal email send times based on industry research and best practices.

Audience: ${audience}
Industry: ${industry}
Timezone: ${timezone}
Campaign Type: ${campaignType}
${historicalData ? `Historical Performance: ${JSON.stringify(historicalData)}` : ''}

CRITICAL: Return ONLY valid JSON:
{
  "bestTimes": [
    {
      "day": "Tuesday",
      "time": "10:00 AM",
      "timezone": "${timezone}",
      "confidence": "high|medium",
      "reasoning": "Why this time works"
    }
  ],
  "avoidTimes": [
    {
      "day": "Weekend",
      "time": "Early morning",
      "reason": "Lower engagement"
    }
  ],
  "industryInsights": "Specific insights for ${industry}",
  "recommendation": "Primary recommendation with reasoning"
}`;

    return await this.callAI(prompt);
  }

  // ==========================================
  // EMAIL COPY IMPROVEMENT
  // ==========================================

  async improveEmailCopy(options) {
    const {
      currentCopy,
      goal = 'engagement', // engagement, conversion, clicks
      tone = 'professional'
    } = options;

    const prompt = `Improve this email copy for better ${goal}.

Current Copy:
${currentCopy}

Goal: Maximize ${goal}
Tone: ${tone}

Analyze and improve:
1. Headlines and subject lines
2. Opening hook
3. Body copy clarity and persuasion
4. Call-to-action strength
5. Overall flow and readability

CRITICAL: Return ONLY valid JSON:
{
  "improvedCopy": "The improved version of the email",
  "changes": [
    {
      "original": "Original text",
      "improved": "Improved text",
      "reason": "Why this change helps"
    }
  ],
  "scoreImprovement": {
    "before": 65,
    "after": 85,
    "factors": ["clarity", "persuasion", "cta_strength"]
  },
  "additionalTips": ["Tip 1", "Tip 2"]
}`;

    return await this.callAI(prompt);
  }

  // ==========================================
  // AUTOMATION WORKFLOW SUGGESTIONS
  // ==========================================

  async suggestAutomationWorkflow(options) {
    const {
      triggerType = 'signup', // signup, purchase, abandoned_cart, birthday, inactivity
      industry = 'general',
      goals = ['engagement', 'conversion']
    } = options;

    const prompt = `Design an email automation workflow for: ${triggerType}

Industry: ${industry}
Goals: ${goals.join(', ')}

Create a complete workflow with:
1. Trigger conditions
2. Email sequence (timing, content themes)
3. Branching logic (if applicable)
4. Exit conditions

CRITICAL: Return ONLY valid JSON:
{
  "workflowName": "Workflow name",
  "description": "What this workflow does",
  "trigger": {
    "type": "${triggerType}",
    "conditions": ["Condition 1", "Condition 2"]
  },
  "emails": [
    {
      "order": 1,
      "delay": "Immediately|1 hour|1 day|3 days",
      "subject": "Suggested subject",
      "contentTheme": "What this email should cover",
      "goal": "Primary goal of this email",
      "exitCondition": "When to stop (if any)"
    }
  ],
  "branches": [
    {
      "condition": "If user clicks",
      "action": "Send follow-up immediately"
    }
  ],
  "expectedResults": {
    "openRate": "25-30%",
    "clickRate": "3-5%",
    "conversionRate": "1-2%"
  },
  "bestPractices": ["Tip 1", "Tip 2"]
}`;

    return await this.callAI(prompt);
  }

  // ==========================================
  // CORE AI CALL METHOD
  // ==========================================

  async callAI(prompt) {
    // Try DeepSeek first (cheapest)
    if (this.deepseekKey) {
      try {
        console.log('⚡ Using DeepSeek for email AI...');
        const result = await this.callDeepSeek(prompt);
        return this.parseResponse(result);
      } catch (err) {
        console.warn('⚠️ DeepSeek failed:', err.message);
      }
    }

    // Try Claude (expensive but reliable)
    if (this.claudeKey) {
      try {
        console.log('🧠 Using Claude for email AI...');
        const result = await this.callClaude(prompt);
        return this.parseResponse(result);
      } catch (err) {
        console.warn('⚠️ Claude failed:', err.message);
      }
    }

    // Try OpenAI as last resort
    if (this.openaiKey) {
      try {
        console.log('🤖 Using OpenAI for email AI...');
        const result = await this.callOpenAI(prompt);
        return this.parseResponse(result);
      } catch (err) {
        console.warn('⚠️ OpenAI failed:', err.message);
      }
    }

    throw new Error('No AI service available. Configure DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY');
  }

  async callDeepSeek(prompt) {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are an expert email marketer. Always respond with valid JSON only, no markdown.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4096
      },
      {
        headers: {
          'Authorization': `Bearer ${this.deepseekKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    return response.data.choices[0].message.content;
  }

  async callClaude(prompt) {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'x-api-key': this.claudeKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    return response.data.content[0].text;
  }

  async callOpenAI(prompt) {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert email marketer. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4096
      },
      {
        headers: {
          'Authorization': `Bearer ${this.openaiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    return response.data.choices[0].message.content;
  }

  parseResponse(response) {
    try {
      let cleaned = response.trim();
      cleaned = cleaned.replace(/^```json\s*\n?/i, '');
      cleaned = cleaned.replace(/^```\s*\n?/i, '');
      cleaned = cleaned.replace(/\n?```\s*$/i, '');
      return JSON.parse(cleaned.trim());
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      console.error('Raw response:', response.substring(0, 500));
      throw new Error('Invalid AI response format');
    }
  }
}

module.exports = new EmailAIService();
