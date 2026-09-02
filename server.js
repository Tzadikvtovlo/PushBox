import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// In-memory demo SMS store for testing and preview without live Yemot HaMashiach credentials
let sentMessagesDemo = [];
let demoMessages = [
  {
    receive_date: '2026-09-02 11:20:15',
    source: 'Google',
    message: 'קוד האימות שלך ב-Google הוא 582914. אין למסור קוד זה לאיש.'
  },
  {
    receive_date: '2026-09-02 10:45:32',
    source: 'Leumi-Bank',
    message: 'קוד אימות חד פעמי לכניסה לחשבון בנק לאומי: 938102. בתוקף ל-5 דקות.'
  },
  {
    receive_date: '2026-09-02 09:12:08',
    source: 'Bit',
    message: 'שלום, הועברה אליך בקשת תשלום. קוד אישור עסקה: 710492.'
  },
  {
    receive_date: '2026-09-01 18:30:00',
    source: 'Yemot-IVR',
    message: 'מערכת 0775551234: התקבלה הודעה קולית חדשה בשלוחה 1.'
  },
  {
    receive_date: '2026-09-01 14:15:22',
    source: 'Postal-IL',
    message: 'חבילה מספר RR948102934IL ממתינה בסניף הדואר המרכזי. קוד איסוף: 48201.'
  }
];

// Proxy for Yemot HaMashiach API (bypasses browser CORS, supports live tokens and demo mode)
app.all('/proxy-ym/api/:endpoint', async (req, res) => {
  const endpoint = req.params.endpoint;
  const token = req.query.token || req.body?.token || '';

  // If using demo mode token
  if (!token || token.toLowerCase().includes('demo')) {
    if (endpoint === 'GetSession') {
      return res.json({
        responseStatus: 'OK',
        username: '077-5551234',
        user_name: '077-5551234',
        did: '077-5551234'
      });
    }

    if (endpoint === 'GetIncomingSms') {
      const limit = parseInt(req.query.limit || req.body?.limit, 10) || 50;
      return res.json({
        responseStatus: 'OK',
        total: demoMessages.length,
        rows: demoMessages.slice(0, limit)
      });
    }

    if (endpoint === 'SendSms') {
      const phones = req.body?.phones || req.query.phones || '';
      const message = req.body?.message || req.query.message || '';
      const callerId = req.body?.callerId || req.query.callerId || '077-5551234';

      if (!phones || !message) {
        return res.status(400).json({
          responseStatus: 'ERROR',
          message: 'יש לציין מספר נמען ותוכן הודעה'
        });
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const sentItem = {
        id: 'sent_' + Date.now(),
        date: dateStr,
        phones: String(phones),
        message: String(message),
        callerId: String(callerId),
        status: 'נשלח בהצלחה'
      };

      sentMessagesDemo.unshift(sentItem);

      return res.json({
        responseStatus: 'OK',
        status: 'success',
        count: 1,
        message: 'הודעת SMS נשלחה בהצלחה!',
        item: sentItem
      });
    }

    return res.json({ responseStatus: 'OK', message: 'Demo mode active' });
  }

  // Forward live request to Call2All (Yemot HaMashiach)
  try {
    const isPost = req.method === 'POST';
    const queryParams = new URLSearchParams(req.query).toString();
    const targetUrl = `https://www.call2all.co.il/ym/api/${endpoint}${queryParams ? '?' + queryParams : ''}`;
    
    console.log(`[Proxy] Forwarding ${req.method} to: ${targetUrl}`);
    const fetchOptions = {
      method: req.method,
      headers: {
        'User-Agent': 'PushBox-Extension/4.6',
        'Accept': 'application/json'
      }
    };

    if (isPost) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(req.body);
    }

    const apiRes = await fetch(targetUrl, fetchOptions);
    const data = await apiRes.json();
    return res.json(data);
  } catch (error) {
    console.error('[Proxy] Error connecting to Yemot HaMashiach:', error);
    return res.status(502).json({
      responseStatus: 'ERROR',
      message: 'שגיאת תקשורת מול שרתי ימות המשיח: ' + error.message
    });
  }
});

// Demo trigger: inject a mock SMS for testing
app.post('/api/demo/add-sms', (req, res) => {
  const { source, message } = req.body;
  if (!source || !message) {
    return res.status(400).json({ error: 'source and message are required' });
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const newMsg = {
    receive_date: dateStr,
    source: source.trim(),
    message: message.trim()
  };

  demoMessages.unshift(newMsg);
  res.json({ success: true, message: newMsg });
});

// Serve static extension and web files
app.use(express.static(__dirname));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'PushBox', version: '4.6' });
});

// Fallback to index.html for root navigation
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 PushBox server running on http://0.0.0.0:${PORT}`);
});
