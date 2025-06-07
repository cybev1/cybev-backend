
# CYBEV Blog Publish Flow Update

## Files Updated
- models/blog.model.js: adds `domain`, `status`, `previewUrl`, `type`
- controllers snippet: how to auto-generate preview URL and mark as published

## Integration Notes
1. Replace your existing `models/blog.model.js` with the provided file.
2. In both your subdomain and custom domain controller, insert the snippet
   for generating `previewUrl` and setting `status: 'published'`.

This ensures all blogs are stored with a resolvable preview link.
