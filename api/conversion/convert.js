/**
 * POST /api/conversion/convert
 *
 * Accepts multipart/form-data with a 'file' field (PDF).
 * Returns CSV as application/octet-stream, or 403 if daily limit is reached.
 *
 * Auth: Optional JWT. Authenticated users get their quota tracked by userId;
 *       anonymous users are tracked by IP.
 *
 * Free tier: 3 conversions per day per IP (anon) or 10 per month (pro plan).
 */

import formidable from 'formidable';
import { readFile, unlink } from 'fs/promises';
import { setCors } from '../middleware/corsHeaders.js';
import { optionalAuth } from '../middleware/auth.js';
import { conversionLimiter } from '../middleware/rateLimit.js';
import { parsePDFToCSV } from '../lib/pdf-parser.js';
import { supabase } from '../lib/supabase.js';
import { Errors } from '../utils/response.js';

export const config = { api: { bodyParser: false } };

const FREE_DAILY_LIMIT = 3; // conversions per IP per day

function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

async function checkAndIncrementQuota(userId, ip) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return Errors.METHOD_NOT_ALLOWED(res);

  // Optional auth
  let user = null;
  await new Promise((resolve) => optionalAuth(req, res, () => { user = req.user; resolve(); }));

  // Rate limit
  await new Promise((resolve) => conversionLimiter(req, res, resolve));
  if (res.headersSent) return;

  // Parse multipart
  const form = formidable({ maxFileSize: 10 * 1024 * 1024, keepExtensions: true });
  let fields, files;
  try {
    [fields, files] = await form.parse(req);
  } catch (err) {
    if (err.code === 1016 /* formidable FILE_TOO_LARGE */) return Errors.FILE_TOO_LARGE(res);
    console.error('[conversion/convert] parse error:', err);
    return Errors.INTERNAL(res, 'Failed to read uploaded file.');
  }

  const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
  if (!uploadedFile) {
    return res.status(400).json({ success: false, error: 'No file uploaded.', code: 'NO_FILE' });
  }

  // Validate MIME
  if (uploadedFile.mimetype !== 'application/pdf') {
    await unlink(uploadedFile.filepath).catch(() => {});
    return Errors.INVALID_FILE_TYPE(res);
  }

  const ip = getClientIP(req);

  // Quota check (anonymous users only; authenticated users have separate quota)
  if (!user) {
    const quota = await checkAndIncrementQuota(null, ip);
    if (!quota.allowed) {
      await unlink(uploadedFile.filepath).catch(() => {});
      return Errors.DAILY_LIMIT_REACHED(res);
    }
  }

  // Read and parse
  let buffer;
  try {
    buffer = await readFile(uploadedFile.filepath);
  } finally {
    unlink(uploadedFile.filepath).catch(() => {});
  }

  const startMs = Date.now();
  let parsed;
  try {
    parsed = await parsePDFToCSV(buffer);
  } catch (err) {
    console.error('[conversion/convert] parse error:', err.message);
    return Errors.CONVERSION_FAILED(res);
  }

  const conversionTimeMs = Date.now() - startMs;

  // Log conversion to Supabase (best-effort)
  supabase.from('conversions').insert({
    user_id:          user?.userId || null,
    filename:         uploadedFile.originalFilename || 'statement.pdf',
    file_size:        uploadedFile.size,
    bank_type:        parsed.bank,
    conversion_time_ms: conversionTimeMs,
    status:           'success',
  }).then(() => {}).catch(() => {});

  // Update authenticated user's monthly conversion count
  if (user?.userId) {
    supabase.rpc('increment_conversion_count', { uid: user.userId }).then(() => {}).catch(() => {});
  }

  const originalName = (uploadedFile.originalFilename || 'statement').replace(/\.pdf$/i, '');
  const csvFilename  = `${originalName}_converted.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${csvFilename}"`);
  res.setHeader('X-Bank-Type', parsed.bank);
  res.setHeader('X-Row-Count', String(parsed.rowCount));
  res.status(200).end(parsed.csv);
}
