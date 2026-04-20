import formidable from 'formidable';
import fs from 'fs';

export const config = { api: { bodyParser: false } };

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

  // Step 3 — Read file into Buffer (not a stream)
  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(uploadedFile.filepath);
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: 'Could not read temp file: ' + e.message
    });
  }

  // Step 4 — Build multipart body manually using Buffer
  // This is the most reliable way in serverless — no stream, no form-data package
  const boundary = '----VercelParserBoundary' + Date.now();
  const filename = uploadedFile.originalFilename || 'statement.pdf';

  const beforeFile = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/pdf\r\n\r\n`
  );
  const afterFile = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([beforeFile, fileBuffer, afterFile]);

  // Step 5 — Forward to Railway Python parser
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

  // Step 6 — Clean up temp file
  try { fs.unlinkSync(uploadedFile.filepath); } catch {}

  // Step 7 — Return parser response
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
