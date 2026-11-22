let currentPdfBytes = null;
let customFontBytes = null;
let customFontName = '';
let edits = [];
let pageSignCanvases = [];
let libsReady = false;
let currentMode = 'edit';
let previousMode = 'box';
const RENDER_SCALE = 1.5;

let isBold = false;
let isItalic = false;
let isUnderline = false;
let textAlign = 'left';

const pdfUpload = document.getElementById('pdfUpload');
const fontUpload = document.getElementById('fontUpload');
const fontSelect = document.getElementById('fontSelect');
const customFontOption = document.getElementById('customFontOption');
const fontSizeInput = document.getElementById('fontSize');
const fontColorInput = document.getElementById('fontColor');
const coverOldTextCheckbox = document.getElementById('coverOldText');
const downloadBtn = document.getElementById('downloadBtn');
const statusBar = document.getElementById('statusBar');
const pdfContainer = document.getElementById('pdfContainer');

const strokeWidthInput = document.getElementById('strokeWidthInput');
const strokeWidthLabel = document.getElementById('strokeWidthLabel');
const opacityInput = document.getElementById('opacityInput');
const opacityLabel = document.getElementById('opacityLabel');

const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');
const alignLeftBtn = document.getElementById('alignLeftBtn');
const alignCenterBtn = document.getElementById('alignCenterBtn');
const alignRightBtn = document.getElementById('alignRightBtn');

const bgColorInput = document.getElementById('bgColor');
const bgHexInput = document.getElementById('bgHexInput');
const bgRInput = document.getElementById('bgRInput');
const bgGInput = document.getElementById('bgGInput');
const bgBInput = document.getElementById('bgBInput');

const modeEditBtn = document.getElementById('modeEditBtn');
const modeSignBtn = document.getElementById('modeSignBtn');
const modeDeleteBtn = document.getElementById('modeDeleteBtn');
const modeBoxBtn = document.getElementById('modeBoxBtn');
const modePickColorBtn = document.getElementById('modePickColorBtn');
const undoBtn = document.getElementById('undoBtn');

strokeWidthInput.addEventListener('input', () => {
  strokeWidthLabel.textContent = strokeWidthInput.value + 'px';
});

opacityInput.addEventListener('input', () => {
  opacityLabel.textContent = opacityInput.value + '%';
  updateActiveInputStyle();
});

function updateActiveInputStyle() {
  const activeInput = document.querySelector('.floating-box-wrapper input');
  if (!activeInput) return;
  activeInput.style.fontWeight = isBold ? 'bold' : 'normal';
  activeInput.style.fontStyle = isItalic ? 'italic' : 'normal';
  activeInput.style.textDecoration = isUnderline ? 'underline' : 'none';
  activeInput.style.textAlign = textAlign;
  activeInput.style.opacity = parseInt(opacityInput.value) / 100;
}

boldBtn.addEventListener('click', () => {
  isBold = !isBold;
  boldBtn.classList.toggle('btn-format-active', isBold);
  updateActiveInputStyle();
});

italicBtn.addEventListener('click', () => {
  isItalic = !isItalic;
  italicBtn.classList.toggle('btn-format-active', isItalic);
  updateActiveInputStyle();
});

underlineBtn.addEventListener('click', () => {
  isUnderline = !isUnderline;
  underlineBtn.classList.toggle('btn-format-active', isUnderline);
  updateActiveInputStyle();
});

function setAlign(align) {
  textAlign = align;
  alignLeftBtn.classList.toggle('btn-format-active', align === 'left');
  alignCenterBtn.classList.toggle('btn-format-active', align === 'center');
  alignRightBtn.classList.toggle('btn-format-active', align === 'right');
  updateActiveInputStyle();
}

alignLeftBtn.addEventListener('click', () => setAlign('left'));
alignCenterBtn.addEventListener('click', () => setAlign('center'));
alignRightBtn.addEventListener('click', () => setAlign('right'));

function clampByte(val) {
  const num = parseInt(val);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.min(255, num));
}

function rgbValuesToHex(r, g, b) {
  const toHex = (n) => clampByte(n).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function syncFromRgb(r, g, b) {
  const cr = clampByte(r);
  const cg = clampByte(g);
  const cb = clampByte(b);
  const hex = rgbValuesToHex(cr, cg, cb);

  bgRInput.value = cr;
  bgGInput.value = cg;
  bgBInput.value = cb;
  bgHexInput.value = hex;
  bgColorInput.value = hex;
}

function syncFromHex(hexStr) {
  let clean = hexStr.trim();
  if (!clean.startsWith('#')) clean = '#' + clean;
  if (/^#[0-9A-Fa-f]{6}$/.test(clean)) {
    const bigint = parseInt(clean.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    syncFromRgb(r, g, b);
  }
}

bgColorInput.addEventListener('input', (e) => syncFromHex(e.target.value));
bgHexInput.addEventListener('change', (e) => syncFromHex(e.target.value));
bgRInput.addEventListener('input', () => syncFromRgb(bgRInput.value, bgGInput.value, bgBInput.value));
bgGInput.addEventListener('input', () => syncFromRgb(bgRInput.value, bgGInput.value, bgBInput.value));
bgBInput.addEventListener('input', () => syncFromRgb(bgRInput.value, bgGInput.value, bgBInput.value));

function setMode(mode) {
  if (mode !== 'pick') {
    previousMode = mode;
  }
  currentMode = mode;

  modeEditBtn.className = 'btn btn-secondary';
  modeSignBtn.className = 'btn btn-secondary';
  modeDeleteBtn.className = 'btn btn-secondary';
  modeBoxBtn.className = 'btn btn-secondary';
  modePickColorBtn.className = 'btn btn-info';
  pdfContainer.classList.remove('mode-edit', 'mode-sign', 'mode-delete', 'mode-box', 'mode-pick');

  if (mode === 'edit') {
    modeEditBtn.className = 'btn btn-active';
    pdfContainer.classList.add('mode-edit');
    statusBar.textContent = 'Mode Edit: Ketuk teks atau area mana saja untuk menulis.';
  } else if (mode === 'sign') {
    modeSignBtn.className = 'btn btn-sign-active';
    pdfContainer.classList.add('mode-sign');
    statusBar.textContent = 'Mode Tanda Tangan: Goreskan jari di atas dokumen. Atur Garis TTD & Opacity.';
  } else if (mode === 'delete') {
    modeDeleteBtn.className = 'btn btn-danger-active';
    pdfContainer.classList.add('mode-delete');
    statusBar.textContent = 'Mode Hapus Teks: Ketuk teks digital bawaan PDF untuk menghapus.';
  } else if (mode === 'box') {
    modeBoxBtn.className = 'btn btn-danger-active';
    pdfContainer.classList.add('mode-box');
    statusBar.textContent = 'Mode Hapus Area (Gambar): Seret jari membentuk kotak di atas tulisan.';
  } else if (mode === 'pick') {
    modePickColorBtn.className = 'btn btn-info-active';
    pdfContainer.classList.add('mode-pick');
    statusBar.textContent = 'Pipet Warna Aktif: Ketuk bagian warna latar PDF yang ingin dicontoh.';
  }
}

modeEditBtn.addEventListener('click', () => setMode('edit'));
modeSignBtn.addEventListener('click', () => setMode('sign'));
modeDeleteBtn.addEventListener('click', () => setMode('delete'));
modeBoxBtn.addEventListener('click', () => setMode('box'));
modePickColorBtn.addEventListener('click', () => setMode('pick'));

undoBtn.addEventListener('click', () => {
  if (edits.length === 0) return;
  const lastEdit = edits.pop();
  if (lastEdit.type === 'sign') {
    redrawSignaturesForPage(lastEdit.pageIndex);
  } else if (lastEdit.previewEl) {
    lastEdit.previewEl.remove();
  }
  undoBtn.disabled = edits.length === 0;
  statusBar.textContent = 'Tindakan terakhir dibatalkan.';
});

function redrawSignaturesForPage(pageIndex) {
  const signCanvas = pageSignCanvases.at(pageIndex);
  if (!signCanvas) return;
  const ctx = signCanvas.getContext('2d');
  ctx.clearRect(0, 0, signCanvas.width, signCanvas.height);

  for (const edit of edits) {
    if (edit.type === 'sign' && edit.pageIndex === pageIndex) {
      drawStrokeOnCanvas(ctx, edit.points, edit.color, edit.lineWidth, edit.opacity);
    }
  }
}

function drawStrokeOnCanvas(ctx, points, color, lineWidth, opacity) {
  if (!points || points.length === 0) return;
  ctx.save();
  ctx.globalAlpha = opacity !== undefined ? opacity : 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (points.length === 1) {
    const pt = points.at(0);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points.at(0).x, points.at(0).y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points.at(i).x, points.at(i).y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function loadLocalScript(fileName) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = fileName;
    s.onload = resolve;
    s.onerror = () => reject(new Error('File "' + fileName + '" tidak ditemukan di folder!'));
    document.head.appendChild(s);
  });
}

async function initLibraries() {
  try {
    statusBar.textContent = 'Memuat modul lokal (1/3)...';
    await loadLocalScript('pdf.min.js');

    statusBar.textContent = 'Memuat modul lokal (2/3)...';
    await loadLocalScript('pdf-lib.min.js');

    statusBar.textContent = 'Memuat modul lokal (3/3)...';
    await loadLocalScript('fontkit.umd.min.js');

    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
    }
    libsReady = true;
    pdfContainer.classList.add('mode-edit');
    statusBar.textContent = 'Siap (Mode Offline)! Silakan tekan tombol Buka PDF.';
  } catch (err) {
    statusBar.textContent = 'Error: ' + err.message;
  }
}

initLibraries();
pdfUpload.addEventListener('change', async (e) => {
  const fileList = e.target.files;
  if (!fileList || fileList.length === 0) return;
  const file = fileList.item(0);

  if (!libsReady) {
    statusBar.textContent = 'Modul belum siap.';
    return;
  }

  try {
    statusBar.textContent = 'Membuka: ' + file.name + '...';
    currentPdfBytes = await file.arrayBuffer();
    edits = [];
    undoBtn.disabled = true;
    await renderPDF(currentPdfBytes);
    
    downloadBtn.disabled = false;
    setMode(currentMode);
  } catch (err) {
    statusBar.textContent = 'Gagal membaca PDF: ' + err.message;
  }
});

fontUpload.addEventListener('change', async (e) => {
  const fileList = e.target.files;
  if (!fileList || fileList.length === 0) return;
  const file = fileList.item(0);

  try {
    customFontBytes = await file.arrayBuffer();
    customFontName = file.name.replace(/\.[^/.]+$/, '');
    customFontOption.textContent = customFontName + ' (Kustom)';
    customFontOption.disabled = false;
    fontSelect.value = 'Custom';
    statusBar.textContent = 'Font "' + customFontName + '" siap dipakai.';
  } catch (err) {
    statusBar.textContent = 'Gagal memuat font: ' + err.message;
  }
});

async function renderPDF(pdfBytes) {
  pdfContainer.innerHTML = '';
  pageSignCanvases = [];
  const loadingTask = window.pdfjsLib.getDocument({
    data: new Uint8Array(pdfBytes.slice(0))
  });
  const pdf = await loadingTask.promise;


  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const pageIndex = pageNum - 1;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'page-wrapper';
    pageWrapper.style.width = viewport.width + 'px';
    pageWrapper.style.height = viewport.height + 'px';
    pageWrapper.dataset.pageIndex = pageIndex;

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    const context = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport: viewport }).promise;
    pageWrapper.appendChild(canvas);

    const signCanvas = document.createElement('canvas');
    signCanvas.className = 'sign-canvas';
    signCanvas.width = viewport.width;
    signCanvas.height = viewport.height;
    const signCtx = signCanvas.getContext('2d');
    pageWrapper.appendChild(signCanvas);
    pageSignCanvases.push(signCanvas);

    let isSigning = false;
    let currentStrokePoints = [];
    let strokeOpacity = 1;

    signCanvas.addEventListener('pointerdown', (e) => {
      if (currentMode !== 'sign') return;
      isSigning = true;
      signCanvas.setPointerCapture(e.pointerId);
      const rect = signCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      strokeOpacity = parseInt(opacityInput.value) / 100;
      currentStrokePoints = [{ x: x, y: y }];
      drawStrokeOnCanvas(signCtx, currentStrokePoints, fontColorInput.value, parseFloat(strokeWidthInput.value), strokeOpacity);
    });

    signCanvas.addEventListener('pointermove', (e) => {
      if (!isSigning || currentMode !== 'sign') return;
      const rect = signCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      currentStrokePoints.push({ x: x, y: y });

      const len = currentStrokePoints.length;
      if (len >= 2) {
        drawStrokeOnCanvas(
          signCtx,
          [currentStrokePoints.at(len - 2), currentStrokePoints.at(len - 1)],
          fontColorInput.value,
          parseFloat(strokeWidthInput.value),
          strokeOpacity
        );
      }
    });

    const finishSignatureStroke = () => {
      if (!isSigning) return;
      isSigning = false;
      if (currentStrokePoints.length > 0) {
        edits.push({
          type: 'sign',
          pageIndex: pageIndex,
          points: currentStrokePoints,
          color: fontColorInput.value,
          lineWidth: parseFloat(strokeWidthInput.value),
          opacity: strokeOpacity
        });
        undoBtn.disabled = false;
        statusBar.textContent = 'Tanda tangan ditambahkan (Opacity ' + Math.round(strokeOpacity * 100) + '%).';
      }
      currentStrokePoints = [];
    };

    signCanvas.addEventListener('pointerup', finishSignatureStroke);
    signCanvas.addEventListener('pointercancel', finishSignatureStroke);

    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'text-layer';
    const textContent = await page.getTextContent();

    textContent.items.forEach((item) => {
      if (!item.str || !item.str.trim()) return;

      const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx.at(2), tx.at(3));
      const posX = tx.at(4);
      const posY = tx.at(5) - fontHeight;
      const itemWidth = (item.width || 20) * RENDER_SCALE;

      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.left = posX + 'px';
      span.style.top = posY + 'px';
      span.style.fontSize = fontHeight + 'px';
      span.style.width = itemWidth + 'px';
      span.style.height = fontHeight + 'px';

      span.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentMode === 'delete') {
          coverArea(pageWrapper, posX - 2, posY - 1, itemWidth + 4, fontHeight + 4, item.str);
        } else if (currentMode === 'edit') {
          detectAndApplyFont(item, textContent.styles, fontHeight);
          createInputBox(pageWrapper, posX, posY, item.str, itemWidth, fontHeight);
        }
      });

      textLayerDiv.appendChild(span);
    });

    let isDrawingBox = false;
    let startX = 0;
    let startY = 0;
    let selBox = null;

    pageWrapper.addEventListener('pointerdown', (e) => {
      if (currentMode !== 'box') return;
      isDrawingBox = true;
      const rect = pageWrapper.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;

      selBox = document.createElement('div');
      selBox.className = 'selection-box';
      selBox.style.left = startX + 'px';
      selBox.style.top = startY + 'px';
      pageWrapper.appendChild(selBox);
    });

    pageWrapper.addEventListener('pointermove', (e) => {
      if (!isDrawingBox || !selBox) return;
      const rect = pageWrapper.getBoundingClientRect();
      const currX = e.clientX - rect.left;
      const currY = e.clientY - rect.top;

      const left = Math.min(startX, currX);
      const top = Math.min(startY, currY);
      const width = Math.abs(currX - startX);
      const height = Math.abs(currY - startY);

      selBox.style.left = left + 'px';
      selBox.style.top = top + 'px';
      selBox.style.width = width + 'px';
      selBox.style.height = height + 'px';
    });

    pageWrapper.addEventListener('pointerup', (e) => {
      if (!isDrawingBox || !selBox) return;
      isDrawingBox = false;
      const rect = pageWrapper.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      const left = Math.min(startX, endX);
      const top = Math.min(startY, endY);
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);

      selBox.remove();
      selBox = null;

      if (width > 5 && height > 5) {
        coverArea(pageWrapper, left, top, width, height, 'Area Gambar');
      }
    });

    pageWrapper.addEventListener('click', (e) => {
      const rect = pageWrapper.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (currentMode === 'pick') {
        const pixel = context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        const r = pixel.at(0);
        const g = pixel.at(1);
        const b = pixel.at(2);
        syncFromRgb(r, g, b);
        const pickedHex = bgHexInput.value.toUpperCase();
        setMode(previousMode);
        statusBar.innerHTML = 'Warna latar diambil: <strong>' + pickedHex + '</strong> | RGB(<strong>' + r + ', ' + g + ', ' + b + '</strong>)';
        return;
      }

      if (currentMode !== 'edit') return;
      if (e.target.closest('.floating-box-wrapper')) return;
      createInputBox(pageWrapper, x, y, '', 0, parseFloat(fontSizeInput.value) * RENDER_SCALE);
    });

    pageWrapper.appendChild(textLayerDiv);
    pdfContainer.appendChild(pageWrapper);
  }
}

function coverArea(pageWrapper, x, y, width, height, label) {
  const pageIndex = parseInt(pageWrapper.dataset.pageIndex);
  const bgHex = bgColorInput.value;

  const coverDiv = document.createElement('div');
  coverDiv.style.position = 'absolute';
  coverDiv.style.left = x + 'px';
  coverDiv.style.top = y + 'px';
  coverDiv.style.width = width + 'px';
  coverDiv.style.height = height + 'px';
  coverDiv.style.backgroundColor = bgHex;
  coverDiv.style.zIndex = '4';
  coverDiv.style.pointerEvents = 'none';
  pageWrapper.appendChild(coverDiv);

  edits.push({
    type: 'delete',
    pageIndex: pageIndex,
    x: x / RENDER_SCALE,
    y: y / RENDER_SCALE,
    width: width / RENDER_SCALE,
    height: height / RENDER_SCALE,
    bgColor: bgHex,
    previewEl: coverDiv
  });

  undoBtn.disabled = false;
  statusBar.textContent = 'Menghapus "' + label + '" dengan warna ' + bgHex.toUpperCase();
}

function detectAndApplyFont(item, styles, renderedHeight) {
  const styleObj = styles ? styles[item.fontName] : null;
  const rawFontName = styleObj ? styleObj.fontFamily : item.fontName;
  const detectedSize = Math.round(renderedHeight / RENDER_SCALE);

  fontSizeInput.value = detectedSize > 0 ? detectedSize : 12;

  const lowerName = String(rawFontName).toLowerCase();
  if (!customFontBytes) {
    if (lowerName.includes('times') || lowerName.includes('serif')) {
fontSelect.value = 'TimesRoman';
} else if (lowerName.includes('courier') || lowerName.includes('mono')) {
fontSelect.value = 'Courier';
} else {
fontSelect.value = 'Helvetica';
}
}
isBold = lowerName.includes('bold') || lowerName.includes('black');
isItalic = lowerName.includes('italic') || lowerName.includes('oblique');
boldBtn.classList.toggle('btn-format-active', isBold);
italicBtn.classList.toggle('btn-format-active', isItalic);
statusBar.innerHTML = 'Font terdeteksi: ' + rawFontName + ' (~' + detectedSize + 'pt).';
}
function createInputBox(pageWrapper, x, y, initialText, oldWidth, oldHeight) {
const existing = document.querySelector('.floating-box-wrapper');
if (existing) {
const oldInput = existing.querySelector('input');
if (oldInput) oldInput.blur();
}
const boxWrapper = document.createElement('div');
boxWrapper.className = 'floating-box-wrapper';
boxWrapper.style.left = x + 'px';
boxWrapper.style.top = y + 'px';
const initialBoxWidth = Math.max(oldWidth || 100, (initialText.length * parseFloat(fontSizeInput.value) * 0.9) + 34);
boxWrapper.style.width = initialBoxWidth + 'px';
const input = document.createElement('input');
input.type = 'text';
input.className = 'floating-input';
input.value = initialText;
input.style.fontSize = (fontSizeInput.value * RENDER_SCALE) + 'px';
input.style.color = fontColorInput.value;
input.style.fontWeight = isBold ? 'bold' : 'normal';
input.style.fontStyle = isItalic ? 'italic' : 'normal';
input.style.textDecoration = isUnderline ? 'underline' : 'none';
input.style.textAlign = textAlign;
input.style.opacity = parseInt(opacityInput.value) / 100;
const handle = document.createElement('div');
handle.className = 'resize-handle';
handle.textContent = '↔';
boxWrapper.appendChild(input);
boxWrapper.appendChild(handle);
pageWrapper.appendChild(boxWrapper);
let userHasTyped = false;
input.addEventListener('input', () => {
userHasTyped = true;
});
function collectCoveredPdfText() {
if (userHasTyped) return;
const boxLeft = x;
const boxRight = x + boxWrapper.offsetWidth;
const boxTop = y;
const boxBottom = y + boxWrapper.offsetHeight;
const spans = pageWrapper.querySelectorAll('.text-layer span');
const matched = [];
spans.forEach((sp) => {
const sLeft = parseFloat(sp.style.left);
const sTop = parseFloat(sp.style.top);
const sRight = sLeft + (parseFloat(sp.style.width) || sp.offsetWidth);
const overlapX = sLeft < boxRight - 4 && sRight > boxLeft + 2;
const overlapY = Math.abs(sTop - boxTop) < (boxBottom - boxTop) * 0.65;
if (overlapX && overlapY) {
matched.push({ left: sLeft, text: sp.textContent });
}
});
if (matched.length > 0) {
matched.sort((a, b) => a.left - b.left);
input.value = matched.map((m) => m.text).join(' ').replace(/\s+/g, ' ').trim();
}
}
let isResizing = false;
let startDragX = 0;
let startBoxWidth = 0;
handle.addEventListener('pointerdown', (e) => {
e.stopPropagation();
e.preventDefault();
isResizing = true;
handle.setPointerCapture(e.pointerId);
startDragX = e.clientX;
startBoxWidth = boxWrapper.offsetWidth;
});
handle.addEventListener('pointermove', (e) => {
if (!isResizing) return;
e.stopPropagation();
const deltaX = e.clientX - startDragX;
const newWidth = Math.max(50, startBoxWidth + deltaX);
boxWrapper.style.width = newWidth + 'px';
collectCoveredPdfText();
});
handle.addEventListener('pointerup', (e) => {
if (!isResizing) return;
e.stopPropagation();
isResizing = false;
collectCoveredPdfText();
input.focus();
});
let isCommitted = false;
const commitText = () => {
if (isResizing || isCommitted) return;
isCommitted = true;
const textValue = input.value.trim();
const finalBoxWidth = boxWrapper.offsetWidth;
const finalBoxHeight = boxWrapper.offsetHeight;
if (textValue) {
const pageIndex = parseInt(pageWrapper.dataset.pageIndex);
const size = parseFloat(fontSizeInput.value);
const bgHex = bgColorInput.value;
const isCovering = coverOldTextCheckbox.checked;
const currentOpacity = parseInt(opacityInput.value) / 100;
// Jika Timpa Lama aktif, gambar blok latar belakang terpisah agar opacity teks tidak membuat latar ikut transparan
let bgCoverEl = null;
if (isCovering) {
bgCoverEl = document.createElement('div');
bgCoverEl.style.position = 'absolute';
bgCoverEl.style.left = x + 'px';
bgCoverEl.style.top = y + 'px';
bgCoverEl.style.width = finalBoxWidth + 'px';
bgCoverEl.style.height = finalBoxHeight + 'px';
bgCoverEl.style.backgroundColor = bgHex;
bgCoverEl.style.zIndex = '4';
bgCoverEl.style.pointerEvents = 'none';
pageWrapper.appendChild(bgCoverEl);
}
const preview = document.createElement('div');
preview.textContent = textValue;
preview.style.position = 'absolute';
preview.style.left = x + 'px';
preview.style.top = y + 'px';
preview.style.width = finalBoxWidth + 'px';
preview.style.minHeight = finalBoxHeight + 'px';
preview.style.fontSize = (size * RENDER_SCALE) + 'px';
preview.style.color = fontColorInput.value;
preview.style.opacity = currentOpacity;
preview.style.fontWeight = isBold ? 'bold' : 'normal';
preview.style.fontStyle = isItalic ? 'italic' : 'normal';
preview.style.textDecoration = isUnderline ? 'underline' : 'none';
preview.style.textAlign = textAlign;
preview.style.padding = '2px 4px';
preview.style.whiteSpace = 'nowrap';
preview.style.zIndex = '4';
preview.style.pointerEvents = 'none';
pageWrapper.appendChild(preview);
const groupWrapper = document.createElement('div');
if (bgCoverEl) groupWrapper.appendChild(bgCoverEl);
groupWrapper.appendChild(preview);
pageWrapper.appendChild(groupWrapper);
let alignedX = x;
if (textAlign === 'center') {
alignedX = x + (finalBoxWidth / 2);
} else if (textAlign === 'right') {
alignedX = x + finalBoxWidth - 4;
}
edits.push({
type: 'text',
pageIndex: pageIndex,
text: textValue,
x: alignedX / RENDER_SCALE,
y: y / RENDER_SCALE,
boxStartX: x / RENDER_SCALE,
boxWidth: finalBoxWidth / RENDER_SCALE,
boxHeight: finalBoxHeight / RENDER_SCALE,
size: size,
color: fontColorInput.value,
opacity: currentOpacity,
bgColor: bgHex,
fontChoice: fontSelect.value,
bold: isBold,
italic: isItalic,
underline: isUnderline,
align: textAlign,
coverOld: isCovering,
oldWidth: finalBoxWidth / RENDER_SCALE,
oldHeight: Math.max(oldHeight, finalBoxHeight) / RENDER_SCALE,
previewEl: groupWrapper
});
undoBtn.disabled = false;
}
if (boxWrapper.parentNode) {
boxWrapper.remove();
}
};
input.addEventListener('keydown', (e) => {
if (e.key === 'Enter') commitText();
if (e.key === 'Escape') {
isCommitted = true;
if (boxWrapper.parentNode) boxWrapper.remove();
}
});
input.addEventListener('blur', () => {
setTimeout(() => {
if (!isResizing && !isCommitted && document.activeElement !== input) {
commitText();
}
}, 120);
});
input.focus();
}
function hexToRgb(hex) {
const bigint = parseInt(hex.slice(1), 16);
const r = ((bigint >> 16) & 255) / 255;
const g = ((bigint >> 8) & 255) / 255;
const b = (bigint & 255) / 255;
return window.PDFLib.rgb(r, g, b);
}
downloadBtn.addEventListener('click', async () => {
if (!currentPdfBytes) return;
statusBar.textContent = 'Sedang memproses file PDF...';
try {
const PDFLibObj = window.PDFLib;
const pdfDoc = await PDFLibObj.PDFDocument.load(currentPdfBytes);
if (window.fontkit) {
pdfDoc.registerFontkit(window.fontkit);
}
const fontMap = {
Helvetica: {
normal: await pdfDoc.embedFont(PDFLibObj.StandardFonts.Helvetica),
bold: await pdfDoc.embedFont(PDFLibObj.StandardFonts.HelveticaBold),
italic: await pdfDoc.embedFont(PDFLibObj.StandardFonts.HelveticaOblique),
boldItalic: await pdfDoc.embedFont(PDFLibObj.StandardFonts.HelveticaBoldOblique)
},
TimesRoman: {
normal: await pdfDoc.embedFont(PDFLibObj.StandardFonts.TimesRoman),
bold: await pdfDoc.embedFont(PDFLibObj.StandardFonts.TimesRomanBold),
italic: await pdfDoc.embedFont(PDFLibObj.StandardFonts.TimesRomanItalic),
boldItalic: await pdfDoc.embedFont(PDFLibObj.StandardFonts.TimesRomanBoldItalic)
},
Courier: {
normal: await pdfDoc.embedFont(PDFLibObj.StandardFonts.Courier),
bold: await pdfDoc.embedFont(PDFLibObj.StandardFonts.CourierBold),
italic: await pdfDoc.embedFont(PDFLibObj.StandardFonts.CourierOblique),
boldItalic: await pdfDoc.embedFont(PDFLibObj.StandardFonts.CourierBoldOblique)
}
};
const customEmbeddedFont = customFontBytes ? await pdfDoc.embedFont(customFontBytes) : null;
const pages = pdfDoc.getPages();
for (const edit of edits) {
if (edit.type === 'sign') continue;
const page = pages.at(edit.pageIndex);
const sizeObj = page.getSize();
if (edit.type === 'delete') {
const pdfY = sizeObj.height - edit.y - edit.height;
page.drawRectangle({
x: edit.x,
y: pdfY,
width: edit.width,
height: edit.height,
color: hexToRgb(edit.bgColor)
});
} else if (edit.type === 'text') {
let selectedFont;
if (edit.fontChoice === 'Custom' && customEmbeddedFont) {
selectedFont = customEmbeddedFont;
} else {
const family = fontMap[edit.fontChoice] || fontMap.Helvetica;
if (edit.bold && edit.italic) {
selectedFont = family.boldItalic;
} else if (edit.bold) {
selectedFont = family.bold;
} else if (edit.italic) {
selectedFont = family.italic;
} else {
selectedFont = family.normal;
}
}
const textWidth = selectedFont.widthOfTextAtSize(edit.text, edit.size);
const pdfY = sizeObj.height - edit.y - edit.size;
const textOpacity = edit.opacity !== undefined ? edit.opacity : 1;
let drawX = edit.x;
if (edit.align === 'center') {
drawX = edit.x - (textWidth / 2);
} else if (edit.align === 'right') {
drawX = edit.x - textWidth;
}
if (edit.coverOld) {
page.drawRectangle({
x: edit.boxStartX || (drawX - 2),
y: pdfY - 3,
width: edit.boxWidth || (Math.max(edit.oldWidth, textWidth) + 4),
height: edit.oldHeight + 2,
color: hexToRgb(edit.bgColor)
});
}
page.drawText(edit.text, {
x: drawX,
y: pdfY,
size: edit.size,
font: selectedFont,
color: hexToRgb(edit.color),
opacity: textOpacity
});
if (edit.underline) {
const lineThickness = Math.max(0.8, edit.size * 0.07);
page.drawLine({
start: { x: drawX, y: pdfY - 2 },
end: { x: drawX + textWidth, y: pdfY - 2 },
thickness: lineThickness,
color: hexToRgb(edit.color),
opacity: textOpacity
});
}
}
}
for (let i = 0; i < pageSignCanvases.length; i++) {
const hasSign = edits.some((ed) => ed.type === 'sign' && ed.pageIndex === i);
if (!hasSign) continue;
const signCanvas = pageSignCanvases.at(i);
const pngDataUrl = signCanvas.toDataURL('image/png');
const pngImage = await pdfDoc.embedPng(pngDataUrl);
const page = pages.at(i);
const sizeObj = page.getSize();
page.drawImage(pngImage, {
x: 0,
y: 0,
width: sizeObj.width,
height: sizeObj.height
});
}
const modifiedPdfBytes = await pdfDoc.save();
const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
const blobUrl = URL.createObjectURL(blob);
const fileName = 'dokumen-diedit-' + Date.now().toString().slice(-5) + '.pdf';
const link = document.createElement('a');
link.href = blobUrl;
link.download = fileName;
link.style.display = 'none';
document.body.appendChild(link);
link.click();
setTimeout(() => {
document.body.removeChild(link);
}, 500);
statusBar.innerHTML = 'Berhasil mengunduh ' + fileName + '! Jika belum terunduh otomatis, klik di sini.';
} catch (err) {
statusBar.textContent = 'Gagal menyimpan: ' + err.message;
}
});