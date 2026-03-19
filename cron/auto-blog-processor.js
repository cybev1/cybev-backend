// ============================================
// FILE: cron/auto-blog-processor.js
// CYBEV Auto-Blog Generator — Cron Service
// Runs every hour, checks campaigns, generates articles
// VERSION: 1.0
// ============================================
const mongoose = require('mongoose');
const axios = require('axios');

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PEXELS_KEY = process.env.PEXELS_API_KEY;

let processInterval = null;
let isProcessing = false;

// ─── AI Generation ───
async function generateAI(prompt, system = 'You are an expert content creator.') {
  // Try DeepSeek first, then OpenAI fallback
  if (DEEPSEEK_KEY) {
    try {
      const { data } = await axios.post('https://api.deepseek.com/chat/completions', {
        model: 'deepseek-chat', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        max_tokens: 3000, temperature: 0.8
      }, { headers: { Authorization: `Bearer ${DEEPSEEK_KEY}` }, timeout: 60000 });
      return data.choices?.[0]?.message?.content?.trim();
    } catch (e) { console.log('⚠️ DeepSeek failed, trying OpenAI:', e.message); }
  }
  if (OPENAI_KEY) {
    try {
      const { data } = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        max_tokens: 3000, temperature: 0.8
      }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 60000 });
      return data.choices?.[0]?.message?.content?.trim();
    } catch (e) { console.log('⚠️ OpenAI failed:', e.message); }
  }
  return null;
}

// ─── Image Fetching ───
async function getImage(query) {
  if (!PEXELS_KEY) return '';
  try {
    const { data } = await axios.get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`, {
      headers: { Authorization: PEXELS_KEY }, timeout: 10000
    });
    const photos = data.photos || [];
    if (!photos.length) return '';
    return photos[Math.floor(Math.random() * photos.length)].src?.landscape || photos[0].src?.original || '';
  } catch { return ''; }
}

// ─── Topic generation ───
const FALLBACK_TOPICS = {
  technology: ['The Future of AI in 2026', 'Top 5 Tech Trends Changing the World', 'How Blockchain is Transforming Industries', 'The Rise of No-Code Platforms', 'Cybersecurity Tips Everyone Should Know', '5G and Its Impact on Daily Life', 'Machine Learning for Beginners', 'Why Cloud Computing Matters', 'The Best Coding Languages to Learn', 'Tech Innovations From Africa'],
  business: ['How to Start a Business With $100', 'Building Your Personal Brand Online', 'Side Hustle Ideas That Actually Work', 'Financial Planning for Entrepreneurs', 'Leadership Skills That Make a Difference', 'Marketing Strategies for Small Businesses', 'The Gig Economy Explained', 'E-Commerce Tips for Beginners', 'Negotiation Skills for Business', 'Remote Work Best Practices'],
  health: ['10 Habits for a Healthier Life', 'Mental Health Awareness', 'Nutrition Myths Debunked', 'Fitness Routines You Can Do At Home', 'Importance of Sleep Quality', 'Managing Stress in Modern Life', 'The Benefits of Meditation', 'Healthy Eating on a Budget', 'Understanding Anxiety', 'Building a Wellness Routine'],
  entertainment: ['Top Movies to Watch This Year', 'Music That Inspires Change', 'The Evolution of Streaming Platforms', 'African Cinema on the Rise', 'Podcasts Worth Listening To', 'Video Games That Teach Life Skills', 'Social Media Trends', 'Content Creation Tips', 'Behind the Scenes of Film Making', 'The Power of Storytelling'],
  sports: ['Football Legends Who Changed the Game', 'The Olympics and Unity', 'How Sports Build Character', 'Youth Sports Development', 'Fitness Training for Athletes', 'Basketball Around the World', 'The Business of Sports', 'Inspiring Athletic Comebacks', 'Women in Sports', 'E-Sports and the Future'],
  science: ['Space Exploration Updates', 'Climate Change Solutions', 'Breakthroughs in Medicine', 'Understanding Quantum Computing', 'Ocean Conservation Efforts', 'The Science of Habits', 'Renewable Energy Innovations', 'DNA and Genetics Simplified', 'Mars Mission Progress', 'How Vaccines Work'],
  lifestyle: ['Minimalism and Happiness', 'Travel on a Budget', 'Home Organization Tips', 'Fashion Trends That Are Sustainable', 'Work-Life Balance Strategies', 'Digital Detox Benefits', 'Building Meaningful Relationships', 'Self-Improvement Books', 'Cooking for One', 'Morning Routines of Successful People'],
  news: ['Global Economic Outlook', 'Technology Policy Updates', 'Environmental News Roundup', 'Education Reform Discussions', 'Healthcare Access Worldwide', 'Infrastructure Development in Africa', 'Digital Currency Regulations', 'Social Media Policy Changes', 'International Trade Updates', 'Innovation in Developing Nations'],
  education: ['The Future of Online Learning', 'Study Tips for Students', 'Scholarships for African Students', 'STEM Education Importance', 'Learning a New Language', 'Educational Technology Trends', 'Career Planning for Graduates', 'Coding Bootcamps Review', 'Financial Literacy in Schools', 'The Value of Mentorship'],
  faith: ['Finding Purpose in Life', 'The Power of Prayer', 'Building a Strong Foundation', 'Gratitude as a Daily Practice', 'Overcoming Challenges with Faith', 'Community and Fellowship', 'Inspirational Stories of Hope', 'Living with Intention', 'Wisdom for Daily Living', 'The Impact of Generosity'],
  travel: ['Hidden Gems in Africa', 'Budget Travel Tips', 'Best Cultural Festivals Worldwide', 'Solo Travel Guide', 'Eco-Tourism Destinations', 'Travel Photography Tips', 'Food Tourism Around the World', 'Digital Nomad Lifestyle', 'Safest Travel Destinations', 'How Travel Changes Your Perspective'],
  food: ['Easy Recipes for Busy People', 'African Cuisine You Must Try', 'Meal Prep Ideas', 'Healthy Snack Options', 'Street Food Around the World', 'Vegan Cooking Made Simple', 'Food Sustainability', 'Cooking Tips from Chefs', 'Traditional Dishes and Their Stories', 'Superfoods Worth Adding to Your Diet'],
  finance: ['Investing for Beginners', 'Crypto Trading Basics', 'Saving Money Tips', 'Building Passive Income', 'Understanding Stock Markets', 'Financial Mistakes to Avoid', 'Budgeting Apps That Work', 'Retirement Planning Early', 'Real Estate Investment Guide', 'Debt Management Strategies'],
  music: ['Rising Artists to Watch', 'Music Production Tips', 'How Music Therapy Works', 'The Business of Music', 'Best Music Festivals', 'Learning an Instrument', 'Gospel Music Impact', 'Afrobeats Going Global', 'Music and Mental Health', 'Behind the Scenes of Hit Songs'],
  culture: ['Celebrating Cultural Diversity', 'Art That Changed the World', 'Preserving Indigenous Languages', 'Fashion as Cultural Expression', 'Film and Cultural Identity', 'Literature That Inspires', 'Dance Traditions Worldwide', 'Museums Worth Visiting', 'Cultural Exchange Programs', 'Heritage and Modern Life'],
  general: ['Things You Didn\'t Know About the World', 'Interesting Facts for Curious Minds', 'How to Be More Productive', 'Life Lessons Worth Sharing', 'Innovations That Changed Everything', 'Inspiring People Making a Difference', 'Surprising Benefits of Reading', 'How to Build Good Habits', 'Understanding Different Perspectives', 'The Power of Community']
};

async function generateTopics(category, count = 5) {
  // Try AI-generated topics first
  try {
    const result = await generateAI(
      `Generate ${count} unique, trending blog article titles for the "${category}" category. Make them engaging, clickable, and SEO-friendly. Return ONLY a JSON array of strings, nothing else.`,
      'You are a trending content strategist. Generate diverse, timely topics.'
    );
    if (result) {
      const parsed = JSON.parse(result.replace(/```json?|```/g, '').trim());
      if (Array.isArray(parsed) && parsed.length >= count) return parsed.slice(0, count);
    }
  } catch {}
  // Fallback to preset topics
  const pool = FALLBACK_TOPICS[category] || FALLBACK_TOPICS.general;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ─── Main processor ───
async function processAutoBlogCampaigns() {
  if (isProcessing) return;
  isProcessing = true;
  
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    const User = mongoose.model('User');
    let Blog;
    try { Blog = mongoose.model('Blog'); } catch { Blog = require('../models/blog.model'); }

    const campaigns = await AutoBlogCampaign.find({ isActive: true, isPaused: false });
    if (!campaigns.length) { isProcessing = false; return; }

    const currentHour = new Date().getHours();
    console.log(`📝 Auto-Blog: Processing ${campaigns.length} campaigns (hour: ${currentHour})`);

    for (const campaign of campaigns) {
      // Check if current hour is in posting schedule
      if (!campaign.postingHours.includes(currentHour)) continue;

      // Calculate how many articles per posting hour
      const postsPerHour = Math.max(1, Math.ceil(campaign.articlesPerDay / campaign.postingHours.length));
      
      console.log(`📝 Campaign "${campaign.name}": Generating ${postsPerHour} articles`);

      // Get special users for this campaign
      let authors;
      if (campaign.assignedUsers?.length > 0) {
        authors = await User.find({ _id: { $in: campaign.assignedUsers }, isSynthetic: true })
          .select('_id name displayName username avatar').lean();
      }
      if (!authors?.length) {
        authors = await User.aggregate([
          { $match: { isSynthetic: true } },
          { $sample: { size: campaign.randomUserCount || 10 } },
          { $project: { _id: 1, name: 1, displayName: 1, username: 1, avatar: 1 } }
        ]);
      }
      if (!authors.length) { console.log('⚠️ No special users available'); continue; }

      // Pick categories and generate topics
      const categories = campaign.categories.length ? campaign.categories : Object.keys(FALLBACK_TOPICS);
      let created = 0, failed = 0;

      for (let i = 0; i < postsPerHour; i++) {
        const author = authors[Math.floor(Math.random() * authors.length)];
        const category = categories[Math.floor(Math.random() * categories.length)];
        const tone = campaign.tones[Math.floor(Math.random() * campaign.tones.length)] || 'conversational';
        const niche = campaign.niches[Math.floor(Math.random() * campaign.niches.length)] || 'general';

        // Pick or generate topic
        let topic;
        if (campaign.topics?.length > 0) {
          topic = campaign.topics[Math.floor(Math.random() * campaign.topics.length)];
        } else {
          const topics = await generateTopics(category, 3);
          topic = topics[Math.floor(Math.random() * topics.length)];
        }

        try {
          const wordCount = campaign.articleLength === 'short' ? '500-700' : campaign.articleLength === 'long' ? '1200-1800' : '800-1100';
          const authorName = author.displayName || author.name || author.username;

          let socialSection = '';
          if (campaign.includeSocialPromo && campaign.socialLinks) {
            const links = campaign.socialLinks;
            const parts = [];
            if (links.youtube) parts.push(`[YouTube](${links.youtube})`);
            if (links.facebook) parts.push(`[Facebook](${links.facebook})`);
            if (links.instagram) parts.push(`[Instagram](${links.instagram})`);
            if (links.tiktok) parts.push(`[TikTok](${links.tiktok})`);
            if (links.twitter) parts.push(`[Twitter/X](${links.twitter})`);
            if (links.website) parts.push(`[Website](${links.website})`);
            if (parts.length) {
              socialSection = `\n\nAt the end of the article, include a "Follow us" section with these links: ${parts.join(', ')}. ${campaign.socialPromoText || 'Follow for more great content!'}`;
            }
          }

          const seoInstruction = campaign.includeSEO
            ? `\nOptimize for SEO: include relevant keywords naturally 2-3 times, use ## subheadings with keyword-rich text.`
            : '';

          // Humanized writing styles to rotate
          const writingStyles = [
            'Start with a personal anecdote or a bold question that hooks the reader.',
            'Open with a surprising statistic or little-known fact.',
            'Begin with a short story or real-world scenario the reader can relate to.',
            'Start with a bold controversial opinion, then back it up with evidence.',
            'Open with "Let me tell you something..." or a direct address to the reader.',
          ];
          const style = writingStyles[Math.floor(Math.random() * writingStyles.length)];

          const content = await generateAI(
            `Write a ${wordCount} word blog article about "${topic}" in the ${category} category.

WRITING STYLE:
- ${style}
- Use a ${tone} tone. Write like a real human blogger — use contractions, ask rhetorical questions, share opinions.
- Include personal touches like "I've found that...", "Here's what most people miss...", "Let's be honest..."
- Vary paragraph lengths — some short (1-2 sentences), some longer.
- Use **bold** for key phrases. Include a numbered list or bullet points where natural.
- End with a thought-provoking conclusion or call-to-action.

STRUCTURE:
- 4-6 ## subheadings that are creative (not generic like "Introduction" or "Conclusion")
- Don't include the main title — start directly with content.
- Between sections, add image placeholders: [IMAGE: descriptive search query]
- Add 2-3 image placeholders throughout the article.${seoInstruction}${socialSection}

HEADLINE RULES (for Google Discover):
- The META_TITLE must create a curiosity gap — make people NEED to click
- Use power words: Shocking, Secret, Surprising, Essential, Inside, Truth, Hidden
- Numbers work: "7 Secrets...", "The 3 Things..."
- Keep META_TITLE under 70 chars but make it irresistible
- META_DESC should promise a payoff for reading

At the very end, on separate lines:
META_TITLE: (irresistible curiosity-gap headline, max 70 chars — NOT generic)
META_DESC: (meta description that makes people click, max 155 chars)
KEYWORDS: (5-8 comma-separated keywords)`,
            `You are ${authorName}, a passionate ${niche} blogger on CYBEV.io. You write with personality, humor, and expertise. You share real insights, not generic advice. Your voice is distinctive — readers recognize your style. You occasionally reference trending topics, pop culture, or personal experiences. Never use phrases like "In conclusion", "In today's world", "In this article we will explore", or "It's important to note". Be original. Write headlines that belong on Google Discover — catchy, specific, and impossible to scroll past.`
          );

          if (!content) { failed++; continue; }

          // Parse SEO metadata from end of content
          let articleContent = content;
          let metaTitle = topic;
          let metaDesc = '';
          let keywords = [];

          const metaTitleMatch = content.match(/META_TITLE:\s*(.+)/i);
          const metaDescMatch = content.match(/META_DESC:\s*(.+)/i);
          const keywordsMatch = content.match(/KEYWORDS:\s*(.+)/i);

          if (metaTitleMatch) { metaTitle = metaTitleMatch[1].trim(); articleContent = articleContent.replace(metaTitleMatch[0], ''); }
          if (metaDescMatch) { metaDesc = metaDescMatch[1].trim(); articleContent = articleContent.replace(metaDescMatch[0], ''); }
          if (keywordsMatch) { keywords = keywordsMatch[1].split(',').map(k => k.trim().toLowerCase()).filter(Boolean); articleContent = articleContent.replace(keywordsMatch[0], ''); }
          articleContent = articleContent.trim();

          if (!metaDesc) metaDesc = articleContent.replace(/<[^>]*>/g, '').replace(/[#*\n]/g, ' ').substring(0, 155).trim();
          if (!keywords.length) keywords = topic.toLowerCase().split(' ').filter(w => w.length > 3).slice(0, 5);

          // Replace [IMAGE: query] placeholders with real Pexels images
          if (campaign.includeImages) {
            const imgMatches = articleContent.match(/\[IMAGE:\s*([^\]]+)\]/gi) || [];
            for (const match of imgMatches) {
              const query = match.replace(/\[IMAGE:\s*/i, '').replace(/\]$/, '').trim();
              const imgUrl = await getImage(query);
              if (imgUrl) {
                articleContent = articleContent.replace(match,
                  `\n\n![${query}](${imgUrl})\n\n`);
              } else {
                articleContent = articleContent.replace(match, '');
              }
            }
          } else {
            // Remove image placeholders if images disabled
            articleContent = articleContent.replace(/\[IMAGE:[^\]]*\]/gi, '');
          }

          // Get featured image
          let featuredImage = '';
          if (campaign.includeImages) {
            const imgQuery = topic.split(' ').slice(0, 3).join(' ');
            featuredImage = await getImage(imgQuery);
          }

          // Create blog post
          const blogData = {
            title: topic,
            content: articleContent,
            excerpt: metaDesc || articleContent.replace(/[#*\n]/g, ' ').substring(0, 200).trim() + '...',
            author: author._id,
            authorName: authorName,
            category,
            status: 'published',
            isAIGenerated: true,
            tags: keywords.length ? keywords : topic.toLowerCase().split(' ').filter(w => w.length > 4).slice(0, 5),
            seo: { metaTitle, metaDescription: metaDesc, keywords },
            readTime: Math.ceil(articleContent.split(' ').length / 200),
            views: Math.floor(Math.random() * 300) + 20,
            featuredImage,
            createdAt: new Date(Date.now() - Math.floor(Math.random() * 3600000)), // slight time offset
          };

          const blog = await Blog.create(blogData);
          created++;
          console.log(`  ✅ "${topic}" by ${authorName} (${category})`);
        } catch (e) {
          console.log(`  ❌ Failed: ${e.message}`);
          failed++;
        }

        // Small delay between articles to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
      }

      // Update campaign stats
      await AutoBlogCampaign.findByIdAndUpdate(campaign._id, {
        $inc: { totalArticlesGenerated: created },
        lastRunAt: new Date(),
        lastRunArticles: created,
        lastRunErrors: failed
      });

      console.log(`📝 Campaign "${campaign.name}": ${created} created, ${failed} failed`);
    }
  } catch (err) {
    console.error('❌ Auto-Blog processor error:', err.message);
  } finally {
    isProcessing = false;
  }
}

module.exports = {
  start() {
    console.log('📝 Auto-Blog processor starting (hourly)');
    // Run every hour
    processInterval = setInterval(processAutoBlogCampaigns, 60 * 60 * 1000);
    // Also run once on startup after 30s delay
    setTimeout(processAutoBlogCampaigns, 30000);
  },
  stop() {
    if (processInterval) clearInterval(processInterval);
    processInterval = null;
  },
  runNow: processAutoBlogCampaigns
};
