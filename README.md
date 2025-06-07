
# CYBEV Subdomain Registration API

## Endpoint
POST /api/domains/subdomain

## Required Fields
- userId
- subdomain
- title
- description
- category
- niche
- template
- logo (URL)
- monetize (true/false)

## Usage
1. Include domain.routes.js in your main server.js or index.js:
   const domainRoutes = require('./routes/domain.routes');
   app.use('/api/domains', domainRoutes);
