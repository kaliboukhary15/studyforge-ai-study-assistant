import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import JSZip from "jszip";

// Bundle worker locally to avoid CDN version mismatches
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml",
  "html", "htm", "rtf", "log", "tex", "srt", "vtt",
  "js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "h", "hpp",
  "cs", "go", "rs", "rb", "php", "swift", "kt", "scala", "sh", "sql",
]);

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") return extractFromPDF(file);
  if (extension === "docx" || extension === "doc") return extractFromDOCX(file);
  if (extension === "pptx") return extractFromPPTX(file);
  if (extension === "xlsx") return extractFromXLSX(file);
  if (extension && TEXT_EXTENSIONS.has(extension)) return file.text();
  if (file.type.startsWith("text/")) return file.text();

  // Best-effort fallback: try reading as text.
  try {
    const text = await file.text();
    if (text && /[\x20-\x7E]/.test(text)) return text;
  } catch {
    // ignore
  }
  throw new Error(`Unable to extract text from .${extension ?? "unknown"} files.`);
}

async function extractFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    text += pageText + "\n\n";
  }

  return text.trim();
}

async function extractFromDOCX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractFromPPTX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] ?? "0", 10);
      return na - nb;
    });

  let text = "";
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.files[slidePaths[i]].async("string");
    const matches = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) ?? [];
    const slideText = matches
      .map((m) => m.replace(/<[^>]+>/g, ""))
      .join(" ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    text += `Slide ${i + 1}:\n${slideText}\n\n`;
  }
  return text.trim();
}

async function extractFromXLSX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Shared strings
  const sharedStrings: string[] = [];
  const sharedFile = zip.file("xl/sharedStrings.xml");
  if (sharedFile) {
    const xml = await sharedFile.async("string");
    const matches = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    for (const m of matches) sharedStrings.push(m.replace(/<[^>]+>/g, ""));
  }

  const sheetPaths = Object.keys(zip.files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort();

  let text = "";
  for (let i = 0; i < sheetPaths.length; i++) {
    const xml = await zip.files[sheetPaths[i]].async("string");
    const rows = xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? [];
    text += `Sheet ${i + 1}:\n`;
    for (const row of rows) {
      const cells = row.match(/<c[^>]*>[\s\S]*?<\/c>/g) ?? [];
      const values = cells.map((c) => {
        const isShared = /t="s"/.test(c);
        const v = c.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
        if (!v) return "";
        if (isShared) return sharedStrings[parseInt(v, 10)] ?? "";
        return v;
      });
      text += values.join("\t") + "\n";
    }
    text += "\n";
  }
  return text.trim();
}
