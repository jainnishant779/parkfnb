const mongoose = require('mongoose');

/**
 * Connect to MongoDB.
 *
 * Retries rather than exiting: on a managed host, exiting on the first failed
 * connection turns a transient Atlas hiccup into a crash-loop, and the
 * platform's own restart backoff is slower than simply waiting here. The
 * health check reports the connection's real state meanwhile, so a pod that
 * never connects stops receiving traffic instead of silently failing queries.
 */
const connectDB = async (attempt = 1) => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Atlas can take a moment to elect a primary; the default 30s leaves a
      // deploy looking hung.
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    });

    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    const wait = Math.min(attempt * 3000, 30000);
    console.error(
      `MongoDB connection failed (attempt ${attempt}): ${error.message}` +
      ` — retrying in ${wait / 1000}s`
    );
    setTimeout(() => connectDB(attempt + 1), wait);
  }
};

// After a successful start, a network blip or an Atlas failover leaves the
// driver buffering: queries hang, then reject with an opaque server error.
// Log the transition so the cause is visible in the host's logs.
mongoose.connection.on('disconnected', () => {
  console.error('MongoDB disconnected');
});
mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message);
});

module.exports = connectDB;
