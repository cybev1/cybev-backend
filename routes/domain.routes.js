const express = require('express');
const router = express.Router();
const dns = require('dns').promises;
const User = require('../models/user.model');
const Wallet = require('../models/wallet.model');
const { authenticateToken } = require('../middleware/auth');

// Check domain availability
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(domain)) {
      return res.status(400).json({ 
        ok: false,
        error: 'Invalid domain format',
        available: false
      });
    }
    
    const existingUser = await User.findOne({ 
      customDomain: domain,
      _id: { $ne: req.user.id }
    });
    
    if (existingUser) {
      return res.json({
        ok: false,
        available: false,
        error: 'Domain already connected to another account'
      });
    }
    
    try {
      const records = await dns.resolve4(domain);
      
      res.json({
        ok: true,
        available: true,
        dnsConfigured: records && records.length > 0,
        currentIPs: records,
        requiredConfig: {
          type: 'A',
          name: '@',
          value: '76.76.21.21',
          instructions: [
            'Go to your domain registrar DNS settings',
            'Add an A record pointing to 76.76.21.21',
            'Or add a CNAME record pointing to cybev.io',
            'Wait 5-10 minutes for DNS propagation'
          ]
        }
      });
    } catch (dnsError) {
      res.json({
        ok: true,
        available: true,
        dnsConfigured: false,
        error: 'DNS not configured yet',
        requiredConfig: {
          type: 'A',
          name: '@',
          value: '76.76.21.21',
          instructions: [
            'Go to your domain registrar DNS settings',
            'Add an A record pointing to 76.76.21.21',
            'Or add a CNAME record pointing to cybev.io',
            'Wait 5-10 minutes for DNS propagation'
          ]
        }
      });
    }
  } catch (error) {
    res.status(500).json({ 
      ok: false,
      error: error.message,
      available: false
    });
  }
});

// Verify and connect domain
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const { domain } = req.body;
    
    try {
      const records = await dns.resolve4(domain);
      const expectedIP = '76.76.21.21';
      
      if (!records.includes(expectedIP)) {
        return res.status(400).json({
          ok: false,
          verified: false,
          error: 'DNS records do not point to our server',
          currentIPs: records,
          expectedIP
        });
      }
      
      const user = await User.findById(req.user.id);
      user.customDomain = domain;
      user.domainVerified = true;
      await user.save();
      
      let wallet = await Wallet.findOne({ user: req.user.id });
      if (!wallet) {
        wallet = new Wallet({ user: req.user.id });
      }
      
      await wallet.addTokens(200, 'DOMAIN_SETUP', `Connected custom domain: ${domain}`);
      
      if (!wallet.achievements.includes('DOMAIN_MASTER')) {
        wallet.achievements.push('DOMAIN_MASTER');
        await wallet.save();
      }
      
      res.json({
        ok: true,
        verified: true,
        message: 'Domain successfully connected!',
        tokensEarned: 200,
        domain: user.customDomain
      });
      
    } catch (dnsError) {
      res.status(400).json({
        ok: false,
        verified: false,
        error: 'Unable to verify DNS records. Please check your configuration.',
        details: dnsError.message
      });
    }
  } catch (error) {
    res.status(500).json({ 
      ok: false,
      verified: false,
      error: error.message 
    });
  }
});

// Get user's domain status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user.customDomain) {
      return res.json({
        ok: true,
        hasCustomDomain: false,
        domain: null,
        verified: false
      });
    }
    
    try {
      const records = await dns.resolve4(user.customDomain);
      const isValid = records.includes('76.76.21.21');
      
      res.json({
        ok: true,
        hasCustomDomain: true,
        domain: user.customDomain,
        verified: user.domainVerified && isValid,
        currentIPs: records,
        needsReconfiguration: !isValid
      });
    } catch (dnsError) {
      res.json({
        ok: true,
        hasCustomDomain: true,
        domain: user.customDomain,
        verified: false,
        error: 'DNS configuration error',
        needsReconfiguration: true
      });
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Remove custom domain
router.delete('/remove', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user.customDomain) {
      return res.status(400).json({ ok: false, error: 'No custom domain configured' });
    }
    
    user.customDomain = null;
    user.domainVerified = false;
    await user.save();
    
    res.json({ 
      ok: true,
      message: 'Custom domain removed successfully',
      defaultUrl: `https://cybev.io/blog/${user.username}`
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
