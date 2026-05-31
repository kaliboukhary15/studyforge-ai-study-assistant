import { createFileRoute } from "@tanstack/react-router";

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
  return (
    <div>
      <h1 className="text-3xl font-bold font-display text-foreground mb-6">Upload Document</h1>
      <p className="text-muted-foreground">Upload your study materials here.</p>
    </div>
  );
}
