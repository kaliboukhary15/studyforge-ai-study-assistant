import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// Set worker for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return extractFromPDF(file);
  } else if (extension === "docx") {
    return extractFromDOCX(file);
  } else if (extension === "pptx") {
    // For PPTX, return a placeholder message - full parsing is complex
    return `[PPTX file: ${file.name}]\n\nNote: PPTX deep text extraction is limited in this MVP. Please convert to PDF or paste the content text directly.`;
  }

  throw new Error("Unsupported file type. Please upload PDF, DOCX, or PPTX.");
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
