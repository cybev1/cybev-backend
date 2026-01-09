// ============================================
// FILE: routes/domain-payment.routes.js
// Domain Payment - Multi-Provider (Paystack, Flutterwave, Stripe)
// VERSION: 6.4.1
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');

// Models
const getDomainModel = () => mongoose.models.Domain || require('../models/domain.model');
const getUserModel = () => mongoose.models.User || require('../models/user.model');
const getSiteModel = () => mongoose.models.Site || require('../models/site.model');

// Domain service
let domainService;
try { domainService = require('../services/domain.service'); } catch (err) {}

// ==========================================
// PAYMENT PROVIDER CONFIG
// ==========================================

const PROVIDERS = {
  paystack: {
    name: 'Paystack',
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY,
    baseUrl: 'https://api.paystack.co',
    currencies: ['NGN', 'GHS', 'ZAR', 'KES', 'USD'],
    countries: ['NG', 'GH', 'ZA', 'KE']
  },
  flutterwave: {
    name: 'Flutterwave',
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    baseUrl: 'https://api.flutterwave.com/v3',
    currencies: ['NGN', 'GHS', 'KES', 'ZAR', 'TZS', 'UGX', 'RWF', 'XOF', 'XAF', 'USD', 'EUR', 'GBP'],
    countries: ['NG', 'GH', 'KE', 'ZA', 'TZ', 'UG', 'RW', 'CI', 'SN', 'CM']
  },
  stripe: {
    name: 'Stripe',
    secretKey: process.env.STRIPE_SECRET_KEY,
    publicKey: process.env.STRIPE_PUBLIC_KEY,
    baseUrl: 'https://api.stripe.com/v1',
    currencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'INR'],
    countries: ['US', 'CA', 'GB', 'EU', 'AU', 'JP', 'IN', 'SG']
  }
};

// Exchange rates
const EXCHANGE_RATES = {
  USD: 1, GHS: 15.5, NGN: 1550, KES: 153, ZAR: 18.5, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.53, TZS: 2500, UGX: 3700, RWF: 1300
};

// TLD Pricing (USD cents)
const TLD_PRICING = {
  'com': { registration: 1299, renewal: 1499 },
  'io': { registration: 3999, renewal: 3999 },
  'net': { registration: 1299, renewal: 1499 },
  'org': { registration: 1299, renewal: 1499 },
  'co': { registration: 2999, renewal: 2999 },
  'app': { registration: 1999, renewal: 1999 },
  'dev': { registration: 1599, renewal: 1599 },
  'xyz': { registration: 999, renewal: 1299 },
  'online': { registration: 499, renewal: 2999 },
  'store': { registration: 999, renewal: 4999 },
  'tech': { registration: 499, renewal: 4999 },
  'site': { registration: 299, renewal: 2999 },
  'africa': { registration: 1999, renewal: 1999 },
  'ng': { registration: 2499, renewal: 2499 },
  'gh': { registration: 7999, renewal: 7999 }
};

// ==========================================
// HELPERS
// ==========================================

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

const getAvailableProviders = () => {
  return Object.entries(PROVIDERS)
    .filter(([_, config]) => config.secretKey)
    .map(([id, config]) => ({ id, name: config.name, currencies: config.currencies, countries: config.countries }));
};

const selectProvider = (currency, country) => {
  const available = getAvailableProviders();
  if (available.length === 0) return null;

  // Paystack for GH/NG
  if (['GHS', 'NGN'].includes(currency) || ['GH', 'NG'].includes(country)) {
    if (available.find(p => p.id === 'paystack')) return 'paystack';
    if (available.find(p => p.id === 'flutterwave')) return 'flutterwave';
  }
  // Flutterwave for broader Africa
  if (['KES', 'TZS', 'UGX', 'RWF', 'XOF', 'XAF', 'ZAR'].includes(currency)) {
    if (available.find(p => p.id === 'flutterwave')) return 'flutterwave';
  }
  // Stripe for international
  if (['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(currency)) {
    if (available.find(p => p.id === 'stripe')) return 'stripe';
  }
  return available[0]?.id || null;
};

const convertCurrency = (amountUSD, targetCurrency) => {
  const rate = EXCHANGE_RATES[targetCurrency] || 1;
  return Math.round(amountUSD * rate * 100);
};

const generateReference = (prefix = 'DOM') => `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

// ==========================================
// PROVIDER FUNCTIONS
// ==========================================

// PAYSTACK
const initializePaystack = async (email, amount, currency, reference, metadata, callbackUrl) => {
  const response = await axios.post(`${PROVIDERS.paystack.baseUrl}/transaction/initialize`, {
    email, amount, currency, reference, callback_url: callbackUrl, metadata
  }, { headers: { Authorization: `Bearer ${PROVIDERS.paystack.secretKey}`, 'Content-Type': 'application/json' } });

  if (response.data.status) {
    return { success: true, authorizationUrl: response.data.data.authorization_url, reference: response.data.data.reference };
  }
  return { success: false, error: 'Paystack initialization failed' };
};

const verifyPaystack = async (reference) => {
  const response = await axios.get(`${PROVIDERS.paystack.baseUrl}/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${PROVIDERS.paystack.secretKey}` }
  });
  return { success: response.data.data.status === 'success', data: response.data.data };
};

// FLUTTERWAVE
const initializeFlutterwave = async (email, amount, currency, reference, metadata, callbackUrl, customerName) => {
  const response = await axios.post(`${PROVIDERS.flutterwave.baseUrl}/payments`, {
    tx_ref: reference,
    amount: amount / 100, // Major units
    currency,
    redirect_url: callbackUrl,
    customer: { email, name: customerName || email.split('@')[0] },
    meta: metadata,
    customizations: { title: 'CYBEV Domain', description: `Domain: ${metadata.domain}`, logo: 'https://cybev.io/icons/cybev-icon-192x192.png' }
  }, { headers: { Authorization: `Bearer ${PROVIDERS.flutterwave.secretKey}`, 'Content-Type': 'application/json' } });

  if (response.data.status === 'success') {
    return { success: true, authorizationUrl: response.data.data.link, reference };
  }
  return { success: false, error: response.data.message || 'Flutterwave initialization failed' };
};

const verifyFlutterwave = async (transactionId) => {
  const response = await axios.get(`${PROVIDERS.flutterwave.baseUrl}/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${PROVIDERS.flutterwave.secretKey}` }
  });
  return { success: response.data.data.status === 'successful', data: response.data.data };
};

// STRIPE
const initializeStripe = async (email, amount, currency, reference, metadata, callbackUrl) => {
  const stripe = require('stripe')(PROVIDERS.stripe.secretKey);
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: currency.toLowerCase(),
        product_data: { name: `Domain: ${metadata.domain}`, description: `${metadata.years} year(s) ${metadata.type === 'domain_renewal' ? 'renewal' : 'registration'}` },
        unit_amount: amount
      },
      quantity: 1
    }],
    mode: 'payment',
    success_url: `${callbackUrl}?reference=${reference}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${callbackUrl}?reference=${reference}&cancelled=true`,
    customer_email: email,
    client_reference_id: reference,
    metadata: { ...metadata, reference }
  });
  return { success: true, authorizationUrl: session.url, sessionId: session.id, reference };
};

const verifyStripe = async (sessionId) => {
  const stripe = require('stripe')(PROVIDERS.stripe.secretKey);
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return { success: session.payment_status === 'paid', data: session };
};

// ==========================================
// ROUTES
// ==========================================

// GET /api/domain-payments/providers
router.get('/providers', async (req, res) => {
  try {
    res.json({ ok: true, providers: getAvailableProviders() });
  } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});

// GET /api/domain-payments/pricing
router.get('/pricing', async (req, res) => {
  try {
    const { currency = 'USD' } = req.query;
    const rate = EXCHANGE_RATES[currency] || 1;
    const pricing = Object.entries(TLD_PRICING).map(([tld, prices]) => ({
      tld,
      registration: { usd: prices.registration / 100, [currency.toLowerCase()]: Math.round((prices.registration / 100) * rate * 100) / 100 },
      renewal: { usd: prices.renewal / 100, [currency.toLowerCase()]: Math.round((prices.renewal / 100) * rate * 100) / 100 }
    }));
    res.json({ ok: true, pricing, exchangeRates: EXCHANGE_RATES, providers: getAvailableProviders() });
  } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});

// POST /api/domain-payments/initialize
router.post('/initialize', verifyToken, async (req, res) => {
  try {
    const { domain, years = 1, siteId, currency = 'USD', provider: requestedProvider, country } = req.body;

    if (!domain) return res.status(400).json({ ok: false, error: 'Domain required' });
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/.test(domain)) {
      return res.status(400).json({ ok: false, error: 'Invalid domain format' });
    }

    const tld = domain.split('.').pop().toLowerCase();
    const pricing = TLD_PRICING[tld];
    if (!pricing) return res.status(400).json({ ok: false, error: `TLD .${tld} not supported` });

    if (domainService?.isConfigured?.()) {
      const avail = await domainService.checkAvailability(domain.toLowerCase());
      if (!avail.available) return res.status(400).json({ ok: false, error: 'Domain not available' });
    }

    const Domain = getDomainModel();
    const existing = await Domain.findOne({ domain: domain.toLowerCase() });
    if (existing) return res.status(400).json({ ok: false, error: 'Domain already registered' });

    const provider = requestedProvider || selectProvider(currency, country);
    if (!provider) return res.status(503).json({ ok: false, error: 'No payment provider available' });
    if (!PROVIDERS[provider]?.secretKey) return res.status(503).json({ ok: false, error: `${provider} not configured` });

    const amountUSD = (pricing.registration / 100) * years;
    const amount = convertCurrency(amountUSD, currency);

    const User = getUserModel();
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const reference = generateReference('DOM');
    const callbackUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/payment/domain-callback`;

    const newDomain = new Domain({
      owner: req.user.id, domain: domain.toLowerCase(), tld, status: 'pending',
      expiresAt: new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000),
      period: years, linkedSite: siteId || null,
      payment: { provider, reference, amount, currency, status: 'pending' },
      pricing: { registration: pricing.registration / 100, renewal: pricing.renewal / 100, currency: 'USD' }
    });
    await newDomain.save();

    const metadata = { domainId: newDomain._id.toString(), domain: domain.toLowerCase(), years, type: 'domain_registration' };

    let result;
    try {
      switch (provider) {
        case 'paystack': result = await initializePaystack(user.email, amount, currency, reference, metadata, callbackUrl); break;
        case 'flutterwave': result = await initializeFlutterwave(user.email, amount, currency, reference, metadata, callbackUrl, user.name); break;
        case 'stripe': result = await initializeStripe(user.email, amount, currency, reference, metadata, callbackUrl); break;
        default: throw new Error('Unknown provider');
      }
    } catch (err) { await Domain.findByIdAndDelete(newDomain._id); throw err; }

    if (result.success) {
      if (result.sessionId) newDomain.payment.transactionId = result.sessionId;
      await newDomain.save();
      res.json({ ok: true, provider, authorizationUrl: result.authorizationUrl, reference, domainId: newDomain._id, amount: { value: amount / 100, currency } });
    } else {
      await Domain.findByIdAndDelete(newDomain._id);
      res.status(400).json({ ok: false, error: result.error || 'Payment initialization failed' });
    }
  } catch (error) {
    console.error('Initialize error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/domain-payments/verify/:reference
router.get('/verify/:reference', verifyToken, async (req, res) => {
  try {
    const { session_id, transaction_id } = req.query;
    const reference = req.params.reference;

    const Domain = getDomainModel();
    const domain = await Domain.findOne({ 'payment.reference': reference });
    if (!domain) return res.status(404).json({ ok: false, error: 'Domain not found' });

    const provider = domain.payment.provider;
    let verifyResult;

    switch (provider) {
      case 'paystack': verifyResult = await verifyPaystack(reference); break;
      case 'flutterwave':
        const txId = transaction_id || domain.payment.transactionId;
        if (!txId) return res.status(400).json({ ok: false, error: 'Transaction ID required' });
        verifyResult = await verifyFlutterwave(txId);
        break;
      case 'stripe':
        const sessId = session_id || domain.payment.transactionId;
        if (!sessId) return res.status(400).json({ ok: false, error: 'Session ID required' });
        verifyResult = await verifyStripe(sessId);
        break;
      default: return res.status(400).json({ ok: false, error: 'Unknown provider' });
    }

    if (verifyResult.success) {
      domain.payment.status = 'completed';
      domain.payment.transactionId = verifyResult.data.id || session_id || transaction_id;
      domain.payment.paidAt = new Date();
      domain.status = 'active';
      domain.registeredAt = new Date();

      if (domainService?.isConfigured?.()) {
        try {
          const regResult = await domainService.registerDomain(domain.domain, domain.period);
          if (regResult.success) {
            domain.registrar.orderId = regResult.orderId;
            if (regResult.expirationDate) domain.expiresAt = new Date(regResult.expirationDate);
            await domainService.setupCYBEVDNS(domain.domain, domain.domain.split('.')[0]);
            domain.dns.configured = true;
            domain.dns.preset = 'cybev';
          }
        } catch (regErr) { domain.meta.notes = `Auto-registration failed: ${regErr.message}`; }
      }

      if (domain.linkedSite) {
        const Site = getSiteModel();
        await Site.findByIdAndUpdate(domain.linkedSite, { 'customDomain.domain': domain.domain, 'customDomain.verified': true, 'customDomain.verifiedAt': new Date(), 'customDomain.sslEnabled': true });
      }

      await domain.save();
      res.json({ ok: true, status: 'success', provider, domain: { domain: domain.domain, status: domain.status, expiresAt: domain.expiresAt, dnsConfigured: domain.dns.configured } });
    } else {
      domain.payment.status = 'failed';
      await domain.save();
      res.json({ ok: true, status: 'failed', message: 'Payment unsuccessful' });
    }
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/domain-payments/renew
router.post('/renew', verifyToken, async (req, res) => {
  try {
    const { domainId, years = 1, currency = 'USD', provider: requestedProvider, country } = req.body;

    const Domain = getDomainModel();
    const domain = await Domain.findOne({ _id: domainId, owner: req.user.id });
    if (!domain) return res.status(404).json({ ok: false, error: 'Domain not found' });

    const pricing = TLD_PRICING[domain.tld];
    if (!pricing) return res.status(400).json({ ok: false, error: 'TLD pricing not found' });

    const provider = requestedProvider || selectProvider(currency, country);
    if (!provider || !PROVIDERS[provider]?.secretKey) return res.status(503).json({ ok: false, error: 'No payment provider available' });

    const amountUSD = (pricing.renewal / 100) * years;
    const amount = convertCurrency(amountUSD, currency);

    const User = getUserModel();
    const user = await User.findById(req.user.id);
    const reference = generateReference('RNW');
    const callbackUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/payment/domain-callback`;
    const metadata = { domainId: domain._id.toString(), domain: domain.domain, years, type: 'domain_renewal' };

    let result;
    switch (provider) {
      case 'paystack': result = await initializePaystack(user.email, amount, currency, reference, metadata, callbackUrl); break;
      case 'flutterwave': result = await initializeFlutterwave(user.email, amount, currency, reference, metadata, callbackUrl, user.name); break;
      case 'stripe': result = await initializeStripe(user.email, amount, currency, reference, metadata, callbackUrl); break;
    }

    if (result.success) {
      res.json({ ok: true, provider, authorizationUrl: result.authorizationUrl, reference, amount: { value: amount / 100, currency } });
    } else {
      res.status(400).json({ ok: false, error: result.error || 'Failed to initialize renewal' });
    }
  } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});

// GET /api/domain-payments/my-domains
router.get('/my-domains', verifyToken, async (req, res) => {
  try {
    const Domain = getDomainModel();
    const domains = await Domain.find({ owner: req.user.id }).populate('linkedSite', 'name subdomain').sort({ createdAt: -1 }).lean();
    const domainsWithInfo = domains.map(d => ({
      ...d,
      daysUntilExpiry: d.expiresAt ? Math.ceil((new Date(d.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)) : null,
      isExpired: d.expiresAt ? new Date() > new Date(d.expiresAt) : false,
      needsRenewal: d.expiresAt ? Math.ceil((new Date(d.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)) <= 30 : false
    }));
    res.json({ ok: true, domains: domainsWithInfo });
  } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});

// ==========================================
// WEBHOOKS
// ==========================================

// Paystack webhook
router.post('/webhook/paystack', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const hash = crypto.createHmac('sha512', PROVIDERS.paystack.secretKey).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) return res.status(401).json({ error: 'Invalid signature' });
    if (req.body.event === 'charge.success') await handleWebhookPayment(req.body.data.reference, req.body.data.metadata, 'paystack', req.body.data.id);
    res.json({ received: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Flutterwave webhook
router.post('/webhook/flutterwave', async (req, res) => {
  try {
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
    if (secretHash && req.headers['verif-hash'] !== secretHash) return res.status(401).json({ error: 'Invalid hash' });
    if (req.body.status === 'successful') await handleWebhookPayment(req.body.txRef, req.body.meta, 'flutterwave', req.body.id);
    res.json({ received: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Stripe webhook
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripe = require('stripe')(PROVIDERS.stripe.secretKey);
    const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      await handleWebhookPayment(session.client_reference_id, session.metadata, 'stripe', session.id);
    }
    res.json({ received: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// Handle successful payment from webhook
async function handleWebhookPayment(reference, metadata, provider, transactionId) {
  const Domain = getDomainModel();
  if (metadata?.type === 'domain_registration') {
    const domain = await Domain.findOne({ 'payment.reference': reference });
    if (domain && domain.payment.status !== 'completed') {
      domain.payment.status = 'completed';
      domain.payment.transactionId = transactionId;
      domain.payment.paidAt = new Date();
      domain.status = 'active';
      domain.registeredAt = new Date();
      await domain.save();
      console.log(`✅ Domain ${domain.domain} registered via ${provider} webhook`);
    }
  } else if (metadata?.type === 'domain_renewal') {
    const domain = await Domain.findById(metadata.domainId);
    if (domain) {
      domain.expiresAt = new Date(new Date(domain.expiresAt).getTime() + (metadata.years || 1) * 365 * 24 * 60 * 60 * 1000);
      domain.renewedAt = new Date();
      domain.remindersSent = { thirtyDays: false, sevenDays: false, oneDayBefore: false, expired: false };
      await domain.save();
      console.log(`✅ Domain ${domain.domain} renewed via ${provider} webhook`);
    }
  }
}

module.exports = router;
