import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDocument } from "@/lib/documents.functions";
import { getSummaries, generateStudyMaterial } from "@/lib/study.functions";
import {
  FileText,
  BookOpen,
  Lightbulb,
  Sparkles,
  ArrowLeft,
  Loader2,
  HelpCircle,
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "explanation" | "concepts">("summary");

  const handleGenerate = async () => {
    if (!document?.extracted_text) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      await generateMaterial({
        data: {
          document_id: documentId,
          text: document.extracted_text,
        },
      });
      refetchSummaries();
    } catch (e) {
      console.error(e);
      setGenError(e instanceof Error ? e.message : "Failed to generate study material");
    }
    setIsGenerating(false);
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
          <h2 className="mt-4 text-lg font-semibold text-foreground">Generate Study Material</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Let AI analyze your document and create a summary, explanation, and key concepts.
          </p>
          {genError && (
            <p className="mt-3 text-sm text-destructive">{genError}</p>
          )}
          {document.extracted_text ? (
            <button
              onClick={handleGenerate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" />
              Generate Study Material
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
          <p className="mt-4 text-sm font-medium text-foreground">Generating study material...</p>
          <p className="text-xs text-muted-foreground">This may take a minute</p>
        </div>
      )}

      {summary && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {[
              { key: "summary" as const, label: "Summary", icon: BookOpen },
              { key: "explanation" as const, label: "Explanation", icon: Lightbulb },
              { key: "concepts" as const, label: "Key Concepts", icon: Sparkles },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
            {activeTab === "summary" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Document Summary</h2>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {summary.summary?.split("\n").map((paragraph, i) => (
                    <p key={i} className="text-foreground leading-relaxed">
                      {paragraph}
                    </p>
                  )) || <p className="text-muted-foreground">No summary available.</p>}
                </div>
              </div>
            )}

            {activeTab === "explanation" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Detailed Explanation</h2>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {summary.explanation?.split("\n").map((paragraph, i) => (
                    <p key={i} className="text-foreground leading-relaxed">
                      {paragraph}
                    </p>
                  )) || <p className="text-muted-foreground">No explanation available.</p>}
                </div>
              </div>
            )}

            {activeTab === "concepts" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Key Concepts & Definitions</h2>
                <div className="grid gap-3">
                  {Array.isArray(summary.key_concepts) && summary.key_concepts.length > 0 ? (
                    (summary.key_concepts as Array<{ term: string; definition: string }>).map(
                      (concept, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-border bg-background p-4"
                        >
                          <h3 className="font-semibold text-foreground">{concept.term}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {concept.definition}
                          </p>
                        </div>
                      )
                    )
                  ) : (
                    <p className="text-muted-foreground">No key concepts available.</p>
                  )}
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
