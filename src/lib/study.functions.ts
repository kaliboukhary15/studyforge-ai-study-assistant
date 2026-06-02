import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText, Output } from "ai";
import { z } from "zod";

// Generate summary, explanation, and key concepts from document text
export const generateStudyMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { document_id: string; text: string }) => input)
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
          summary: z.string().describe("A concise 3-5 paragraph summary"),
          explanation: z.string().describe("Clear explanation of main concepts for a student"),
          key_concepts: z.array(
            z.object({ term: z.string(), definition: z.string() })
          ),
        }),
      }),
      prompt: `Analyze the following document and produce a study guide as JSON with fields: summary, explanation, key_concepts (array of {term, definition}).\n\nDocument:\n${data.text.slice(0, 15000)}`,
    });

    // Save to database
    const { data: summary, error } = await supabase
      .from("summaries")
      .insert({
        document_id: data.document_id,
        user_id: userId,
        summary: output.summary,
        explanation: output.explanation,
        key_concepts: output.key_concepts,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { summary };
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
