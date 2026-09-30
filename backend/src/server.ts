import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import apiRouter from './routes/api';
import { CronService } from './services/cronService';
import { CategoryModel } from './models/Category';
import { RuleModel } from './models/Rule';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lekka_db';

app.use(cors());
app.use(express.json());

// API route middleware
app.use('/api', apiRouter);

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

async function seedInitialCategoriesAndRules() {
  try {
    const categoryCount = await CategoryModel.countDocuments({});
    if (categoryCount === 0) {
      console.log('[Seed] Seeding initial categories into MongoDB...');
      const defaultCategories = [
        { name: 'Invoices & Receipts', slug: 'invoices-receipts', colorCode: '#10B981', createdSource: 'SYSTEM' },
        { name: 'Alerts & Security', slug: 'alerts-security', colorCode: '#EF4444', createdSource: 'SYSTEM' },
        { name: 'Orders & Delivery', slug: 'orders-delivery', colorCode: '#3B82F6', createdSource: 'SYSTEM' },
        { name: 'Financial Statements', slug: 'financial-statements', colorCode: '#8B5CF6', createdSource: 'SYSTEM' },
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

async function startServer() {
  try {
    console.log('[Database] Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('[Database] Connected to MongoDB successfully.');
    await seedInitialCategoriesAndRules();
  } catch (error: any) {
    console.warn('[Database] MongoDB connection warning:', error.message || error);
    console.warn('[Database] Backend will run API endpoints with local fallback mode until DB credentials are provided.');
  }

  // Start background cron scheduler
  CronService.initCronJobs();

  app.listen(PORT, () => {
    console.log(`[Server] Lekka backend API running on port ${PORT}`);
  });
}

startServer();
