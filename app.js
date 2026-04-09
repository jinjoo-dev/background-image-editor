/* =====================================================
   Background Image Editor — app.js
   Step 1: Canvas init, background image, zoom
   ===================================================== */

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

// Stubs — implemented in later steps
function drawElements() {}
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

// ─── Start ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
