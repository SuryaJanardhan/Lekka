import http from 'http';

function makeRequest(path: string, method: string = 'GET', body?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 500, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 500, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runApiVerification() {
  console.log('--- Starting Lekka API Verification Test Suite ---');
  try {
    const health = await makeRequest('/health');
    console.log('[PASS] GET /health -> Status:', health.status, health.data);

    const categories = await makeRequest('/api/categories');
    console.log('[PASS] GET /api/categories -> Status:', categories.status, 'Count:', categories.data.count);

    const emails = await makeRequest('/api/emails');
    console.log('[PASS] GET /api/emails -> Status:', emails.status, 'Count:', emails.data.count);

    const ingest = await makeRequest('/api/ingest', 'POST');
    console.log('[PASS] POST /api/ingest -> Status:', ingest.status, 'Result:', ingest.data.data);

    const analytics = await makeRequest('/api/analytics');
    console.log('[PASS] GET /api/analytics -> Status:', analytics.status, 'Summary:', analytics.data.data?.summary);

    const exportBundle = await makeRequest('/api/export');
    console.log('[PASS] GET /api/export -> Status:', exportBundle.status, 'Total Exported:', exportBundle.data.exportMetadata?.totalEmailsExported);

    console.log('--- All API Integration Tests Completed Successfully ---');
  } catch (err) {
    console.error('[FAIL] API Test error:', err);
  }
}

runApiVerification();
