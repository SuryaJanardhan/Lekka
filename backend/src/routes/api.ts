import { Router } from 'express';
import { EmailController } from '../controllers/emailController';
import { CategoryController } from '../controllers/categoryController';
import { RuleController } from '../controllers/ruleController';
import { AnalyticsController } from '../controllers/analyticsController';
import { ExportController } from '../controllers/exportController';
import { IngestController } from '../controllers/ingestController';
import { NotificationController } from '../services/notificationService';
import { ChatController } from '../controllers/chatController';
import { SystemController } from '../controllers/systemController';
import { PushController } from '../controllers/pushController';
import { secureApiMiddleware } from '../middleware/authMiddleware';
import { SnapshotController } from '../controllers/snapshotController';
import { trackSnapshotChanges } from '../middleware/snapshotRevision';

const router = Router();

// Apply cryptographic API secret middleware to all /api routes
router.use(secureApiMiddleware);
router.use(trackSnapshotChanges);
router.get('/sync/status', SnapshotController.status);
router.get('/sync/snapshot', SnapshotController.snapshot);

// Email routes
router.get('/emails', EmailController.getEmails);
router.post('/emails/manual', EmailController.createManualTransaction);
router.post('/emails/notes/backfill', EmailController.backfillNotes);
router.get('/emails/:id', EmailController.getEmailById);
router.patch('/emails/:id', EmailController.updateTransaction);
router.delete('/emails/:id', EmailController.deleteTransaction);
router.post('/emails/:emailId/category', EmailController.assignCategory);
router.post('/emails/:emailId/review', EmailController.requestReview);

// Category routes
router.get('/categories', CategoryController.getCategories);
router.post('/categories', CategoryController.createCategory);
router.patch('/categories/:id', CategoryController.renameCategory);

// Rule routes
router.get('/rules', RuleController.getRules);
router.post('/rules', RuleController.createRule);
router.patch('/rules/:id', RuleController.updateRule);
router.delete('/rules/:id', RuleController.deleteRule);

// Analytics routes
router.get('/analytics', AnalyticsController.getDashboardStats);

// System routes
router.get('/system/sync-status', SystemController.getSyncStatus);

// Export routes
router.get('/export', ExportController.getLLMContextBundle);

// Ingestion trigger route
router.get('/ingest', IngestController.triggerManualIngestion);
router.get('/ingest/preview', IngestController.previewIngestion);
router.post('/ingest', IngestController.triggerManualIngestion);
router.post('/ingest/recover-credits', IngestController.recoverCredits);

// Notification & Server Push routes
router.get('/notifications', NotificationController.getNotifications);
router.get('/notifications/push-status', PushController.status);
router.post('/notifications/devices', PushController.register);
router.delete('/notifications/devices/:installationId', PushController.unregister);
router.get('/notifications/digest', PushController.digest);
router.post('/notifications/reminder', NotificationController.triggerReminder);
router.post('/notifications/:id/read', NotificationController.markRead);
router.post('/notifications/clear', NotificationController.clearAll);

// Groq AI Chatbot routes (with Read-Only Database Tool Calling)
router.post('/chat', ChatController.sendMessage);
router.post('/chat/clear', ChatController.clearHistory);

export default router;
