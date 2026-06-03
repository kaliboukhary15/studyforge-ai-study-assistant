import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let initialized = false;

export function MermaidDiagram({ chart, id }: { chart: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "strict",
        fontFamily: "inherit",
      });
      initialized = true;
    }
    let cancelled = false;
    const cleaned = chart.replace(/^```mermaid\s*/i, "").replace(/```\s*$/, "").trim();
    mermaid
      .render(`m-${id}-${Math.random().toString(36).slice(2, 8)}`, cleaned)
      .then(({ svg }) => {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render diagram");
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        Diagram error: {error}
        <pre className="mt-2 overflow-auto text-[10px] text-muted-foreground">{chart}</pre>
      </div>
    );
  }
  return <div ref={ref} className="mermaid-diagram flex justify-center overflow-auto" />;
}