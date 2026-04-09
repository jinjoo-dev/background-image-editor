/* =====================================================
   Background Image Editor — app.js
   Step 1: Canvas init, background image, zoom
   Step 2: Element rendering engine (image / text)
   ===================================================== */

// ─── Helpers ──────────────────────────────────────────
let _uidCounter = 0;
function uid() { return 'el_' + (++_uidCounter); }

/**
 * Element shapes:
 *
 * Image: { type:'image', id, x, y, w, h, rotation, borderRadius, opacity, src, name, img }
 * Text:  { type:'text',  id, x, y, content, fontSize, color, fontFamily, fontWeight, rotation, opacity }
 *
 * x, y = center of the element on canvas.
 * rotation = degrees.
 */

// ─── State ────────────────────────────────────────────
const state = {
  canvas: null,
  ctx: null,

  // Canvas logical size
  canvasW: 1200,
  canvasH: 675,

  // Background
  bgImage: null,       // HTMLImageElement or null

  // Zoom
  zoom: 1.0,

  // Elements (populated in later steps)
  elements: [],
  selectedIndex: -1,
};

// ─── DOM refs ─────────────────────────────────────────
const dom = {
  canvas:          () => document.getElementById('editor-canvas'),
  placeholder:     () => document.getElementById('canvas-placeholder'),
  canvasArea:      () => document.getElementById('canvas-area'),
  bgFileInput:     () => document.getElementById('bg-file-input'),
  imgFileInput:    () => document.getElementById('img-file-input'),
  canvasWInput:    () => document.getElementById('canvas-w'),
  canvasHInput:    () => document.getElementById('canvas-h'),
  zoomLabel:       () => document.getElementById('zoom-label'),
};

// ─── Init ─────────────────────────────────────────────
function init() {
  state.canvas = dom.canvas();
  state.ctx    = state.canvas.getContext('2d');

  applyCanvasSize(state.canvasW, state.canvasH);
  bindEvents();
  renderAll();
}

// ─── Canvas Size ──────────────────────────────────────
function applyCanvasSize(w, h) {
  state.canvasW = w;
  state.canvasH = h;
  state.canvas.width  = w;
  state.canvas.height = h;
  renderAll();
}

function fitZoom() {
  const area   = dom.canvasArea();
  const pad    = 40;
  const scaleW = (area.clientWidth  - pad) / state.canvasW;
  const scaleH = (area.clientHeight - pad) / state.canvasH;
  setZoom(Math.min(scaleW, scaleH, 1));
}

function setZoom(z) {
  state.zoom = Math.max(0.1, Math.min(4, z));
  state.canvas.style.width  = Math.round(state.canvasW * state.zoom) + 'px';
  state.canvas.style.height = Math.round(state.canvasH * state.zoom) + 'px';
  dom.zoomLabel().textContent = Math.round(state.zoom * 100) + '%';
}

// ─── Show canvas, hide placeholder ───────────────────
function showCanvas() {
  dom.placeholder().style.display = 'none';
  dom.canvas().style.display      = 'block';
}

// ─── Background Image ─────────────────────────────────
function loadBackground(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.bgImage = img;
      showCanvas();
      fitZoom();
      renderAll();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ─── Render ───────────────────────────────────────────
function renderAll() {
  const { ctx, canvasW, canvasH, bgImage } = state;
  if (!ctx) return;

  // Clear
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Checkerboard background (when no bg image)
  if (!bgImage) {
    drawCheckerboard();
  } else {
    ctx.drawImage(bgImage, 0, 0, canvasW, canvasH);
  }

  // Elements will be drawn here in later steps
  drawElements();

  // Selection handles will be drawn here in later steps
  drawSelectionHandles();
}

function drawCheckerboard() {
  const { ctx, canvasW, canvasH } = state;
  const size = 20;
  for (let y = 0; y < canvasH; y += size) {
    for (let x = 0; x < canvasW; x += size) {
      ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#2a2a3e' : '#1a1a2e';
      ctx.fillRect(x, y, size, size);
    }
  }
}

// ─── Draw all elements ────────────────────────────────
function drawElements() {
  state.elements.forEach((el, i) => {
    if (el.type === 'image') drawImageElement(el);
    else if (el.type === 'text') drawTextElement(el);
  });
}

function drawImageElement(el) {
  if (!el.img) return;
  const { ctx } = state;
  const hw = el.w / 2;
  const hh = el.h / 2;
  const rad = (el.rotation || 0) * Math.PI / 180;

  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  ctx.translate(el.x, el.y);
  ctx.rotate(rad);

  // Rounded clip path
  const r = Math.min(hw, hh) * (el.borderRadius || 0) / 50;
  if (r > 0) {
    roundedRectPath(ctx, -hw, -hh, el.w, el.h, r);
    ctx.clip();
  }

  ctx.drawImage(el.img, -hw, -hh, el.w, el.h);
  ctx.restore();
}

function drawTextElement(el) {
  const { ctx } = state;
  const rad = (el.rotation || 0) * Math.PI / 180;
  const font = `${el.fontWeight || 'normal'} ${el.fontSize || 32}px ${el.fontFamily || 'sans-serif'}`;

  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  ctx.translate(el.x, el.y);
  ctx.rotate(rad);
  ctx.font      = font;
  ctx.fillStyle = el.color || '#ffffff';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // Support multi-line
  const lines    = (el.content || '').split('\n');
  const lineH    = (el.fontSize || 32) * 1.2;
  const totalH   = lineH * lines.length;
  const startY   = -(totalH - lineH) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, 0, startY + i * lineH);
  });

  ctx.restore();
}

// ─── Rounded rect path helper ─────────────────────────
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

// ─── Get text bounding box (for hit testing later) ───
function getTextBounds(el) {
  const { ctx } = state;
  ctx.font = `${el.fontWeight || 'normal'} ${el.fontSize || 32}px ${el.fontFamily || 'sans-serif'}`;
  const lines  = (el.content || '').split('\n');
  const lineH  = (el.fontSize || 32) * 1.2;
  let maxW = 0;
  lines.forEach(l => {
    const m = ctx.measureText(l);
    if (m.width > maxW) maxW = m.width;
  });
  return { w: maxW, h: lineH * lines.length };
}

// Stub — implemented in Step 3
function drawSelectionHandles() {}

// ─── Event Binding ────────────────────────────────────
function bindEvents() {
  // Background upload button
  document.getElementById('btn-bg-upload').addEventListener('click', () => {
    dom.bgFileInput().click();
  });
  dom.bgFileInput().addEventListener('change', (e) => {
    if (e.target.files[0]) {
      loadBackground(e.target.files[0]);
      e.target.value = '';
    }
  });

  // Canvas drag-over / drop for background
  dom.canvasArea().addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  dom.canvasArea().addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      loadBackground(file);
    }
  });

  // Canvas size apply
  document.getElementById('btn-apply-size').addEventListener('click', () => {
    const w = parseInt(dom.canvasWInput().value, 10);
    const h = parseInt(dom.canvasHInput().value, 10);
    if (w > 0 && h > 0) {
      applyCanvasSize(w, h);
      showCanvas();
      fitZoom();
    }
  });

  // Zoom controls
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    setZoom(state.zoom + 0.1);
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    setZoom(state.zoom - 0.1);
  });
  document.getElementById('btn-zoom-fit').addEventListener('click', fitZoom);

  // Mousewheel zoom on canvas area
  dom.canvasArea().addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom(state.zoom + delta);
    }
  }, { passive: false });

  // ── Add Image ──────────────────────────────────────
  document.getElementById('btn-add-image').addEventListener('click', () => {
    dom.imgFileInput().click();
  });
  dom.imgFileInput().addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      addImageFromFile(file);
      e.target.value = '';
    }
  });

  // ── Add Text (topbar button) ────────────────────────
  document.getElementById('btn-add-text').addEventListener('click', () => {
    // Focus the left panel text input
    document.querySelector('[data-panel="left"][data-tab="recent"]').click();
    document.getElementById('text-input').focus();
  });

  // ── Add Text (left panel button) ───────────────────
  document.getElementById('btn-add-text-from-input').addEventListener('click', () => {
    const content = document.getElementById('text-input').value.trim();
    if (!content) return;
    addTextElement(content);
    document.getElementById('text-input').value = '';
  });
  document.getElementById('text-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      const content = e.target.value.trim();
      if (content) {
        addTextElement(content);
        e.target.value = '';
      }
    }
  });

  // Panel tabs
  document.querySelectorAll('.panel-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const panel   = tab.dataset.panel;   // 'left' or 'right'
      const tabName = tab.dataset.tab;

      // Update tab button styles
      document.querySelectorAll(`.panel-tab[data-panel="${panel}"]`).forEach(t => {
        t.classList.toggle('active', t === tab);
      });

      // Show/hide panes
      const prefix = panel === 'left' ? 'left-tab-' : 'right-tab-';
      document.querySelectorAll(`[id^="${prefix}"]`).forEach(pane => {
        pane.classList.toggle('active', pane.id === prefix + tabName);
      });
    });
  });
}

// ─── Add Image Element ────────────────────────────────
function addImageFromFile(file, opts = {}) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const src = e.target.result;
    const img = new Image();
    img.onload = () => {
      // Default size: fit within 400px keeping aspect ratio
      const maxSide = 400;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxSide || h > maxSide) {
        const ratio = Math.min(maxSide / w, maxSide / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const el = {
        type: 'image',
        id: uid(),
        x: opts.x ?? Math.round(state.canvasW / 2),
        y: opts.y ?? Math.round(state.canvasH / 2),
        w,
        h,
        rotation: 0,
        borderRadius: 0,
        opacity: 1,
        src,
        name: file.name || 'image',
        img,
      };

      state.elements.push(el);
      state.selectedIndex = state.elements.length - 1;
      showCanvas();
      renderAll();
      onElementsChanged();
    };
    img.src = src;
  };
  reader.readAsDataURL(file);
}

// ─── Add Text Element ─────────────────────────────────
function addTextElement(content, opts = {}) {
  const el = {
    type: 'text',
    id: uid(),
    x: opts.x ?? Math.round(state.canvasW / 2),
    y: opts.y ?? Math.round(state.canvasH / 2),
    content,
    fontSize: opts.fontSize ?? 48,
    color: opts.color ?? '#ffffff',
    fontFamily: opts.fontFamily ?? 'sans-serif',
    fontWeight: opts.fontWeight ?? 'bold',
    rotation: 0,
    opacity: 1,
  };

  state.elements.push(el);
  state.selectedIndex = state.elements.length - 1;
  showCanvas();
  renderAll();
  onElementsChanged();
}

// ─── Delete selected element ──────────────────────────
function deleteSelected() {
  if (state.selectedIndex < 0) return;
  state.elements.splice(state.selectedIndex, 1);
  state.selectedIndex = Math.min(state.selectedIndex, state.elements.length - 1);
  renderAll();
  onElementsChanged();
  updatePropsPanel();
}

// Hook for steps 4-7 (panels, storage, presets)
function onElementsChanged() {
  updateLayersPanel();
}

// Stubs — implemented in later steps
function updateLayersPanel() {}
function updatePropsPanel() {}

// ─── Start ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
