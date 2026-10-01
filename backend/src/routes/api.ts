import { Router } from 'express';
import { EmailController } from '../controllers/emailController';
import { CategoryController } from '../controllers/categoryController';
import { RuleController } from '../controllers/ruleController';
import { AnalyticsController } from '../controllers/analyticsController';
import { ExportController } from '../controllers/exportController';
import { IngestController } from '../controllers/ingestController';
import { secureApiMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Apply cryptographic API secret middleware to all /api routes
router.use(secureApiMiddleware);

// Email routes
router.get('/emails', EmailController.getEmails);
router.post('/emails/manual', EmailController.createManualTransaction);
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
