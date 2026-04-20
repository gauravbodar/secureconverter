/**
 * /api/conversion — Consolidated conversion handler
 *
 * Routes handled:
 *   POST /api/conversion/convert   (multipart PDF → JSON via Railway Python parser)
 *
 * bodyParser is disabled so formidable can handle multipart uploads.
 * PDFs are proxied to our own Railway Python service — never sent to third parties.
 */

import formidable from 'formidable';
import fs from 'fs';
import { setCors } from '../middleware/corsHeaders.js';
import { optionalAuth } from '../middleware/auth.js';
import { conversionLimiter } from '../middleware/rateLimit.js';
import { supabase } from '../lib/supabase.js';
import { Errors } from '../utils/response.js';

const PARSER_URL    = process.env.PARSER_URL;
const PARSER_SECRET = process.env.PARSER_SECRET;

export const config = { api: { bodyParser: false } };

const FREE_DAILY_LIMIT = 3;

function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

async function checkAndIncrementQuota(userId, ip) {
  const today = new Date().toISOString().slice(0, 10);
  const key   = userId || ip;

  const { data: quota } = await supabase
    .from('daily_limits')
    .select('*')
    .eq('key', key)
    .eq('date', today)
    .single();

  if (!quota) {
    await supabase.from('daily_limits').insert({ key, date: today, count: 1 });
    return { allowed: true, count: 1 };
  }

  if (quota.count >= FREE_DAILY_LIMIT && !userId) {
    return { allowed: false, count: quota.count };
  }

  await supabase
    .from('daily_limits')
    .update({ count: quota.count + 1 })
    .eq('id', quota.id);

  return { allowed: true, count: quota.count + 1 };
}

async function handleConvert(req, res) {
  // Optional auth
  let user = null;
  await new Promise((resolve) => optionalAuth(req, res, () => { user = req.user; resolve(); }));

  // Rate limit
  await new Promise((resolve) => conversionLimiter(req, res, resolve));
  if (res.headersSent) return;

  // Parse multipart
  const form = formidable({ maxFileSize: 10 * 1024 * 1024, keepExtensions: true });
  let files;
  try {
    [, files] = await form.parse(req);
  } catch (err) {
    if (err.code === 1016) return Errors.FILE_TOO_LARGE(res);
    console.error('[conversion/convert] parse error:', err);
    return Errors.INTERNAL(res, 'Failed to read uploaded file.');
  }

  const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
  if (!uploadedFile) {
    return res.status(400).json({ success: false, error: 'No file uploaded.', code: 'NO_FILE' });
  }

  if (uploadedFile.mimetype !== 'application/pdf') {
    await fs.promises.unlink(uploadedFile.filepath).catch(() => {});
    return Errors.INVALID_FILE_TYPE(res);
  }

  const ip = getClientIP(req);

  if (!user) {
    const quota = await checkAndIncrementQuota(null, ip);
    if (!quota.allowed) {
      await fs.promises.unlink(uploadedFile.filepath).catch(() => {});
      return Errors.DAILY_LIMIT_REACHED(res);
    }
  }

  if (!PARSER_URL) {
    fs.promises.unlink(uploadedFile.filepath).catch(() => {});
    console.error('[conversion/convert] PARSER_URL not configured');
    return Errors.INTERNAL(res, 'Parser service not configured.');
  }

  const startMs = Date.now();

  // Build FormData using npm 'form-data' — NOT browser FormData — so getHeaders() works
  const FormData = (await import('form-data')).default;
  const parserForm = new FormData();
  parserForm.append('file', fs.createReadStream(uploadedFile.filepath), {
    filename: uploadedFile.originalFilename || 'statement.pdf',
    contentType: uploadedFile.mimetype || 'application/pdf',
    knownLength: uploadedFile.size,
  });

  let result;
  try {
    const parserResponse = await fetch(`${PARSER_URL}/parse`, {
      method: 'POST',
      headers: {
        ...parserForm.getHeaders(),
        'X-Secret': PARSER_SECRET || '',
      },
      body: parserForm,
    });

    const rawText = await parserResponse.text();
    console.log('Railway status:', parserResponse.status);
    console.log('Railway raw response:', rawText.substring(0, 500));

    try {
      result = JSON.parse(rawText);
    } catch (e) {
      return res.status(502).json({
        success: false,
        error: 'Parser returned invalid JSON: ' + rawText.substring(0, 300),
        code: 'PARSER_INVALID_JSON',
      });
    }

    if (!parserResponse.ok) {
      return res.status(502).json({
        success: false,
        error: result.error || 'Parser failed',
        code: 'PARSER_ERROR',
      });
    }
  } catch (err) {
    console.error('[conversion/convert] proxy error:', err.message);
    return Errors.CONVERSION_FAILED(res);
  } finally {
    try { fs.unlinkSync(uploadedFile.filepath); } catch {}
  }

  const conversionTimeMs = Date.now() - startMs;

  // Log (best-effort)
  supabase.from('conversions').insert({
    user_id:            user?.userId || null,
    filename:           uploadedFile.originalFilename || 'statement.pdf',
    file_size:          uploadedFile.size,
    bank_type:          result.bank,
    conversion_time_ms: conversionTimeMs,
    status:             'success',
  }).then(() => {}).catch(() => {});

  if (user?.userId) {
    supabase.rpc('increment_conversion_count', { uid: user.userId }).then(() => {}).catch(() => {});
  }

  return res.status(200).json({ success: true, ...result });
}

// ── main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  const path = new URL(req.url, 'http://localhost').pathname;

  try {
    if (req.method === 'POST' && path.endsWith('/convert')) {
      return await handleConvert(req, res);
    }

    return Errors.METHOD_NOT_ALLOWED(res);

  } catch (err) {
    console.error('[api/conversion]', err);
    return Errors.INTERNAL(res);
  }
}
