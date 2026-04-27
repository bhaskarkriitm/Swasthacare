// ============================================
// SwasthCare - Main Server Entry Point
// ============================================

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
require('dotenv').config();

const { initSocket } = require('./config/socket');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// ── Route Imports ──────────────────────────────
const authRoutes        = require('./routes/auth.routes');
const patientRoutes     = require('./routes/patient.routes');
const doctorRoutes      = require('./routes/doctor.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const consultationRoutes= require('./routes/consultation.routes');
const paymentRoutes     = require('./routes/payment.routes');
const subscriptionRoutes= require('./routes/subscription.routes');
const prescriptionRoutes= require('./routes/prescription.routes');
const notificationRoutes= require('./routes/notification.routes');
const adminRoutes       = require('./routes/admin.routes');
const healthRoutes      = require('./routes/health.routes');

const app = express();
const server = http.createServer(app);

// ── Security Middleware ────────────────────────
app.use(helmet());
app.use(mongoSanitize());
app.use(hpp());

// ── CORS ───────────────────────────────────────
app.use(cors({
  origin: [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:19006'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
}));

// ── Rate Limiting ─────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' },
});

app.use('/api/', limiter);
app.use('/api/v1/auth/', authLimiter);

// ── Body Parsing ───────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging ────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) }
  }));
}

// ── API Documentation ──────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { background: #FF6B00; }',
  customSiteTitle: 'SwasthCare API Docs',
}));

// ── Routes ─────────────────────────────────────
const API = `/api/v1`;
app.use(`${API}/auth`,          authRoutes);
app.use(`${API}/patients`,      patientRoutes);
app.use(`${API}/doctors`,       doctorRoutes);
app.use(`${API}/appointments`,  appointmentRoutes);
app.use(`${API}/consultations`, consultationRoutes);
app.use(`${API}/payments`,      paymentRoutes);
app.use(`${API}/subscriptions`, subscriptionRoutes);
app.use(`${API}/prescriptions`, prescriptionRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/admin`,         adminRoutes);
app.use(`${API}/health`,        healthRoutes);

// ── 404 Handler ────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ── Error Handler ──────────────────────────────
app.use(errorHandler);

// ── Boot ───────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    await connectDB();
    await connectRedis();
    initSocket(server);

    server.listen(PORT, () => {
      logger.info(`🚀 SwasthCare API running on port ${PORT}`);
      logger.info(`📚 API Docs: http://localhost:${PORT}/api-docs`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();

// ── Graceful Shutdown ─────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await mongoose.disconnect();
  server.close(() => process.exit(0));
});

module.exports = { app, server };
