// ============================================
// FILE: routes/render.routes.js
// Site Renderer - Serves subdomain sites
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const getSitesCollection = () => mongoose.connection.db.collection('sites');

// ==========================================
// GET /* - Render site pages
// Called when subdomain middleware detects a site
// ==========================================
router.get('*', async (req, res) => {
  // If no site attached by middleware, 404
  if (!req.site) {
    return res.status(404).send(generateErrorPage('Site Not Found', 'This site does not exist or is not published.'));
  }

  const site = req.site;
  const path = req.path || '/';
  
  // Find the page to render
  let page = site.pages?.find(p => p.slug === path || p.slug === path.slice(1));
  if (!page) {
    page = site.pages?.find(p => p.isHomePage) || site.pages?.[0];
  }
  
  // Use site blocks if page has no blocks
  const blocks = page?.blocks?.length ? page.blocks : site.blocks;
  
  // Generate HTML
  const html = generateSiteHTML(site, blocks);
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ==========================================
// HTML Generator
// ==========================================
function generateSiteHTML(site, blocks) {
  const theme = site.theme || {};
  const primaryColor = theme.colors?.primary || theme.primaryColor || '#7c3aed';
  const secondaryColor = theme.colors?.secondary || theme.secondaryColor || '#ec4899';
  const fontHeading = theme.fonts?.heading || theme.fontHeading || 'Inter';
  const fontBody = theme.fonts?.body || theme.fontBody || 'Inter';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(site.ogTitle || site.name)}</title>
  <meta name="description" content="${escapeHtml(site.ogDescription || site.description || '')}">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${escapeHtml(site.ogTitle || site.name)}">
  <meta property="og:description" content="${escapeHtml(site.ogDescription || site.description || '')}">
  ${site.ogImage ? `<meta property="og:image" content="${escapeHtml(site.ogImage)}">` : ''}
  <meta property="og:url" content="https://${site.subdomain}.cybev.io">
  <meta property="og:type" content="website">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(site.ogTitle || site.name)}">
  <meta name="twitter:description" content="${escapeHtml(site.ogDescription || site.description || '')}">
  ${site.ogImage ? `<meta name="twitter:image" content="${escapeHtml(site.ogImage)}">` : ''}
  
  <!-- Favicon -->
  ${site.favicon ? `<link rel="icon" href="${escapeHtml(site.favicon)}">` : ''}
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${fontHeading.replace(' ', '+')}:wght@400;500;600;700&family=${fontBody.replace(' ', '+')}:wght@400;500;600&display=swap" rel="stylesheet">
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  
  <style>
    :root {
      --color-primary: ${primaryColor};
      --color-secondary: ${secondaryColor};
    }
    body {
      font-family: '${fontBody}', sans-serif;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: '${fontHeading}', sans-serif;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    }
    .bg-gradient {
      background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    }
    .text-primary { color: var(--color-primary); }
    .bg-primary { background-color: var(--color-primary); }
    .border-primary { border-color: var(--color-primary); }
    ${site.customCss || ''}
  </style>
  
  ${site.customHead || ''}
  ${site.googleAnalytics ? `
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(site.googleAnalytics)}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${escapeHtml(site.googleAnalytics)}');
  </script>` : ''}
</head>
<body class="antialiased">
  <!-- Navigation -->
  <nav class="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-gray-900">${escapeHtml(site.name)}</a>
      <div class="flex items-center gap-6">
        <a href="/" class="text-gray-600 hover:text-gray-900 transition">Home</a>
        <a href="#contact" class="text-gray-600 hover:text-gray-900 transition">Contact</a>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <main class="pt-16">
    ${blocks?.map(block => renderBlock(block, { primaryColor, secondaryColor })).join('\n') || '<div class="py-20 text-center"><p class="text-gray-500">No content yet</p></div>'}
  </main>

  <!-- Powered by CYBEV -->
  <div class="py-4 text-center text-gray-400 text-sm border-t border-gray-100">
    Powered by <a href="https://cybev.io" class="text-primary hover:underline" target="_blank">CYBEV</a>
  </div>

  <script>
    // Initialize Lucide icons
    lucide.createIcons();
  </script>
</body>
</html>`;
}

// ==========================================
// Block Renderers
// ==========================================
function renderBlock(block, theme) {
  const { type, content } = block;
  if (!content) return '';

  switch (type) {
    case 'hero':
      return renderHero(content, theme);
    case 'features':
      return renderFeatures(content, theme);
    case 'testimonials':
      return renderTestimonials(content, theme);
    case 'cta':
      return renderCTA(content, theme);
    case 'contact':
      return renderContact(content, theme);
    case 'footer':
      return renderFooter(content, theme);
    case 'stats':
      return renderStats(content, theme);
    case 'gallery':
      return renderGallery(content, theme);
    case 'pricing':
      return renderPricing(content, theme);
    case 'about':
      return renderAbout(content, theme);
    case 'services':
      return renderServices(content, theme);
    case 'newsletter':
      return renderNewsletter(content, theme);
    case 'faq':
      return renderFAQ(content, theme);
    case 'blog-posts':
      return renderBlogPosts(content, theme);
    default:
      return `<!-- Unknown block type: ${type} -->`;
  }
}

function renderHero(content, theme) {
  const bgStyle = content.backgroundImage 
    ? `background-image: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('${escapeHtml(content.backgroundImage)}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor});`;
  
  return `
  <section class="min-h-[70vh] flex items-center justify-center text-white relative" style="${bgStyle}">
    <div class="max-w-4xl mx-auto px-6 text-center">
      <h1 class="text-4xl md:text-6xl font-bold mb-6 leading-tight">${escapeHtml(content.title || '')}</h1>
      <p class="text-xl md:text-2xl opacity-90 mb-8 max-w-2xl mx-auto">${escapeHtml(content.subtitle || '')}</p>
      ${content.buttonText ? `
      <a href="${escapeHtml(content.buttonLink || '#')}" class="inline-flex items-center gap-2 px-8 py-4 bg-white text-gray-900 rounded-full font-semibold text-lg hover:bg-gray-100 transition shadow-lg">
        ${escapeHtml(content.buttonText)}
        <i data-lucide="chevron-right" class="w-5 h-5"></i>
      </a>` : ''}
    </div>
  </section>`;
}

function renderFeatures(content, theme) {
  const items = content.items || [];
  return `
  <section class="py-20 px-6 bg-gray-50">
    <div class="max-w-6xl mx-auto">
      ${content.title ? `
      <div class="text-center mb-16">
        <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">${escapeHtml(content.title)}</h2>
        ${content.subtitle ? `<p class="text-xl text-gray-600">${escapeHtml(content.subtitle)}</p>` : ''}
      </div>` : ''}
      <div class="grid md:grid-cols-3 gap-8">
        ${items.map(item => `
        <div class="bg-white p-8 rounded-2xl shadow-sm hover:shadow-lg transition text-center">
          <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style="background-color: ${theme.primaryColor}15">
            <i data-lucide="${item.icon || 'zap'}" class="w-8 h-8" style="color: ${theme.primaryColor}"></i>
          </div>
          <h3 class="text-xl font-bold text-gray-900 mb-3">${escapeHtml(item.title || '')}</h3>
          <p class="text-gray-600">${escapeHtml(item.description || '')}</p>
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

function renderTestimonials(content, theme) {
  const items = content.items || [];
  return `
  <section class="py-20 px-6">
    <div class="max-w-6xl mx-auto">
      ${content.title ? `<h2 class="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-16">${escapeHtml(content.title)}</h2>` : ''}
      <div class="grid md:grid-cols-3 gap-8">
        ${items.map(item => `
        <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <div class="flex gap-1 mb-4">
            ${[1,2,3,4,5].map(() => '<i data-lucide="star" class="w-5 h-5 fill-yellow-400 text-yellow-400"></i>').join('')}
          </div>
          <p class="text-gray-700 text-lg mb-6 italic">"${escapeHtml(item.quote || '')}"</p>
          <div class="flex items-center gap-4">
            ${item.avatar 
              ? `<img src="${escapeHtml(item.avatar)}" alt="${escapeHtml(item.name)}" class="w-12 h-12 rounded-full object-cover">`
              : `<div class="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center"><span class="text-xl font-bold text-gray-500">${(item.name || 'A')[0]}</span></div>`
            }
            <div>
              <p class="font-semibold text-gray-900">${escapeHtml(item.name || '')}</p>
              <p class="text-sm text-gray-500">${escapeHtml(item.role || '')}</p>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

function renderCTA(content, theme) {
  return `
  <section class="py-20 px-6 text-white bg-gradient">
    <div class="max-w-4xl mx-auto text-center">
      <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(content.title || '')}</h2>
      <p class="text-xl opacity-90 mb-8">${escapeHtml(content.description || '')}</p>
      ${content.buttonText ? `
      <a href="${escapeHtml(content.buttonLink || '#')}" class="inline-block px-8 py-4 bg-white text-gray-900 rounded-full font-semibold text-lg hover:bg-gray-100 transition">
        ${escapeHtml(content.buttonText)}
      </a>` : ''}
    </div>
  </section>`;
}

function renderContact(content, theme) {
  return `
  <section id="contact" class="py-20 px-6 bg-gray-900 text-white">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-3xl md:text-4xl font-bold text-center mb-16">${escapeHtml(content.title || 'Get in Touch')}</h2>
      <div class="grid md:grid-cols-3 gap-8 text-center">
        ${content.email ? `
        <div class="flex flex-col items-center">
          <div class="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mb-4">
            <i data-lucide="mail" class="w-6 h-6"></i>
          </div>
          <p class="text-lg">${escapeHtml(content.email)}</p>
        </div>` : ''}
        ${content.phone ? `
        <div class="flex flex-col items-center">
          <div class="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mb-4">
            <i data-lucide="phone" class="w-6 h-6"></i>
          </div>
          <p class="text-lg">${escapeHtml(content.phone)}</p>
        </div>` : ''}
        ${content.address ? `
        <div class="flex flex-col items-center">
          <div class="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mb-4">
            <i data-lucide="map-pin" class="w-6 h-6"></i>
          </div>
          <p class="text-lg">${escapeHtml(content.address)}</p>
        </div>` : ''}
      </div>
    </div>
  </section>`;
}

function renderFooter(content, theme) {
  return `
  <footer class="py-12 px-6 bg-gray-900 text-white border-t border-gray-800">
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="text-lg font-bold">${escapeHtml(content.logo || '')}</div>
        <div class="flex gap-6">
          ${(content.links || []).map(link => `
          <a href="${escapeHtml(link.url || '#')}" class="text-gray-400 hover:text-white transition">
            ${escapeHtml(link.label || '')}
          </a>`).join('')}
        </div>
        <div class="flex gap-4">
          ${content.social?.twitter ? `<a href="${escapeHtml(content.social.twitter)}" class="text-gray-400 hover:text-white"><i data-lucide="twitter" class="w-5 h-5"></i></a>` : ''}
          ${content.social?.facebook ? `<a href="${escapeHtml(content.social.facebook)}" class="text-gray-400 hover:text-white"><i data-lucide="facebook" class="w-5 h-5"></i></a>` : ''}
          ${content.social?.instagram ? `<a href="${escapeHtml(content.social.instagram)}" class="text-gray-400 hover:text-white"><i data-lucide="instagram" class="w-5 h-5"></i></a>` : ''}
          ${content.social?.linkedin ? `<a href="${escapeHtml(content.social.linkedin)}" class="text-gray-400 hover:text-white"><i data-lucide="linkedin" class="w-5 h-5"></i></a>` : ''}
        </div>
      </div>
      <div class="mt-8 pt-8 border-t border-gray-800 text-center text-gray-500">
        <p>${escapeHtml(content.copyright || '')}</p>
      </div>
    </div>
  </footer>`;
}

function renderStats(content, theme) {
  const items = content.items || [];
  return `
  <section class="py-16 px-6 text-white bg-gradient">
    <div class="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      ${items.map(item => `
      <div>
        <div class="text-4xl md:text-5xl font-bold mb-2">${escapeHtml(item.value || '')}</div>
        <div class="text-lg opacity-80">${escapeHtml(item.label || '')}</div>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderGallery(content, theme) {
  const images = content.images || [];
  return `
  <section class="py-20 px-6">
    <div class="max-w-6xl mx-auto">
      ${content.title ? `<h2 class="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12">${escapeHtml(content.title)}</h2>` : ''}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${images.map((img, i) => `
        <div class="aspect-square rounded-xl overflow-hidden group cursor-pointer">
          <img src="${escapeHtml(img.src || img)}" alt="${escapeHtml(img.alt || `Gallery ${i+1}`)}" class="w-full h-full object-cover group-hover:scale-110 transition duration-500">
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

function renderPricing(content, theme) {
  const plans = content.plans || [];
  return `
  <section class="py-20 px-6 bg-gray-50">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-16">
        <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">${escapeHtml(content.title || 'Pricing')}</h2>
        ${content.subtitle ? `<p class="text-xl text-gray-600">${escapeHtml(content.subtitle)}</p>` : ''}
      </div>
      <div class="grid md:grid-cols-3 gap-8">
        ${plans.map(plan => `
        <div class="bg-white rounded-2xl p-8 ${plan.featured ? 'ring-2 ring-primary shadow-xl scale-105' : 'shadow-sm'}">
          ${plan.featured ? `<span class="inline-block px-3 py-1 text-xs font-semibold text-white rounded-full mb-4 bg-primary">Most Popular</span>` : ''}
          <h3 class="text-2xl font-bold text-gray-900 mb-2">${escapeHtml(plan.name || '')}</h3>
          <div class="mb-6">
            <span class="text-4xl font-bold">${escapeHtml(plan.price || '')}</span>
            <span class="text-gray-500">${escapeHtml(plan.period || '')}</span>
          </div>
          <ul class="space-y-3 mb-8">
            ${(plan.features || []).map(f => `
            <li class="flex items-center gap-2">
              <i data-lucide="check" class="w-5 h-5 text-green-500"></i>
              <span class="text-gray-600">${escapeHtml(f)}</span>
            </li>`).join('')}
          </ul>
          <button class="w-full py-3 rounded-lg font-semibold transition ${plan.featured ? 'btn-primary text-white' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}">
            ${escapeHtml(plan.buttonText || 'Get Started')}
          </button>
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

function renderAbout(content, theme) {
  return `
  <section class="py-20 px-6">
    <div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
      ${content.image ? `
      <div class="rounded-2xl overflow-hidden">
        <img src="${escapeHtml(content.image)}" alt="About" class="w-full h-auto">
      </div>` : ''}
      <div>
        <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-6">${escapeHtml(content.title || 'About')}</h2>
        <p class="text-lg text-gray-600 leading-relaxed">${escapeHtml(content.text || '')}</p>
      </div>
    </div>
  </section>`;
}

function renderServices(content, theme) {
  const items = content.items || [];
  return `
  <section class="py-20 px-6">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-16">${escapeHtml(content.title || 'Services')}</h2>
      <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        ${items.map(item => `
        <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-lg transition border border-gray-100">
          <i data-lucide="${item.icon || 'zap'}" class="w-10 h-10 mb-4 text-primary"></i>
          <h3 class="text-lg font-bold text-gray-900 mb-2">${escapeHtml(item.title || '')}</h3>
          <p class="text-gray-600 text-sm">${escapeHtml(item.description || '')}</p>
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

function renderNewsletter(content, theme) {
  return `
  <section class="py-16 px-6 bg-gray-100">
    <div class="max-w-2xl mx-auto text-center">
      <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-4">${escapeHtml(content.title || 'Subscribe')}</h2>
      <p class="text-gray-600 mb-6">${escapeHtml(content.description || '')}</p>
      <div class="flex gap-2 max-w-md mx-auto">
        <input type="email" placeholder="${escapeHtml(content.placeholder || 'Enter your email')}" class="flex-1 px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent">
        <button class="px-6 py-3 text-white rounded-lg font-semibold hover:opacity-90 transition bg-primary">
          ${escapeHtml(content.buttonText || 'Subscribe')}
        </button>
      </div>
    </div>
  </section>`;
}

function renderFAQ(content, theme) {
  const items = content.items || [];
  return `
  <section class="py-20 px-6">
    <div class="max-w-3xl mx-auto">
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12">${escapeHtml(content.title || 'FAQ')}</h2>
      <div class="space-y-4">
        ${items.map((item, i) => `
        <details class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 group" ${i === 0 ? 'open' : ''}>
          <summary class="font-semibold text-gray-900 cursor-pointer list-none flex justify-between items-center">
            ${escapeHtml(item.question || '')}
            <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform"></i>
          </summary>
          <p class="mt-4 text-gray-600">${escapeHtml(item.answer || '')}</p>
        </details>`).join('')}
      </div>
    </div>
  </section>`;
}

function renderBlogPosts(content, theme) {
  const posts = content.posts || [];
  return `
  <section class="py-20 px-6 bg-gray-50">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12">${escapeHtml(content.title || 'Latest Posts')}</h2>
      <div class="grid md:grid-cols-3 gap-8">
        ${posts.map(post => `
        <div class="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition">
          ${post.image ? `<img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" class="w-full h-48 object-cover">` : ''}
          <div class="p-6">
            <p class="text-sm text-gray-500 mb-2">${escapeHtml(post.date || '')}</p>
            <h3 class="text-xl font-bold text-gray-900 mb-2">${escapeHtml(post.title || '')}</h3>
            <p class="text-gray-600">${escapeHtml(post.excerpt || '')}</p>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

// ==========================================
// Utilities
// ==========================================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateErrorPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - CYBEV</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen flex items-center justify-center bg-gray-50">
  <div class="text-center px-6">
    <h1 class="text-4xl font-bold text-gray-900 mb-4">${title}</h1>
    <p class="text-gray-600 mb-8">${message}</p>
    <a href="https://cybev.io" class="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition">
      Go to CYBEV
    </a>
  </div>
</body>
</html>`;
}

module.exports = router;
