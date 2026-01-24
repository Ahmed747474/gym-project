// @ts-nocheck
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Gemini
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-1.5-flash"; 
// بدائل: gemini-1.5-pro (أدق) / gemini-1.5-flash (أسرع وأرخص)

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickToken(authHeader: string) {
  if (!authHeader) return "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
}

async function callGeminiToParseText(extractedText: string) {
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

  const prompt = `
You are a strict JSON generator.

Return ONLY a single valid JSON object with this exact schema:
{
  "program": { "title": string, "description": string|null },
  "days": [
    {
      "day_number": number,
      "title": string,
      "description": string|null,
      "exercises": [
        {
          "exercise_number": number,
          "name": string,
          "sets": number|null,
          "reps": string|null,
          "rest_seconds": number|null,
          "notes": string|null,
          "video_url": string|null
        }
      ]
    }
  ]
}

Rules:
- Output JSON ONLY (no markdown, no explanations, no extra text).
- If a value is missing or unclear, use null.
- Detect day sections like "Day 1", "Day 2" (or Arabic equivalents if present).
- Parse sets/reps patterns like 3x10, 4×(12-15).
- Do NOT invent exercises or days.
`.trim();

  // Guard: Gemini input size (we keep it reasonable)
  const maxChars = 120_000; // safe-ish
  const safeText = extractedText.length > maxChars ? extractedText.slice(0, maxChars) : extractedText;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { text: "PDF_TEXT_START\n" + safeText + "\nPDF_TEXT_END" },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        // مهم: نخلي الرد JSON (Gemini يدعم responseMimeType)
        responseMimeType: "application/json",
      },
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    // خلي error واضح للـ UI
    throw new Error(`Gemini error ${resp.status}: ${text.slice(0, 2000)}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON wrapper: ${text.slice(0, 2000)}`);
  }

  const out =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("") ||
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!out) throw new Error(`Gemini empty output: ${text.slice(0, 2000)}`);

  // Gemini لما responseMimeType تكون application/json غالبًا بيرجع JSON string في out
  let parsed: any;
  try {
    parsed = JSON.parse(out);
  } catch {
    // أحيانًا يرجع JSON صحيح بس حواليه مسافات—نجرب نقتطع
    const first = out.indexOf("{");
    const last = out.lastIndexOf("}");
    if (first === -1 || last === -1) throw new Error(`Invalid JSON from Gemini: ${out.slice(0, 2000)}`);
    parsed = JSON.parse(out.slice(first, last + 1));
  }

  return parsed;
}

serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Env guards
    if (!SUPABASE_URL) return json({ error: "Missing SUPABASE_URL" }, 500);
    if (!SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);
    if (!GEMINI_API_KEY) return json({ error: "Missing GEMINI_API_KEY" }, 500);

    // Auth
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Unauthorized (missing Authorization)" }, 401);

    const token = pickToken(authHeader);
    if (!token) return json({ error: "Unauthorized (empty token)" }, 401);

    // Supabase admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Validate user JWT
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user?.id) {
      return json({ error: "Unauthorized (invalid token)", details: userErr?.message || null }, 401);
    }
    const userId = userRes.user.id;

    // Admin check
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) return json({ error: "Failed to read profile", details: profErr.message }, 500);
    if (!profile?.is_admin) return json({ error: "Forbidden - admin only" }, 403);

    // Body: expects { text, filename? }
    const body = await req.json().catch(() => ({}));
    const extractedText = (body.text as string) || "";
    const filename = (body.filename as string) || "upload.pdf";

    if (!extractedText || extractedText.trim().length < 20) {
      return json({ error: "No extracted text provided (send body.text from UI)" }, 400);
    }

    // Parse with Gemini
    const parsed = await callGeminiToParseText(extractedText);

    // Minimal validation
    if (!parsed || !Array.isArray(parsed.days)) {
      return json({ error: "Invalid parsed structure", parsed }, 502);
    }

    return json({ parsed, meta: { filename, model: GEMINI_MODEL } }, 200);
  } catch (err: any) {
    return json({ error: err?.message || String(err) }, 500);
  }
});
