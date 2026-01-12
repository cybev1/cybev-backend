/**
 * Contacts Routes - Contact Management
 * CYBEV Studio v2.0
 * GitHub: https://github.com/cybev1/cybev-backend/routes/contacts.routes.js
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import schemas from campaigns routes
const ContactList = mongoose.models.ContactList;
const Contact = mongoose.models.Contact;

// Get all contact lists
router.get('/lists', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const lists = await ContactList.find({ userId }).sort({ createdAt: -1 });
    res.json({ lists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create contact list
router.post('/lists', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { name, description, tags } = req.body;
    const list = new ContactList({ userId, name, description, tags });
    await list.save();
    res.json({ list });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get contacts
router.get('/', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { listId, status, search, page = 1, limit = 50 } = req.query;

    const query = { userId };
    if (listId) query.listId = listId;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Contact.countDocuments(query);
    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ contacts, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add contact
router.post('/', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const contact = new Contact({ ...req.body, userId });
    await contact.save();
    res.json({ contact });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update contact
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, userId },
      req.body,
      { new: true }
    );
    res.json({ contact });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    await Contact.deleteOne({ _id: req.params.id, userId });
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
