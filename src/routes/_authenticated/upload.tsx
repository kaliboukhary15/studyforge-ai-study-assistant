import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createDocument, updateDocumentText } from "@/lib/documents.functions";
import { extractTextFromFile } from "@/lib/document-parser";
import {
  Upload,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Upload Document — StudyForge" },
      { name: "description", content: "Upload PDF, DOCX, or PPTX files to StudyForge." },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const createDoc = useServerFn(createDocument);
  const updateDocText = useServerFn(updateDocumentText);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles]);
    setError("");
    setSuccess(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    },
    maxSize: 20 * 1024 * 1024, // 20MB
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    setProgress(0);

    try {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user.id;
      if (!userId) throw new Error("Not authenticated");

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split(".").pop();
        const storagePath = `${userId}/${Date.now()}_${file.name}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(storagePath, file);

        if (uploadError) throw uploadError;

        // Create document record
        const { document } = await createDoc({
          data: {
            filename: file.name,
            storage_path: storagePath,
            file_type: fileExt || "unknown",
            file_size: file.size,
          },
        });

        // Extract text
        try {
          const extractedText = await extractTextFromFile(file);
          if (document?.id) {
            await updateDocText({
              data: { id: document.id, extracted_text: extractedText },
            });
          }
        } catch (parseErr) {
          console.error("Text extraction failed:", parseErr);
        }

        setProgress(((i + 1) / files.length) * 100);
      }

      setSuccess(true);
      setFiles([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Upload Document</h1>
        <p className="mt-1 text-muted-foreground">
          Upload your study materials. We support PDF, DOCX, and PPTX files.
        </p>
      </div>

      {success && (
        <div className="flex items-center gap-3 rounded-xl bg-chart-2/10 p-4 text-chart-2">
          <CheckCircle className="h-5 w-5" />
          <p className="text-sm font-medium">Documents uploaded successfully!</p>
          <Link
            to="/documents"
            className="ml-auto rounded-lg bg-chart-2 px-3 py-1.5 text-xs font-medium text-white hover:bg-chart-2/90"
          >
            View Documents
          </Link>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:bg-accent/50"
        }`}
      >
        <input {...getInputProps()} />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
          <Upload className="h-7 w-7 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">
          {isDragActive ? "Drop files here" : "Drag & drop files here"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          or click to browse. Max 20MB per file.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">PDF, DOCX, PPTX</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Selected Files</h3>
          {files.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <FileText className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              <button
                onClick={() => removeFile(i)}
                disabled={uploading}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {uploading && (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Uploading and processing... {Math.round(progress)}%
              </p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload {files.length} file{files.length !== 1 ? "s" : ""}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
