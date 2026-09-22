import { NextResponse } from "next/server";

import { getContractTextPages, renderContractTextPagesHtml } from "@/lib/contract-document";
import { CONTRACT_VERSION } from "@/lib/contract-verification-shared";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("format") === "json") {
      return NextResponse.json({
        version: CONTRACT_VERSION,
        pages: await getContractTextPages(),
        contractNumber: null,
        pseudonym: null
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const pages = await renderContractTextPagesHtml();
    const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Договор ICECREAMMUSIC</title>
  <style>
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Iowan Old Style, Baskerville, Times New Roman, Times, serif; font-size: 15px; font-weight: 400; line-height: 1.62; }
    main { width: 900px; max-width: calc(100% - 32px); margin: 32px auto; padding: 40px; background: #fff; border: 1px solid #d1d5db; border-radius: 16px; }
    h1 { margin: 0 0 8px; font-size: 28px; } .muted { color: #6b7280; }
    .contract-page { margin-top: 22px; padding: 25mm 20mm; border: 1px solid #e5e7eb; border-radius: 12px; }
    .contract-page p { margin: 0 0 16px; font-weight: 400; letter-spacing: .003em; white-space: pre-wrap; } .contract-page-number { margin-bottom: 18px !important; color: #6b7280; font-size: 10px; font-weight: 700 !important; }
    .contract-paragraph { text-align: justify; text-indent: 1.25cm; } .contract-section-heading { text-indent: 0; font-weight: 700; text-transform: uppercase; }
    .signing-note { margin-top: 22px; padding: 22px; border: 1px solid #e5e7eb; border-radius: 12px; }
  </style>
</head>
<body><main>
  <h1>Договор ICECREAMMUSIC</h1>
  ${pages}
  <section class="signing-note"><h2>12. Адреса, банковские реквизиты и подписи сторон</h2><p>Реквизиты Лицензиара и его подпись заполняются в финальной версии при подписании договора.</p></section>
</main></body></html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": "inline",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Document unavailable" }, { status: 404 });
  }
}
