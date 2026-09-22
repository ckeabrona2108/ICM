import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { CONTRACT_FILE_NAME } from "@/lib/contract-verification-shared";

export type ContractTextPage = {
  number: number;
  text: string;
};

let contractTextPagesPromise: Promise<ContractTextPage[]> | null = null;

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.;:])/gu, "$1")
    .trim();
}

function removeTemplateHeader(pageNumber: number, text: string): string {
  if (pageNumber !== 1) return text;

  // The application renders the number and signing date itself. Keeping the
  // source PDF header here duplicates it and leaves its blank date fields in
  // the final document.
  const bodyStart = text.search(/Гражданин Российской Федерации\s*\/\s*(?:индивидуальный предприниматель|юридическое лицо)/u);
  return bodyStart >= 0 ? text.slice(bodyStart) : text;
}

function removeRunningPageHeader(text: string): string {
  // Each source-PDF page carries this running header. It is not part of the
  // agreement and otherwise lands at the start of a paragraph in the HTML copy.
  return text.replace(
    /ICECREAMMUSIC\s*\|\s*ЛИЦЕНЗИОННЫЙ\s+ДОГОВОР\s+Страница\s+\d+/giu,
    ""
  );
}

function removeLegacyPaperSigningDetails(text: string): string {
  // The signed document renders the parties' actual details and signatures in
  // its own final section. The source template's blank paper-signing form must
  // not appear before the payout appendix.
  return text.replace(
    /\s*12\.7\.\s*Реквизиты Сторон при бумажном подписании:.*?(?=ПРИЛОЖЕНИЕ №\s*1\.)/su,
    " "
  );
}

type PdfTextItem = {
  str: string;
  hasEOL: boolean;
};

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string" &&
    "hasEOL" in item &&
    typeof item.hasEOL === "boolean"
  );
}

function joinPdfTextItems(items: readonly unknown[]): string {
  let text = "";

  for (const item of items) {
    if (!isPdfTextItem(item)) continue;

    // PDF.js keeps real spaces as text items. Adding our own space between every
    // item turns words split across drawing commands into `обнародован ного`.
    text += item.str;
    if (item.hasEOL) text += " ";
  }

  return text;
}

async function extractContractTextPages(): Promise<ContractTextPage[]> {
  const filePath = path.join(process.cwd(), "public", "docs", CONTRACT_FILE_NAME);
  const data = new Uint8Array(await readFile(filePath));
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // In Next's server bundle pdf.js resolves its default `./pdf.worker.mjs`
  // relative to a vendor chunk. Point it at the real package file instead.
  GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")
  ).href;
  const document = await getDocument({ data }).promise;
  const pages: ContractTextPage[] = [];

  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const text = removeLegacyPaperSigningDetails(
      removeTemplateHeader(
        number,
        removeRunningPageHeader(normalizeExtractedText(joinPdfTextItems(content.items)))
      )
    );
    if (text) pages.push({ number, text });
  }

  return pages;
}

export function getContractTextPages(): Promise<ContractTextPage[]> {
  contractTextPagesPromise ??= extractContractTextPages();
  return contractTextPagesPromise;
}

export function escapeContractHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#039;");
}

function splitContractParagraphs(text: string): string[] {
  return text
    // Do not split inside a subclause number: `1.1.` also contains `1.`.
    .split(/(?<![\d.])(?=\d{1,2}\.(?:\d{1,2}\.)?\s)/gu)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function isContractSectionHeading(paragraph: string): boolean {
  return /^\d{1,2}\.\s+[А-ЯЁ0-9 ,;:«»"'()\-–—]+$/u.test(paragraph);
}

export async function renderContractTextPagesHtml(): Promise<string> {
  const pages = await getContractTextPages();
  // The tenth page is rendered separately because it contains the parties' details and signatures.
  return pages
    .filter((page) => page.number !== 10)
    .map((page) => {
      const paragraphs = splitContractParagraphs(page.text)
        .map((paragraph) => {
          const className = isContractSectionHeading(paragraph)
            ? "contract-paragraph contract-section-heading"
            : "contract-paragraph";
          return `<p class="${className}">${escapeContractHtml(paragraph)}</p>`;
        })
        .join("\n  ");

      return `<section class="contract-page" data-page="${page.number}">
  <p class="contract-page-number">Страница ${page.number}</p>
  ${paragraphs}
</section>`;
    })
    .join("\n");
}
