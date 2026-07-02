import formidable from 'formidable';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '../lib/jwt.js';

export const config = { api: { bodyParser: false } };

const ANON_PAGE_LIMIT = 3;
const FREE_PAGE_LIMIT = 6;

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET, {
    auth: { persistSession: false },
  });
}

function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Returns { allowed, message, requiresSignup, requiresUpgrade }
 * Increments quota by pageCount if allowed.
 */
async function checkQuota(req, pageCount) {
  // Beta accommodation: bypasses quota entirely when enabled. Reversible by
  // unsetting the env var — no quota/Stripe logic below is touched or removed.
  if (process.env.BETA_UNLIMITED_MODE === 'true') {
    return { allowed: true, plan: 'beta-unlimited' };
  }

  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const authHeader = req.headers.authorization;

  // ── Authenticated user (custom JWT) ─────────────────────────────────────
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    let payload;
    try { payload = await verifyToken(token); } catch { /* invalid token — fall through to anon */ }

    if (payload?.userId) {
      const { data: userRow } = await supabase
        .from('users')
        .select('plan')
        .eq('id', payload.userId)
        .single();

      const plan = userRow?.plan || 'free';

      if (plan === 'pro' || plan === 'accountant') {
        return { allowed: true, userId: payload.userId, plan };
      }

      // Free registered: track pages in daily_limits keyed by userId
      const key = `user:${payload.userId}`;
      const { data: limitRow } = await supabase
        .from('daily_limits')
        .select('*')
        .eq('key', key)
        .eq('date', today)
        .single();

      const used = limitRow?.count || 0;

      if (used + pageCount > FREE_PAGE_LIMIT) {
        const remaining = Math.max(0, FREE_PAGE_LIMIT - used);
        return {
          allowed: false,
          message: `Free plan allows ${FREE_PAGE_LIMIT} pages per day. You have ${remaining} page${remaining === 1 ? '' : 's'} remaining and this document has ${pageCount} pages.`,
          requiresSignup: false,
          requiresUpgrade: true,
        };
      }

      if (!limitRow) {
        await supabase.from('daily_limits').insert({ key, date: today, count: pageCount });
      } else {
        await supabase.from('daily_limits').update({ count: used + pageCount }).eq('id', limitRow.id);
      }

      return { allowed: true, userId: payload.userId, plan };
    }
  }

  // ── Anonymous user (IP-based) ─────────────────────────────────────────────
  const ip  = getClientIP(req);
  const key = `anon:${ip}`;

  const { data: limitRow } = await supabase
    .from('daily_limits')
    .select('*')
    .eq('key', key)
    .eq('date', today)
    .single();

  const used = limitRow?.count || 0;

  if (used + pageCount > ANON_PAGE_LIMIT) {
    const remaining = Math.max(0, ANON_PAGE_LIMIT - used);
    return {
      allowed: false,
      message: `Free limit is ${ANON_PAGE_LIMIT} pages per day. You have ${remaining} page${remaining === 1 ? '' : 's'} remaining and this document has ${pageCount} pages. Sign up free to get ${FREE_PAGE_LIMIT} pages per day.`,
      requiresSignup: true,
      requiresUpgrade: false,
    };
  }

  if (!limitRow) {
    await supabase.from('daily_limits').insert({ key, date: today, count: pageCount });
  } else {
    await supabase
      .from('daily_limits')
      .update({ count: used + pageCount })
      .eq('id', limitRow.id);
  }

  return { allowed: true, plan: 'anonymous' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Step 1 — Parse multipart upload
  const form = formidable({ maxFileSize: 20 * 1024 * 1024, keepExtensions: true });

  let files;
  try {
    [, files] = await form.parse(req);
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Could not read uploaded file: ' + e.message });
  }

  const uploadedFile = files.file?.[0] || files.pdf?.[0];
  if (!uploadedFile) {
    return res.status(400).json({ success: false, error: 'No file found in upload. Field name must be "file".' });
  }

  const PARSER_URL    = process.env.PARSER_URL;
  const PARSER_SECRET = process.env.PARSER_SECRET;

  if (!PARSER_URL) {
    return res.status(500).json({ success: false, error: 'PARSER_URL environment variable not set on Vercel' });
  }

  // Step 2 — Read file into Buffer
  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(uploadedFile.filepath);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read temp file: ' + e.message });
  }

  // Step 3 — Build multipart body (reused for both /page-count and /parse)
  const boundary = '----VercelParserBoundary' + Date.now();
  const filename  = uploadedFile.originalFilename || 'statement.pdf';

  const beforeFile = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/pdf\r\n\r\n`
  );
  const afterFile = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([beforeFile, fileBuffer, afterFile]);

  const parserHeaders = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length.toString(),
    'X-Secret': PARSER_SECRET || '',
  };

  // Step 4 — Get actual page count from Railway
  let pageCount = 1;
  try {
    const pcRes  = await fetch(`${PARSER_URL}/page-count`, { method: 'POST', headers: parserHeaders, body });
    const pcData = await pcRes.json();
    if (typeof pcData.pageCount === 'number') {
      pageCount = pcData.pageCount;
    }
  } catch (e) {
    // If /page-count fails, fall through with pageCount=1 (fail open for quota, not fatal)
    console.warn('[conversion] /page-count failed:', e.message);
  }

  // Step 5 — Quota check with actual page count
  try { fs.unlinkSync(uploadedFile.filepath); } catch {}

  const quota = await checkQuota(req, pageCount);
  if (!quota.allowed) {
    return res.status(429).json({
      success: false,
      error: quota.message,
      code: 'QUOTA_EXCEEDED',
      pageCount,
      requiresSignup:  quota.requiresSignup  || false,
      requiresUpgrade: quota.requiresUpgrade || false,
    });
  }

  // Step 6 — Forward to Railway Python parser
  let parserRes;
  try {
    parserRes = await fetch(`${PARSER_URL}/parse`, { method: 'POST', headers: parserHeaders, body });
  } catch (e) {
    return res.status(502).json({ success: false, error: 'Could not reach parser service: ' + e.message });
  }

  // Step 7 — Return parser response
  const rawText = await parserRes.text();
  console.log('Railway status:', parserRes.status);
  console.log('Railway response preview:', rawText.substring(0, 300));

  let result;
  try {
    result = JSON.parse(rawText);
  } catch (e) {
    return res.status(502).json({ success: false, error: 'Parser returned invalid response: ' + rawText.substring(0, 200) });
  }

  if (!parserRes.ok) {
    return res.status(502).json({ success: false, error: result.error || 'Parser failed with status ' + parserRes.status });
  }

  return res.status(200).json({ success: true, ...result });
}
