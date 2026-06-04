import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText, Output } from "ai";
import { z } from "zod";

const LevelEnum = z.enum(["beginner", "intermediate", "advanced"]);

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
      .select("extracted_text")
      .eq("id", data.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document not found or access denied");
    if (!doc.extracted_text) throw new Error("Document has no extracted text yet");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const level = data.level ?? "intermediate";
    const levelGuide: Record<string, string> = {
      beginner: "Use simple, friendly language. Avoid jargon. Prefer everyday analogies and step-by-step walkthroughs. Assume no prior knowledge.",
      intermediate: "Use clear academic language with standard terminology. Balance depth and accessibility.",
      advanced: "Use precise technical terminology and industry vocabulary. Go deep into nuances, edge cases, and underlying mechanics.",
    };

    const text = doc.extracted_text.slice(0, 10000);

    // Quick heuristic subject detection (no extra AI roundtrip)
    const detectedRaw = quickDetectSubject(text);
    const { canonical: subject, guide: playbook } = playbookFor(detectedRaw);

    const { experimental_output: output } = await generateText({
      model,
      experimental_output: Output.object({
        schema: z.object({
          subject: z.string().describe("Detected subject area, e.g. Mathematics, Programming, Databases, Networking, Physics, Accounting, Business/MIS, Statistics, etc."),
          summary: z.string().describe("A concise 3-5 paragraph summary"),
          explanation: z.string().describe("Tutor-style explanation of the main concepts, written in markdown. Teach, don't just summarize."),
          key_concepts: z.array(
            z.object({ term: z.string(), definition: z.string() })
          ),
          examples: z.array(
            z.object({
              title: z.string(),
              kind: z.string().describe("worked_problem | code | sql | scenario | calculation | trace"),
              language: z.string().optional().describe("For code/sql examples, the language (e.g. python, javascript, sql)"),
              content: z.string().describe("The example body in markdown. For worked problems show every step. For code include sample input/output. For SQL include sample tables."),
              common_mistakes: z.array(z.string()).optional(),
              alternative_methods: z.array(z.string()).optional(),
            })
          ).min(2).describe("At least 2-4 practical, subject-appropriate examples (worked solutions, code, SQL, scenarios, etc.)."),
          analogies: z.array(
            z.object({ concept: z.string(), analogy: z.string() })
          ).describe("Real-world analogies that make difficult concepts intuitive."),
          visuals: z.array(
            z.object({
              title: z.string(),
              description: z.string(),
              mermaid: z.string().describe("A valid Mermaid.js diagram (flowchart, sequenceDiagram, erDiagram, classDiagram, graph, etc.) that illustrates a concept from the document."),
            })
          ).describe("1-3 Mermaid diagrams illustrating processes, relationships, or architectures from the material."),
          practice: z.array(
            z.object({
              question: z.string(),
              difficulty: z.enum(["easy", "medium", "hard"]),
              answer: z.string(),
              explanation: z.string(),
            })
          ).min(3).describe("3-5 practice exercises with answers and explanations."),
          comprehension_check: z.object({
            question: z.string(),
            answer: z.string(),
          }).describe("A quick comprehension question to check understanding after reading."),
        }),
      }),
      prompt: `You are an Adaptive Personal Tutor.

Detected subject: ${subject}
Subject playbook (follow strictly when choosing example/practice formats):
${playbook}

Learning level: ${level}. ${levelGuide[level]}

Teach — don't summarize. Set the "subject" field in your JSON to "${subject}".

Rules for examples: every example MUST follow the subject playbook above. Do not produce generic prose examples when the playbook calls for worked problems, code, SQL, journal entries, IRAC, or case studies.

Rules for practice: practice items MUST match the subject playbook (e.g. compute-and-show for math, write-the-query for databases, trace-the-algorithm for algorithms).

For visuals, prefer Mermaid flowcharts, sequence diagrams, ER diagrams, or class diagrams. Use plain text labels only — NO HTML, NO <img>, NO <script>, NO inline styles, no emojis, no markdown fences around the diagram. Keep node labels short.

Return strictly valid JSON matching the schema.

Document:
${text}`,
    });

    // Save to database
    const { data: summary, error } = await supabase
      .from("summaries")
      .insert({
        document_id: data.document_id,
        user_id: userId,
        level,
        subject,
        summary: output.summary,
        explanation: output.explanation,
        key_concepts: output.key_concepts,
        examples: output.examples,
        analogies: output.analogies,
        visuals: output.visuals,
        practice: output.practice,
      })
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

    const { experimental_output: output } = await generateText({
      model,
      experimental_output: Output.object({
        schema: z.object({
          questions: z.array(
            z.object({
              question: z.string(),
              type: z.enum(["multiple_choice", "true_false"]),
              options: z.array(z.string()).optional(),
              correct_answer: z.string(),
              explanation: z.string(),
            })
          ),
        }),
      }),
      prompt: `Create a quiz with 10 questions from the document below. Mix multiple choice (4 options) and true/false. Return JSON {questions:[{question,type,options?,correct_answer,explanation}]}.\n\nDocument:\n${doc.extracted_text.slice(0, 15000)}`,
    });

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
