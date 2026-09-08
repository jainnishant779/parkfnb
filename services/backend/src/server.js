const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Load environment variables
dotenv.config();

// Fail at boot, not on the first request. Without JWT_SECRET the server
// starts happily, passes its health check, and 500s every single login —
// the worst way to find out.
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

// Connect to database
connectDB();

const app = express();

// Render (and every other managed host) terminates TLS at a proxy. Without
// this every request carries the proxy's IP, so a per-IP rate limit would
// throttle all users together.
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// Strips $-prefixed keys so a body like { email: { $ne: null } } cannot reach
// a Mongoose query — the existing sanitiser only covered top-level strings.
//
// Written here rather than using express-mongo-sanitize: that package assigns
// to req.query, which Express 5 exposes as a getter only, so it throws on
// every request.
const stripOperators = (value) => {
  if (Array.isArray(value)) return value.map(stripOperators);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) delete value[key];
      else stripOperators(value[key]);
    }
  }
  return value;
};
app.use((req, res, next) => {
  if (req.body) stripOperators(req.body);
  if (req.params) stripOperators(req.params);
  // req.query is a getter in Express 5, so mutate its contents in place.
  if (req.query) stripOperators(req.query);
  next();
});

// Rate limits. These endpoints were entirely unthrottled: the limiter module
// existed but every call site was commented out and the package was not even
// installed.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', http: 429,
    message: 'Too many attempts. Please try again in a few minutes.' } }
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', http: 429,
    message: 'Too many requests. Please slow down.' } }
});
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to ParkBNB API',
    version: '1.0.0',
    status: 'healthy'
  });
});

app.get('/health', (req, res) => {
  // readyState 1 is connected. Reporting healthy without checking would keep
  // a pod with a dead database in the load balancer.
  const mongoose = require('mongoose');
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    success: dbUp,
    status: dbUp ? 'healthy' : 'degraded',
    database: dbUp ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Uploaded KYC documents and listing photos. Both apps store the URL this
// serves and render it directly, so the folder has to be reachable.
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/vehicles', require('./routes/vehicleRoutes'));
app.use('/api/payment-methods', require('./routes/paymentMethodRoutes'));
app.use('/api/owners', require('./routes/ownerRoutes'));
app.use('/api/properties', require('./routes/propertyRoutes'));
app.use('/api/parking-spaces', require('./routes/parkingSpaceRoutes'));
app.use('/api/availability', require('./routes/availabilityRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/refunds', require('./routes/refundRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/conversations', require('./routes/conversationRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/promo-codes', require('./routes/promoCodeRoutes'));
app.use('/api/support-tickets', require('./routes/supportTicketRoutes'));
app.use('/api/admins', require('./routes/adminRoutes'));
app.use('/api/settings', require('./routes/platformSettingRoutes'));
app.use('/api/uploads', require('./routes/uploadRoutes'));

// 404 handler - must be after all routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      http: 404,
      message: `Route ${req.method} ${req.url} not found`,
      traceId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
  });
});

// Global error handler - must be last
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Parkfnb API listening on ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

// Render sends SIGTERM on every deploy. Without this, in-flight requests —
// including bookings and payments — are killed mid-write.
const shutdown = (signal) => {
  console.log(`${signal} received, closing server`);
  server.close(() => {
    require('mongoose').connection.close(false, () => process.exit(0));
  });
  // Don't hang forever if a connection refuses to drain.
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

module.exports = app;
