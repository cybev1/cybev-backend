// ============================================
// FILE: contacts.routes.js
// PATH: cybev-backend/routes/contacts.routes.js
// PURPOSE: Contact Management for Campaigns
// VERSION: 1.0.0
// GITHUB: https://github.com/cybev1/cybev-backend
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

const Contact = mongoose.models.Contact;
const ContactList = mongoose.models.ContactList;

// GET /api/contacts
router.get('/', auth, async (req, res) => {
  try {
    const { list, status, search, limit = 50, skip = 0 } = req.query;
    const query = { user: req.user.id };
    if (list) query.lists = list;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const contacts = await Contact.find(query).sort({ createdAt: -1 }).skip(parseInt(skip)).limit(parseInt(limit));
    const total = await Contact.countDocuments(query);
    res.json({ ok: true, contacts, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/contacts
router.post('/', auth, async (req, res) => {
  try {
    const { email, phone, name, firstName, lastName, lists, tags } = req.body;
    const contact = await Contact.findOneAndUpdate(
      { user: req.user.id, email },
      { phone, name, firstName, lastName, lists, tags },
      { upsert: true, new: true }
    );
    res.json({ ok: true, contact });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/contacts/lists
router.get('/lists', auth, async (req, res) => {
  try {
    const lists = await ContactList.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ ok: true, lists });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/contacts/lists
router.post('/lists', auth, async (req, res) => {
  try {
    const { name, description, tags } = req.body;
    const list = new ContactList({ user: req.user.id, name, description, tags });
    await list.save();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/contacts/import
router.post('/import', auth, async (req, res) => {
  try {
    const { contacts, listId } = req.body;
    let imported = 0;
    for (const c of contacts) {
      try {
        await Contact.findOneAndUpdate(
          { user: req.user.id, email: c.email },
          { ...c, lists: listId ? [listId] : [] },
          { upsert: true }
        );
        imported++;
      } catch {}
    }
    if (listId) await ContactList.findByIdAndUpdate(listId, { $inc: { contactCount: imported } });
    res.json({ ok: true, imported });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
