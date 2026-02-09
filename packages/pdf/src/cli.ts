#!/usr/bin/env node
/**
 * CLI utility to extract pages from a PDF and generate a self-contained HTML viewer.
 *
 * Usage:
 *   npx tsx packages/pdf/src/cli.ts <pdf-file> [start-end]
 *
 * Examples:
 *   npx tsx packages/pdf/src/cli.ts book.pdf          # all pages
 *   npx tsx packages/pdf/src/cli.ts book.pdf 1-10     # pages 1 through 10
 *   npx tsx packages/pdf/src/cli.ts book.pdf 5        # page 5 only
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { extractPdf } from "./extract.js";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.error("Usage: pdf-extract <pdf-file> [start-end]");
  console.error("");
  console.error("  pdf-file   Path to a PDF file");
  console.error("  start-end  Optional page range, e.g. 1-10, 5, 3-");
  console.error("");
  console.error("Outputs a self-contained HTML viewer next to the PDF.");
  process.exit(args.length === 0 ? 1 : 0);
}

const pdfPath = resolve(args[0]);
let startPage: number | undefined;
let endPage: number | undefined;

if (args[1]) {
  const range = args[1];
  if (range.includes("-")) {
    const [s, e] = range.split("-");
    if (s) startPage = parseInt(s, 10);
    if (e) endPage = parseInt(e, 10);
  } else {
    startPage = parseInt(range, 10);
    endPage = startPage;
  }
}

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------

const pdfBuffer = readFileSync(pdfPath);
const label = basename(pdfPath, ".pdf");

const rangeLabel = startPage || endPage
  ? ` (pages ${startPage ?? 1}–${endPage ?? "end"})`
  : "";
console.error(`Extracting ${label}${rangeLabel}...`);

const result = await extractPdf(
  { pdfBuffer: Buffer.from(pdfBuffer), startPage, endPage },
  (p) => console.error(`  page ${p.page}/${p.totalPages}`),
);

// ---------------------------------------------------------------------------
// Build JSON payload
// ---------------------------------------------------------------------------

const payload = {
  totalPagesInPdf: result.totalPagesInPdf,
  pdfMetadata: result.pdfMetadata,
  pages: result.pages.map((page) => ({
    pageId: page.pageId,
    pageNumber: page.pageNumber,
    text: page.text,
    pageImage: {
      imageId: page.pageImage.imageId,
      width: page.pageImage.width,
      height: page.pageImage.height,
      hash: page.pageImage.hash,
      dataUrl: `data:image/png;base64,${page.pageImage.pngBuffer.toString("base64")}`,
    },
    images: page.images.map((img) => ({
      imageId: img.imageId,
      width: img.width,
      height: img.height,
      hash: img.hash,
      dataUrl: `data:image/png;base64,${img.pngBuffer.toString("base64")}`,
    })),
  })),
};

// ---------------------------------------------------------------------------
// Generate HTML
// ---------------------------------------------------------------------------

const html = buildHtml(payload);
const outPath = pdfPath.replace(/\.pdf$/i, "-extract.html");
writeFileSync(outPath, html);
console.error(`Written to ${outPath}`);

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function buildHtml(data: unknown): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PDF Extract – ${esc(label)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#1a1a2e;--sf:#16213e;--cd:#0f3460;--hv:#1a3a6e;--tx:#e0e0e0;--td:#8899aa;--tb:#fff;--ac:#e94560;--bd:#2a3a5e;--bl:#60a5fa}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--tx);height:100vh;display:flex;flex-direction:column;overflow:hidden}
.hd{background:var(--sf);border-bottom:1px solid var(--bd);padding:12px 20px;display:flex;align-items:center;gap:20px;flex-shrink:0}
.hd h1{font-size:16px;font-weight:600;color:var(--tb);white-space:nowrap}
.hd .mt{display:flex;gap:16px;font-size:12px;color:var(--td);flex-wrap:wrap}
.hd .mt span{white-space:nowrap}
.hd .mt .l{color:var(--td)} .hd .mt .v{color:var(--tx)}
.nv{margin-left:auto;display:flex;align-items:center;gap:8px;flex-shrink:0}
.nv button{background:var(--cd);border:1px solid var(--bd);color:var(--tx);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px}
.nv button:hover{background:var(--hv)} .nv button:disabled{opacity:.3;cursor:default}
.nv .pi{font-size:13px;color:var(--td);min-width:80px;text-align:center}
.mn{display:flex;flex:1;overflow:hidden}
.sb{width:140px;min-width:140px;background:var(--sf);border-right:1px solid var(--bd);overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
.th{border:2px solid transparent;border-radius:6px;cursor:pointer;overflow:hidden;position:relative}
.th:hover{border-color:var(--bd)} .th.ac{border-color:var(--ac)}
.th img{width:100%;display:block;border-radius:4px}
.th .tl{position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,.7);color:var(--tx);font-size:10px;padding:2px 6px;border-radius:3px}
.ct{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:20px}
.pi-s{display:flex;gap:20px;align-items:flex-start}
.pi-s>img{max-width:420px;width:100%;border-radius:8px;border:1px solid var(--bd);flex-shrink:0}
.st{font-size:14px;font-weight:600;color:var(--tb);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.st .bg{font-size:11px;font-weight:400;background:var(--cd);color:var(--td);padding:2px 8px;border-radius:10px}
.tb{background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:16px;font-family:'SF Mono','Fira Code',monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto}
.te{color:var(--td);font-style:italic}
.ig{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.ic{background:var(--sf);border:1px solid var(--bd);border-radius:8px;overflow:hidden}
.ic:hover{border-color:var(--bl)}
.ic .ip{background:repeating-conic-gradient(#222 0% 25%,#333 0% 50%) 50%/16px 16px;display:flex;align-items:center;justify-content:center;padding:8px;min-height:120px}
.ic .ip img{max-width:100%;max-height:180px;display:block;outline:1px solid rgba(255,255,255,.35)}
.ic .ii{padding:8px 10px;font-size:11px;border-top:1px solid var(--bd);display:flex;flex-direction:column;gap:2px}
.ic .ii .id{font-weight:600;color:var(--bl);font-family:monospace}
.ic .ii .dm{color:var(--td)} .ic .ii .hs{color:var(--td);font-family:monospace;font-size:10px}
.ps{flex:1;min-width:200px}
.sr{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bd);font-size:13px}
.sr:last-child{border-bottom:none}
.sl{color:var(--td)} .sv{color:var(--tb);font-family:monospace}
::-webkit-scrollbar{width:8px;height:8px} ::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--bd);border-radius:4px} ::-webkit-scrollbar-thumb:hover{background:#3a4a6e}
</style>
</head>
<body>
<div class="hd"><h1 id="title">PDF Extract</h1><div class="mt" id="meta"></div>
<div class="nv"><button id="pb" onclick="nav(-1)">\u2190 Prev</button><span class="pi" id="pin">\u2014</span><button id="nb" onclick="nav(1)">Next \u2192</button></div></div>
<div class="mn"><div class="sb" id="sb"></div><div class="ct" id="ct"></div></div>
<script>
const D=${JSON.stringify(data).replace(/</g, '\\u003c')};
let cur=0;
function esc(s){const e=document.createElement('span');e.textContent=s;return e.innerHTML}
function init(){
  const m=D.pdfMetadata,p=[];
  if(m.title)p.push('<span><span class="l">Title:</span> <span class="v">'+esc(m.title)+'</span></span>');
  if(m.creator)p.push('<span><span class="l">Creator:</span> <span class="v">'+esc(m.creator)+'</span></span>');
  p.push('<span><span class="l">Pages:</span> <span class="v">'+D.pages.length+' of '+D.totalPagesInPdf+'</span></span>');
  if(m.format)p.push('<span><span class="l">Format:</span> <span class="v">'+esc(m.format)+'</span></span>');
  document.getElementById('meta').innerHTML=p.join('');
  document.getElementById('sb').innerHTML=D.pages.map((pg,i)=>
    '<div class="th'+(i===0?' ac':'')+'" onclick="sel('+i+')" id="t'+i+'"><img src="'+pg.pageImage.dataUrl+'" loading="lazy"><span class="tl">pg '+pg.pageNumber+'</span></div>'
  ).join('');
  sel(0);
}
function sel(i){
  if(i<0||i>=D.pages.length)return;cur=i;const pg=D.pages[i];
  document.querySelectorAll('.th').forEach((e,j)=>e.classList.toggle('ac',j===i));
  const t=document.getElementById('t'+i);if(t)t.scrollIntoView({block:'nearest',behavior:'smooth'});
  document.getElementById('pb').disabled=i===0;
  document.getElementById('nb').disabled=i===D.pages.length-1;
  document.getElementById('pin').textContent='Page '+pg.pageNumber+' / '+D.totalPagesInPdf;
  const c=document.getElementById('ct');c.scrollTop=0;
  const tx=pg.text.trim()?esc(pg.text):'<span class="te">(no text extracted)</span>';
  const imgs=pg.images.length?pg.images.map(im=>
    '<div class="ic"><div class="ip"><img src="'+im.dataUrl+'" loading="lazy"></div><div class="ii"><span class="id">'+im.imageId+'</span><span class="dm">'+im.width+' \\u00d7 '+im.height+'px</span><span class="hs">#'+im.hash+'</span></div></div>'
  ).join(''):'<div style="color:var(--td);font-style:italic;padding:8px 0">No extracted images</div>';
  c.innerHTML='<div class="pi-s"><img src="'+pg.pageImage.dataUrl+'"><div class="ps"><div class="st">Page '+pg.pageNumber+' <span class="bg">'+pg.pageId+'</span></div><div class="sr"><span class="sl">Page Image</span><span class="sv">'+pg.pageImage.width+' \\u00d7 '+pg.pageImage.height+'</span></div><div class="sr"><span class="sl">Hash</span><span class="sv">'+pg.pageImage.hash+'</span></div><div class="sr"><span class="sl">Text</span><span class="sv">'+pg.text.length+' chars</span></div><div class="sr"><span class="sl">Images</span><span class="sv">'+pg.images.length+'</span></div></div></div><div><div class="st">Extracted Text <span class="bg">'+pg.text.length+' chars</span></div><div class="tb">'+tx+'</div></div><div><div class="st">Extracted Images <span class="bg">'+pg.images.length+'</span></div><div class="ig">'+imgs+'</div></div>';
}
function nav(d){sel(cur+d)}
document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();nav(-1)}if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();nav(1)}});
init();
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
