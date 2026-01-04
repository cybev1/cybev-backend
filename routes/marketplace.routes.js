// ============================================
// FILE: routes/marketplace.routes.js
// Marketplace API Routes - Products, Stores, Orders
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
    try { verifyToken = require('../middleware/auth'); } catch (e3) {
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
          const jwt = require('jsonwebtoken');
          req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          next();
        } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}

const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
    } catch {}
  }
  next();
};

// ==========================================
// SCHEMAS
// ==========================================

// Product Schema
const productSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Basic Info
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  images: [String],
  videos: [String],
  
  // Pricing
  price: { type: Number, required: true, min: 0 },
  originalPrice: Number, // For showing discounts
  currency: { type: String, default: 'USD' },
  
  // Category & Tags
  category: { type: String, required: true },
  subcategory: String,
  tags: [String],
  
  // Product Details
  condition: { type: String, enum: ['new', 'like-new', 'good', 'fair', 'digital'], default: 'new' },
  brand: String,
  model: String,
  
  // Inventory
  quantity: { type: Number, default: 1 },
  sku: String,
  
  // Location
  location: String,
  shippingOptions: [{
    method: String,
    price: Number,
    estimatedDays: String
  }],
  localPickup: { type: Boolean, default: false },
  
  // Digital Products
  isDigital: { type: Boolean, default: false },
  digitalFileUrl: String,
  
  // Blog Integration - publish to blogs
  publishToBlogs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Blog' }],
  publishToAllBlogs: { type: Boolean, default: false },
  
  // Stats
  views: { type: Number, default: 0 },
  saves: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  savesCount: { type: Number, default: 0 },
  
  // Reviews
  reviews: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    images: [String],
    createdAt: { type: Date, default: Date.now }
  }],
  averageRating: { type: Number, default: 0 },
  reviewsCount: { type: Number, default: 0 },
  
  // Status
  status: { type: String, enum: ['active', 'sold', 'pending', 'draft', 'removed'], default: 'active' },
  isFeatured: { type: Boolean, default: false },
  isAdminProduct: { type: Boolean, default: false }, // Admin can feature on all blogs
  
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

productSchema.index({ title: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ seller: 1 });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

// Store Schema (optional - for sellers with multiple products)
const storeSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: String,
  logo: String,
  banner: String,
  
  // Contact
  email: String,
  phone: String,
  website: String,
  
  // Location
  location: String,
  address: String,
  
  // Stats
  productsCount: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  
  // Verification
  isVerified: { type: Boolean, default: false },
  verifiedAt: Date,
  
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Store = mongoose.models.Store || mongoose.model('Store', storeSchema);

// Order Schema
const orderSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  
  quantity: { type: Number, default: 1 },
  unitPrice: Number,
  totalPrice: Number,
  currency: { type: String, default: 'USD' },
  
  // Shipping
  shippingAddress: {
    name: String,
    address: String,
    city: String,
    state: String,
    country: String,
    zipCode: String,
    phone: String
  },
  shippingMethod: String,
  shippingCost: Number,
  trackingNumber: String,
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  
  // Payment
  paymentMethod: String,
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  transactionId: String,
  
  // Messages between buyer and seller
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Timestamps
  confirmedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date
}, { timestamps: true });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// ==========================================
// PRODUCT ROUTES
// ==========================================

// GET /api/marketplace/products - Get all products
router.get('/products', optionalAuth, async (req, res) => {
  try {
    const { 
      category, subcategory, condition, minPrice, maxPrice, 
      search, seller, sort = 'newest', page = 1, limit = 20,
      featured
    } = req.query;
    
    const query = { status: 'active', isActive: true };
    
    if (category && category !== 'All') query.category = category;
    if (subcategory) query.subcategory = subcategory;
    if (condition) query.condition = condition;
    if (seller) query.seller = seller;
    if (featured === 'true') query.isFeatured = true;
    
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }
    
    let sortOption = { createdAt: -1 };
    if (sort === 'price-low') sortOption = { price: 1 };
    else if (sort === 'price-high') sortOption = { price: -1 };
    else if (sort === 'popular') sortOption = { views: -1 };
    else if (sort === 'rating') sortOption = { averageRating: -1 };
    
    const products = await Product.find(query)
      .populate('seller', 'name username profilePicture isVerified')
      .sort({ isFeatured: -1, ...sortOption })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    // Check if saved by current user
    if (req.user) {
      products.forEach(p => {
        p.saved = p.saves?.some(s => s.toString() === req.user.id);
      });
    }
    
    const total = await Product.countDocuments(query);
    
    res.json({
      success: true,
      products,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      hasMore: products.length === parseInt(limit)
    });
    
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

// GET /api/marketplace/products/categories - Get categories
router.get('/products/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category', { status: 'active', isActive: true });
    
    const defaultCategories = ['Electronics', 'Fashion', 'Home', 'Services', 'Digital', 'Books', 'Sports', 'Vehicles', 'Other'];
    const allCategories = [...new Set([...defaultCategories, ...categories])];
    
    res.json({ success: true, categories: allCategories });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

// GET /api/marketplace/products/my-products - Seller's products
router.get('/products/my-products', verifyToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const query = { seller: req.user.id, isActive: true };
    if (status) query.status = status;
    
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    const total = await Product.countDocuments(query);
    
    res.json({ success: true, products, total });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

// GET /api/marketplace/products/saved - Saved products
router.get('/products/saved', verifyToken, async (req, res) => {
  try {
    const products = await Product.find({ saves: req.user.id, status: 'active', isActive: true })
      .populate('seller', 'name username profilePicture')
      .sort({ updatedAt: -1 })
      .lean();
    
    products.forEach(p => p.saved = true);
    
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch saved products' });
  }
});

// POST /api/marketplace/products - Create product
router.post('/products', verifyToken, async (req, res) => {
  try {
    const {
      title, description, images, price, originalPrice, currency,
      category, subcategory, tags, condition, brand, model,
      quantity, location, shippingOptions, localPickup,
      isDigital, digitalFileUrl, publishToBlogs, publishToAllBlogs
    } = req.body;
    
    if (!title || !price || !category) {
      return res.status(400).json({ success: false, error: 'Title, price, and category required' });
    }
    
    // Check if user is admin for admin product features
    let User;
    try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
    const user = await User.findById(req.user.id);
    const isAdmin = user?.isAdmin || user?.role === 'admin';
    
    const product = new Product({
      seller: req.user.id,
      title: title.trim(),
      description: description?.trim(),
      images: images || [],
      price: parseFloat(price),
      originalPrice: originalPrice ? parseFloat(originalPrice) : null,
      currency: currency || 'USD',
      category,
      subcategory,
      tags: tags || [],
      condition: condition || 'new',
      brand, model,
      quantity: quantity || 1,
      location,
      shippingOptions: shippingOptions || [],
      localPickup: localPickup || false,
      isDigital: isDigital || false,
      digitalFileUrl,
      publishToBlogs: publishToBlogs || [],
      publishToAllBlogs: isAdmin && publishToAllBlogs,
      isAdminProduct: isAdmin && publishToAllBlogs
    });
    
    await product.save();
    await product.populate('seller', 'name username profilePicture');
    
    // If publishing to blogs, create blog posts
    if (publishToBlogs?.length > 0 || publishToAllBlogs) {
      try {
        let Blog;
        try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
        
        const blogPost = new Blog({
          author: req.user.id,
          title: `🛒 ${title}`,
          content: `${description || ''}\n\n**Price:** ${currency} ${price}\n\n[View Product](/marketplace/${product._id})`,
          contentType: 'product',
          productId: product._id,
          featuredImage: images?.[0],
          visibility: 'public'
        });
        await blogPost.save();
        
        product.publishToBlogs.push(blogPost._id);
        await product.save();
      } catch (e) {
        console.log('Could not create blog post for product:', e.message);
      }
    }
    
    res.status(201).json({
      success: true,
      product,
      message: 'Product listed successfully'
    });
    
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, error: 'Failed to create product' });
  }
});

// GET /api/marketplace/products/:id - Get single product
router.get('/products/:id', optionalAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('seller', 'name username profilePicture bio followersCount isVerified createdAt')
      .populate('reviews.user', 'name username profilePicture')
      .lean();
    
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // Increment views
    await Product.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    
    // Check if saved
    if (req.user) {
      product.saved = product.saves?.some(s => s.toString() === req.user.id);
      product.isOwner = product.seller._id.toString() === req.user.id;
    }
    
    // Get related products
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      status: 'active',
      isActive: true
    })
    .populate('seller', 'name username profilePicture')
    .limit(4)
    .lean();
    
    res.json({
      success: true,
      product,
      relatedProducts
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch product' });
  }
});

// PUT /api/marketplace/products/:id - Update product
router.put('/products/:id', verifyToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    if (product.seller.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    const allowedUpdates = [
      'title', 'description', 'images', 'price', 'originalPrice', 'currency',
      'category', 'subcategory', 'tags', 'condition', 'brand', 'model',
      'quantity', 'location', 'shippingOptions', 'localPickup', 'status'
    ];
    
    allowedUpdates.forEach(key => {
      if (req.body[key] !== undefined) product[key] = req.body[key];
    });
    
    await product.save();
    
    res.json({ success: true, product, message: 'Product updated' });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update product' });
  }
});

// DELETE /api/marketplace/products/:id - Delete product
router.delete('/products/:id', verifyToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    if (product.seller.toString() !== req.user.id) {
      // Check if admin
      let User;
      try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
      const user = await User.findById(req.user.id);
      if (!user?.isAdmin && user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Not authorized' });
      }
    }
    
    product.isActive = false;
    product.status = 'removed';
    await product.save();
    
    res.json({ success: true, message: 'Product deleted' });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete product' });
  }
});

// POST /api/marketplace/products/:id/save - Save/unsave product
router.post('/products/:id/save', verifyToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    const isSaved = product.saves.includes(req.user.id);
    
    if (isSaved) {
      product.saves = product.saves.filter(s => s.toString() !== req.user.id);
    } else {
      product.saves.push(req.user.id);
    }
    product.savesCount = product.saves.length;
    await product.save();
    
    res.json({
      success: true,
      saved: !isSaved,
      message: isSaved ? 'Removed from saved' : 'Saved!'
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save product' });
  }
});

// POST /api/marketplace/products/:id/review - Add review
router.post('/products/:id/review', verifyToken, async (req, res) => {
  try {
    const { rating, comment, images } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5' });
    }
    
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // Check if already reviewed
    const existingReview = product.reviews.find(r => r.user.toString() === req.user.id);
    if (existingReview) {
      return res.status(400).json({ success: false, error: 'You already reviewed this product' });
    }
    
    product.reviews.push({
      user: req.user.id,
      rating,
      comment,
      images: images || []
    });
    
    // Update average rating
    const totalRating = product.reviews.reduce((sum, r) => sum + r.rating, 0);
    product.averageRating = totalRating / product.reviews.length;
    product.reviewsCount = product.reviews.length;
    
    await product.save();
    await product.populate('reviews.user', 'name username profilePicture');
    
    res.json({
      success: true,
      review: product.reviews[product.reviews.length - 1],
      averageRating: product.averageRating
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add review' });
  }
});

// ==========================================
// ORDER ROUTES
// ==========================================

// POST /api/marketplace/orders - Create order
router.post('/orders', verifyToken, async (req, res) => {
  try {
    const { productId, quantity, shippingAddress, shippingMethod, paymentMethod } = req.body;
    
    const product = await Product.findById(productId).populate('seller');
    
    if (!product || product.status !== 'active') {
      return res.status(404).json({ success: false, error: 'Product not available' });
    }
    
    if (product.seller._id.toString() === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot buy your own product' });
    }
    
    if (product.quantity < (quantity || 1)) {
      return res.status(400).json({ success: false, error: 'Not enough stock' });
    }
    
    // Calculate shipping
    const shippingOption = product.shippingOptions?.find(s => s.method === shippingMethod);
    const shippingCost = shippingOption?.price || 0;
    
    const order = new Order({
      buyer: req.user.id,
      seller: product.seller._id,
      product: product._id,
      quantity: quantity || 1,
      unitPrice: product.price,
      totalPrice: (product.price * (quantity || 1)) + shippingCost,
      currency: product.currency,
      shippingAddress,
      shippingMethod,
      shippingCost,
      paymentMethod
    });
    
    await order.save();
    
    // Update product quantity
    product.quantity -= (quantity || 1);
    if (product.quantity <= 0) {
      product.status = 'sold';
    }
    await product.save();
    
    await order.populate('product', 'title images price');
    await order.populate('seller', 'name username profilePicture');
    
    // Notify seller
    try {
      const Notification = mongoose.model('Notification');
      await Notification.create({
        recipient: product.seller._id,
        sender: req.user.id,
        type: 'new_order',
        message: `New order for "${product.title}"`,
        data: { orderId: order._id }
      });
    } catch {}
    
    res.status(201).json({
      success: true,
      order,
      message: 'Order placed successfully'
    });
    
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

// GET /api/marketplace/orders - Get user's orders
router.get('/orders', verifyToken, async (req, res) => {
  try {
    const { type = 'buying', status, page = 1, limit = 20 } = req.query;
    
    const query = type === 'selling' 
      ? { seller: req.user.id }
      : { buyer: req.user.id };
    
    if (status) query.status = status;
    
    const orders = await Order.find(query)
      .populate('product', 'title images price')
      .populate('buyer', 'name username profilePicture')
      .populate('seller', 'name username profilePicture')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    res.json({ success: true, orders });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

// GET /api/marketplace/orders/:id - Get order details
router.get('/orders/:id', verifyToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('product')
      .populate('buyer', 'name username profilePicture email')
      .populate('seller', 'name username profilePicture email')
      .populate('messages.sender', 'name username profilePicture');
    
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    // Only buyer or seller can view
    if (order.buyer._id.toString() !== req.user.id && order.seller._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    res.json({ success: true, order });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
});

// PUT /api/marketplace/orders/:id/status - Update order status
router.put('/orders/:id/status', verifyToken, async (req, res) => {
  try {
    const { status, trackingNumber } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    // Only seller can update most statuses
    if (order.seller.toString() !== req.user.id) {
      // Buyer can only cancel pending orders
      if (order.buyer.toString() === req.user.id && status === 'cancelled' && order.status === 'pending') {
        order.status = 'cancelled';
        order.cancelledAt = new Date();
        await order.save();
        return res.json({ success: true, order, message: 'Order cancelled' });
      }
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    order.status = status;
    if (trackingNumber) order.trackingNumber = trackingNumber;
    
    if (status === 'confirmed') order.confirmedAt = new Date();
    if (status === 'shipped') order.shippedAt = new Date();
    if (status === 'delivered') order.deliveredAt = new Date();
    if (status === 'cancelled') order.cancelledAt = new Date();
    
    await order.save();
    
    // Notify buyer
    try {
      const Notification = mongoose.model('Notification');
      await Notification.create({
        recipient: order.buyer,
        sender: req.user.id,
        type: 'order_update',
        message: `Your order status: ${status}`,
        data: { orderId: order._id }
      });
    } catch {}
    
    res.json({ success: true, order, message: 'Order updated' });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update order' });
  }
});

// POST /api/marketplace/orders/:id/message - Send message about order
router.post('/orders/:id/message', verifyToken, async (req, res) => {
  try {
    const { content } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    if (order.buyer.toString() !== req.user.id && order.seller.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    order.messages.push({
      sender: req.user.id,
      content
    });
    
    await order.save();
    await order.populate('messages.sender', 'name username profilePicture');
    
    res.json({
      success: true,
      message: order.messages[order.messages.length - 1]
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// ==========================================
// STORE ROUTES
// ==========================================

// GET /api/marketplace/stores/:username - Get store by username
router.get('/stores/:username', async (req, res) => {
  try {
    let User;
    try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
    
    const user = await User.findOne({ username: req.params.username }).select('_id name username profilePicture bio');
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }
    
    const store = await Store.findOne({ owner: user._id, isActive: true });
    
    const products = await Product.find({ seller: user._id, status: 'active', isActive: true })
      .sort({ createdAt: -1 })
      .lean();
    
    const stats = {
      productsCount: products.length,
      totalReviews: products.reduce((sum, p) => sum + (p.reviewsCount || 0), 0),
      averageRating: products.length > 0 
        ? products.reduce((sum, p) => sum + (p.averageRating || 0), 0) / products.length 
        : 0
    };
    
    res.json({
      success: true,
      store: store || { owner: user, name: user.name + "'s Store" },
      seller: user,
      products,
      stats
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch store' });
  }
});

console.log('✅ Marketplace routes loaded');

module.exports = router;
