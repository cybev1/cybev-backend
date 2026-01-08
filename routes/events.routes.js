// ============================================
// FILE: routes/events.routes.js
// Community Events API Routes
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No token provided' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
      req.user = decoded;
    } catch (err) {}
  }
  next();
};

// Get Event model
const getEventModel = () => {
  if (mongoose.models.Event) return mongoose.models.Event;
  return require('../models/event.model');
};

const getUserModel = () => {
  if (mongoose.models.User) return mongoose.models.User;
  return require('../models/user.model');
};

// ==========================================
// CREATE EVENT
// POST /api/events
// ==========================================

router.post('/', verifyToken, async (req, res) => {
  try {
    const Event = getEventModel();
    const {
      title,
      description,
      coverImage,
      type,
      category,
      startDate,
      endDate,
      timezone,
      isAllDay,
      location,
      onlineDetails,
      maxAttendees,
      visibility,
      requiresApproval,
      isTicketed,
      tickets,
      tags,
      group
    } = req.body;

    if (!title || !startDate) {
      return res.status(400).json({ ok: false, error: 'Title and start date required' });
    }

    const event = new Event({
      title,
      description,
      coverImage,
      type: type || 'online',
      category: category || 'meetup',
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      timezone: timezone || 'UTC',
      isAllDay: isAllDay || false,
      location,
      onlineDetails,
      maxAttendees: maxAttendees || 0,
      visibility: visibility || 'public',
      requiresApproval: requiresApproval || false,
      isTicketed: isTicketed || false,
      tickets: tickets || [],
      tags: tags || [],
      group,
      organizer: req.user.id,
      status: 'published',
      // Auto-add organizer as going
      attendees: [{
        user: req.user.id,
        status: 'going',
        rsvpDate: new Date()
      }]
    });

    await event.save();
    await event.populate('organizer', 'name username avatar');

    res.status(201).json({ ok: true, event });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GET ALL EVENTS (Public)
// GET /api/events
// ==========================================

router.get('/', optionalAuth, async (req, res) => {
  try {
    const Event = getEventModel();
    const {
      page = 1,
      limit = 20,
      category,
      type,
      startDate,
      endDate,
      city,
      country,
      search,
      upcoming = 'true',
      past = 'false',
      organizer,
      group
    } = req.query;

    const query = { status: 'published', visibility: 'public' };

    // Category filter
    if (category) query.category = category;
    
    // Type filter
    if (type) query.type = type;
    
    // Date filters
    const now = new Date();
    if (upcoming === 'true' && past !== 'true') {
      query.startDate = { $gte: now };
    } else if (past === 'true' && upcoming !== 'true') {
      query.startDate = { $lt: now };
    }
    
    if (startDate) {
      query.startDate = { ...query.startDate, $gte: new Date(startDate) };
    }
    if (endDate) {
      query.startDate = { ...query.startDate, $lte: new Date(endDate) };
    }
    
    // Location filters
    if (city) query['location.city'] = new RegExp(city, 'i');
    if (country) query['location.country'] = new RegExp(country, 'i');
    
    // Search
    if (search) {
      query.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { tags: new RegExp(search, 'i') }
      ];
    }
    
    // Organizer filter
    if (organizer) query.organizer = organizer;
    
    // Group filter
    if (group) query.group = group;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort({ startDate: upcoming === 'true' ? 1 : -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('organizer', 'name username avatar')
        .populate('group', 'name slug coverImage')
        .lean(),
      Event.countDocuments(query)
    ]);

    // Add attendee counts and user's RSVP status
    const eventsWithCounts = events.map(event => ({
      ...event,
      goingCount: event.attendees?.filter(a => a.status === 'going').length || 0,
      interestedCount: event.attendees?.filter(a => a.status === 'interested').length || 0,
      userRsvp: req.user ? 
        event.attendees?.find(a => a.user?.toString() === req.user.id)?.status : null,
      attendees: undefined // Don't send full attendee list
    }));

    res.json({
      ok: true,
      events: eventsWithCounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GET SINGLE EVENT
// GET /api/events/:id
// ==========================================

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const Event = getEventModel();
    const { id } = req.params;

    const event = await Event.findById(id)
      .populate('organizer', 'name username avatar bio')
      .populate('coHosts', 'name username avatar')
      .populate('group', 'name slug coverImage memberCount')
      .populate('attendees.user', 'name username avatar')
      .lean();

    if (!event) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    // Check visibility
    if (event.visibility === 'private' && 
        event.organizer._id.toString() !== req.user?.id) {
      return res.status(403).json({ ok: false, error: 'Private event' });
    }

    // Increment views
    await Event.findByIdAndUpdate(id, { $inc: { 'stats.views': 1 } });

    // Get counts
    const goingCount = event.attendees?.filter(a => a.status === 'going').length || 0;
    const interestedCount = event.attendees?.filter(a => a.status === 'interested').length || 0;
    const userRsvp = req.user ? 
      event.attendees?.find(a => a.user?._id?.toString() === req.user.id)?.status : null;

    // Limit attendees shown (first 20 going)
    const goingAttendees = event.attendees
      ?.filter(a => a.status === 'going')
      .slice(0, 20);

    res.json({
      ok: true,
      event: {
        ...event,
        goingCount,
        interestedCount,
        userRsvp,
        isOrganizer: event.organizer._id.toString() === req.user?.id,
        isCoHost: event.coHosts?.some(h => h._id.toString() === req.user?.id),
        attendees: goingAttendees,
        isFull: event.maxAttendees > 0 && goingCount >= event.maxAttendees
      }
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// UPDATE EVENT
// PUT /api/events/:id
// ==========================================

router.put('/:id', verifyToken, async (req, res) => {
  try {
    const Event = getEventModel();
    const { id } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.id && 
        !event.coHosts?.includes(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const allowedUpdates = [
      'title', 'description', 'coverImage', 'images', 'type', 'category',
      'startDate', 'endDate', 'timezone', 'isAllDay', 'location', 'onlineDetails',
      'maxAttendees', 'visibility', 'requiresApproval', 'isTicketed', 'tickets',
      'tags', 'status', 'allowComments', 'coHosts'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'startDate' || field === 'endDate') {
          event[field] = new Date(req.body[field]);
        } else {
          event[field] = req.body[field];
        }
      }
    });

    await event.save();
    await event.populate('organizer', 'name username avatar');

    res.json({ ok: true, event });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// DELETE EVENT
// DELETE /api/events/:id
// ==========================================

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const Event = getEventModel();
    const { id } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    await Event.findByIdAndDelete(id);

    res.json({ ok: true, message: 'Event deleted' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// RSVP TO EVENT
// POST /api/events/:id/rsvp
// ==========================================

router.post('/:id/rsvp', verifyToken, async (req, res) => {
  try {
    const Event = getEventModel();
    const { id } = req.params;
    const { status } = req.body; // 'going', 'interested', 'not-going'

    if (!['going', 'interested', 'not-going'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Invalid status' });
    }

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    // Check if event is full (for 'going' status)
    if (status === 'going' && event.maxAttendees > 0) {
      const goingCount = event.attendees.filter(a => a.status === 'going').length;
      if (goingCount >= event.maxAttendees) {
        // Add to waitlist
        const onWaitlist = event.waitlist.some(w => w.user.toString() === req.user.id);
        if (!onWaitlist) {
          event.waitlist.push({ user: req.user.id });
          await event.save();
        }
        return res.json({ 
          ok: true, 
          waitlisted: true, 
          message: 'Event is full. Added to waitlist.' 
        });
      }
    }

    // Find existing RSVP
    const existingIndex = event.attendees.findIndex(
      a => a.user.toString() === req.user.id
    );

    if (status === 'not-going') {
      // Remove RSVP
      if (existingIndex > -1) {
        event.attendees.splice(existingIndex, 1);
      }
    } else {
      if (existingIndex > -1) {
        // Update existing
        event.attendees[existingIndex].status = status;
        event.attendees[existingIndex].rsvpDate = new Date();
      } else {
        // Add new
        event.attendees.push({
          user: req.user.id,
          status,
          rsvpDate: new Date()
        });
      }
    }

    // Remove from waitlist if changing status
    event.waitlist = event.waitlist.filter(w => w.user.toString() !== req.user.id);

    await event.save();

    // Get updated counts
    const goingCount = event.attendees.filter(a => a.status === 'going').length;
    const interestedCount = event.attendees.filter(a => a.status === 'interested').length;

    res.json({
      ok: true,
      status,
      goingCount,
      interestedCount
    });
  } catch (error) {
    console.error('RSVP error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GET EVENT ATTENDEES
// GET /api/events/:id/attendees
// ==========================================

router.get('/:id/attendees', optionalAuth, async (req, res) => {
  try {
    const Event = getEventModel();
    const { id } = req.params;
    const { status = 'going', page = 1, limit = 50 } = req.query;

    const event = await Event.findById(id)
      .populate('attendees.user', 'name username avatar bio')
      .lean();

    if (!event) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    let attendees = event.attendees.filter(a => a.status === status);
    const total = attendees.length;

    // Paginate
    const skip = (parseInt(page) - 1) * parseInt(limit);
    attendees = attendees.slice(skip, skip + parseInt(limit));

    res.json({
      ok: true,
      attendees,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get attendees error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// ADD COMMENT TO EVENT
// POST /api/events/:id/comments
// ==========================================

router.post('/:id/comments', verifyToken, async (req, res) => {
  try {
    const Event = getEventModel();
    const { id } = req.params;
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ ok: false, error: 'Content required' });
    }

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    if (!event.allowComments) {
      return res.status(403).json({ ok: false, error: 'Comments disabled' });
    }

    event.comments.push({
      user: req.user.id,
      content: content.trim(),
      createdAt: new Date()
    });

    await event.save();

    // Get the new comment with user info
    const User = getUserModel();
    const user = await User.findById(req.user.id).select('name username avatar');

    res.status(201).json({
      ok: true,
      comment: {
        user,
        content: content.trim(),
        createdAt: new Date()
      }
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GET USER'S EVENTS
// GET /api/events/user/me
// ==========================================

router.get('/user/me', verifyToken, async (req, res) => {
  try {
    const Event = getEventModel();
    const { type = 'all' } = req.query; // 'organized', 'attending', 'interested', 'all'
    const now = new Date();

    let query = {};

    if (type === 'organized') {
      query.organizer = req.user.id;
    } else if (type === 'attending') {
      query['attendees'] = {
        $elemMatch: { user: req.user.id, status: 'going' }
      };
    } else if (type === 'interested') {
      query['attendees'] = {
        $elemMatch: { user: req.user.id, status: 'interested' }
      };
    } else {
      // All events user is involved with
      query.$or = [
        { organizer: req.user.id },
        { 'attendees.user': req.user.id }
      ];
    }

    const events = await Event.find(query)
      .sort({ startDate: 1 })
      .populate('organizer', 'name username avatar')
      .populate('group', 'name slug')
      .lean();

    // Separate upcoming and past
    const upcoming = events.filter(e => new Date(e.startDate) >= now);
    const past = events.filter(e => new Date(e.startDate) < now);

    res.json({
      ok: true,
      upcoming,
      past,
      total: events.length
    });
  } catch (error) {
    console.error('Get user events error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// CANCEL EVENT
// POST /api/events/:id/cancel
// ==========================================

router.post('/:id/cancel', verifyToken, async (req, res) => {
  try {
    const Event = getEventModel();
    const { id } = req.params;
    const { reason } = req.body;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    event.status = 'cancelled';
    await event.save();

    // TODO: Send notifications to attendees about cancellation

    res.json({ ok: true, message: 'Event cancelled', reason });
  } catch (error) {
    console.error('Cancel event error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// SHARE EVENT
// POST /api/events/:id/share
// ==========================================

router.post('/:id/share', verifyToken, async (req, res) => {
  try {
    const Event = getEventModel();
    const { id } = req.params;

    await Event.findByIdAndUpdate(id, { $inc: { 'stats.shares': 1 } });

    res.json({ ok: true, message: 'Share recorded' });
  } catch (error) {
    console.error('Share event error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
