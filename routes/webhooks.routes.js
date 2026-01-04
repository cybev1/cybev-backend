// ============================================
// FILE: routes/webhooks.routes.js
// Mux Webhook Handler for Recording Capture
// Handles: stream.active, stream.idle, asset.ready
// ============================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');

// Get LiveStream model
let LiveStream;
try {
  LiveStream = require('../models/livestream.model');
} catch {
  // Use existing model if available
  LiveStream = mongoose.models.LiveStream;
}

// Mux webhook secret (set in Mux dashboard)
const MUX_WEBHOOK_SECRET = process.env.MUX_WEBHOOK_SECRET;

// ==========================================
// Webhook Signature Verification
// ==========================================
function verifyMuxSignature(payload, signature, secret) {
  if (!secret) {
    console.log('⚠️ MUX_WEBHOOK_SECRET not set - skipping verification');
    return true; // Skip verification if no secret set
  }
  
  try {
    const parts = signature.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const signaturePart = parts.find(p => p.startsWith('v1='));
    
    if (!timestampPart || !signaturePart) {
      return false;
    }
    
    const timestamp = timestampPart.split('=')[1];
    const expectedSignature = signaturePart.split('=')[1];
    
    const signedPayload = `${timestamp}.${payload}`;
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(computedSignature)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// ==========================================
// POST /api/webhooks/mux - Mux Webhook Endpoint
// ==========================================
router.post('/mux', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['mux-signature'];
  const payload = req.body.toString();
  
  // Verify signature (optional but recommended)
  if (MUX_WEBHOOK_SECRET && signature) {
    const isValid = verifyMuxSignature(payload, signature, MUX_WEBHOOK_SECRET);
    if (!isValid) {
      console.log('❌ Invalid Mux webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }
  
  try {
    const event = JSON.parse(payload);
    const { type, data } = event;
    
    console.log(`📨 Mux webhook received: ${type}`);
    
    switch (type) {
      // ==========================================
      // Live Stream Active - Stream started receiving data
      // ==========================================
      case 'video.live_stream.active':
        await handleStreamActive(data);
        break;
      
      // ==========================================
      // Live Stream Idle - Stream stopped receiving data
      // ==========================================
      case 'video.live_stream.idle':
        await handleStreamIdle(data);
        break;
      
      // ==========================================
      // Live Stream Disconnected
      // ==========================================
      case 'video.live_stream.disconnected':
        await handleStreamDisconnected(data);
        break;
      
      // ==========================================
      // Asset Created - Recording is being processed
      // ==========================================
      case 'video.asset.created':
        await handleAssetCreated(data);
        break;
      
      // ==========================================
      // Asset Ready - Recording is available
      // ==========================================
      case 'video.asset.ready':
        await handleAssetReady(data);
        break;
      
      // ==========================================
      // Asset Errored - Recording failed
      // ==========================================
      case 'video.asset.errored':
        await handleAssetErrored(data);
        break;
      
      // ==========================================
      // Live Stream Recording Completed
      // ==========================================
      case 'video.live_stream.recording.completed':
        await handleRecordingCompleted(data);
        break;
      
      default:
        console.log(`ℹ️ Unhandled Mux event: ${type}`);
    }
    
    // Always respond 200 to acknowledge receipt
    res.status(200).json({ received: true, type });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Still return 200 to prevent retries for parsing errors
    res.status(200).json({ received: true, error: error.message });
  }
});

// ==========================================
// Handler: Stream Active
// ==========================================
async function handleStreamActive(data) {
  try {
    const { id: muxStreamId, playback_ids, status } = data;
    
    console.log(`🔴 Stream active: ${muxStreamId}`);
    
    // Find stream by Mux stream ID
    const stream = await LiveStream.findOne({ muxStreamId });
    
    if (stream) {
      stream.status = 'live';
      stream.isActive = true;
      if (!stream.startedAt) {
        stream.startedAt = new Date();
      }
      await stream.save();
      console.log(`✅ Stream ${stream._id} marked as live`);
    } else {
      console.log(`⚠️ No stream found for Mux ID: ${muxStreamId}`);
    }
  } catch (error) {
    console.error('handleStreamActive error:', error);
  }
}

// ==========================================
// Handler: Stream Idle
// ==========================================
async function handleStreamIdle(data) {
  try {
    const { id: muxStreamId } = data;
    
    console.log(`⏸️ Stream idle: ${muxStreamId}`);
    
    const stream = await LiveStream.findOne({ muxStreamId });
    
    if (stream && stream.status === 'live') {
      // Don't end immediately - streamer might reconnect
      // Just log the idle state
      console.log(`ℹ️ Stream ${stream._id} went idle (not ending yet)`);
    }
  } catch (error) {
    console.error('handleStreamIdle error:', error);
  }
}

// ==========================================
// Handler: Stream Disconnected
// ==========================================
async function handleStreamDisconnected(data) {
  try {
    const { id: muxStreamId } = data;
    
    console.log(`📴 Stream disconnected: ${muxStreamId}`);
    
    const stream = await LiveStream.findOne({ muxStreamId });
    
    if (stream) {
      // Mark as ended after disconnect
      stream.status = 'ended';
      stream.isActive = false;
      stream.endedAt = new Date();
      
      if (stream.startedAt) {
        stream.duration = Math.floor((stream.endedAt - stream.startedAt) / 1000);
      }
      
      await stream.save();
      console.log(`⏹️ Stream ${stream._id} ended (disconnected)`);
      
      // Update feed post if exists
      await updateFeedPost(stream, false);
    }
  } catch (error) {
    console.error('handleStreamDisconnected error:', error);
  }
}

// ==========================================
// Handler: Asset Created (Recording processing)
// ==========================================
async function handleAssetCreated(data) {
  try {
    const { id: assetId, live_stream_id: muxStreamId, status } = data;
    
    console.log(`📼 Asset created: ${assetId} for stream ${muxStreamId}`);
    
    const stream = await LiveStream.findOne({ muxStreamId });
    
    if (stream) {
      stream.muxAssetId = assetId;
      stream.recordingStatus = 'processing';
      await stream.save();
      console.log(`✅ Asset ID saved to stream ${stream._id}`);
    }
  } catch (error) {
    console.error('handleAssetCreated error:', error);
  }
}

// ==========================================
// Handler: Asset Ready (Recording available!)
// ==========================================
async function handleAssetReady(data) {
  try {
    const { 
      id: assetId, 
      playback_ids,
      duration,
      max_stored_resolution,
      max_stored_frame_rate,
      aspect_ratio,
      live_stream_id: muxStreamId
    } = data;
    
    console.log(`✅ Asset ready: ${assetId}`);
    
    // Find stream by asset ID or Mux stream ID
    let stream = await LiveStream.findOne({ muxAssetId: assetId });
    if (!stream && muxStreamId) {
      stream = await LiveStream.findOne({ muxStreamId });
    }
    
    if (stream) {
      // Get playback ID for the recording
      const playbackId = playback_ids?.[0]?.id;
      
      if (playbackId) {
        // Build recording URLs
        stream.recordingPlaybackId = playbackId;
        stream.recordingUrl = `https://stream.mux.com/${playbackId}.m3u8`;
        stream.recordingThumbnail = `https://image.mux.com/${playbackId}/thumbnail.jpg`;
        stream.recordingGif = `https://image.mux.com/${playbackId}/animated.gif`;
        
        // Store metadata
        stream.recordingDuration = duration;
        stream.recordingResolution = max_stored_resolution;
        stream.recordingFrameRate = max_stored_frame_rate;
        stream.recordingAspectRatio = aspect_ratio;
        stream.recordingStatus = 'ready';
        stream.recordingReadyAt = new Date();
        
        // Update status if still live
        if (stream.status === 'live') {
          stream.status = 'ended';
          stream.isActive = false;
        }
        
        await stream.save();
        
        console.log(`🎬 Recording saved for stream ${stream._id}`);
        console.log(`   URL: ${stream.recordingUrl}`);
        console.log(`   Duration: ${duration}s`);
        
        // Notify streamer about recording
        await notifyRecordingReady(stream);
        
        // Update feed post with recording info
        await updateFeedPostWithRecording(stream);
      }
    } else {
      console.log(`⚠️ No stream found for asset ${assetId}`);
    }
  } catch (error) {
    console.error('handleAssetReady error:', error);
  }
}

// ==========================================
// Handler: Asset Errored
// ==========================================
async function handleAssetErrored(data) {
  try {
    const { id: assetId, errors } = data;
    
    console.log(`❌ Asset errored: ${assetId}`, errors);
    
    const stream = await LiveStream.findOne({ muxAssetId: assetId });
    
    if (stream) {
      stream.recordingStatus = 'error';
      stream.recordingError = errors?.messages?.join(', ') || 'Recording failed';
      await stream.save();
      console.log(`⚠️ Recording error saved for stream ${stream._id}`);
    }
  } catch (error) {
    console.error('handleAssetErrored error:', error);
  }
}

// ==========================================
// Handler: Recording Completed
// ==========================================
async function handleRecordingCompleted(data) {
  try {
    const { id: muxStreamId, asset_id: assetId } = data;
    
    console.log(`📼 Recording completed for stream: ${muxStreamId}`);
    
    const stream = await LiveStream.findOne({ muxStreamId });
    
    if (stream && assetId && !stream.muxAssetId) {
      stream.muxAssetId = assetId;
      await stream.save();
    }
  } catch (error) {
    console.error('handleRecordingCompleted error:', error);
  }
}

// ==========================================
// Helper: Update Feed Post
// ==========================================
async function updateFeedPost(stream, isLive) {
  try {
    if (!stream.feedPostId) return;
    
    let Blog;
    try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
    
    const update = {
      isLive,
      'streamData.isLive': isLive
    };
    
    if (!isLive) {
      update.title = `📹 ${stream.title} (Ended)`;
    }
    
    await Blog.findByIdAndUpdate(stream.feedPostId, update);
    console.log(`✅ Feed post updated: isLive=${isLive}`);
  } catch (error) {
    console.log('Could not update feed post:', error.message);
  }
}

// ==========================================
// Helper: Update Feed Post with Recording
// ==========================================
async function updateFeedPostWithRecording(stream) {
  try {
    if (!stream.feedPostId) return;
    
    let Blog;
    try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
    
    await Blog.findByIdAndUpdate(stream.feedPostId, {
      isLive: false,
      title: `📹 ${stream.title}`,
      'streamData.isLive': false,
      'streamData.recordingUrl': stream.recordingUrl,
      'streamData.recordingThumbnail': stream.recordingThumbnail,
      'streamData.duration': stream.recordingDuration,
      recordingUrl: stream.recordingUrl
    });
    
    console.log(`✅ Feed post updated with recording info`);
  } catch (error) {
    console.log('Could not update feed post with recording:', error.message);
  }
}

// ==========================================
// Helper: Notify Recording Ready
// ==========================================
async function notifyRecordingReady(stream) {
  try {
    let Notification;
    try { Notification = require('../models/notification.model'); } catch { Notification = mongoose.model('Notification'); }
    
    await Notification.create({
      recipient: stream.streamer,
      type: 'recording_ready',
      message: `Your stream recording "${stream.title}" is ready!`,
      data: {
        streamId: stream._id,
        recordingUrl: stream.recordingUrl,
        recordingThumbnail: stream.recordingThumbnail,
        duration: stream.recordingDuration
      },
      isRead: false
    });
    
    console.log(`🔔 Notification sent to streamer about recording`);
  } catch (error) {
    console.log('Could not send recording notification:', error.message);
  }
}

// ==========================================
// GET /api/webhooks/mux/test - Test endpoint
// ==========================================
router.get('/mux/test', (req, res) => {
  res.json({
    success: true,
    message: 'Mux webhook endpoint is active',
    configured: !!MUX_WEBHOOK_SECRET,
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Webhook routes loaded (Mux recording capture)');

module.exports = router;
