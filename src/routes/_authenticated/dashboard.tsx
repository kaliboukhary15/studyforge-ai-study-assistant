import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDocuments } from "@/lib/documents.functions";
import { getQuizzes } from "@/lib/study.functions";
import {
  FileText,
  Upload,
  BookOpen,
  Clock,
  ChevronRight,
  GraduationCap,
} from "lucide-react";

const documentsQueryOptions = queryOptions({
  queryKey: ["documents"],
  queryFn: () => getDocuments(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — StudyForge" },
      { name: "description", content: "Your StudyForge dashboard with documents and study progress." },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(documentsQueryOptions),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: docsData } = useSuspenseQuery(documentsQueryOptions);
  const documents = docsData?.documents || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back! Here's an overview of your study materials.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="Documents"
          value={documents.length}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          icon={<BookOpen className="h-5 w-5" />}
          label="Summaries"
          value={documents.filter((d) => d.extracted_text).length}
          color="bg-chart-2/10 text-chart-2"
        />
        <StatCard
          icon={<GraduationCap className="h-5 w-5" />}
          label="Quizzes"
          value="—"
          color="bg-chart-4/10 text-chart-4"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/upload"
          className="group flex items-center gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:bg-accent"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Upload Document</h3>
            <p className="text-sm text-muted-foreground">Add new study materials</p>
          </div>
          <ChevronRight className="ml-auto h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </Link>

        <Link
          to="/documents"
          className="group flex items-center gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:bg-accent"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-chart-2/10">
            <BookOpen className="h-6 w-6 text-chart-2" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">My Documents</h3>
            <p className="text-sm text-muted-foreground">View and study your files</p>
          </div>
          <ChevronRight className="ml-auto h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      {/* Recent Documents */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Recent Documents</h2>
        {documents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              No documents yet. Upload your first study material!
            </p>
            <Link
              to="/upload"
              className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Upload Document
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {documents.slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-foreground">{doc.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.file_type.toUpperCase()} ·{" "}
                    {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  to={`/study/${doc.id}`}
                  className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                >
                  Study
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
