// ============================================
// FILE: routes/stream-schedule.routes.js
// Stream Scheduling & Live Enhancements
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Models
const User = require('../models/user.model');

// ==========================================
// Scheduled Stream Schema
// ==========================================

const scheduledStreamSchema = new mongoose.Schema({
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, maxLength: 100 },
  description: { type: String, maxLength: 500 },
  scheduledFor: { type: Date, required: true },
  duration: { type: Number, default: 60 }, // minutes
  thumbnail: String,
  category: { type: String, default: 'general' },
  tags: [String],
  notifyFollowers: { type: Boolean, default: true },
  remindersSent: {
    oneDay: { type: Boolean, default: false },
    oneHour: { type: Boolean, default: false },
    tenMinutes: { type: Boolean, default: false }
  },
  status: {
    type: String,
    enum: ['scheduled', 'live', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  liveStreamId: String, // Link to actual livestream when it goes live
  interestedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  viewerCount: { type: Number, default: 0 }
}, { timestamps: true });

scheduledStreamSchema.index({ host: 1, scheduledFor: -1 });
scheduledStreamSchema.index({ scheduledFor: 1, status: 1 });

const ScheduledStream = mongoose.models.ScheduledStream || 
  mongoose.model('ScheduledStream', scheduledStreamSchema);

// ==========================================
// Live Poll Schema
// ==========================================

const livePollSchema = new mongoose.Schema({
  stream: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  question: { type: String, required: true, maxLength: 200 },
  options: [{
    text: { type: String, required: true, maxLength: 100 },
    votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    voteCount: { type: Number, default: 0 }
  }],
  isActive: { type: Boolean, default: true },
  endsAt: Date,
  showResults: { type: Boolean, default: false },
  totalVotes: { type: Number, default: 0 }
}, { timestamps: true });

const LivePoll = mongoose.models.LivePoll || mongoose.model('LivePoll', livePollSchema);

// ==========================================
// Stream Donation Schema
// ==========================================

const streamDonationSchema = new mongoose.Schema({
  stream: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true },
  donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'NGN' },
  message: { type: String, maxLength: 200 },
  displayName: String,
  isAnonymous: { type: Boolean, default: false },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  transactionRef: String,
  highlightColor: String, // For super chats
  readOnStream: { type: Boolean, default: false }
}, { timestamps: true });

const StreamDonation = mongoose.models.StreamDonation || 
  mongoose.model('StreamDonation', streamDonationSchema);

// ==========================================
// SCHEDULE A STREAM
// ==========================================

router.post('/schedule', verifyToken, async (req, res) => {
  try {
    const { title, description, scheduledFor, duration, thumbnail, category, tags, notifyFollowers } = req.body;
    const userId = req.user.id;

    // Validation
    if (!title || !scheduledFor) {
      return res.status(400).json({ ok: false, error: 'Title and scheduled time required' });
    }

    const scheduledDate = new Date(scheduledFor);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ ok: false, error: 'Scheduled time must be in the future' });
    }

    // Check for conflicting schedules (within 30 mins)
    const conflicting = await ScheduledStream.findOne({
      host: userId,
      status: 'scheduled',
      scheduledFor: {
        $gte: new Date(scheduledDate - 30 * 60 * 1000),
        $lte: new Date(scheduledDate.getTime() + 30 * 60 * 1000)
      }
    });

    if (conflicting) {
      return res.status(400).json({ 
        ok: false, 
        error: 'You already have a stream scheduled around this time' 
      });
    }

    const stream = await ScheduledStream.create({
      host: userId,
      title,
      description,
      scheduledFor: scheduledDate,
      duration: duration || 60,
      thumbnail,
      category: category || 'general',
      tags: tags || [],
      notifyFollowers: notifyFollowers !== false
    });

    // Notify followers if enabled
    if (notifyFollowers) {
      notifyFollowersAboutSchedule(userId, stream);
    }

    res.json({
      ok: true,
      stream,
      message: 'Stream scheduled successfully'
    });
  } catch (error) {
    console.error('Schedule stream error:', error);
    res.status(500).json({ ok: false, error: 'Failed to schedule stream' });
  }
});

// ==========================================
// GET SCHEDULED STREAMS
// ==========================================

router.get('/scheduled', async (req, res) => {
  try {
    const { userId, upcoming = 'true', limit = 20, page = 1 } = req.query;

    const query = { status: 'scheduled' };
    
    if (userId) {
      query.host = userId;
    }

    if (upcoming === 'true') {
      query.scheduledFor = { $gte: new Date() };
    }

    const streams = await ScheduledStream.find(query)
      .sort({ scheduledFor: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('host', 'name username avatar')
      .lean();

    const total = await ScheduledStream.countDocuments(query);

    res.json({
      ok: true,
      streams,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get scheduled streams error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch scheduled streams' });
  }
});

// ==========================================
// GET MY SCHEDULED STREAMS
// ==========================================

router.get('/my-schedule', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const query = { host: userId };
    if (status) query.status = status;

    const streams = await ScheduledStream.find(query)
      .sort({ scheduledFor: -1 })
      .lean();

    res.json({ ok: true, streams });
  } catch (error) {
    console.error('Get my schedule error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch schedule' });
  }
});

// ==========================================
// UPDATE SCHEDULED STREAM
// ==========================================

router.put('/schedule/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    const stream = await ScheduledStream.findOne({ _id: id, host: userId });

    if (!stream) {
      return res.status(404).json({ ok: false, error: 'Scheduled stream not found' });
    }

    if (stream.status !== 'scheduled') {
      return res.status(400).json({ ok: false, error: 'Cannot update non-scheduled stream' });
    }

    // Update allowed fields
    const allowedUpdates = ['title', 'description', 'scheduledFor', 'duration', 'thumbnail', 'category', 'tags'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        stream[field] = updates[field];
      }
    });

    await stream.save();

    res.json({ ok: true, stream });
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update schedule' });
  }
});

// ==========================================
// CANCEL SCHEDULED STREAM
// ==========================================

router.delete('/schedule/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const stream = await ScheduledStream.findOneAndUpdate(
      { _id: id, host: userId, status: 'scheduled' },
      { status: 'cancelled' },
      { new: true }
    );

    if (!stream) {
      return res.status(404).json({ ok: false, error: 'Scheduled stream not found' });
    }

    // TODO: Notify interested users about cancellation

    res.json({ ok: true, message: 'Stream cancelled', stream });
  } catch (error) {
    console.error('Cancel schedule error:', error);
    res.status(500).json({ ok: false, error: 'Failed to cancel stream' });
  }
});

// ==========================================
// SET REMINDER (Interest)
// ==========================================

router.post('/schedule/:id/remind', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const stream = await ScheduledStream.findById(id);

    if (!stream || stream.status !== 'scheduled') {
      return res.status(404).json({ ok: false, error: 'Scheduled stream not found' });
    }

    const isInterested = stream.interestedUsers.includes(userId);

    if (isInterested) {
      // Remove interest
      stream.interestedUsers.pull(userId);
    } else {
      // Add interest
      stream.interestedUsers.push(userId);
    }

    await stream.save();

    res.json({
      ok: true,
      interested: !isInterested,
      interestedCount: stream.interestedUsers.length
    });
  } catch (error) {
    console.error('Set reminder error:', error);
    res.status(500).json({ ok: false, error: 'Failed to set reminder' });
  }
});

// ==========================================
// CREATE LIVE POLL
// ==========================================

router.post('/poll', verifyToken, async (req, res) => {
  try {
    const { streamId, question, options, duration } = req.body;
    const userId = req.user.id;

    if (!streamId || !question || !options || options.length < 2) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Stream ID, question, and at least 2 options required' 
      });
    }

    // Verify user is the stream host
    const LiveStream = require('../models/livestream.model');
    const stream = await LiveStream.findById(streamId);

    if (!stream || stream.host.toString() !== userId) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    // Close any existing active polls
    await LivePoll.updateMany(
      { stream: streamId, isActive: true },
      { isActive: false, showResults: true }
    );

    const poll = await LivePoll.create({
      stream: streamId,
      host: userId,
      question,
      options: options.map(text => ({ text, votes: [], voteCount: 0 })),
      endsAt: duration ? new Date(Date.now() + duration * 1000) : null
    });

    // Emit poll to stream viewers via socket
    if (global.io) {
      global.io.to(`stream:${streamId}`).emit('poll-created', {
        pollId: poll._id,
        question: poll.question,
        options: poll.options.map(o => ({ text: o.text, voteCount: 0 })),
        endsAt: poll.endsAt
      });
    }

    res.json({ ok: true, poll });
  } catch (error) {
    console.error('Create poll error:', error);
    res.status(500).json({ ok: false, error: 'Failed to create poll' });
  }
});

// ==========================================
// VOTE ON POLL
// ==========================================

router.post('/poll/:pollId/vote', verifyToken, async (req, res) => {
  try {
    const { pollId } = req.params;
    const { optionIndex } = req.body;
    const userId = req.user.id;

    const poll = await LivePoll.findById(pollId);

    if (!poll || !poll.isActive) {
      return res.status(404).json({ ok: false, error: 'Poll not found or closed' });
    }

    if (poll.endsAt && new Date() > poll.endsAt) {
      poll.isActive = false;
      poll.showResults = true;
      await poll.save();
      return res.status(400).json({ ok: false, error: 'Poll has ended' });
    }

    // Check if user already voted
    const hasVoted = poll.options.some(opt => opt.votes.includes(userId));
    if (hasVoted) {
      return res.status(400).json({ ok: false, error: 'Already voted' });
    }

    // Add vote
    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      return res.status(400).json({ ok: false, error: 'Invalid option' });
    }

    poll.options[optionIndex].votes.push(userId);
    poll.options[optionIndex].voteCount += 1;
    poll.totalVotes += 1;
    await poll.save();

    // Emit updated results
    if (global.io) {
      global.io.to(`stream:${poll.stream}`).emit('poll-update', {
        pollId: poll._id,
        options: poll.options.map(o => ({ text: o.text, voteCount: o.voteCount })),
        totalVotes: poll.totalVotes
      });
    }

    res.json({
      ok: true,
      voted: true,
      results: poll.options.map(o => ({
        text: o.text,
        voteCount: o.voteCount,
        percentage: poll.totalVotes > 0 ? Math.round((o.voteCount / poll.totalVotes) * 100) : 0
      }))
    });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ ok: false, error: 'Failed to vote' });
  }
});

// ==========================================
// END POLL
// ==========================================

router.post('/poll/:pollId/end', verifyToken, async (req, res) => {
  try {
    const { pollId } = req.params;
    const userId = req.user.id;

    const poll = await LivePoll.findOne({ _id: pollId, host: userId });

    if (!poll) {
      return res.status(404).json({ ok: false, error: 'Poll not found' });
    }

    poll.isActive = false;
    poll.showResults = true;
    await poll.save();

    // Emit final results
    if (global.io) {
      global.io.to(`stream:${poll.stream}`).emit('poll-ended', {
        pollId: poll._id,
        question: poll.question,
        results: poll.options.map(o => ({
          text: o.text,
          voteCount: o.voteCount,
          percentage: poll.totalVotes > 0 ? Math.round((o.voteCount / poll.totalVotes) * 100) : 0
        })),
        totalVotes: poll.totalVotes
      });
    }

    res.json({ ok: true, poll });
  } catch (error) {
    console.error('End poll error:', error);
    res.status(500).json({ ok: false, error: 'Failed to end poll' });
  }
});

// ==========================================
// GET ACTIVE POLL
// ==========================================

router.get('/poll/active/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;

    const poll = await LivePoll.findOne({
      stream: streamId,
      isActive: true
    }).lean();

    if (!poll) {
      return res.json({ ok: true, poll: null });
    }

    res.json({
      ok: true,
      poll: {
        id: poll._id,
        question: poll.question,
        options: poll.options.map(o => ({
          text: o.text,
          voteCount: poll.showResults ? o.voteCount : undefined
        })),
        totalVotes: poll.totalVotes,
        endsAt: poll.endsAt
      }
    });
  } catch (error) {
    console.error('Get active poll error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch poll' });
  }
});

// ==========================================
// SEND STREAM DONATION (Super Chat)
// ==========================================

router.post('/donate', verifyToken, async (req, res) => {
  try {
    const { streamId, amount, message, isAnonymous, currency = 'NGN' } = req.body;
    const userId = req.user.id;

    if (!streamId || !amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid donation details' });
    }

    // Get stream and verify it's live
    const LiveStream = require('../models/livestream.model');
    const stream = await LiveStream.findById(streamId);

    if (!stream || stream.status !== 'live') {
      return res.status(404).json({ ok: false, error: 'Stream not found or not live' });
    }

    const donor = await User.findById(userId).select('name username');

    // Determine highlight color based on amount
    let highlightColor = null;
    if (currency === 'NGN') {
      if (amount >= 10000) highlightColor = '#ef4444'; // Red - Super
      else if (amount >= 5000) highlightColor = '#f59e0b'; // Orange
      else if (amount >= 2000) highlightColor = '#10b981'; // Green
      else if (amount >= 1000) highlightColor = '#3b82f6'; // Blue
    }

    // Create donation record
    const donation = await StreamDonation.create({
      stream: streamId,
      donor: userId,
      host: stream.host,
      amount,
      currency,
      message: message?.substring(0, 200),
      displayName: isAnonymous ? 'Anonymous' : donor.name,
      isAnonymous,
      highlightColor
    });

    // Use payment service for actual payment
    const paymentService = require('../services/payment.service');
    const provider = paymentService.getDefaultProvider();

    if (!provider) {
      return res.status(503).json({ ok: false, error: 'No payment provider configured' });
    }

    const payment = await paymentService.initializePayment(provider, {
      amount,
      currency,
      email: donor.email || `${donor.username}@cybev.io`,
      name: isAnonymous ? 'Anonymous' : donor.name,
      userId,
      type: 'stream_donation',
      metadata: {
        streamId,
        donationId: donation._id.toString(),
        hostId: stream.host.toString(),
        message
      }
    });

    donation.transactionRef = payment.reference;
    await donation.save();

    res.json({
      ok: true,
      payment: {
        url: payment.paymentUrl,
        reference: payment.reference
      },
      donationId: donation._id
    });
  } catch (error) {
    console.error('Stream donation error:', error);
    res.status(500).json({ ok: false, error: 'Failed to process donation' });
  }
});

// ==========================================
// GET STREAM DONATIONS
// ==========================================

router.get('/donations/:streamId', verifyToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    const userId = req.user.id;

    // Verify user is host or admin
    const LiveStream = require('../models/livestream.model');
    const stream = await LiveStream.findById(streamId);

    if (!stream || stream.host.toString() !== userId) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const donations = await StreamDonation.find({
      stream: streamId,
      status: 'completed'
    })
      .sort({ createdAt: -1 })
      .populate('donor', 'name username avatar')
      .lean();

    const totalAmount = donations.reduce((sum, d) => sum + d.amount, 0);

    res.json({
      ok: true,
      donations,
      total: totalAmount,
      count: donations.length
    });
  } catch (error) {
    console.error('Get donations error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch donations' });
  }
});

// ==========================================
// HELPER: Notify Followers About Schedule
// ==========================================

async function notifyFollowersAboutSchedule(hostId, stream) {
  try {
    const Follow = require('../models/follow.model');
    const Notification = require('../models/notification.model');
    const host = await User.findById(hostId).select('name username');

    const followers = await Follow.find({ following: hostId }).select('follower');

    const notifications = followers.map(f => ({
      recipient: f.follower,
      type: 'stream_scheduled',
      sender: hostId,
      message: `${host.name} scheduled a live stream: "${stream.title}"`,
      data: {
        streamId: stream._id,
        scheduledFor: stream.scheduledFor,
        title: stream.title
      }
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    console.log(`📢 Notified ${notifications.length} followers about scheduled stream`);
  } catch (error) {
    console.error('Failed to notify followers:', error);
  }
}

module.exports = router;
