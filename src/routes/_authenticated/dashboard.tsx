import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — StudyForge" },
      { name: "description", content: "Your StudyForge dashboard with documents and study progress." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold font-display text-foreground mb-6">Dashboard</h1>
      <p className="text-muted-foreground">Welcome to StudyForge. Upload documents to get started.</p>
    </div>
  );
}
