// ============================================
// FILE: src/lib/markdown.js
// Simple Markdown to HTML Converter
// ============================================

/**
 * Convert Markdown to HTML
 * Handles: headings, bold, italic, links, images, lists, blockquotes
 */
export function markdownToHtml(markdown) {
  if (!markdown) return '';
  
  let html = markdown;
  
  // Escape HTML entities first (but preserve markdown)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Images: ![alt](url) - MUST be before links
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, 
    '<figure class="my-6"><img src="$2" alt="$1" class="w-full rounded-lg shadow-md" loading="lazy" /><figcaption class="text-center text-gray-500 text-sm mt-2 italic">$1</figcaption></figure>');
  
  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, 
    '<a href="$2" class="text-purple-600 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Headers (process from h4 to h1 to avoid conflicts)
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-lg font-semibold text-gray-800 mt-6 mb-3">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold text-gray-900 mt-8 mb-4">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold text-gray-900 mt-10 mb-4">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold text-gray-900 mt-8 mb-6">$1</h1>');
  
  // Bold: **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong class="font-bold">$1</strong>');
  
  // Italic: *text* or _text_
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em class="italic">$1</em>');
  
  // Blockquotes: > text
  html = html.replace(/^&gt; (.+)$/gm, 
    '<blockquote class="border-l-4 border-purple-500 pl-4 py-2 my-4 bg-purple-50 rounded-r-lg italic text-gray-700">$1</blockquote>');
  
  // Unordered lists: - item or * item
  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="ml-6 list-disc text-gray-700 mb-2">$1</li>');
  
  // Numbered lists: 1. item
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-6 list-decimal text-gray-700 mb-2">$1</li>');
  
  // Wrap consecutive list items in ul/ol
  html = html.replace(/(<li class="ml-6 list-disc[^>]*>.*?<\/li>\n?)+/g, '<ul class="my-4">$&</ul>');
  html = html.replace(/(<li class="ml-6 list-decimal[^>]*>.*?<\/li>\n?)+/g, '<ol class="my-4">$&</ol>');
  
  // Code blocks: ```code```
  html = html.replace(/```([^`]+)```/g, 
    '<pre class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto my-4 text-sm"><code>$1</code></pre>');
  
  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, 
    '<code class="bg-gray-100 text-pink-600 px-2 py-0.5 rounded text-sm">$1</code>');
  
  // Horizontal rule: --- or ***
  html = html.replace(/^(\-{3,}|\*{3,})$/gm, '<hr class="my-8 border-gray-300" />');
  
  // Paragraphs: double newlines
  html = html.split('\n\n').map(para => {
    para = para.trim();
    // Don't wrap if it's already a block element
    if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<ol') || 
        para.startsWith('<blockquote') || para.startsWith('<pre') || para.startsWith('<hr') ||
        para.startsWith('<figure') || para.startsWith('<li')) {
      return para;
    }
    if (para) {
      return `<p class="text-gray-700 leading-relaxed mb-4">${para}</p>`;
    }
    return '';
  }).join('\n');
  
  // Clean up single newlines within paragraphs
  html = html.replace(/([^>])\n([^<])/g, '$1<br/>$2');
  
  // Remove photo credits that look like *Photo: ...*
  html = html.replace(/<p[^>]*>\s*<em[^>]*>Photo:.*?<\/em>\s*<\/p>/gi, '');
  html = html.replace(/<em[^>]*>Photo:.*?<\/em>/gi, '');
  
  return html;
}

/**
 * Strip markdown and HTML for plain text preview
 */
export function stripMarkdown(text) {
  if (!text) return '';
  
  return text
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove headers markers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove list markers
    .replace(/^[\-\*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // Remove code blocks
    .replace(/```[^`]+```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Remove horizontal rules
    .replace(/^[\-\*]{3,}$/gm, '')
    // Clean up whitespace
    .replace(/\n{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract first image from markdown
 */
export function extractFirstImage(markdown) {
  if (!markdown) return null;
  
  const match = markdown.match(/!\[([^\]]*)\]\(([^)]+)\)/);
  if (match) {
    return {
      alt: match[1],
      url: match[2]
    };
  }
  return null;
}

/**
 * Extract all images from markdown
 */
export function extractImages(markdown) {
  if (!markdown) return [];
  
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images = [];
  let match;
  
  while ((match = regex.exec(markdown)) !== null) {
    images.push({
      alt: match[1],
      url: match[2]
    });
  }
  
  return images;
}

export default {
  markdownToHtml,
  stripMarkdown,
  extractFirstImage,
  extractImages
};
