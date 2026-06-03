import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDocument } from "@/lib/documents.functions";
import { getQuizzes, generateQuiz, saveQuizAttempt } from "@/lib/study.functions";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
  HelpCircle,
  Trophy,
  RotateCcw,
} from "lucide-react";

const documentQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["document", id],
    queryFn: () => getDocument({ data: { id } }),
  });

const quizzesQueryOptions = (documentId: string) =>
  queryOptions({
    queryKey: ["quizzes", documentId],
    queryFn: () => getQuizzes({ data: { document_id: documentId } }),
  });

export const Route = createFileRoute("/_authenticated/quiz/$documentId")({
  head: () => ({
    meta: [
      { title: "Quiz — StudyForge" },
      { name: "description", content: "Test your knowledge with AI-generated quizzes." },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(documentQueryOptions(params.documentId)),
  component: QuizPage,
});

function QuizPage() {
  const { documentId } = Route.useParams();
  const { data: docData } = useSuspenseQuery(documentQueryOptions(documentId));
  const { data: quizzesData, refetch: refetchQuizzes } = useSuspenseQuery(
    quizzesQueryOptions(documentId)
  );
  const document = docData?.document;
  const quizzes = quizzesData?.quizzes || [];
  const quiz = quizzes[0];

  const generateQuizFn = useServerFn(generateQuiz);
  const saveAttempt = useServerFn(saveQuizAttempt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const handleGenerate = async () => {
    if (!document?.extracted_text) return;
    setIsGenerating(true);
    try {
      await generateQuizFn({
        data: {
          document_id: documentId,
          title: `Quiz: ${document.filename}`,
        },
      });
      refetchQuizzes();
      setAnswers({});
      setSubmitted(false);
      setScore(0);
    } catch (e) {
      console.error(e);
    }
    setIsGenerating(false);
  };

  const handleAnswer = (questionIndex: number, answer: string) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [questionIndex]: answer }));
  };

  const handleSubmit = async () => {
    if (!quiz?.questions) return;
    const questions = quiz.questions as Array<{
      question: string;
      type: string;
      options?: string[];
      correct_answer: string;
    }>;

    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correct_answer) correct++;
    });

    setScore(correct);
    setSubmitted(true);

    try {
      await saveAttempt({
        data: {
          quiz_id: quiz.id,
          score: correct,
          total_questions: questions.length,
          answers,
        },
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleRetake = () => {
    setAnswers({});
    setSubmitted(false);
    setScore(0);
  };

  if (!document) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Document not found.</p>
        <Link to="/documents" className="mt-4 inline-block text-primary hover:underline">
          Back to documents
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/documents"
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Quiz</h1>
          <p className="text-sm text-muted-foreground">{document.filename}</p>
        </div>
      </div>

      {!quiz && !isGenerating && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <HelpCircle className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Generate a Quiz</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create an AI-powered quiz based on your document to test your knowledge.
          </p>
          {document.extracted_text ? (
            <button
              onClick={handleGenerate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" />
              Generate Quiz
            </button>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Text extraction is still processing. Check back in a moment.
            </p>
          )}
        </div>
      )}

      {isGenerating && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm font-medium text-foreground">Generating quiz...</p>
          <p className="text-xs text-muted-foreground">This may take a minute</p>
        </div>
      )}

      {quiz && (
        <>
          {submitted && (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <Trophy className="mx-auto h-10 w-10 text-chart-3" />
              <h2 className="mt-3 text-2xl font-bold text-foreground">
                {score} / {(quiz.questions as unknown[]).length}
              </h2>
              <p className="text-sm text-muted-foreground">
                {score === (quiz.questions as unknown[]).length
                  ? "Perfect score! Excellent work!"
                  : score >= (quiz.questions as unknown[]).length / 2
                  ? "Good job! Keep studying."
                  : "Keep practicing to improve your score."}
              </p>
              <button
                onClick={handleRetake}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                <RotateCcw className="h-4 w-4" />
                Retake Quiz
              </button>
            </div>
          )}

          <div className="space-y-6">
            {(quiz.questions as Array<{
              question: string;
              type: string;
              options?: string[];
              correct_answer: string;
              explanation: string;
            }>).map((q, i) => {
              const userAnswer = answers[i];
              const isCorrect = userAnswer === q.correct_answer;

              return (
                <div
                  key={i}
                  className={`rounded-2xl border bg-card p-6 ${
                    submitted
                      ? isCorrect
                        ? "border-chart-2/50"
                        : "border-destructive/50"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{q.question}</p>

                      {q.type === "multiple_choice" && q.options && (
                        <div className="mt-4 space-y-2">
                          {q.options.map((option) => {
                            const isSelected = userAnswer === option;
                            const isCorrectOption = option === q.correct_answer;

                            let optionClass =
                              "w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ";
                            if (submitted) {
                              if (isCorrectOption) {
                                optionClass +=
                                  "border-chart-2 bg-chart-2/10 text-chart-2";
                              } else if (isSelected && !isCorrectOption) {
                                optionClass +=
                                  "border-destructive bg-destructive/10 text-destructive";
                              } else {
                                optionClass +=
                                  "border-border bg-background text-muted-foreground";
                              }
                            } else {
                              optionClass += isSelected
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-border bg-background text-foreground hover:bg-accent";
                            }

                            return (
                              <button
                                key={option}
                                onClick={() => handleAnswer(i, option)}
                                disabled={submitted}
                                className={optionClass}
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`h-4 w-4 rounded-full border ${
                                      isSelected
                                        ? submitted
                                          ? isCorrectOption
                                            ? "border-chart-2 bg-chart-2"
                                            : "border-destructive bg-destructive"
                                          : "border-primary bg-primary"
                                        : "border-muted-foreground"
                                    }`}
                                  />
                                  {option}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {q.type === "true_false" && (
                        <div className="mt-4 flex gap-3">
                          {["True", "False"].map((option) => {
                            const isSelected = userAnswer === option;
                            const isCorrectOption = option === q.correct_answer;

                            let btnClass =
                              "flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ";
                            if (submitted) {
                              if (isCorrectOption) {
                                btnClass +=
                                  "border-chart-2 bg-chart-2/10 text-chart-2";
                              } else if (isSelected && !isCorrectOption) {
                                btnClass +=
                                  "border-destructive bg-destructive/10 text-destructive";
                              } else {
                                btnClass +=
                                  "border-border bg-background text-muted-foreground";
                              }
                            } else {
                              btnClass += isSelected
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-border bg-background text-foreground hover:bg-accent";
                            }

                            return (
                              <button
                                key={option}
                                onClick={() => handleAnswer(i, option)}
                                disabled={submitted}
                                className={btnClass}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {submitted && (
                        <div className="mt-4 rounded-xl bg-muted p-4">
                          <div className="flex items-center gap-2">
                            {isCorrect ? (
                              <CheckCircle className="h-4 w-4 text-chart-2" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                            <span className="text-sm font-medium text-foreground">
                              {isCorrect ? "Correct" : "Incorrect"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {q.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!submitted && (
            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={
                  Object.keys(answers).length !==
                  (quiz.questions as unknown[]).length
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Submit Quiz
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
