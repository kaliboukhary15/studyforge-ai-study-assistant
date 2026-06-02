import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getDocument } from "@/lib/documents.functions";
import { getSummaries, generateStudyMaterial, saveSummaryNotes } from "@/lib/study.functions";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import {
  BookOpen,
  Lightbulb,
  Sparkles,
  ArrowLeft,
  Loader2,
  HelpCircle,
  Beaker,
  ImageIcon,
  Dumbbell,
  StickyNote,
  Check,
} from "lucide-react";

const documentQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["document", id],
    queryFn: () => getDocument({ data: { id } }),
  });

const summariesQueryOptions = (documentId: string) =>
  queryOptions({
    queryKey: ["summaries", documentId],
    queryFn: () => getSummaries({ data: { document_id: documentId } }),
  });

export const Route = createFileRoute("/_authenticated/study/$documentId")({
  head: () => ({
    meta: [
      { title: "Study Material — StudyForge" },
      { name: "description", content: "AI-generated study materials for your document." },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(documentQueryOptions(params.documentId)),
  component: StudyPage,
});

function StudyPage() {
  const { documentId } = Route.useParams();
  const { data: docData } = useSuspenseQuery(documentQueryOptions(documentId));
  const { data: summariesData, refetch: refetchSummaries } = useSuspenseQuery(
    summariesQueryOptions(documentId)
  );
  const document = docData?.document;
  const summaries = summariesData?.summaries || [];
  const summary = summaries[0];

  const generateMaterial = useServerFn(generateStudyMaterial);
  const saveNotes = useServerFn(saveSummaryNotes);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "explanation" | "examples" | "visuals" | "practice" | "notes"
  >("explanation");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (summary?.notes) setNotesDraft(summary.notes);
  }, [summary?.id]);

  const handleGenerate = async () => {
    if (!document?.extracted_text) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      await generateMaterial({
        data: {
          document_id: documentId,
          text: document.extracted_text,
          level,
        },
      });
      refetchSummaries();
    } catch (e) {
      console.error(e);
      setGenError(e instanceof Error ? e.message : "Failed to generate study material");
    }
    setIsGenerating(false);
  };

  const handleSaveNotes = async () => {
    if (!summary) return;
    setNotesSaving(true);
    setNotesSaved(false);
    try {
      await saveNotes({ data: { summary_id: summary.id, notes: notesDraft } });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setNotesSaving(false);
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

  const examples = (summary?.examples ?? []) as Array<{
    title: string;
    kind: string;
    language?: string;
    content: string;
    common_mistakes?: string[];
    alternative_methods?: string[];
  }>;
  const analogies = (summary?.analogies ?? []) as Array<{ concept: string; analogy: string }>;
  const visuals = (summary?.visuals ?? []) as Array<{
    title: string;
    description: string;
    mermaid: string;
  }>;
  const practice = (summary?.practice ?? []) as Array<{
    question: string;
    difficulty: string;
    answer: string;
    explanation: string;
  }>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/documents"
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">{document.filename}</h1>
          <p className="text-sm text-muted-foreground">
            {document.file_type.toUpperCase()} · {new Date(document.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {!summary && !isGenerating && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Adaptive Teaching Mode</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your AI tutor will explain concepts with worked examples, diagrams, analogies, and practice exercises tailored to your level.
          </p>
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Learning level</p>
            <div className="mt-2 inline-flex rounded-lg border border-border bg-background p-1">
              {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLevel(lvl)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    level === lvl
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
          {genError && (
            <p className="mt-3 text-sm text-destructive">{genError}</p>
          )}
          {document.extracted_text ? (
            <button
              onClick={handleGenerate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" />
              Start Teaching Session
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
          <p className="mt-4 text-sm font-medium text-foreground">Preparing your tutoring session...</p>
          <p className="text-xs text-muted-foreground">Crafting examples, diagrams, and practice — this may take a minute</p>
        </div>
      )}

      {summary && (
        <>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2">
            <p className="text-xs text-muted-foreground">
              Level: <span className="font-medium capitalize text-foreground">{summary.level ?? "intermediate"}</span>
            </p>
            <button
              onClick={handleGenerate}
              className="text-xs text-primary hover:underline"
            >
              Regenerate
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
            {[
              { key: "explanation" as const, label: "Explanation", icon: Lightbulb },
              { key: "examples" as const, label: "Examples", icon: Beaker },
              { key: "visuals" as const, label: "Visuals", icon: ImageIcon },
              { key: "practice" as const, label: "Practice", icon: Dumbbell },
              { key: "notes" as const, label: "Notes", icon: StickyNote },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 min-w-[100px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="rounded-2xl border border-border bg-card p-6">
            {activeTab === "explanation" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <BookOpen className="h-5 w-5" /> Summary
                  </h2>
                  <div className="mt-2 space-y-2">
                    {summary.summary?.split("\n").filter(Boolean).map((p, i) => (
                      <p key={i} className="text-sm text-foreground leading-relaxed">{p}</p>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" /> Tutor Explanation
                  </h2>
                  <div className="mt-2 space-y-2">
                    {summary.explanation?.split("\n").filter(Boolean).map((p, i) => (
                      <p key={i} className="text-sm text-foreground leading-relaxed">{p}</p>
                    ))}
                  </div>
                </div>
                {Array.isArray(summary.key_concepts) && summary.key_concepts.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <Sparkles className="h-5 w-5" /> Key Concepts
                    </h2>
                    <div className="mt-2 grid gap-2">
                      {(summary.key_concepts as Array<{ term: string; definition: string }>).map((c, i) => (
                        <div key={i} className="rounded-lg border border-border bg-background p-3">
                          <p className="font-semibold text-sm text-foreground">{c.term}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{c.definition}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {analogies.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Learn by Analogy</h2>
                    <div className="mt-2 grid gap-2">
                      {analogies.map((a, i) => (
                        <div key={i} className="rounded-lg border-l-4 border-primary bg-primary/5 p-3">
                          <p className="font-medium text-sm text-foreground">{a.concept}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{a.analogy}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "examples" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Worked Examples</h2>
                {examples.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No examples available.</p>
                ) : (
                  examples.map((ex, i) => (
                    <div key={i} className="rounded-xl border border-border bg-background p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-foreground">{ex.title}</h3>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {ex.kind}
                        </span>
                      </div>
                      <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-foreground font-mono">
{ex.content}
                      </pre>
                      {ex.common_mistakes && ex.common_mistakes.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Common mistakes</p>
                          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                            {ex.common_mistakes.map((m, j) => <li key={j}>{m}</li>)}
                          </ul>
                        </div>
                      )}
                      {ex.alternative_methods && ex.alternative_methods.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Alternative methods</p>
                          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                            {ex.alternative_methods.map((m, j) => <li key={j}>{m}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "visuals" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Visual Learning</h2>
                {visuals.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No diagrams available.</p>
                ) : (
                  visuals.map((v, i) => (
                    <div key={i} className="rounded-xl border border-border bg-background p-4">
                      <h3 className="font-semibold text-foreground">{v.title}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{v.description}</p>
                      <div className="mt-3 rounded-lg bg-muted/40 p-3">
                        <MermaidDiagram chart={v.mermaid} id={`${summary.id}-${i}`} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "practice" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Practice Exercises</h2>
                {practice.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No practice exercises available.</p>
                ) : (
                  practice.map((p, i) => (
                    <div key={i} className="rounded-xl border border-border bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-foreground">
                          <span className="text-muted-foreground mr-2">Q{i + 1}.</span>
                          {p.question}
                        </p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs capitalize ${
                          p.difficulty === "easy" ? "bg-green-100 text-green-700" :
                          p.difficulty === "medium" ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>{p.difficulty}</span>
                      </div>
                      {revealed[i] ? (
                        <div className="mt-3 space-y-2">
                          <div className="rounded-lg bg-primary/5 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Answer</p>
                            <p className="text-sm text-foreground mt-1">{p.answer}</p>
                          </div>
                          <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Explanation</p>
                            <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{p.explanation}</p>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRevealed((r) => ({ ...r, [i]: true }))}
                          className="mt-3 text-sm text-primary hover:underline"
                        >
                          Reveal answer
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "notes" && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">My Notes</h2>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Write your own notes, questions, or reflections here..."
                  className="min-h-[260px] w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex items-center justify-end gap-3">
                  {notesSaved && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <Check className="h-3.5 w-3.5" /> Saved
                    </span>
                  )}
                  <button
                    onClick={handleSaveNotes}
                    disabled={notesSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {notesSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save notes
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Link
              to={`/quiz/${documentId}`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <HelpCircle className="h-4 w-4" />
              Take a Quiz
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
