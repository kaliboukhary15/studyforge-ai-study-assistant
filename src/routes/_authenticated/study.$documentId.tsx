import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getDocument } from "@/lib/documents.functions";
import {
  getSummaries,
  generateStudyMaterial,
  saveSummaryNotes,
  getDocumentImages,
} from "@/lib/study.functions";
import { updateDocumentText } from "@/lib/documents.functions";
import { supabase } from "@/integrations/supabase/client";
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
  Brain,
  ListChecks,
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

const documentImagesQueryOptions = (documentId: string) =>
  queryOptions({
    queryKey: ["document-images", documentId],
    queryFn: () => getDocumentImages({ data: { document_id: documentId } }),
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
  const { data: imagesData, refetch: refetchImages } = useSuspenseQuery(
    documentImagesQueryOptions(documentId)
  );
  const document = docData?.document;
  const summaries = summariesData?.summaries || [];
  const summary = summaries[0];
  const extractedImages = (imagesData?.images ?? []) as Array<{
    id: string;
    url: string | null;
    caption: string | null;
    ai_description: string | null;
    kind: string | null;
    page_number: number | null;
  }>;

  const generateMaterial = useServerFn(generateStudyMaterial);
  const saveNotes = useServerFn(saveSummaryNotes);
  const updateDocText = useServerFn(updateDocumentText);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "explanation" | "examples" | "visuals" | "practice" | "memory" | "notes"
  >("explanation");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [language, setLanguage] = useState<string>("auto");
  const [bilingual, setBilingual] = useState<boolean>(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (summary?.notes) setNotesDraft(summary.notes);
  }, [summary?.id]);

  const handleGenerate = async () => {
    // Allow generation even without prior text extraction for PDFs/images
    // (the server will analyze the original file multimodally).
    const ext = (document?.file_type || document?.filename?.split(".").pop() || "").toLowerCase();
    const isBinaryVisual =
      ext === "pdf" || ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext);
    if (!document?.extracted_text && !isBinaryVisual) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      await generateMaterial({
        data: {
          document_id: documentId,
          level,
          language: language as
            | "auto" | "english" | "arabic" | "french" | "spanish" | "german"
            | "italian" | "portuguese" | "chinese" | "japanese" | "korean"
            | "russian" | "hindi" | "turkish",
          bilingual,
        },
      });
      refetchSummaries();
      refetchImages();
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

  const handleReExtract = async () => {
    if (!document) return;
    setIsExtracting(true);
    setExtractError(null);
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .download(document.storage_path);
      if (error) throw error;
      const file = new File([data], document.filename, { type: data.type });
      const { extractTextFromFile } = await import("@/lib/document-parser");
      const text = await extractTextFromFile(file);
      if (!text || text.trim().length < 10) {
        throw new Error("No readable text found in this document.");
      }
      await updateDocText({ data: { id: document.id, extracted_text: text } });
      window.location.reload();
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Extraction failed");
    }
    setIsExtracting(false);
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
  const visualAnalysis = ((summary as { visual_analysis?: unknown })?.visual_analysis ?? []) as Array<{
    title: string;
    kind?: string;
    page?: number | string;
    description: string;
    image_index?: number;
  }>;
  const formulas = ((summary as { formulas?: unknown })?.formulas ?? []) as Array<{
    latex: string;
    plain?: string;
    explanation: string;
  }>;
  const tables = ((summary as { tables?: unknown })?.tables ?? []) as Array<{
    title: string;
    headers: string[];
    rows: string[][];
    explanation: string;
  }>;
  const processingNotes = ((summary as { processing_notes?: { notes?: string[]; mode?: string; attached_images?: number; saved_images?: number } })?.processing_notes ?? {}) as {
    notes?: string[];
    mode?: string;
    attached_images?: number;
    saved_images?: number;
  };
  const practice = (summary?.practice ?? []) as Array<{
    question: string;
    difficulty: string;
    answer: string;
    explanation: string;
  }>;
  const quickOverview = (summary as { quick_overview?: string } | undefined)?.quick_overview ?? "";
  const keyPoints = ((summary as { key_points?: unknown })?.key_points ?? []) as string[];
  const steps = ((summary as { steps?: unknown })?.steps ?? []) as Array<{
    title: string;
    steps: Array<{ action: string; why?: string }>;
  }>;
  const memoryAids = ((summary as { memory_aids?: unknown })?.memory_aids ?? {}) as {
    mnemonics?: Array<{ device: string; meaning: string }>;
    revision_notes?: string[];
    exam_tips?: string[];
  };
  const comprehension = ((summary as { comprehension_check?: unknown })?.comprehension_check ?? {}) as {
    quick?: Array<{ question: string; answer: string }>;
    medium?: Array<{ question: string; answer: string }>;
    challenge?: Array<{ question: string; answer: string }>;
  };
  const [checkRevealed, setCheckRevealed] = useState<Record<string, boolean>>({});
  const summaryLang = (summary as { language?: string } | undefined)?.language ?? "english";
  const isRtl = ["arabic", "hebrew", "persian", "urdu"].includes(summaryLang);
  const langLabel: Record<string, string> = {
    english: "English",
    arabic: "العربية",
    french: "Français",
    spanish: "Español",
    german: "Deutsch",
    italian: "Italiano",
    portuguese: "Português",
    chinese: "中文",
    japanese: "日本語",
    korean: "한국어",
    russian: "Русский",
    hindi: "हिन्दी",
    turkish: "Türkçe",
  };

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
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Language</p>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="auto">Auto-detect from document</option>
              <option value="english">English</option>
              <option value="arabic">العربية (Arabic)</option>
              <option value="french">Français (French)</option>
              <option value="spanish">Español (Spanish)</option>
              <option value="german">Deutsch (German)</option>
              <option value="italian">Italiano (Italian)</option>
              <option value="portuguese">Português (Portuguese)</option>
              <option value="chinese">中文 (Chinese)</option>
              <option value="japanese">日本語 (Japanese)</option>
              <option value="korean">한국어 (Korean)</option>
              <option value="russian">Русский (Russian)</option>
              <option value="hindi">हिन्दी (Hindi)</option>
              <option value="turkish">Türkçe (Turkish)</option>
            </select>
            <label className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={bilingual}
                onChange={(e) => setBilingual(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              Bilingual mode (show English alongside original)
            </label>
          </div>
          {genError && (
            <p className="mt-3 text-sm text-destructive">{genError}</p>
          )}
          {(() => {
            const ext = (document.file_type || document.filename?.split(".").pop() || "").toLowerCase();
            const isBinaryVisual =
              ext === "pdf" || ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext);
            return document.extracted_text || isBinaryVisual;
          })() ? (
            <button
              onClick={handleGenerate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" />
              Start Teaching Session
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                We couldn't read text from this document yet. Click below to extract it now.
              </p>
              {extractError && (
                <p className="text-sm text-destructive">{extractError}</p>
              )}
              <button
                onClick={handleReExtract}
                disabled={isExtracting}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isExtracting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Extract text now</>
                )}
              </button>
              <p className="text-xs text-muted-foreground">
                If extraction keeps failing, your PDF may be scanned images. Try re-uploading a text-based PDF.
              </p>
            </div>
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
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>
                Subject:{" "}
                <span className="font-medium text-foreground">
                  {(summary as { subject?: string }).subject ?? "General"}
                </span>
              </span>
              <span className="text-border">·</span>
              <span>
                Level:{" "}
                <span className="font-medium capitalize text-foreground">
                  {summary.level ?? "intermediate"}
                </span>
              </span>
              <span className="text-border">·</span>
              <span>
                Language:{" "}
                <span className="font-medium text-foreground">
                  {langLabel[summaryLang] ?? summaryLang}
                </span>
              </span>
            </div>
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
              { key: "memory" as const, label: "Memory & Check", icon: Brain },
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
          <div
            dir={isRtl ? "rtl" : "ltr"}
            className="rounded-2xl border border-border bg-card p-6"
          >
            {activeTab === "explanation" && (
              <div className="space-y-6">
                {quickOverview && (
                  <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Quick overview</p>
                    <p className="mt-1 text-sm text-foreground leading-relaxed">{quickOverview}</p>
                  </div>
                )}
                {keyPoints.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <ListChecks className="h-5 w-5" /> Key Points
                    </h2>
                    <ul className="mt-2 grid gap-1.5">
                      {keyPoints.map((p, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground">
                          <span className="text-primary">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                      <Sparkles className="h-5 w-5" /> Definitions
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
                {steps.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Step-by-Step</h2>
                    <div className="mt-2 space-y-3">
                      {steps.map((proc, i) => (
                        <div key={i} className="rounded-xl border border-border bg-background p-4">
                          <h3 className="font-semibold text-foreground">{proc.title}</h3>
                          <ol className="mt-2 space-y-2">
                            {proc.steps.map((s, j) => (
                              <li key={j} className="flex gap-3">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                  {j + 1}
                                </span>
                                <div>
                                  <p className="text-sm text-foreground">{s.action}</p>
                                  {s.why && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      <span className="font-medium">Why:</span> {s.why}
                                    </p>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ol>
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
                {(processingNotes.notes?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <p className="font-semibold uppercase tracking-wide text-foreground mb-1">
                      Processing report
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {processingNotes.notes?.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </div>
                )}

                {extractedImages.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Extracted Images</h2>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {extractedImages.map((img) => (
                        <figure key={img.id} className="rounded-xl border border-border bg-background p-3">
                          {img.url ? (
                            <img
                              src={img.url}
                              alt={img.caption ?? "Extracted figure"}
                              className="w-full rounded-lg bg-muted object-contain max-h-64"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-40 rounded-lg bg-muted" />
                          )}
                          <figcaption className="mt-2 text-sm">
                            <p className="font-medium text-foreground">{img.caption ?? "Figure"}</p>
                            {img.kind && (
                              <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                {img.kind}
                              </span>
                            )}
                            {img.ai_description && (
                              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                                {img.ai_description}
                              </p>
                            )}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}

                {visualAnalysis.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Visual Analysis</h2>
                    <div className="mt-2 grid gap-2">
                      {visualAnalysis.map((v, i) => (
                        <div key={i} className="rounded-xl border border-border bg-background p-4">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-semibold text-foreground">{v.title}</h3>
                            {v.kind && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                {v.kind}
                              </span>
                            )}
                          </div>
                          {v.page !== undefined && (
                            <p className="mt-0.5 text-xs text-muted-foreground">Page {String(v.page)}</p>
                          )}
                          <p className="mt-2 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                            {v.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {formulas.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Formulas</h2>
                    <div className="mt-2 grid gap-2">
                      {formulas.map((f, i) => (
                        <div key={i} className="rounded-xl border border-border bg-background p-4">
                          <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-sm font-mono text-foreground">{f.latex}</pre>
                          {f.plain && (
                            <p className="mt-2 text-xs text-muted-foreground">Reads as: {f.plain}</p>
                          )}
                          <p className="mt-2 text-sm text-foreground leading-relaxed">{f.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tables.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Tables</h2>
                    <div className="mt-2 space-y-3">
                      {tables.map((t, i) => (
                        <div key={i} className="rounded-xl border border-border bg-background p-4">
                          <h3 className="font-semibold text-foreground">{t.title}</h3>
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full text-sm">
                              {t.headers?.length > 0 && (
                                <thead>
                                  <tr>
                                    {t.headers.map((h, j) => (
                                      <th key={j} className="border-b border-border bg-muted/40 px-2 py-1.5 text-left font-medium text-foreground">
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                              )}
                              <tbody>
                                {t.rows?.map((row, ri) => (
                                  <tr key={ri}>
                                    {row.map((cell, ci) => (
                                      <td key={ci} className="border-b border-border/60 px-2 py-1.5 text-foreground">
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{t.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {visuals.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">AI-Generated Diagrams</h2>
                    <div className="mt-2 space-y-3">
                      {visuals.map((v, i) => (
                        <div key={i} className="rounded-xl border border-border bg-background p-4">
                          <h3 className="font-semibold text-foreground">{v.title}</h3>
                          <p className="text-sm text-muted-foreground mt-0.5">{v.description}</p>
                          <div className="mt-3 rounded-lg bg-muted/40 p-3">
                            <MermaidDiagram chart={v.mermaid} id={`${summary.id}-${i}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {extractedImages.length === 0 &&
                  visualAnalysis.length === 0 &&
                  formulas.length === 0 &&
                  tables.length === 0 &&
                  visuals.length === 0 && (
                    <p className="text-muted-foreground text-sm">No visual content detected.</p>
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

            {activeTab === "memory" && (
              <div className="space-y-6">
                {(memoryAids.mnemonics?.length ?? 0) > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Mnemonics</h2>
                    <div className="mt-2 grid gap-2">
                      {memoryAids.mnemonics!.map((m, i) => (
                        <div key={i} className="rounded-lg border-l-4 border-primary bg-primary/5 p-3">
                          <p className="font-mono font-semibold text-sm text-foreground">{m.device}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{m.meaning}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(memoryAids.revision_notes?.length ?? 0) > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Quick Revision Notes</h2>
                    <ul className="mt-2 grid gap-1.5">
                      {memoryAids.revision_notes!.map((n, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground">
                          <span className="text-primary">•</span>
                          <span>{n}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(memoryAids.exam_tips?.length ?? 0) > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Exam Tips</h2>
                    <ul className="mt-2 grid gap-1.5">
                      {memoryAids.exam_tips!.map((t, i) => (
                        <li key={i} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(["quick", "medium", "challenge"] as const).map((tier) => {
                  const items = comprehension[tier] ?? [];
                  if (items.length === 0) return null;
                  const tierLabel = { quick: "Quick Recall", medium: "Medium", challenge: "Challenge" }[tier];
                  const tierColor = {
                    quick: "bg-green-100 text-green-700",
                    medium: "bg-yellow-100 text-yellow-700",
                    challenge: "bg-red-100 text-red-700",
                  }[tier];
                  return (
                    <div key={tier}>
                      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        Knowledge Check
                        <span className={`rounded-full px-2 py-0.5 text-xs ${tierColor}`}>{tierLabel}</span>
                      </h2>
                      <div className="mt-2 space-y-2">
                        {items.map((q, i) => {
                          const key = `${tier}-${i}`;
                          return (
                            <div key={key} className="rounded-xl border border-border bg-background p-4">
                              <p className="text-sm font-medium text-foreground">
                                <span className="text-muted-foreground mr-2">Q{i + 1}.</span>
                                {q.question}
                              </p>
                              {checkRevealed[key] ? (
                                <p className="mt-2 rounded-lg bg-primary/5 p-2 text-sm text-foreground">
                                  {q.answer}
                                </p>
                              ) : (
                                <button
                                  onClick={() => setCheckRevealed((r) => ({ ...r, [key]: true }))}
                                  className="mt-2 text-xs text-primary hover:underline"
                                >
                                  Show answer
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {!memoryAids.mnemonics?.length &&
                  !memoryAids.revision_notes?.length &&
                  !memoryAids.exam_tips?.length &&
                  !comprehension.quick?.length &&
                  !comprehension.medium?.length &&
                  !comprehension.challenge?.length && (
                    <p className="text-sm text-muted-foreground">No memory aids generated. Regenerate to produce them.</p>
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
