import { Router } from 'express';
import { EmailController } from '../controllers/emailController.js';
import { CategoryController } from '../controllers/categoryController.js';
import { RuleController } from '../controllers/ruleController.js';
import { AnalyticsController } from '../controllers/analyticsController.js';
import { ExportController } from '../controllers/exportController.js';
import { IngestController } from '../controllers/ingestController.js';

const router = Router();

// Email routes
router.get('/emails', EmailController.getEmails);
router.get('/emails/:id', EmailController.getEmailById);
router.post('/emails/:emailId/category', EmailController.assignCategory);

// Category routes
router.get('/categories', CategoryController.getCategories);
router.post('/categories', CategoryController.createCategory);

// Rule routes
router.get('/rules', RuleController.getRules);
router.post('/rules', RuleController.createRule);
router.delete('/rules/:id', RuleController.deleteRule);

// Analytics routes
router.get('/analytics', AnalyticsController.getDashboardStats);

// Export routes
router.get('/export', ExportController.getLLMContextBundle);

// Ingestion trigger route
router.post('/ingest', IngestController.triggerManualIngestion);

export default router;
