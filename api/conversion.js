import formidable from 'formidable';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

const ANON_PAGE_LIMIT = 3;   // anonymous (no token)
const FREE_PAGE_LIMIT = 6;   // registered free plan

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

async function checkQuota(req, res) {
  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const authHeader = req.headers.authorization;

  // ── Authenticated user ───────────────────────────────────────────────────
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, pages_used_today, quota_reset_at')
        .eq('id', user.id)
        .single();

      const plan = profile?.plan || 'free';

      // Pro and accountant have unlimited conversions
      if (plan === 'pro' || plan === 'accountant') {
        return { allowed: true, userId: user.id, plan };
      }

      // Free registered: 6 pages per day
      const resetAt = profile?.quota_reset_at ? new Date(profile.quota_reset_at) : new Date(0);
      const todayStart = new Date(today);
      const pagesUsed = resetAt < todayStart ? 0 : (profile?.pages_used_today || 0);

      if (pagesUsed >= FREE_PAGE_LIMIT) {
        res.status(429).json({
          success: false,
          error: `Free plan allows ${FREE_PAGE_LIMIT} pages per day. Upgrade to Pro for unlimited.`,
          code: 'QUOTA_EXCEEDED',
          upgradeUrl: '/pricing',
        });
        return { allowed: false };
      }

      // Increment counter
      await supabase.from('profiles').update({
        pages_used_today: pagesUsed + 1,
        quota_reset_at: resetAt < todayStart ? new Date().toISOString() : profile.quota_reset_at,
      }).eq('id', user.id);

      return { allowed: true, userId: user.id, plan };
    }
  }

  // ── Anonymous user (IP-based) ─────────────────────────────────────────────
  const ip = getClientIP(req);
  const key = `anon:${ip}`;

  const { data: limitRow } = await supabase
    .from('daily_limits')
    .select('*')
    .eq('key', key)
    .eq('date', today)
    .single();

  if (!limitRow) {
    await supabase.from('daily_limits').insert({ key, date: today, count: 1 });
    return { allowed: true, plan: 'anonymous' };
  }

  if (limitRow.count >= ANON_PAGE_LIMIT) {
    res.status(403).json({
      success: false,
      error: `Free limit is ${ANON_PAGE_LIMIT} conversions per day. Sign up free to get ${FREE_PAGE_LIMIT} per day.`,
      code: 'DAILY_LIMIT_REACHED',
      upgradeUrl: '/pricing',
    });
    return { allowed: false };
  }

  await supabase
    .from('daily_limits')
    .update({ count: limitRow.count + 1 })
    .eq('id', limitRow.id);

  return { allowed: true, plan: 'anonymous' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Step 1 — Parse incoming upload with formidable
  const form = formidable({
    maxFileSize: 20 * 1024 * 1024,
    keepExtensions: true
  });

  let fields, files;
  try {
    [fields, files] = await form.parse(req);
  } catch (e) {
    return res.status(400).json({
      success: false,
      error: 'Could not read uploaded file: ' + e.message
    });
  }

  // Step 2 — Get the uploaded file
  const uploadedFile = files.file?.[0] || files.pdf?.[0];
  if (!uploadedFile) {
    return res.status(400).json({
      success: false,
      error: 'No file found in upload. Field name must be "file".'
    });
  }

  // Step 3 — Quota check BEFORE forwarding to parser
  const quota = await checkQuota(req, res);
  if (!quota.allowed) {
    try { fs.unlinkSync(uploadedFile.filepath); } catch {}
    return; // response already sent inside checkQuota
  }

  // Step 4 — Read file into Buffer (not a stream)
  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(uploadedFile.filepath);
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: 'Could not read temp file: ' + e.message
    });
  }

  // Step 5 — Build multipart body manually using Buffer
  const boundary = '----VercelParserBoundary' + Date.now();
  const filename = uploadedFile.originalFilename || 'statement.pdf';

  const beforeFile = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/pdf\r\n\r\n`
  );
  const afterFile = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([beforeFile, fileBuffer, afterFile]);

  // Step 6 — Forward to Railway Python parser
  const PARSER_URL = process.env.PARSER_URL;
  const PARSER_SECRET = process.env.PARSER_SECRET;

  if (!PARSER_URL) {
    return res.status(500).json({
      success: false,
      error: 'PARSER_URL environment variable not set on Vercel'
    });
  }

  let parserRes;
  try {
    parserRes = await fetch(`${PARSER_URL}/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
        'X-Secret': PARSER_SECRET || ''
      },
      body: body
    });
  } catch (e) {
    return res.status(502).json({
      success: false,
      error: 'Could not reach parser service: ' + e.message
    });
  }

  // Step 7 — Clean up temp file
  try { fs.unlinkSync(uploadedFile.filepath); } catch {}

  // Step 8 — Return parser response
  const rawText = await parserRes.text();
  console.log('Railway status:', parserRes.status);
  console.log('Railway response preview:', rawText.substring(0, 300));

  let result;
  try {
    result = JSON.parse(rawText);
  } catch (e) {
    return res.status(502).json({
      success: false,
      error: 'Parser returned invalid response: ' + rawText.substring(0, 200)
    });
  }

  if (!parserRes.ok) {
    return res.status(502).json({
      success: false,
      error: result.error || 'Parser failed with status ' + parserRes.status
    });
  }

  return res.status(200).json({ success: true, ...result });
}
