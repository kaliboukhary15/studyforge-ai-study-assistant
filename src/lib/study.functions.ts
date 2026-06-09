import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText } from "ai";
import { buildMultimodalContent, persistExtractedImages } from "./multimodal-content.server";
import { z } from "zod";

// Extract and parse a JSON object from a model response that may include
// markdown fences or stray prose. Throws a descriptive error on failure.
function parseJsonObject<T>(raw: string, schema: z.ZodType<T>): T {
  let s = raw.trim();
  // Strip ```json ... ``` fences if present
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response did not contain a JSON object");
  }
  let body = s.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Repair common issues: trailing commas, stray control chars
    body = body
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    parsed = JSON.parse(body);
  }
  return schema.parse(parsed);
}

const LevelEnum = z.enum(["beginner", "intermediate", "advanced"]);

const LanguageEnum = z.enum([
  "auto",
  "english",
  "arabic",
  "french",
  "spanish",
  "german",
  "italian",
  "portuguese",
  "chinese",
  "japanese",
  "korean",
  "russian",
  "hindi",
  "turkish",
]);

const LANGUAGE_LABELS: Record<string, string> = {
  english: "English",
  arabic: "Arabic (العربية)",
  french: "French (Français)",
  spanish: "Spanish (Español)",
  german: "German (Deutsch)",
  italian: "Italian (Italiano)",
  portuguese: "Portuguese (Português)",
  chinese: "Chinese (中文)",
  japanese: "Japanese (日本語)",
  korean: "Korean (한국어)",
  russian: "Russian (Русский)",
  hindi: "Hindi (हिन्दी)",
  turkish: "Turkish (Türkçe)",
};

// Fast heuristic language detection from a text sample. Falls back to English.
function quickDetectLanguage(text: string): string {
  const sample = text.slice(0, 4000);
  // Script-based detection wins first (non-Latin scripts are unambiguous)
  const counts = {
    arabic: (sample.match(/[\u0600-\u06FF]/g) || []).length,
    chinese: (sample.match(/[\u4E00-\u9FFF]/g) || []).length,
    japanese: (sample.match(/[\u3040-\u30FF]/g) || []).length,
    korean: (sample.match(/[\uAC00-\uD7AF]/g) || []).length,
    cyrillic: (sample.match(/[\u0400-\u04FF]/g) || []).length,
    devanagari: (sample.match(/[\u0900-\u097F]/g) || []).length,
  };
  if (counts.arabic > 30) return "arabic";
  if (counts.chinese > 30) return "chinese";
  if (counts.japanese > 20) return "japanese";
  if (counts.korean > 20) return "korean";
  if (counts.cyrillic > 30) return "russian";
  if (counts.devanagari > 20) return "hindi";

  // Latin-script: stopword scoring
  const t = ` ${sample.toLowerCase().replace(/[^a-zà-ÿğıİşöüç ]+/g, " ")} `;
  const score = (words: string[]) => words.reduce((a, w) => a + (t.split(` ${w} `).length - 1), 0);
  const candidates: Array<[string, number]> = [
    ["english", score(["the", "and", "of", "to", "in", "is", "that", "for", "with", "this"])],
    ["french", score(["le", "la", "les", "des", "une", "est", "et", "dans", "que", "pour", "avec"])],
    ["spanish", score(["el", "la", "los", "las", "una", "es", "que", "en", "para", "con", "del", "por"])],
    ["german", score(["der", "die", "das", "und", "ist", "nicht", "mit", "ein", "eine", "für", "auch"])],
    ["italian", score(["il", "la", "che", "di", "una", "per", "con", "non", "sono", "anche"])],
    ["portuguese", score(["de", "que", "não", "uma", "para", "com", "por", "como", "mais", "também"])],
    ["turkish", score(["bir", "ve", "bu", "için", "ile", "olan", "değil", "çok"])],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  if (candidates[0][1] >= 3) return candidates[0][0];
  return "english";
}

const SUBJECT_PLAYBOOKS: Record<string, string> = {
  Mathematics:
    "Show fully worked numerical problems with every algebraic step on its own line. Use LaTeX-style notation inline. Call out common arithmetic mistakes. Practice = mix of computation problems and word problems.",
  Physics:
    "State known/unknown, list relevant formulas, substitute units, solve, check dimensions. Use real-world setups. Practice = quantitative problems with numeric answers and units.",
  Statistics:
    "Show formula, plug in sample data, compute step-by-step, interpret the result in plain English. Practice = compute statistics from small datasets and interpret p-values/CIs.",
  Accounting:
    "Show journal entries in debit/credit table format and walk through trial-balance / ledger effects. Practice = post transactions and prepare mini statements.",
  Programming:
    "Provide short, runnable code snippets with sample input/output and line-by-line comments. Mention edge cases and complexity. Practice = small coding exercises with expected output.",
  Algorithms:
    "Trace the algorithm step-by-step on a small input, showing the state of data structures at each step. Include time/space complexity. Practice = trace on a new input and answer complexity questions.",
  Databases:
    "Show sample tables with a few rows, then SQL queries with expected result sets. Cover joins, indexes, normalization where relevant. Practice = write SQL queries against a given schema.",
  Networking:
    "Illustrate packet flow, protocol layers, or topology using Mermaid diagrams. Include realistic addresses/ports. Practice = scenario questions (e.g. why is this packet dropped?).",
  Business:
    "Use a concrete company mini-case-study with named actors, numbers, and a decision. Practice = short case questions asking for a recommendation with justification.",
  MIS:
    "Use a concrete company mini-case-study tying IT systems to business outcomes. Practice = case questions and short-answer concept checks.",
  Chemistry:
    "Show balanced equations and stoichiometric calculations step-by-step with units. Practice = balance equations and compute moles/yields.",
  Biology:
    "Use labeled process diagrams (Mermaid flowcharts) for pathways/cycles. Practice = identify steps, predict effects of disruptions.",
  History:
    "Use cause-effect timelines and short primary-source style excerpts. Practice = short-answer cause/effect and significance questions.",
  Law:
    "Use IRAC (Issue, Rule, Application, Conclusion) on a short hypothetical. Practice = mini hypotheticals analyzed in IRAC.",
  Language:
    "Show example sentences with translation/parsing and grammar notes. Practice = fill-in-the-blank, translation, conjugation.",
  General:
    "Use concrete real-world examples and analogies. Practice = mix of recall and short-answer questions.",
};

function playbookFor(subject: string): { canonical: string; guide: string } {
  const s = subject.toLowerCase();
  const match = (k: string) => s.includes(k);
  if (match("math") || match("calculus") || match("algebra") || match("geometry")) return { canonical: "Mathematics", guide: SUBJECT_PLAYBOOKS.Mathematics };
  if (match("physic")) return { canonical: "Physics", guide: SUBJECT_PLAYBOOKS.Physics };
  if (match("statistic") || match("probability")) return { canonical: "Statistics", guide: SUBJECT_PLAYBOOKS.Statistics };
  if (match("account") || match("finance") || match("bookkeep")) return { canonical: "Accounting", guide: SUBJECT_PLAYBOOKS.Accounting };
  if (match("algorithm") || match("data structure")) return { canonical: "Algorithms", guide: SUBJECT_PLAYBOOKS.Algorithms };
  if (match("program") || match("software") || match("code") || match("python") || match("javascript") || match("java") || match("c++")) return { canonical: "Programming", guide: SUBJECT_PLAYBOOKS.Programming };
  if (match("database") || match("sql")) return { canonical: "Databases", guide: SUBJECT_PLAYBOOKS.Databases };
  if (match("network") || match("tcp") || match("protocol")) return { canonical: "Networking", guide: SUBJECT_PLAYBOOKS.Networking };
  if (match("mis") || match("information system")) return { canonical: "MIS", guide: SUBJECT_PLAYBOOKS.MIS };
  if (match("business") || match("management") || match("marketing") || match("economic")) return { canonical: "Business", guide: SUBJECT_PLAYBOOKS.Business };
  if (match("chem")) return { canonical: "Chemistry", guide: SUBJECT_PLAYBOOKS.Chemistry };
  if (match("bio") || match("anatom") || match("medic")) return { canonical: "Biology", guide: SUBJECT_PLAYBOOKS.Biology };
  if (match("histor")) return { canonical: "History", guide: SUBJECT_PLAYBOOKS.History };
  if (match("law") || match("legal")) return { canonical: "Law", guide: SUBJECT_PLAYBOOKS.Law };
  if (match("language") || match("spanish") || match("french") || match("german") || match("grammar")) return { canonical: "Language", guide: SUBJECT_PLAYBOOKS.Language };
  return { canonical: subject || "General", guide: SUBJECT_PLAYBOOKS.General };
}

function quickDetectSubject(text: string): string {
  const t = text.toLowerCase().slice(0, 8000);
  const score = (kws: string[]) => kws.reduce((a, k) => a + (t.includes(k) ? 1 : 0), 0);
  const candidates: Array<[string, number]> = [
    ["Mathematics", score(["theorem", "integral", "derivative", "equation", "algebra", "calculus", "matrix"])],
    ["Programming", score(["function", "variable", "const ", "class ", "import ", "def ", "return ", "console.log"])],
    ["Databases", score(["select ", "from ", "join", "primary key", "foreign key", "schema", "normaliz"])],
    ["Networking", score(["tcp", "udp", "packet", "router", "protocol", "subnet", "ip address"])],
    ["Physics", score(["velocity", "force", "newton", "energy", "momentum", "acceleration"])],
    ["Chemistry", score(["mole", "reaction", "compound", "molecule", "acid", "base", "atom"])],
    ["Biology", score(["cell", "dna", "protein", "organism", "enzyme", "tissue"])],
    ["Accounting", score(["debit", "credit", "ledger", "journal entry", "balance sheet", "revenue"])],
    ["Business", score(["market", "customer", "strategy", "revenue", "company", "swot"])],
    ["Statistics", score(["mean", "variance", "p-value", "probability", "distribution", "regression"])],
    ["Law", score(["plaintiff", "defendant", "statute", "court", "contract", "tort"])],
    ["History", score(["century", "war", "empire", "revolution", "treaty", "ancient"])],
    ["Language", score(["grammar", "verb", "noun", "tense", "translation", "conjugat"])],
    ["Algorithms", score(["complexity", "big-o", "recursion", "graph traversal", "sorting"])],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][1] >= 2 ? candidates[0][0] : "General";
}

// Generate summary, explanation, and key concepts from document text
export const generateStudyMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        document_id: z.string().uuid(),
        level: LevelEnum.optional(),
        language: LanguageEnum.optional(),
        bilingual: z.boolean().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Ownership check + load text server-side (never trust client text)
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("extracted_text, storage_path, file_type, filename")
      .eq("id", data.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document not found or access denied");
    const fileExt = (doc.file_type || doc.filename.split(".").pop() || "").toLowerCase();
    const isBinaryVisual =
      fileExt === "pdf" || ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(fileExt);
    if (!doc.extracted_text && !isBinaryVisual) {
      throw new Error("Document has no extracted text yet");
    }

    const gateway = createLovableAiGatewayProvider(key);
    // Gemini 2.5 Pro for multimodal visual understanding (diagrams, formulas, OCR).
    const model = gateway("google/gemini-2.5-pro");

    const level = data.level ?? "intermediate";
    const levelGuide: Record<string, string> = {
      beginner: "Use simple, friendly language. Avoid jargon. Prefer everyday analogies and step-by-step walkthroughs. Assume no prior knowledge.",
      intermediate: "Use clear academic language with standard terminology. Balance depth and accessibility.",
      advanced: "Use precise technical terminology and industry vocabulary. Go deep into nuances, edge cases, and underlying mechanics.",
    };

    const text = (doc.extracted_text ?? "").slice(0, 10000);

    // Build multimodal content from the original file (PDF/image bytes, PPTX/DOCX
    // embedded images, or plain text fallback).
    const built = await buildMultimodalContent({
      supabase,
      storagePath: doc.storage_path,
      fileType: fileExt,
      extractedText: doc.extracted_text ?? null,
      filename: doc.filename,
    });

    // Quick heuristic subject detection (no extra AI roundtrip)
    const detectedRaw = quickDetectSubject(text || doc.filename);
    const { canonical: subject, guide: playbook } = playbookFor(detectedRaw);

    // Language detection — explicit override wins, otherwise auto-detect
    const requestedLang = data.language ?? "auto";
    const detectedLang = requestedLang === "auto" ? quickDetectLanguage(text) : requestedLang;
    const languageLabel = LANGUAGE_LABELS[detectedLang] ?? "English";
    const bilingual = data.bilingual ?? false;

    const languageInstruction = `PRIMARY OUTPUT LANGUAGE: ${languageLabel}.
ALL generated text — summary, explanation, key concept terms/definitions, example titles & bodies, analogy concepts & text, visual titles & descriptions, practice questions/answers/explanations, and comprehension_check — MUST be written in ${languageLabel}.
Preserve standard technical terminology (e.g. SQL keywords, code identifiers, mathematical symbols, scientific units, proper nouns) in their original form even when surrounding prose is in ${languageLabel}.
Use culturally appropriate examples, names, currencies, and writing conventions for ${languageLabel} when generating scenarios and case studies.
If the language is Arabic, write right-to-left natural prose (the renderer handles direction); do not transliterate.${
      bilingual
        ? `\n\nBILINGUAL MODE: After each paragraph of the main "explanation" field, append a line starting with "EN: " containing a concise English translation of that paragraph. For each item in "key_concepts", include the English translation of the term in parentheses after the original term (e.g. "المصفوفة (Matrix)").`
        : ""
    }`;

    const StudySchema = z.object({
      subject: z.string(),
      summary: z.string(),
      explanation: z.string(),
      quick_overview: z.string().default(""),
      key_points: z.array(z.string()).default([]),
      key_concepts: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
      examples: z
        .array(
          z.object({
            title: z.string(),
            kind: z.string(),
            language: z.string().optional(),
            content: z.string(),
            common_mistakes: z.array(z.string()).optional(),
            alternative_methods: z.array(z.string()).optional(),
          })
        )
        .default([]),
      analogies: z
        .array(z.object({ concept: z.string(), analogy: z.string() }))
        .default([]),
      steps: z
        .array(
          z.object({
            title: z.string(),
            steps: z
              .array(z.object({ action: z.string(), why: z.string().optional() }))
              .default([]),
          })
        )
        .default([]),
      visuals: z
        .array(
          z.object({
            title: z.string(),
            description: z.string(),
            mermaid: z.string(),
          })
        )
        .default([]),
      visual_analysis: z
        .array(
          z.object({
            title: z.string(),
            kind: z.string().optional(),
            page: z.union([z.number(), z.string()]).optional(),
            description: z.string(),
            image_index: z.number().int().optional(),
          })
        )
        .default([]),
      formulas: z
        .array(
          z.object({
            latex: z.string(),
            plain: z.string().optional(),
            explanation: z.string(),
          })
        )
        .default([]),
      tables: z
        .array(
          z.object({
            title: z.string(),
            headers: z.array(z.string()).default([]),
            rows: z.array(z.array(z.string())).default([]),
            explanation: z.string(),
          })
        )
        .default([]),
      practice: z
        .array(
          z.object({
            question: z.string(),
            difficulty: z.enum(["easy", "medium", "hard"]),
            answer: z.string(),
            explanation: z.string(),
          })
        )
        .default([]),
      memory_aids: z
        .object({
          mnemonics: z.array(z.object({ device: z.string(), meaning: z.string() })).default([]),
          revision_notes: z.array(z.string()).default([]),
          exam_tips: z.array(z.string()).default([]),
        })
        .default({ mnemonics: [], revision_notes: [], exam_tips: [] }),
      comprehension_check: z
        .object({
          quick: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
          medium: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
          challenge: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
        })
        .default({ quick: [], medium: [], challenge: [] }),
    });

    const attachedImageCount = built.parts.filter((p) => p.type === "image").length;
    const hasPdf = built.parts.some((p) => p.type === "file");

    const instructions = `You are an Adaptive Personal Tutor with strong visual reasoning.

Detected subject: ${subject}
Subject playbook (follow strictly when choosing example/practice formats):
${playbook}

Learning level: ${level}. ${levelGuide[level]}

${languageInstruction}

Teach — don't summarize. Set the "subject" field in your JSON to "${subject}".

LEARNING-FIRST STYLE (mandatory):
- Behave like a teacher creating study aids, NOT a textbook rewriter.
- AVOID walls of text. Prefer bullets, short sentences, examples, diagrams, and exercises over paragraphs.
- "quick_overview": 2–3 sentences MAX explaining what the topic is.
- "key_points": short, scannable bullet strings (8–15 words each). 5–10 items.
- "key_concepts": important terms with concise definitions (1–2 sentences each).
- "summary" and "explanation": keep BRIEF — each at most ~6 short lines. Use line breaks; never produce one giant paragraph. If you'd write a long passage, break it into "key_points", "steps", or "examples" instead.
- "steps": for procedures/algorithms/workflows, give one or more step-by-step demos. Each step has an "action" and a short "why" explaining the reason.
- "memory_aids": include subject-appropriate mnemonics, quick revision notes (one-line reminders), and exam tips (what students commonly miss).
- "comprehension_check": short knowledge check with 3 tiers — "quick" (recall, ~3 items), "medium" (apply, ~3 items), "challenge" (analyze/synthesize, ~2 items). Each item has question + answer.
- Generate subject-specific practice (math problems, code/debug tasks, SQL, networking scenarios, MIS case studies, science calculations, etc.) following the subject playbook.
- Whenever a concept benefits from a picture, prefer a Mermaid diagram or a table over prose.

Rules for examples: every example MUST follow the subject playbook above. Do not produce generic prose examples when the playbook calls for worked problems, code, SQL, journal entries, IRAC, or case studies.

Rules for practice: practice items MUST match the subject playbook (e.g. compute-and-show for math, write-the-query for databases, trace-the-algorithm for algorithms).

VISUAL CONTENT — treat images, diagrams, charts, screenshots, tables, and formulas as first-class learning material:
- ${hasPdf ? "The attached PDF contains text AND embedded visuals (diagrams, screenshots, scanned figures). Read both." : "No PDF attached."}
- ${attachedImageCount > 0 ? `${attachedImageCount} image(s) are attached in order (image_index 1..${attachedImageCount}).` : "No standalone images attached."}
- For every meaningful diagram/chart/table/screenshot/figure, add a "visual_analysis" entry with title, kind (diagram|chart|table|screenshot|figure|er_diagram|uml|flowchart|network|formula), page if known, a thorough description (relationships, data flow, processes, network/db connections), and image_index pointing to the attached image (1-based) when applicable.
- Detect mathematical formulas (in text OR images) and put them in "formulas" with LaTeX, a plain reading, and an explanation. Generate at least one solved example when relevant.
- Extract any informative table into "tables" with headers, rows, and an explanation of the data.
- Apply OCR-level reading on images and scanned PDF pages. Support any language found.
- Generate practice questions that reference visuals when present (e.g. "Explain the topology", "Identify relationships in the ER diagram").

For visuals, prefer Mermaid flowcharts, sequence diagrams, ER diagrams, or class diagrams. Use plain text labels only — NO HTML, NO <img>, NO <script>, NO inline styles, no emojis, no markdown fences around the diagram. Keep node labels short.

Return STRICTLY a single valid JSON object (no prose, no markdown fences) with exactly these keys:
{
  "subject": string,
  "summary": string,
  "explanation": string,
  "quick_overview": string,
  "key_points": string[],
  "key_concepts": [{ "term": string, "definition": string }],
  "examples": [{ "title": string, "kind": "worked_problem"|"code"|"sql"|"scenario"|"calculation"|"trace", "language": string?, "content": string, "common_mistakes": string[]?, "alternative_methods": string[]? }],
  "analogies": [{ "concept": string, "analogy": string }],
  "steps": [{ "title": string, "steps": [{ "action": string, "why": string? }] }],
  "visuals": [{ "title": string, "description": string, "mermaid": string }],
  "visual_analysis": [{ "title": string, "kind": string?, "page": (number|string)?, "description": string, "image_index": number? }],
  "formulas": [{ "latex": string, "plain": string?, "explanation": string }],
  "tables": [{ "title": string, "headers": string[], "rows": string[][], "explanation": string }],
  "practice": [{ "question": string, "difficulty": "easy"|"medium"|"hard", "answer": string, "explanation": string }],
  "memory_aids": { "mnemonics": [{ "device": string, "meaning": string }], "revision_notes": string[], "exam_tips": string[] },
  "comprehension_check": { "quick": [{ "question": string, "answer": string }], "medium": [{ "question": string, "answer": string }], "challenge": [{ "question": string, "answer": string }] }
}`;

    const userParts: Array<
      | { type: "text"; text: string }
      | { type: "image"; image: Uint8Array }
      | { type: "file"; data: Uint8Array; mediaType: string }
    > = [{ type: "text", text: instructions }];
    for (const p of built.parts) userParts.push(p);
    if (userParts.length === 1) {
      userParts.push({ type: "text", text: `Filename: ${doc.filename}` });
    }

    const { text: rawText } = await generateText({
      model,
      messages: [{ role: "user", content: userParts }],
    });

    const output = parseJsonObject(rawText, StudySchema);

    // Persist embedded images we extracted ourselves (PPTX/DOCX) with AI captions.
    let savedImagesCount = 0;
    if (built.images.length > 0) {
      const descByIndex = new Map<number, { caption?: string; description?: string; kind?: string }>();
      const offsetForBuiltImages = built.parts.findIndex((p) => p.type === "image");
      for (const va of output.visual_analysis ?? []) {
        if (typeof va.image_index === "number" && va.image_index >= 1) {
          // Built images are the only image parts in pptx/docx flows, so map directly
          // when offset matches the start of image parts.
          const arrayIdx = va.image_index - 1;
          if (offsetForBuiltImages >= 0 && arrayIdx < built.images.length) {
            descByIndex.set(arrayIdx, {
              caption: va.title,
              description: va.description,
              kind: va.kind,
            });
          }
        }
      }
      const descriptions = built.images.map((_, i) => descByIndex.get(i) ?? {});
      try {
        const saved = await persistExtractedImages(
          supabase,
          userId,
          data.document_id,
          built.images,
          descriptions,
        );
        savedImagesCount = saved.length;
      } catch (e) {
        built.notes.push(
          `Image persistence failed: ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    }

    // Save to database
    const { data: summary, error } = await supabase
      .from("summaries")
      .insert({
        document_id: data.document_id,
        user_id: userId,
        level,
        subject,
        language: detectedLang,
        bilingual: { enabled: bilingual },
        summary: output.summary,
        explanation: output.explanation,
        quick_overview: output.quick_overview,
        key_points: output.key_points,
        key_concepts: output.key_concepts,
        examples: output.examples,
        analogies: output.analogies,
        steps: output.steps,
        visuals: output.visuals,
        visual_analysis: output.visual_analysis,
        formulas: output.formulas,
        tables: output.tables,
        processing_notes: {
          mode: built.mode,
          notes: built.notes,
          attached_images: attachedImageCount,
          saved_images: savedImagesCount,
        },
        practice: output.practice,
        memory_aids: output.memory_aids,
        comprehension_check: output.comprehension_check,
      } as never)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { summary };
  });

// Save personal notes for a summary
export const saveSummaryNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ summary_id: z.string().uuid(), notes: z.string().max(50000) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("summaries")
      .update({ notes: data.notes })
      .eq("id", data.summary_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// Generate a quiz from document text
export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        document_id: z.string().uuid(),
        title: z.string().min(1).max(200),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("extracted_text")
      .eq("id", data.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document not found or access denied");
    if (!doc.extracted_text) throw new Error("Document has no extracted text yet");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const quizLang = quickDetectLanguage(doc.extracted_text);
    const quizLangLabel = LANGUAGE_LABELS[quizLang] ?? "English";

    const QuizSchema = z.object({
      questions: z.array(
        z.object({
          question: z.string(),
          type: z.enum(["multiple_choice", "true_false"]),
          options: z.array(z.string()).optional(),
          correct_answer: z.string(),
          explanation: z.string(),
        })
      ),
    });

    const { text: rawQuiz } = await generateText({
      model,
      prompt: `Create a quiz with 10 questions from the document below. Mix multiple choice (4 options) and true/false. Write ALL questions, options, correct_answer values, and explanations in ${quizLangLabel} (preserve standard technical terminology in its original form).\n\nReturn STRICTLY a single valid JSON object (no prose, no markdown fences) of the form:\n{"questions":[{"question":string,"type":"multiple_choice"|"true_false","options":string[]?,"correct_answer":string,"explanation":string}]}\n\nDocument:\n${doc.extracted_text.slice(0, 15000)}`,
    });
    const output = parseJsonObject(rawQuiz, QuizSchema);

    const { data: quiz, error } = await supabase
      .from("quizzes")
      .insert({
        document_id: data.document_id,
        user_id: userId,
        title: data.title,
        questions: output.questions,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { quiz };
  });

export const getSummaries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ document_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: summaries, error } = await supabase
      .from("summaries")
      .select("*")
      .eq("document_id", data.document_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { summaries: summaries || [] };
  });

export const getQuizzes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ document_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: quizzes, error } = await supabase
      .from("quizzes")
      .select("*")
      .eq("document_id", data.document_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { quizzes: quizzes || [] };
  });

export const saveQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        quiz_id: z.string().uuid(),
        score: z.number().int().min(0),
        total_questions: z.number().int().min(1).max(500),
        answers: z.record(z.string(), z.string()),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: attempt, error } = await supabase
      .from("quiz_attempts")
      .insert({
        quiz_id: data.quiz_id,
        user_id: userId,
        score: data.score,
        total_questions: data.total_questions,
        answers: data.answers as Record<string, string>,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { attempt };
  });

export const getQuizAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ quiz_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: attempts, error } = await supabase
      .from("quiz_attempts")
      .select("*")
      .eq("quiz_id", data.quiz_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { attempts: attempts || [] };
  });

// List extracted images for a document, with short-lived signed URLs.
export const getDocumentImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ document_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("document_images")
      .select("id, storage_path, caption, ai_description, kind, ordinal, page_number")
      .eq("document_id", data.document_id)
      .eq("user_id", userId)
      .order("ordinal", { ascending: true });
    if (error) throw new Error(error.message);

    const images = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: signed } = await supabase.storage
          .from("documents")
          .createSignedUrl(r.storage_path, 60 * 60);
        return { ...r, url: signed?.signedUrl ?? null };
      })
    );
    return { images };
  });
