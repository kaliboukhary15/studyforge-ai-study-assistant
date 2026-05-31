import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDocuments, deleteDocument } from "@/lib/documents.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  FileText,
  Trash2,
  BookOpen,
  HelpCircle,
  MoreVertical,
} from "lucide-react";

const documentsQueryOptions = queryOptions({
  queryKey: ["documents"],
  queryFn: () => getDocuments(),
});

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "My Documents — StudyForge" },
      { name: "description", content: "View and manage your uploaded study documents." },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(documentsQueryOptions),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { data: docsData, refetch } = useSuspenseQuery(documentsQueryOptions);
  const documents = docsData?.documents || [];
  const deleteDoc = useServerFn(deleteDocument);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (doc: { id: string; storage_path: string }) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    setDeletingId(doc.id);
    try {
      await deleteDoc({ data: { id: doc.id, storage_path: doc.storage_path } });
      refetch();
    } catch (e) {
      console.error(e);
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">My Documents</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your uploaded study materials.
          </p>
        </div>
        <Link
          to="/upload"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Upload New
        </Link>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-lg font-medium text-foreground">No documents yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your first PDF, DOCX, or PPTX file to get started.
          </p>
          <Link
            to="/upload"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Upload Document
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent/50"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-foreground">{doc.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.file_type.toUpperCase()} · {formatFileSize(doc.file_size)} ·{" "}
                  {new Date(doc.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/study/${doc.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Study
                </Link>
                <Link
                  to={`/quiz/${doc.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Quiz
                </Link>
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={deletingId === doc.id}
                  className="inline-flex items-center rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
