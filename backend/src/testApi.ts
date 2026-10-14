import 'dotenv/config';
import mongoose from 'mongoose';
import { EmailModel } from './models/Email';

const baseUrl = (process.env.LEKKA_API_BASE_URL || `http://localhost:${process.env.PORT || '5000'}`).replace(/\/+$/, '');
const apiSecret = process.env.LEKKA_API_SECRET || '';
const smokeTitle = `Lekka smoke ${new Date().toISOString()}`;

type ApiResult = { status: number; data: any };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function makeRequest(path: string, method: string = 'GET', body?: any): Promise<ApiResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-SECRET': apiSecret
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });

  const text = await response.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }

  return { status: response.status, data };
}

async function cleanupSmokeEntry(entryId?: string) {
  if (!entryId || !process.env.MONGODB_URI) return;
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await EmailModel.deleteOne({ _id: entryId, subject: smokeTitle });
  await mongoose.disconnect();
}

async function runApiVerification() {
  console.log(`--- Starting Lekka API smoke against ${baseUrl} ---`);
  let smokeEntryId = '';

  try {
    const health = await makeRequest('/health');
    assert(health.status === 200 && health.data?.databaseConnected === true, `GET /health failed: ${health.status}`);
    console.log('[PASS] GET /health database connected');

    const categories = await makeRequest('/api/categories');
    assert(categories.status === 200 && categories.data?.success === true && categories.data.count > 0, `GET /api/categories failed: ${categories.status}`);
    console.log('[PASS] GET /api/categories count:', categories.data.count);

    const emails = await makeRequest('/api/emails');
    assert(emails.status === 200 && emails.data?.success === true, `GET /api/emails failed: ${emails.status}`);
    console.log('[PASS] GET /api/emails count:', emails.data.count);

    const manual = await makeRequest('/api/emails/manual', 'POST', {
      title: smokeTitle,
      amount: 11,
      paymentMode: 'CASH',
      notes: 'Temporary smoke entry. Safe to delete.',
      date: new Date().toISOString()
    });
    assert(manual.status === 201 && manual.data?.success === true && manual.data.data?._id, `POST /api/emails/manual failed: ${manual.status}`);
    smokeEntryId = manual.data.data._id;
    console.log('[PASS] POST /api/emails/manual created:', smokeEntryId);

    const created = await makeRequest(`/api/emails/${smokeEntryId}`);
    assert(created.status === 200 && created.data?.data?.subject === smokeTitle, `GET /api/emails/:id failed: ${created.status}`);
    console.log('[PASS] GET /api/emails/:id read created entry');

    const updated = await makeRequest(`/api/emails/${smokeEntryId}`, 'PATCH', {
      title: smokeTitle,
      amount: 12,
      paymentMode: 'UPI',
      notes: 'Temporary smoke entry updated. Safe to delete.',
      date: new Date().toISOString()
    });
    assert(updated.status === 200 && updated.data?.data?.parsedJson?.detectedAmount === 12, `PATCH /api/emails/:id failed: ${updated.status}`);
    console.log('[PASS] PATCH /api/emails/:id updated entry');

    const analytics = await makeRequest('/api/analytics');
    assert(analytics.status === 200 && analytics.data?.success === true && analytics.data.data?.summary, `GET /api/analytics failed: ${analytics.status}`);
    console.log('[PASS] GET /api/analytics summary ok');

    const exportBundle = await makeRequest('/api/export');
    assert(exportBundle.status === 200 && exportBundle.data, `GET /api/export failed: ${exportBundle.status}`);
    console.log('[PASS] GET /api/export returned bundle');

    const chat = await makeRequest('/api/chat', 'POST', {
      sessionId: `smoke-${Date.now()}`,
      message: 'Reply in one short sentence with the current number of transactions.',
      clientState: { source: 'smoke-test' }
    });
    assert(chat.status === 200 && chat.data?.success === true && chat.data.data?.reply, `POST /api/chat failed: ${chat.status}`);
    console.log('[PASS] POST /api/chat reply received');

    const deleted = await makeRequest(`/api/emails/${smokeEntryId}`, 'DELETE');
    assert(deleted.status === 200 && deleted.data?.success === true, `DELETE /api/emails/:id failed: ${deleted.status}`);
    smokeEntryId = '';
    console.log('[PASS] DELETE /api/emails/:id removed entry');

    console.log('--- Lekka API smoke completed successfully ---');
  } catch (err) {
    console.error('[FAIL] API smoke error:', err);
    process.exitCode = 1;
  } finally {
    await cleanupSmokeEntry(smokeEntryId).catch((error) => {
      console.error('[WARN] Smoke cleanup failed:', error instanceof Error ? error.message : error);
    });
  }
}

runApiVerification();
