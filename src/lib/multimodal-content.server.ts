import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: Uint8Array }
  | { type: "file"; data: Uint8Array; mediaType: string };

export type ExtractedImage = {
  bytes: Uint8Array;
  mediaType: string;
  extension: string;
  source: string; // e.g. "Slide 3", "DOCX media"
};

export type BuiltContent = {
  parts: ContentPart[];
  images: ExtractedImage[]; // images we extracted ourselves (saveable)
  notes: string[]; // human-readable processing notes
  mode: "pdf" | "image" | "pptx" | "docx" | "text" | "unknown";
};

const IMG_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

function bytesToUint8(ab: ArrayBuffer): Uint8Array {
  return new Uint8Array(ab);
}

async function downloadFile(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from("documents").download(storagePath);
  if (error || !data) return null;
  return bytesToUint8(await data.arrayBuffer());
}

async function extractImagesFromZip(
  zipBytes: Uint8Array,
  mediaPrefix: string,
  sourceLabel: (path: string) => string,
  maxImages = 12,
  maxBytesEach = 4 * 1024 * 1024,
): Promise<ExtractedImage[]> {
  const zip = await JSZip.loadAsync(zipBytes);
  const out: ExtractedImage[] = [];
  const paths = Object.keys(zip.files)
    .filter((p) => p.startsWith(mediaPrefix))
    .sort();
  for (const p of paths) {
    if (out.length >= maxImages) break;
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    const mime = IMG_EXT_MIME[ext];
    if (!mime) continue;
    const file = zip.files[p];
    if (!file || file.dir) continue;
    const bytes = bytesToUint8(await file.async("arraybuffer"));
    if (bytes.byteLength > maxBytesEach) continue;
    out.push({ bytes, mediaType: mime, extension: ext, source: sourceLabel(p) });
  }
  return out;
}

export async function buildMultimodalContent(args: {
  supabase: SupabaseClient;
  storagePath: string;
  fileType: string;
  extractedText: string | null;
  filename: string;
}): Promise<BuiltContent> {
  const { supabase, storagePath, fileType, extractedText, filename } = args;
  const ext = (fileType || filename.split(".").pop() || "").toLowerCase();
  const notes: string[] = [];
  const parts: ContentPart[] = [];
  const images: ExtractedImage[] = [];

  const bytes = await downloadFile(supabase, storagePath);
  if (!bytes) {
    notes.push("Could not download original file from storage; falling back to text only.");
    if (extractedText) parts.push({ type: "text", text: extractedText.slice(0, 12000) });
    return { parts, images, notes, mode: "text" };
  }

  // Soft cap so we don't blow request budget (Gemini accepts large but cost it)
  const MAX_DIRECT = 18 * 1024 * 1024;

  if (ext === "pdf") {
    if (bytes.byteLength <= MAX_DIRECT) {
      parts.push({ type: "file", data: bytes, mediaType: "application/pdf" });
      notes.push("Sent full PDF to AI for native text + visual analysis (OCR, diagrams, formulas, tables).");
    } else if (extractedText) {
      parts.push({ type: "text", text: extractedText.slice(0, 12000) });
      notes.push("PDF too large for direct upload; analyzed extracted text only.");
    }
    return { parts, images, notes, mode: "pdf" };
  }

  if (IMG_EXT_MIME[ext]) {
    parts.push({ type: "image", image: bytes });
    notes.push("Analyzed image directly (OCR + visual interpretation).");
    return { parts, images, notes, mode: "image" };
  }

  if (ext === "pptx") {
    if (extractedText) parts.push({ type: "text", text: extractedText.slice(0, 12000) });
    try {
      const extracted = await extractImagesFromZip(
        bytes,
        "ppt/media/",
        (p) => `PPTX media ${p.split("/").pop()}`,
      );
      for (const img of extracted) {
        parts.push({ type: "image", image: img.bytes });
        images.push(img);
      }
      notes.push(
        extracted.length
          ? `Extracted ${extracted.length} embedded image(s) from PPTX for visual analysis.`
          : "No embedded images found in PPTX.",
      );
    } catch (e) {
      notes.push(`PPTX image extraction failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
    return { parts, images, notes, mode: "pptx" };
  }

  if (ext === "docx" || ext === "doc") {
    if (extractedText) parts.push({ type: "text", text: extractedText.slice(0, 12000) });
    try {
      const extracted = await extractImagesFromZip(
        bytes,
        "word/media/",
        (p) => `DOCX media ${p.split("/").pop()}`,
      );
      for (const img of extracted) {
        parts.push({ type: "image", image: img.bytes });
        images.push(img);
      }
      notes.push(
        extracted.length
          ? `Extracted ${extracted.length} embedded image(s) from DOCX for visual analysis.`
          : "No embedded images found in DOCX.",
      );
    } catch (e) {
      notes.push(`DOCX image extraction failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
    return { parts, images, notes, mode: "docx" };
  }

  // Fallback: text-only
  if (extractedText) {
    parts.push({ type: "text", text: extractedText.slice(0, 12000) });
    notes.push("Analyzed extracted text (no visual content detected).");
    return { parts, images, notes, mode: "text" };
  }

  notes.push("No extractable content available for this file type.");
  return { parts, images, notes, mode: "unknown" };
}

export async function persistExtractedImages(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  images: ExtractedImage[],
  descriptions: Array<{ caption?: string; description?: string; kind?: string }> = [],
): Promise<Array<{ storage_path: string; ordinal: number }>> {
  const saved: Array<{ storage_path: string; ordinal: number }> = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const storage_path = `${userId}/${documentId}/images/${Date.now()}_${i}.${img.extension}`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(storage_path, img.bytes, { contentType: img.mediaType, upsert: true });
    if (upErr) continue;
    const meta = descriptions[i] ?? {};
    await supabase.from("document_images").insert({
      document_id: documentId,
      user_id: userId,
      storage_path,
      ordinal: i,
      caption: meta.caption ?? img.source,
      ai_description: meta.description ?? null,
      kind: meta.kind ?? null,
    });
    saved.push({ storage_path, ordinal: i });
  }
  return saved;
}