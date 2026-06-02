import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText, Output } from "ai";
import { z } from "zod";

// Generate summary, explanation, and key concepts from document text
export const generateStudyMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { document_id: string; text: string; level?: "beginner" | "intermediate" | "advanced" }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const level = data.level ?? "intermediate";
    const levelGuide: Record<string, string> = {
      beginner: "Use simple, friendly language. Avoid jargon. Prefer everyday analogies and step-by-step walkthroughs. Assume no prior knowledge.",
      intermediate: "Use clear academic language with standard terminology. Balance depth and accessibility.",
      advanced: "Use precise technical terminology and industry vocabulary. Go deep into nuances, edge cases, and underlying mechanics.",
    };

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
      prompt: `You are an Adaptive Personal Tutor. Teach the student the material below — do NOT just summarize it.

Learning level: ${level}. ${levelGuide[level]}

Detect the subject and tailor examples to it:
- Math/Physics/Stats/Accounting: include fully worked numerical problems with every step shown and common mistakes called out.
- Programming: include short runnable code snippets with sample input/output and line-by-line explanation.
- Databases: include sample tables and SQL queries.
- Networking: include packet-flow or topology illustrations (use Mermaid for diagrams).
- Business/MIS: include a real-world company scenario or mini case study.
- Algorithms: include a step-by-step trace.

For visuals, prefer Mermaid flowcharts, sequence diagrams, ER diagrams, or class diagrams. Make sure Mermaid syntax is valid (no markdown fences around the diagram, no emojis).

After teaching, generate practice exercises with answers and explanations.

Return strictly valid JSON matching the schema.

Document:
${data.text.slice(0, 15000)}`,
    });

    // Save to database
    const { data: summary, error } = await supabase
      .from("summaries")
      .insert({
        document_id: data.document_id,
        user_id: userId,
        level,
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
  .inputValidator((input: { summary_id: string; notes: string }) => input)
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
  .inputValidator((input: { document_id: string; text: string; title: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

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
      prompt: `Create a quiz with 10 questions from the document below. Mix multiple choice (4 options) and true/false. Return JSON {questions:[{question,type,options?,correct_answer,explanation}]}.\n\nDocument:\n${data.text.slice(0, 15000)}`,
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
  .inputValidator((input: { document_id: string }) => input)
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
  .inputValidator((input: { document_id: string }) => input)
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
  .inputValidator((input: { quiz_id: string; score: number; total_questions: number; answers: Record<string, string> }) => input)
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
  .inputValidator((input: { quiz_id: string }) => input)
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
