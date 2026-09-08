const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  res.json({
    success: true,
    status: 'healthy',
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

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   ParkBNB API Server                      ║
╠═══════════════════════════════════════════════════════════╣
║  Environment: ${process.env.NODE_ENV || 'development'}${' '.repeat(45 - (process.env.NODE_ENV || 'development').length)}║
║  Port: ${PORT}${' '.repeat(52 - PORT.toString().length)}║
║  Database: ${process.env.MONGODB_URI ? 'Connected' : 'Not configured'}${' '.repeat(45 - (process.env.MONGODB_URI ? 'Connected' : 'Not configured').length)}║
║  Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}${' '.repeat(40 - (process.env.FRONTEND_URL || 'http://localhost:5173').length)}║
╠═══════════════════════════════════════════════════════════╣
║  Registered Routes:                                       ║
║  • /api/auth              - Authentication                ║
║  • /api/users             - User Management               ║
║  • /api/vehicles          - Vehicle Management            ║
║  • /api/payment-methods   - Payment Methods               ║
║  • /api/owners            - Owner Management              ║
║  • /api/properties        - Property Management           ║
║  • /api/parking-spaces    - Parking Space Management      ║
║  • /api/availability      - Availability Schedules        ║
║  • /api/bookings          - Booking Management            ║
║  • /api/payments          - Payment Processing            ║
║  • /api/refunds           - Refund Management             ║
║  • /api/reviews           - Review Management             ║
║  • /api/conversations     - Conversation Management       ║
║  • /api/messages          - Message Management            ║
║  • /api/notifications     - Notification Management       ║
║  • /api/promo-codes       - Promo Code Management         ║
║  • /api/support-tickets   - Support Ticket Management     ║
║  • /api/admins            - Admin Management              ║
║  • /api/settings          - Platform Settings             ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
