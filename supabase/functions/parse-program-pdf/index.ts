// @ts-nocheck
// Supabase Edge Function (Deno) - parse-program-pdf
// Implements:
//  - admin auth check via /auth/v1/user + profiles lookup using service role
//  - accepts multipart/form-data `file` or JSON body { file_b64, filename }
//  - calls OpenAI Chat Completion to parse PDF into strict JSON per schema
//  - returns { parsed } on success

import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';

function jsonResponse(obj: any, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  return new Response(JSON.stringify(obj), { status, headers });
}

async function getUserFromToken(token: string) {
  // Call Supabase Auth user endpoint
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: token } });
  if (!resp.ok) return null;
  return await resp.json();
}

async function isAdminUser(userId: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_admin`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) return false;
  const data = await resp.json();
  if (!Array.isArray(data) || data.length === 0) return false;
  return !!data[0].is_admin;
}

async function callOpenAI_parsePDF(base64pdf: string) {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  const systemMessage = `You are an expert assistant that MUST output a single valid JSON object and nothing else.\n
Return JSON that strictly follows this schema: {\n  "program": { "title": string, "description": string|null },\n  "days": [ { "day_number": number, "title": string, "description": string|null, "exercises": [ { "exercise_number": number, "name": string, "sets": number|null, "reps": string|null, "rest_seconds": number|null, "notes": string|null, "video_url": string|null } ] } ]\n}\n
Rules:\n- Output only valid JSON, no markdown, no commentary.\n- Do NOT invent values; if a value is missing, use null.\n- Detect day sections such as "Day 1", "Day 2" etc.\n- Treat "Core" or similar sections as normal exercises within the same day.\n- Parse sets/reps patterns like 3x10, 4x(12-15) into sets/reps (sets as number, reps as string).\n- If uncertain about a number, prefer null rather than guessing.\n
Input: below is the PDF encoded in base64. You may decode it to extract text before parsing. If you cannot decode or it's unreadable, return {"program":{"title":null,"description":null},"days":[]}.
`; 

  const userMessage = `PDF_BASE64_START\n${base64pdf}\nPDF_BASE64_END`;

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ],
    temperature: 0,
    max_tokens: 12000
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI error: ${resp.status} ${txt}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content from OpenAI');

  // Ensure it's JSON only: try to find first '{' and parse full object
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) throw new Error('OpenAI response missing JSON object');
  const jsonText = content.slice(firstBrace, lastBrace + 1);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error('Failed to parse JSON from OpenAI response');
  }
  return parsed;
}

async function extractTextFromPdfBase64(base64pdf: string) {
  try {
    // dynamic import of pdfjs-dist via esm.sh
    const pdfjs = await import('https://esm.sh/pdfjs-dist@2.16.105/build/pdf.js');
    // decode base64 to Uint8Array
    const binaryString = atob(base64pdf);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items.map((it: any) => it.str).join(' ');
      fullText += pageText + '\n\n';
    }
    return fullText.trim();
  } catch (err) {
    console.warn('PDF text extraction failed, falling back to base64:', err);
    return null;
  }
}

serve(async (req: Request) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }});
    }
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    // Validate token and get user
    const user = await getUserFromToken(authHeader);
    if (!user || !user.id) return jsonResponse({ error: 'Unauthorized' }, 401);

    // Check admin flag in profiles using service role
    const admin = await isAdminUser(user.id);
    if (!admin) return jsonResponse({ error: 'Forbidden - admin required' }, 403);

    // Accept multipart/form-data or JSON with file_b64
    let fileB64: string | null = null;
    let filename = 'upload.pdf';

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const f = form.get('file') as File | null;
      if (!f) return jsonResponse({ error: 'No file field in form' }, 400);
      filename = f.name || filename;
      const arrayBuffer = await f.arrayBuffer();
      fileB64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    } else {
      const body = await req.json().catch(() => ({}));
      fileB64 = body.file_b64 || null;
      filename = body.filename || filename;
    }

    if (!fileB64) return jsonResponse({ error: 'No file provided' }, 400);

    // Basic size guard: don't accept huge files
    const sizeBytes = (fileB64.length * 3) / 4;
    if (sizeBytes > 10 * 1024 * 1024) {
      return jsonResponse({ error: 'File too large (max 10MB)' }, 400);
    }

    // Call OpenAI to parse
    const parsed = await callOpenAI_parsePDF(fileB64);

    // Validate parsed shape minimally
    if (!parsed || !Array.isArray(parsed.days)) {
      return jsonResponse({ error: 'Parser returned invalid structure' }, 500);
    }

    return jsonResponse({ parsed });
  } catch (err: any) {
    console.error('parse-program-pdf error:', err);
    return jsonResponse({ error: err.message || String(err) }, 500);
  }
});
