/* script.js - generator logic (frontend-only)
   - Builds table editor
   - Extracts relevant CSS from pasted full CSS using an iframe/CSSOM strategy
   - Generates a JS file with VAR_ROW_... variables and automatic injection
   - Packages index.html, style.css, script.js (for the generated block) into a ZIP
*/

(function(){
  // UI references
  const tableEditor = document.getElementById('tableEditor');
  const addRowBtn = document.getElementById('addRow');
  const addColBtn = document.getElementById('addCol');
  const remRowBtn = document.getElementById('remRow');
  const remColBtn = document.getElementById('remCol');
  const loadExampleBtn = document.getElementById('loadExample');
  const blockNameInp = document.getElementById('blockName');
  const fullCssTA = document.getElementById('fullCss');
  const blockHtmlTA = document.getElementById('blockHtml');
  //const exportZipBtn = document.getElementById('exportZip');
  const previewBtn = document.getElementById('previewBtn');
  const downloadCssBtn = document.getElementById('downloadCss');
  const previewContainer = document.getElementById('previewContainer');
  const generatedJsPreview = document.getElementById('generatedJsPreview');
  const generatedCssPreview = document.getElementById('generatedCssPreview');
  const status = document.getElementById('status');

  // Simple table data structure
  let tableData = [
    ['Title','Caption','Image','Video'],
    ['Autumn Sale','Up to 50% off','/assets/sale.jpg','https://youtu.be/dQw4w9WgXcQ']
  ];

  // Render editable table
  function renderTable(){
    tableEditor.innerHTML = '';
    const table = document.createElement('table');
    table.style.width = '100%'; table.style.borderCollapse = 'collapse';
    tableData.forEach((row, r) => {
      const tr = document.createElement('tr');
      row.forEach((cell, c) => {
        const td = document.createElement('td');
        td.style.border = '1px solid #eee';
        td.style.padding = '6px';
        const inp = document.createElement('input');
        inp.value = cell;
        inp.style.width = '100%';
        inp.addEventListener('input', e => {
          tableData[r][c] = e.target.value;
          updatePreviews();
        });
        td.appendChild(inp);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    tableEditor.appendChild(table);
  }

  addRowBtn.addEventListener('click', ()=>{ tableData.push(new Array(tableData[0].length).fill('')); renderTable(); updatePreviews(); });
  addColBtn.addEventListener('click', ()=>{ tableData.forEach(r=>r.push('')); renderTable(); updatePreviews(); });
  remRowBtn.addEventListener('click', ()=>{ if(tableData.length>1) tableData.pop(); renderTable(); updatePreviews(); });
  remColBtn.addEventListener('click', ()=>{ if(tableData[0].length>1) tableData.forEach(r=>r.pop()); renderTable(); updatePreviews(); });

  loadExampleBtn.addEventListener('click', ()=>{
    tableData = [
      ['Title','Caption','Image','Video'],
      ['Autumn Sale','Up to 50% off','/assets/sale.jpg','https://youtu.be/dQw4w9WgXcQ']
    ];
    blockHtmlTA.value = `<div data-block="${blockNameInp.value}" class="hero">
  <h1 class="title">VAR_ROW_1_COL_1</h1>
  <p class="caption">VAR_ROW_1_COL_2</p>
  <img class="hero-img" src="VAR_ROW_1_COL_3" alt="">
  <a class="cta" href="VAR_ROW_1_COL_4">Watch Video</a>
</div>`;
    fullCssTA.value = `.hero{padding:24px;border-radius:8px;background:linear-gradient(90deg,#243B55,#141E30);color:white}
.hero .title{font-size:28px;margin:0}
.hero .caption{opacity:0.9}
.hero .hero-img{width:100%;height:auto;border-radius:6px;margin-top:8px}
.hero .cta{display:inline-block;margin-top:8px;padding:8px 12px;background:#ff7b7b;color:#012;border-radius:6px;text-decoration:none}`;
    renderTable();
    updatePreviews();
  });

  // ----------------- CSS extraction (iframe + CSSOM) -----------------
  // Create hidden iframe for safe CSSOM parsing & selector matching
  const workerIframe = document.createElement('iframe');
  workerIframe.style.display = 'none';
  workerIframe.sandbox = 'allow-same-origin';
  document.body.appendChild(workerIframe);

  function safeQueryAll(doc, sel){
    try { return Array.from(doc.querySelectorAll(sel)); }
    catch(e) { return []; }
  }

  function extractAnimNamesFromValue(val){
    if(!val) return [];
    return val.split(',').map(part=>{
      const tokens = part.match(/[a-zA-Z_][-a-zA-Z0-9_]*/g)||[];
      const keywords = new Set(["ease","linear","infinite","forwards","running","paused","normal","alternate","both","none","initial","inherit","unset"]);
      const names = tokens.filter(t=>{
        if(keywords.has(t.toLowerCase())) return false;
        if(/^\d/.test(t)) return false;
        if(/ms$/.test(t) || /s$/.test(t)) return false;
        return true;
      });
      return names[0]||null;
    }).filter(Boolean);
  }

  function buildExtractedCSS(domHtml, cssText){
    const ifr = workerIframe;
    const idoc = ifr.contentDocument || ifr.contentWindow.document;
    idoc.open();
    idoc.write('<!doctype html><html><head></head><body><div id="__extract-root">'+domHtml+'</div></body></html>');
    idoc.close();

    // add pasted CSS into iframe head so CSSOM is available
    const styleEl = idoc.createElement('style');
    styleEl.textContent = cssText;
    idoc.head.appendChild(styleEl);

    const sheet = styleEl.sheet;
    if(!sheet) return '';

    const usedRulesTexts = [];
    const keyframesMap = new Map();
    const keyframesOrder = [];
    const usedKeyframes = new Set();
    const fontfaces = new Map();
    const usedFonts = new Set();

    function recordKeyframes(rule){
      try {
        const name = rule.name;
        if(!keyframesMap.has(name)){
          keyframesMap.set(name, rule.cssText);
          keyframesOrder.push(name);
        }
      } catch(e){}
    }

    function processRule(rule, mediaWrap=null){
      try{
        const type = rule.type;
        const CSSRule = rule.constructor;
        if(type === CSSRule.STYLE_RULE || type === 1){
          const selectorText = rule.selectorText;
          let matched = false;
          try{
            const elems = safeQueryAll(idoc, selectorText);
            if(elems.length>0) matched = true;
          }catch(e){
            // invalid selector — fall back to checking for classes/ids presence
            const maybe = selectorText.match(/[.#][a-zA-Z0-9_-]+/g) || [];
            if(maybe.some(m => idoc.querySelector(m))) matched = true;
          }
          if(matched){
            // record font-family usages
            try{
              const ff = rule.style.getPropertyValue('font-family');
              if(ff) ff.split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,'')).forEach(f=>{ if(f) usedFonts.add(f); });
            }catch(e){}
            // record animation names
            try{
              const an = rule.style.getPropertyValue('animation-name');
              if(an) extractAnimNamesFromValue(an).forEach(n=>usedKeyframes.add(n));
              const ash = rule.style.getPropertyValue('animation');
              if(ash) extractAnimNamesFromValue(ash).forEach(n=>usedKeyframes.add(n));
            }catch(e){}
            if(mediaWrap){
              if(!mediaWrap.collected) mediaWrap.collected = [];
              mediaWrap.collected.push(rule.cssText);
            } else {
              usedRulesTexts.push(rule.cssText);
            }
          }
        } else if(type === CSSRule.MEDIA_RULE || type === 4){
          const media = '@media ' + rule.conditionText + ' {';
          const mw = {collected:[], media};
          for(let i=0;i<rule.cssRules.length;i++) processRule(rule.cssRules[i], mw);
          if(mw.collected.length) usedRulesTexts.push(media + '\n' + mw.collected.join('\n') + '\n}');
        } else if(type === CSSRule.KEYFRAMES_RULE || type === 7){
          recordKeyframes(rule);
        } else if(type === CSSRule.FONT_FACE_RULE || type === 5){
          try{
            const family = rule.style.getPropertyValue('font-family').replace(/^['"]|['"]$/g,'');
            if(family) fontfaces.set(family, rule.cssText);
          }catch(e){}
        } else if(type === CSSRule.SUPPORTS_RULE || type === 12){
          const sw = {collected:[], supports:'@supports '+rule.conditionText+' {'};
          for(let i=0;i<rule.cssRules.length;i++) processRule(rule.cssRules[i], sw);
          if(sw.collected.length) usedRulesTexts.push(sw.supports + '\n' + sw.collected.join('\n') + '\n}');
        } else {
          try{
            if(rule.cssText && /@keyframes\s+([a-zA-Z_][-a-zA-Z0-9_]*)/.test(rule.cssText)){
              const m = rule.cssText.match(/@keyframes\s+([a-zA-Z_][-a-zA-Z0-9_]*)/);
              if(m) recordKeyframes({name:m[1], cssText:rule.cssText});
            }
          }catch(e){}
        }
      }catch(e){ /* guard */ }
    }

    try{
      const rules = sheet.cssRules;
      for(let i=0;i<rules.length;i++) processRule(rules[i], null);
    }catch(e){ /* ignore iteration errors */ }

    // scan inline styles for animations and fonts
    try{
      const allEls = idoc.querySelectorAll('*');
      allEls.forEach(el=>{
        const inline = el.getAttribute('style');
        if(inline){
          if(/animation-name|animation\s*:/i.test(inline)){
            const anm = (inline.match(/animation-name\s*:\s*([^;]+)/i)||[])[1];
            if(anm) extractAnimNamesFromValue(anm).forEach(n=>usedKeyframes.add(n));
            const ash = (inline.match(/animation\s*:\s*([^;]+)/i)||[])[1];
            if(ash) extractAnimNamesFromValue(ash).forEach(n=>usedKeyframes.add(n));
          }
          if(/font-family\s*:/i.test(inline)){
            const ff = (inline.match(/font-family\s*:\s*([^;]+)/i)||[])[1];
            if(ff) ff.split(',').map(s=>s.trim().replace(/^['"]/,'').replace(/['"]$/,'')).forEach(f=>usedFonts.add(f));
          }
        }
      });
    }catch(e){}

    // include keyframes and font-face if used
    const keyframesToInclude = [];
    keyframesOrder.forEach(name => { if(usedKeyframes.has(name)) keyframesToInclude.push(keyframesMap.get(name)); });
    const fontFaceToInclude = [];
    fontfaces.forEach((cssText, family) => { if(usedFonts.has(family)) fontFaceToInclude.push(cssText); });

    const finalParts = [];
    if(fontFaceToInclude.length) finalParts.push(fontFaceToInclude.join('\n\n'));
    finalParts.push(usedRulesTexts.join('\n\n'));
    if(keyframesToInclude.length) finalParts.push(keyframesToInclude.join('\n\n'));
    const finalCss = finalParts.filter(Boolean).join('\n\n');

    // cleanup big style element so iframe preview uses only extracted CSS
    try{ idoc.head.removeChild(styleEl); }catch(e){}
    return finalCss;
  }

  // ----------------- JS generation -----------------
  function sanitizeName(n){ return (n||'block').trim().toLowerCase().replace(/[^a-z0-9-_]/g,'-'); }

function jsSafe(str) {
  // Escape backticks and ${} to avoid breaking template literals
  return str
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function generateJSString(blockName, blockHtml, tableData){
  //const blockName = document.getElementById('blockName').value.trim().toLowerCase();

  // Build variable fetchers for each cell
  let fetchLines = "";
  tableData.forEach((row, r) => {
    row.forEach((cell, c) => {
      fetchLines +=
`  var VAR_ROW_${r+1}_COL_${c+1} = (function(){
    var tbl = block.querySelector("table");
    if(!tbl) return "";
    var rows = tbl.rows || [];
    var cellObj = (rows[${r}] && rows[${r}].cells && rows[${r}].cells[${c}])
      ? rows[${r}].cells[${c}]
      : null;
    return cellObj ? cellObj.textContent.trim() : "";
  })();

`;
    });
  });

  // Escape the HTML safely
  const escapedDom = jsSafe(document.getElementById("blockHtml").value);

  const finalJs =
`
//import { createAemElement } from '../../scripts/aem.js';

export default async function decorate(block) {

${fetchLines}
  // Clear old authored HTML so injected HTML is always clean
  block.innerHTML = "";

  // Inject the original DOM
  block.innerHTML = \`${escapedDom}\`;

  // ---- NOTE ----
  // Variables VAR_ROW_X_COL_Y are available above.
  // Insert them inside your generated HTML wherever needed.
}
`;

  return finalJs;
}



  // ----------------- Project generation (ZIP with separated files) -----------------
  async function generateProjectZip(){
    const blockName = sanitizeName(blockNameInp.value || 'block');
    const fullCss = fullCssTA.value || '';
    const blockHtml = blockHtmlTA.value || '';

    status.textContent = 'Extracting relevant CSS...';
    await new Promise(r => setTimeout(r, 10)); // give UI a tick

    const extractedCss = buildExtractedCSS(blockHtml, fullCss);
    const generatedJs = generateJSString(blockName, blockHtml, tableData);

    // project index.html (for the generated block) - simple scaffold referencing style.css and script.js
    const projectIndex = `<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>${blockName}</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  ${blockHtml}\n  <script src=\"script.js\"></script>\n</body>\n</html>`;

    // style.css: small scaffold + extracted rules
    const scaffoldCss = `/* Scaffold styles (editable) */\n:root{--bg:#fff;--fg:#0b1220}\nbody{font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto;margin:0;padding:18px;background:var(--bg);color:var(--fg);} \n`;
    const projectStyle = scaffoldCss + '\n/* Extracted CSS for the block (relevant rules only) */\n' + extractedCss;

    // Use JSZip to create a zip with a folder bearing the block name
    const zip = new JSZip();
    //zip.folder(blockName).file('index.html', projectIndex);
    zip.folder(blockName).file('style.css', projectStyle);
    zip.folder(blockName).file('script.js', generatedJs);
    zip.folder(blockName).file('README.txt', `Block: ${blockName}\nFiles: index.html, style.css, script.js\n` );

    status.textContent = 'Packing ZIP...';
    const blob = await zip.generateAsync({type:'blob'});
    saveAs(blob, `${blockName}-block.zip`);
    status.textContent = `Generated ${blockName}-block.zip`;
  }

  // ----------------- Download extracted CSS only -----------------
  function downloadExtractedCss(){
    const blockHtml = blockHtmlTA.value || '';
    const fullCss = fullCssTA.value || '';
    const extracted = buildExtractedCSS(blockHtml, fullCss);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    saveAs(blob, `${sanitizeName(blockNameInp.value||'block')}.css`);
  }

  function downloadGeneratedJs(){
    const blockName = sanitizeName(blockNameInp.value || 'block');
    const blockHtml = blockHtmlTA.value || '';

    const generatedJs = generateJSString(blockName, blockHtml, tableData);
    const fileName = `${blockName}.js`;

    const blob = new Blob([generatedJs], {type:'text/javascript'});
    saveAs(blob, fileName);
  }
// Helper: return table rows and column count in a small object
function extractTableData() {
  // Use the in-memory tableData if present (keeps authored edits)
  const rows = Array.isArray(tableData) ? tableData.map(r => r.slice()) : [];

  // Fallback: try to read tableEditor DOM if needed
  if(rows.length === 0 && tableEditor) {
    const domRows = Array.from(tableEditor.querySelectorAll('tr'));
    domRows.forEach(tr => {
      const cells = Array.from(tr.querySelectorAll('input')).map(i => i.value || '');
      if(cells.length) rows.push(cells);
    });
  }

  const cols = rows[0] ? rows[0].length : 0;
  return { rows, cols };
}

  // ----------------- Download table as DOCX -----------------
// ----------------- Download table as Word (.doc) -----------------
async function downloadDocx() {
  const blockNameRaw = (blockNameInp.value || 'block').trim();
  const blockName = sanitizeName(blockNameRaw) || 'block';
  const t = extractTableData();
  const rows = t.rows;
  const cols = t.cols || 0;

  // Build WordprocessingML XML table rows
  function makeCell(text) {
    const safe = ('' + text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `
      <w:tc>
        <w:p><w:r><w:t>${safe}</w:t></w:r></w:p>
      </w:tc>`;
  }

  function makeRow(cells) {
    return `<w:tr>${cells.map(makeCell).join("")}</w:tr>`;
  }

  // Header row spanning all columns
  const headerRow = `
    <w:tr>
      <w:tc>
        <w:tcPr><w:gridSpan w:val="${cols}"/></w:tcPr>
        <w:p><w:r><w:t>${blockNameRaw}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>`;

  // Build table XML
  const tableXml = `
    <w:tbl>
      <w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>
      ${headerRow}
      ${rows.map(r => makeRow(r)).join("")}
    </w:tbl>
  `;

  // Build full document XML
  const documentXml = `
    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
      xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
      xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:w10="urn:schemas-microsoft-com:office:word"
      xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
      xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
      xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
      xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
      xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
      mc:Ignorable="w14 wp14">
      <w:body>
        ${tableXml}
        <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
      </w:body>
    </w:document>
  `;

  // Build DOCX ZIP structure
  const zip = new JSZip();

  zip.file("[Content_Types].xml",
`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.folder("_rels").file(".rels",
`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.folder("word").file("document.xml", documentXml);

  zip.folder("word").folder("_rels").file("document.xml.rels",
`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships"></Relationships>`);

  // Generate final .docx blob
  const content = await zip.generateAsync({ type: "blob" });

  saveAs(content, `${blockName}.docx`);
}



  // ----------------- Previews -----------------
  function updatePreviews(){
    const blockHtml = blockHtmlTA.value || '';
    const fullCss = fullCssTA.value || '';
    const extracted = buildExtractedCSS(blockHtml, fullCss);
    generatedCssPreview.textContent = extracted || '/* No matched rules */';
    generatedJsPreview.textContent = generateJSString(sanitizeName(blockNameInp.value||'block'), blockHtml, tableData);

    // iframe preview
    const blob = new Blob(['<!doctype html><html><head><meta charset="utf-8"><style>'+extracted+'</style></head><body>'+blockHtml+'</body></html>'], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    previewContainer.innerHTML = `<iframe src="${url}" style="width:100%;height:100%;border:0"></iframe>`;
  }

 // exportZipBtn.addEventListener('click', generateProjectZip);
  previewBtn.addEventListener('click', ()=>{ updatePreviews(); alert('Preview refreshed'); });
  downloadCssBtn.addEventListener('click', downloadExtractedCss);
  downloadCssBtn.addEventListener('click', downloadGeneratedJs);
  // ----------------- Attach to button -----------------
  downloadDocxBtn.addEventListener('click', downloadDocx);

  // initial render
  renderTable();
  updatePreviews();

})();
