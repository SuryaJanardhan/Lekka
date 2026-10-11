import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import apiRouter from './routes/api';
import { CronService } from './services/cronService';
import { CategoryModel } from './models/Category';
import { RuleModel } from './models/Rule';
import { runtimeConfig } from './config/runtimeConfig';

dotenv.config();

const app = express();
const PORT = runtimeConfig.port;

app.use(cors({
  origin(origin, callback) {
    if (!origin || runtimeConfig.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-SECRET']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (_req, res) => {
  const isMongoConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    service: 'Lekka Backend API',
    databaseConnected: isMongoConnected,
    timestamp: new Date()
  });
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'Lekka API Serverless Entry Point' });
});

async function seedInitialCategoriesAndRules() {
  try {
    const categoryCount = await CategoryModel.countDocuments({});
    if (categoryCount === 0) {
      console.log('[Seed] Seeding initial categories into MongoDB...');
      const defaultCategories = [
        { name: 'Invoices & Receipts', slug: 'invoices-receipts', colorCode: '#059669', createdSource: 'SYSTEM' },
        { name: 'Alerts & Security', slug: 'alerts-security', colorCode: '#DC2626', createdSource: 'SYSTEM' },
        { name: 'Orders & Delivery', slug: 'orders-delivery', colorCode: '#D97706', createdSource: 'SYSTEM' },
        { name: 'Financial Statements', slug: 'financial-statements', colorCode: '#7C3AED', createdSource: 'SYSTEM' },
        { name: 'General', slug: 'general', colorCode: '#6B7280', createdSource: 'SYSTEM' }
      ];

      const inserted = await CategoryModel.insertMany(defaultCategories);
      console.log(`[Seed] Seeded ${inserted.length} categories.`);

      const invoicesCat = inserted.find((c) => c.slug === 'invoices-receipts');
      const alertsCat = inserted.find((c) => c.slug === 'alerts-security');

      if (invoicesCat) {
        await RuleModel.create({
          categoryId: invoicesCat._id,
          conditions: [{ field: 'subject', operator: 'contains', value: 'Invoice' }],
          priority: 10
        });
      }

      if (alertsCat) {
        await RuleModel.create({
          categoryId: alertsCat._id,
          conditions: [{ field: 'subject', operator: 'contains', value: 'Security' }],
          priority: 10
        });
      }
    }
  } catch (err) {
    console.error('[Seed] Seeding error:', err);
  }
}

// Database Connection Helper for Serverless
let isDbConnecting = false;
export async function connectDatabase() {
  if (mongoose.connection.readyState === 1 || isDbConnecting) return;
  isDbConnecting = true;
  try {
    console.log('[Database] Connecting to MongoDB Atlas...');
    await mongoose.connect(runtimeConfig.mongodbUri, { serverSelectionTimeoutMS: 5000 });
    console.log('[Database] Connected to MongoDB Atlas.');
    await seedInitialCategoriesAndRules();
  } catch (err: any) {
    console.error('[Database] Connection failed:', err.message || err);
    throw err;
  } finally {
    isDbConnecting = false;
  }
}

// Middleware for serverless request DB connection
app.use(async (_req, _res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

// API route middleware
app.use('/api', apiRouter);

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Request failed:', error);
  res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
});

if (!process.env.VERCEL) {
  connectDatabase().then(() => {
    CronService.initCronJobs();
    app.listen(PORT, () => {
      console.log(`[Server] Lekka backend API running on port ${PORT}`);
    });
  });
}

export default app;
