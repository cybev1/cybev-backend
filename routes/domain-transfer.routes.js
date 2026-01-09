// ============================================
// FILE: routes/domain-transfer.routes.js
// Domain Transfer In/Out Routes - v6.4
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

const getDomainModel = () => mongoose.models.Domain || require('../models/domain.model');

let domainService;
try { domainService = require('../services/domain.service'); } catch (err) {}

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// Transfer pricing (includes 1 year extension)
const TRANSFER_PRICING = {
  'com': 1499, 'io': 3999, 'net': 1499, 'org': 1499, 'co': 2999,
  'app': 1999, 'dev': 1599, 'default': 1499
};

// GET /api/domain-transfer/check - Check if domain can be transferred
router.get('/check', verifyToken, async (req, res) => {
  try {
    const { domain } = req.query;
    if (!domain) return res.status(400).json({ ok: false, error: 'Domain required' });

    const Domain = getDomainModel();
    const existing = await Domain.findOne({ domain: domain.toLowerCase() });
    if (existing) {
      return res.json({ ok: true, transferable: false, reason: 'Domain already on CYBEV' });
    }

    // Check if domain is registered
    if (domainService?.isConfigured?.()) {
      try {
        const avail = await domainService.checkAvailability(domain.toLowerCase());
        if (avail.available) {
          return res.json({ ok: true, transferable: false, reason: 'Domain not registered. Register instead?', canRegister: true });
        }
      } catch (err) {}
    }

    res.json({
      ok: true,
      transferable: true,
      domain: domain.toLowerCase(),
      note: 'Ensure domain is unlocked and you have the EPP/Auth code from your current registrar.'
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/domain-transfer/pricing
router.get('/pricing', async (req, res) => {
  try {
    const pricing = Object.entries(TRANSFER_PRICING).map(([tld, price]) => ({
      tld, price: price / 100, currency: 'USD', note: 'Includes 1 year extension'
    }));
    res.json({ ok: true, pricing });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/domain-transfer/initiate - Start transfer to CYBEV
router.post('/initiate', verifyToken, async (req, res) => {
  try {
    const { domain, authCode, siteId } = req.body;
    if (!domain || !authCode) return res.status(400).json({ ok: false, error: 'Domain and auth code required' });

    const Domain = getDomainModel();
    const existing = await Domain.findOne({ domain: domain.toLowerCase() });
    if (existing) return res.status(400).json({ ok: false, error: 'Domain already on CYBEV' });

    const tld = domain.split('.').pop().toLowerCase();

    // Create transfer record
    const newDomain = new Domain({
      owner: req.user.id,
      domain: domain.toLowerCase(),
      tld,
      status: 'transferring',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year default
      linkedSite: siteId || null,
      transfer: { status: 'pending', authCode, initiatedAt: new Date() },
      meta: { source: 'transfer' }
    });

    // Initiate with registrar
    if (domainService?.isConfigured?.()) {
      try {
        const result = await domainService.transferDomain(domain.toLowerCase(), authCode);
        if (result.success) {
          newDomain.registrar.orderId = result.transferId;
          newDomain.transfer.status = 'approved';
          await newDomain.save();
          return res.json({
            ok: true,
            message: 'Transfer initiated successfully',
            transferId: result.transferId,
            domain: domain.toLowerCase(),
            status: 'approved',
            note: 'Transfer completes in 5-7 days. Check email for updates.'
          });
        } else {
          return res.status(400).json({ ok: false, error: result.error || 'Transfer failed. Check auth code.' });
        }
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
    }

    // No domain service - save for manual review
    newDomain.meta.notes = 'Pending manual transfer';
    await newDomain.save();

    res.json({
      ok: true,
      message: 'Transfer request submitted',
      domain: domain.toLowerCase(),
      status: 'pending',
      note: 'We\'ll review and contact you within 24-48 hours.'
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/domain-transfer/status/:domainId
router.get('/status/:domainId', verifyToken, async (req, res) => {
  try {
    const Domain = getDomainModel();
    const domain = await Domain.findOne({ _id: req.params.domainId, owner: req.user.id });
    if (!domain) return res.status(404).json({ ok: false, error: 'Domain not found' });

    const statusNotes = {
      pending: 'Transfer submitted. Awaiting approval.',
      approved: 'Transfer approved. Moving to CYBEV (5-7 days).',
      rejected: 'Transfer rejected. Check auth code or domain lock.',
      completed: 'Transfer complete! Domain is now on CYBEV.'
    };

    res.json({
      ok: true,
      domain: domain.domain,
      transferStatus: domain.transfer?.status || 'unknown',
      initiatedAt: domain.transfer?.initiatedAt,
      completedAt: domain.transfer?.completedAt,
      note: statusNotes[domain.transfer?.status] || 'Unknown status'
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/domain-transfer/:domainId - Cancel pending transfer
router.delete('/:domainId', verifyToken, async (req, res) => {
  try {
    const Domain = getDomainModel();
    const domain = await Domain.findOne({ _id: req.params.domainId, owner: req.user.id, status: 'transferring' });
    if (!domain) return res.status(404).json({ ok: false, error: 'Pending transfer not found' });

    if (domain.transfer?.status !== 'pending' && domain.transfer?.status !== 'approved') {
      return res.status(400).json({ ok: false, error: 'Cannot cancel at this stage' });
    }

    await Domain.findByIdAndDelete(domain._id);
    res.json({ ok: true, message: 'Transfer cancelled' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==================== TRANSFER OUT ====================

// GET /api/domain-transfer/auth-code/:domainId - Get auth code for transfer out
router.get('/auth-code/:domainId', verifyToken, async (req, res) => {
  try {
    const Domain = getDomainModel();
    const domain = await Domain.findOne({ _id: req.params.domainId, owner: req.user.id, status: 'active' });
    if (!domain) return res.status(404).json({ ok: false, error: 'Domain not found' });

    if (domainService?.isConfigured?.()) {
      try {
        const result = await domainService.getTransferAuthCode(domain.domain);
        if (result.success) {
          domain.registrar.authCode = result.authCode;
          await domain.save();
          return res.json({ ok: true, authCode: result.authCode, domain: domain.domain, note: 'Use this at your new registrar. Valid for 5 days.' });
        }
      } catch (err) {}
    }

    // Generate placeholder
    const placeholderCode = `CYBEV-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    res.json({ ok: true, authCode: placeholderCode, domain: domain.domain, note: 'Contact support to complete transfer out.' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/domain-transfer/unlock/:domainId - Unlock domain for transfer
router.post('/unlock/:domainId', verifyToken, async (req, res) => {
  try {
    const Domain = getDomainModel();
    const domain = await Domain.findOne({ _id: req.params.domainId, owner: req.user.id, status: 'active' });
    if (!domain) return res.status(404).json({ ok: false, error: 'Domain not found' });

    if (domainService?.isConfigured?.()) {
      const result = await domainService.setDomainLock(domain.domain, false);
      if (result.success) {
        domain.registrar.locked = false;
        await domain.save();
        return res.json({ ok: true, message: 'Domain unlocked for transfer' });
      }
    }

    domain.registrar.locked = false;
    await domain.save();
    res.json({ ok: true, message: 'Domain marked for unlocking. Contact support to complete.' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/domain-transfer/lock/:domainId - Lock domain (re-enable protection)
router.post('/lock/:domainId', verifyToken, async (req, res) => {
  try {
    const Domain = getDomainModel();
    const domain = await Domain.findOne({ _id: req.params.domainId, owner: req.user.id, status: 'active' });
    if (!domain) return res.status(404).json({ ok: false, error: 'Domain not found' });

    if (domainService?.isConfigured?.()) {
      const result = await domainService.setDomainLock(domain.domain, true);
      if (result.success) {
        domain.registrar.locked = true;
        await domain.save();
        return res.json({ ok: true, message: 'Domain locked' });
      }
    }

    domain.registrar.locked = true;
    await domain.save();
    res.json({ ok: true, message: 'Domain locked' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
