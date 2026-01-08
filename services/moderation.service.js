// ============================================
// FILE: services/moderation.service.js
// Content Moderation Service with AI Analysis
// VERSION: 1.0
// ============================================

const axios = require('axios');

class ModerationService {
  constructor() {
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    this.perspectiveKey = process.env.PERSPECTIVE_API_KEY;
    
    // Default word filters (basic list - expand as needed)
    this.defaultBadWords = [
      // Add basic profanity filter words
    ];
    
    // Spam patterns
    this.spamPatterns = [
      /\b(buy|sell|discount|offer|free|click here|act now)\b/gi,
      /(https?:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?/gi, // URLs for new accounts
      /(.)\1{5,}/g, // Repeated characters
      /[\u{1F300}-\u{1F9FF}]{10,}/gu // Excessive emojis
    ];
    
    // Scam indicators
    this.scamPatterns = [
      /send.*\$?\d+.*crypto/i,
      /double.*your.*money/i,
      /investment.*opportunity/i,
      /guaranteed.*returns/i,
      /dm.*for.*details/i,
      /whatsapp.*\+?\d{10,}/i
    ];

    console.log('🛡️ Moderation Service initialized');
    console.log(`   AI Analysis: ${this.anthropicKey || this.openaiKey ? '✅ Configured' : '⚠️ Not configured'}`);
    console.log(`   Perspective API: ${this.perspectiveKey ? '✅ Configured' : '⚠️ Not configured'}`);
  }

  // ==========================================
  // TEXT ANALYSIS
  // ==========================================

  /**
   * Analyze text content for various violations
   */
  async analyzeContent(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return { safe: true, issues: [] };
    }

    const results = {
      safe: true,
      issues: [],
      scores: {
        toxicity: 0,
        spam: 0,
        nsfw: 0,
        hate: 0,
        violence: 0,
        selfHarm: 0
      },
      flags: [],
      suggestions: []
    };

    try {
      // Run all checks in parallel
      const [
        wordFilterResult,
        spamResult,
        scamResult,
        aiResult
      ] = await Promise.all([
        this.checkWordFilter(text),
        this.checkSpamPatterns(text),
        this.checkScamPatterns(text),
        options.useAI ? this.analyzeWithAI(text) : Promise.resolve(null)
      ]);

      // Word filter results
      if (wordFilterResult.flagged) {
        results.safe = false;
        results.issues.push(...wordFilterResult.issues);
        results.flags.push('profanity');
      }

      // Spam results
      if (spamResult.isSpam) {
        results.scores.spam = spamResult.score;
        if (spamResult.score > 0.7) {
          results.safe = false;
          results.flags.push('spam');
        }
        results.issues.push(...spamResult.issues);
      }

      // Scam results
      if (scamResult.isScam) {
        results.safe = false;
        results.flags.push('scam');
        results.issues.push(...scamResult.issues);
      }

      // AI analysis results
      if (aiResult) {
        results.scores = { ...results.scores, ...aiResult.scores };
        if (aiResult.flagged) {
          results.safe = false;
          results.flags.push(...aiResult.flags);
          results.issues.push(...aiResult.issues);
        }
        results.suggestions = aiResult.suggestions || [];
      }

      // Determine overall safety
      if (results.scores.toxicity > 0.8 || 
          results.scores.hate > 0.7 ||
          results.scores.violence > 0.8 ||
          results.scores.selfHarm > 0.7) {
        results.safe = false;
      }

      return results;
    } catch (error) {
      console.error('Content analysis error:', error);
      return { 
        safe: true, 
        issues: [], 
        error: error.message,
        fallback: true 
      };
    }
  }

  /**
   * Check text against word filter database
   */
  async checkWordFilter(text, customFilters = []) {
    const result = {
      flagged: false,
      issues: [],
      matchedWords: []
    };

    const textLower = text.toLowerCase();
    const allFilters = [...this.defaultBadWords, ...customFilters];

    for (const filter of allFilters) {
      if (filter.isRegex) {
        const regex = new RegExp(filter.word, 'gi');
        if (regex.test(textLower)) {
          result.flagged = true;
          result.matchedWords.push(filter.word);
          result.issues.push({
            type: 'word-filter',
            category: filter.category,
            severity: filter.severity,
            word: filter.word
          });
        }
      } else if (textLower.includes(filter.word || filter)) {
        result.flagged = true;
        result.matchedWords.push(filter.word || filter);
        result.issues.push({
          type: 'word-filter',
          category: filter.category || 'custom',
          severity: filter.severity || 'medium'
        });
      }
    }

    return result;
  }

  /**
   * Check for spam patterns
   */
  checkSpamPatterns(text) {
    const result = {
      isSpam: false,
      score: 0,
      issues: []
    };

    let spamIndicators = 0;

    // Check for excessive caps
    const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (capsRatio > 0.5 && text.length > 20) {
      spamIndicators++;
      result.issues.push({ type: 'spam', reason: 'Excessive caps' });
    }

    // Check for repeated words
    const words = text.toLowerCase().split(/\s+/);
    const wordCounts = {};
    words.forEach(w => wordCounts[w] = (wordCounts[w] || 0) + 1);
    const maxRepeat = Math.max(...Object.values(wordCounts));
    if (maxRepeat > 5) {
      spamIndicators++;
      result.issues.push({ type: 'spam', reason: 'Repeated words' });
    }

    // Check spam patterns
    for (const pattern of this.spamPatterns) {
      if (pattern.test(text)) {
        spamIndicators++;
        result.issues.push({ type: 'spam', reason: 'Spam pattern detected' });
      }
    }

    // Calculate score
    result.score = Math.min(spamIndicators / 5, 1);
    result.isSpam = result.score > 0.4;

    return result;
  }

  /**
   * Check for scam patterns
   */
  checkScamPatterns(text) {
    const result = {
      isScam: false,
      issues: []
    };

    for (const pattern of this.scamPatterns) {
      if (pattern.test(text)) {
        result.isScam = true;
        result.issues.push({
          type: 'scam',
          reason: 'Potential scam content detected',
          severity: 'high'
        });
        break;
      }
    }

    return result;
  }

  /**
   * Analyze content with AI (Claude/OpenAI)
   */
  async analyzeWithAI(text) {
    if (!this.anthropicKey && !this.openaiKey) {
      return null;
    }

    try {
      // Use Claude if available
      if (this.anthropicKey) {
        return await this.analyzeWithClaude(text);
      }
      // Fallback to OpenAI
      if (this.openaiKey) {
        return await this.analyzeWithOpenAI(text);
      }
    } catch (error) {
      console.error('AI analysis error:', error.message);
      return null;
    }
  }

  async analyzeWithClaude(text) {
    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-haiku-20240307',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Analyze this content for moderation. Rate each category 0-1:
- toxicity (insults, threats)
- hate_speech (discrimination, slurs)
- violence (threats, graphic content)
- self_harm (suicide, self-injury references)
- spam (promotional, repetitive)
- nsfw (adult content)

Return JSON only: {"scores":{"toxicity":0,"hate":0,"violence":0,"selfHarm":0,"spam":0,"nsfw":0},"flagged":false,"flags":[],"issues":[],"suggestions":[]}

Content: "${text.substring(0, 1000)}"`
          }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.anthropicKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      const content = response.data.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return null;
    } catch (error) {
      console.error('Claude analysis error:', error.message);
      return null;
    }
  }

  async analyzeWithOpenAI(text) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/moderations',
        { input: text },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openaiKey}`
          }
        }
      );

      const result = response.data.results[0];
      return {
        scores: {
          toxicity: result.category_scores.harassment || 0,
          hate: result.category_scores['hate'] || 0,
          violence: result.category_scores['violence'] || 0,
          selfHarm: result.category_scores['self-harm'] || 0,
          nsfw: result.category_scores['sexual'] || 0
        },
        flagged: result.flagged,
        flags: Object.keys(result.categories).filter(k => result.categories[k]),
        issues: result.flagged ? [{ type: 'ai-flagged', reason: 'Content flagged by AI' }] : []
      };
    } catch (error) {
      console.error('OpenAI moderation error:', error.message);
      return null;
    }
  }

  // ==========================================
  // IMAGE ANALYSIS
  // ==========================================

  /**
   * Analyze image for NSFW content
   */
  async analyzeImage(imageUrl) {
    const result = {
      safe: true,
      scores: {
        nsfw: 0,
        violence: 0,
        gore: 0
      },
      flags: []
    };

    // If using Google Cloud Vision or similar
    // Add implementation here

    return result;
  }

  // ==========================================
  // USER TRUST SCORE
  // ==========================================

  /**
   * Calculate user trust score
   */
  calculateTrustScore(userData) {
    let score = 50; // Base score
    const components = {};

    // Account age (0-20 points)
    const accountAgeDays = userData.accountAgeDays || 0;
    components.accountAge = Math.min(accountAgeDays / 30 * 5, 20);
    score += components.accountAge;

    // Email verification (10 points)
    components.emailVerified = userData.emailVerified ? 10 : 0;
    score += components.emailVerified;

    // Content quality (0-20 points based on engagement)
    const avgEngagement = userData.avgEngagement || 0;
    components.contentQuality = Math.min(avgEngagement * 10, 20);
    score += components.contentQuality;

    // Report history (-30 to 0 points)
    const reportCount = userData.reportCount || 0;
    const warningCount = userData.warningCount || 0;
    components.reportHistory = -Math.min((reportCount * 5) + (warningCount * 10), 30);
    score += components.reportHistory;

    // Follower ratio (0-10 points)
    const followerRatio = userData.followers / Math.max(userData.following, 1);
    components.followerRatio = Math.min(followerRatio * 2, 10);
    score += components.followerRatio;

    // Verified status (10 bonus points)
    if (userData.isVerified) {
      score += 10;
    }

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score));

    return {
      score: Math.round(score),
      components,
      flags: {
        isNewAccount: accountAgeDays < 7,
        hasWarnings: warningCount > 0,
        isHighQualityContributor: score > 80,
        isVerified: userData.isVerified
      }
    };
  }

  // ==========================================
  // RATE LIMITING
  // ==========================================

  /**
   * Check if user is rate limited
   */
  async checkRateLimit(userId, action, limits) {
    // Implementation would use Redis or in-memory store
    // For now, return not limited
    return {
      limited: false,
      remaining: limits.max,
      resetAt: null
    };
  }

  // ==========================================
  // CONTENT FILTER
  // ==========================================

  /**
   * Filter/sanitize content
   */
  filterContent(text, options = {}) {
    let filtered = text;

    // Replace profanity with asterisks
    if (options.replaceProfanity) {
      for (const word of this.defaultBadWords) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        filtered = filtered.replace(regex, '*'.repeat(word.length));
      }
    }

    // Remove links from new users
    if (options.removeLinks) {
      filtered = filtered.replace(/(https?:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?/gi, '[link removed]');
    }

    return filtered;
  }

  // ==========================================
  // PRIORITY CALCULATION
  // ==========================================

  /**
   * Calculate report priority
   */
  calculatePriority(report) {
    let priorityScore = 0;

    // High severity reasons
    const highPriorityReasons = ['violence', 'self-harm', 'underage', 'illegal-content'];
    if (highPriorityReasons.includes(report.reason)) {
      priorityScore += 3;
    }

    // Medium severity
    const mediumPriorityReasons = ['harassment', 'hate-speech', 'impersonation'];
    if (mediumPriorityReasons.includes(report.reason)) {
      priorityScore += 2;
    }

    // AI flagged
    if (report.aiAnalysis?.flagged) {
      priorityScore += 1;
    }

    // Multiple reports on same content
    if (report.relatedReports?.length > 3) {
      priorityScore += 2;
    }

    // User with history
    if (report.contentAuthorHasHistory) {
      priorityScore += 1;
    }

    // Determine priority level
    if (priorityScore >= 4) return 'critical';
    if (priorityScore >= 3) return 'high';
    if (priorityScore >= 2) return 'medium';
    return 'low';
  }
}

module.exports = new ModerationService();
