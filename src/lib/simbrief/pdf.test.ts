import assert from "node:assert/strict";
import { extractSimbriefPdfUrl, safeSimbriefPdfUrl } from "./pdf.ts";

assert.equal(extractSimbriefPdfUrl({ pdfUrl: "https://www.simbrief.com/ofp/flightplans/HF0200.pdf" }), "https://www.simbrief.com/ofp/flightplans/HF0200.pdf");
assert.equal(extractSimbriefPdfUrl({ files: { pdf: { link: "/ofp/flightplans/HF0200.pdf" } } }), "https://www.simbrief.com/ofp/flightplans/HF0200.pdf");
assert.equal(extractSimbriefPdfUrl({ params: { pdf: "LEMDLEVC_PDF_1783244128.pdf" } }), null);
assert.equal(safeSimbriefPdfUrl("/pilot/ofp/LEMDLEVC_PDF_1783244128.pdf"), null);
assert.equal(safeSimbriefPdfUrl("https://example.com/ofp.pdf"), null);
assert.equal(extractSimbriefPdfUrl({ ofp_pdf: { url: "https://dispatch.simbrief.com/ofp/HF123.pdf" } }), "https://dispatch.simbrief.com/ofp/HF123.pdf");
console.log("SimBrief PDF URL: 6 assertions passed.");
