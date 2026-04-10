/* =====================================================
   Background Image Editor — app.js
   Step 1: Canvas init, background image, zoom
   Step 2: Element rendering engine (image / text)
   Step 3: Mouse interaction (select / move / resize / rotate)
   Step 4: Properties panel
   Step 5: Layers panel
   Step 6: LocalStorage recent resources
   Step 7: Presets (save / load)
   Step 8: PNG download
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

  // Elements
  elements: [],
  selectedIndex: -1,

  // Drag state
  drag: {
    active: false,
    type: null,    // 'move' | 'resize' | 'rotate'
    handle: null,  // 'nw' | 'ne' | 'se' | 'sw'
    startX: 0,     // canvas coords at mousedown
    startY: 0,
    elSnap: null,  // shallow copy of element at drag start
    fixedPt: null, // canvas-space opposite corner (for resize)
  },
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
  bindCanvasEvents();
  bindPropsPanel();
  bindPresets();
  renderAll();
  renderRecentImages();
  renderRecentTexts();
  renderPresets();
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
      // Auto-set canvas size to match image
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      state.canvasW = w;
      state.canvasH = h;
      state.canvas.width  = w;
      state.canvas.height = h;
      dom.canvasWInput().value = w;
      dom.canvasHInput().value = h;

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

// ─── Constants ────────────────────────────────────────
const HANDLE_R    = 6;   // resize handle radius (px, canvas space)
const ROT_OFFSET  = 30;  // rotation handle distance above top edge

// ─── Selection handles ────────────────────────────────
function drawSelectionHandles() {
  const { ctx, selectedIndex, elements } = state;
  if (selectedIndex < 0 || selectedIndex >= elements.length) return;
  const el = elements[selectedIndex];

  const handles = getHandles(el);
  const corners = handles.filter(h => h.name !== 'rot');
  const rotH    = handles.find(h => h.name === 'rot');
  const topMid  = handles.find(h => h.name === 'topmid');

  // Bounding box (dashed)
  ctx.save();
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  // Go around corners in order: nw → ne → se → sw → nw
  const order = ['nw', 'ne', 'se', 'sw'];
  order.forEach((name, i) => {
    const h = handles.find(h => h.name === name);
    if (i === 0) ctx.moveTo(h.x, h.y);
    else ctx.lineTo(h.x, h.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // Line to rotation handle
  ctx.beginPath();
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth   = 1.5;
  const nw = handles.find(h => h.name === 'nw');
  const ne = handles.find(h => h.name === 'ne');
  const tmx = (nw.x + ne.x) / 2;
  const tmy = (nw.y + ne.y) / 2;
  ctx.moveTo(tmx, tmy);
  ctx.lineTo(rotH.x, rotH.y);
  ctx.stroke();

  // Corner resize squares
  corners.forEach(h => {
    ctx.fillStyle   = '#fff';
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth   = 1.5;
    ctx.fillRect(h.x - HANDLE_R, h.y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
    ctx.strokeRect(h.x - HANDLE_R, h.y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
  });

  // Rotation handle (circle)
  ctx.beginPath();
  ctx.arc(rotH.x, rotH.y, HANDLE_R, 0, Math.PI * 2);
  ctx.fillStyle   = '#e94560';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  ctx.restore();
}

// ─── Compute handle positions in canvas space ─────────
function getHandles(el) {
  const cx  = el.x;
  const cy  = el.y;
  const rad = (el.rotation || 0) * Math.PI / 180;

  let hw, hh;
  if (el.type === 'image') {
    hw = el.w / 2;
    hh = el.h / 2;
  } else {
    const b = getTextBounds(el);
    hw = b.w / 2;
    hh = b.h / 2;
  }

  function rot(lx, ly) {
    return {
      x: cx + lx * Math.cos(rad) - ly * Math.sin(rad),
      y: cy + lx * Math.sin(rad) + ly * Math.cos(rad),
    };
  }

  return [
    { name: 'nw',  ...rot(-hw, -hh) },
    { name: 'ne',  ...rot( hw, -hh) },
    { name: 'se',  ...rot( hw,  hh) },
    { name: 'sw',  ...rot(-hw,  hh) },
    { name: 'rot', ...rot(0, -hh - ROT_OFFSET) },
  ];
}

// ─── Hit testing ──────────────────────────────────────
/** Convert clientX/Y → canvas logical coords */
function canvasPoint(clientX, clientY) {
  const rect = state.canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / state.zoom,
    y: (clientY - rect.top)  / state.zoom,
  };
}

/** Return handle name at canvas point pt, or null */
function hitTestHandles(el, pt) {
  const handles = getHandles(el);
  for (const h of handles) {
    const dx = pt.x - h.x;
    const dy = pt.y - h.y;
    if (dx * dx + dy * dy <= (HANDLE_R + 4) * (HANDLE_R + 4)) return h.name;
  }
  return null;
}

/** Return true if canvas point pt is inside element body */
function hitTestElement(el, pt) {
  const dx  = pt.x - el.x;
  const dy  = pt.y - el.y;
  const rad = -(el.rotation || 0) * Math.PI / 180;
  // Rotate pt into element local space
  const lx  = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly  = dx * Math.sin(rad) + dy * Math.cos(rad);

  if (el.type === 'image') {
    return Math.abs(lx) <= el.w / 2 + 4 && Math.abs(ly) <= el.h / 2 + 4;
  } else {
    const b = getTextBounds(el);
    return Math.abs(lx) <= b.w / 2 + 8 && Math.abs(ly) <= b.h / 2 + 8;
  }
}

/** Given a corner name, return the name of the opposite corner */
function oppositeCorner(name) {
  return { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' }[name];
}

// ─── Canvas mouse events ──────────────────────────────
function bindCanvasEvents() {
  const canvas = state.canvas;

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup',   onMouseUp);

  // Keyboard: Delete / Backspace to remove selected
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelected();
    }
  });
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  const pt = canvasPoint(e.clientX, e.clientY);
  const { elements, selectedIndex, drag } = state;

  // 1) Check if clicking a handle on currently selected element
  if (selectedIndex >= 0) {
    const el   = elements[selectedIndex];
    const hit  = hitTestHandles(el, pt);
    if (hit) {
      drag.active  = true;
      drag.startX  = pt.x;
      drag.startY  = pt.y;
      drag.elSnap  = { ...el };

      if (hit === 'rot') {
        drag.type   = 'rotate';
        drag.handle = null;
      } else {
        drag.type   = 'resize';
        drag.handle = hit;
        // Find the opposite corner's canvas position (stays fixed during resize)
        const oppName   = oppositeCorner(hit);
        const handles   = getHandles(el);
        drag.fixedPt    = handles.find(h => h.name === oppName);
      }
      e.preventDefault();
      return;
    }
  }

  // 2) Hit test elements from top to bottom
  let found = -1;
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitTestElement(elements[i], pt)) { found = i; break; }
  }

  // If we're leaving a text element, sync its current content to recent list
  if (state.selectedIndex >= 0 && state.selectedIndex !== found) {
    const prev = state.elements[state.selectedIndex];
    if (prev && prev.type === 'text') syncRecentText(prev);
  }

  state.selectedIndex = found;
  updatePropsPanel();
  updateLayersPanel();

  if (found >= 0) {
    drag.active = true;
    drag.type   = 'move';
    drag.handle = null;
    drag.startX = pt.x;
    drag.startY = pt.y;
    drag.elSnap = { ...elements[found] };
    e.preventDefault();
  }

  renderAll();
}

function onMouseMove(e) {
  const { drag, elements, selectedIndex } = state;

  // Update cursor when hovering over canvas
  if (!drag.active) {
    updateCursor(e);
    return;
  }

  const pt  = canvasPoint(e.clientX, e.clientY);
  const el  = elements[selectedIndex];
  if (!el) return;

  const dx = pt.x - drag.startX;
  const dy = pt.y - drag.startY;

  if (drag.type === 'move') {
    el.x = drag.elSnap.x + dx;
    el.y = drag.elSnap.y + dy;

  } else if (drag.type === 'rotate') {
    // Angle from element center to current mouse position
    const angle = Math.atan2(pt.x - el.x, -(pt.y - el.y)) * 180 / Math.PI;
    // Snap to 15° if Shift is held
    el.rotation = e.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle * 10) / 10;

  } else if (drag.type === 'resize') {
    const fp  = drag.fixedPt;              // fixed corner (canvas space)
    const rad = -(drag.elSnap.rotation || 0) * Math.PI / 180;

    // Vector from fixed corner to current mouse in canvas space
    const vx = pt.x - fp.x;
    const vy = pt.y - fp.y;

    // Rotate that vector into element local space
    const lx = vx * Math.cos(rad) - vy * Math.sin(rad);
    const ly = vx * Math.sin(rad) + vy * Math.cos(rad);

    if (el.type === 'image') {
      let newW = Math.max(10, Math.abs(lx));
      let newH = Math.max(10, Math.abs(ly));
      let centerX, centerY;

      if (e.shiftKey) {
        // Uniform scale: use the dimension that grew more
        const origW  = drag.elSnap.w;
        const origH  = drag.elSnap.h;
        const scale  = Math.max(Math.abs(lx) / origW, Math.abs(ly) / origH);
        newW = Math.max(10, scale * origW);
        newH = Math.max(10, scale * origH);

        // Recompute where the dragged corner actually lands in canvas space
        const signX    = lx >= 0 ? 1 : -1;
        const signY    = ly >= 0 ? 1 : -1;
        const fwdRad   = (drag.elSnap.rotation || 0) * Math.PI / 180;
        const draggedX = fp.x + (signX * newW) * Math.cos(fwdRad) - (signY * newH) * Math.sin(fwdRad);
        const draggedY = fp.y + (signX * newW) * Math.sin(fwdRad) + (signY * newH) * Math.cos(fwdRad);
        centerX = (fp.x + draggedX) / 2;
        centerY = (fp.y + draggedY) / 2;
      } else {
        centerX = (fp.x + pt.x) / 2;
        centerY = (fp.y + pt.y) / 2;
      }

      el.w = newW;
      el.h = newH;
      el.x = centerX;
      el.y = centerY;
    } else {
      // For text resize: adjust font size proportionally
      const snap   = drag.elSnap;
      const snapB  = getTextBoundsOf(snap);
      const scale  = Math.max(0.1, Math.abs(lx) / (snapB.w / 2 || 1));
      el.fontSize  = Math.max(8, Math.round(snap.fontSize * scale));

      // New center = midpoint of fixed corner and current mouse
      el.x = (fp.x + pt.x) / 2;
      el.y = (fp.y + pt.y) / 2;
    }
  }

  renderAll();
  updatePropsPanel();
}

function onMouseUp() {
  state.drag.active = false;
  state.drag.type   = null;
}

function updateCursor(e) {
  const { canvas, elements, selectedIndex } = state;
  if (!canvas) return;
  const pt = canvasPoint(e.clientX, e.clientY);

  if (selectedIndex >= 0) {
    const el  = elements[selectedIndex];
    const hit = hitTestHandles(el, pt);
    if (hit === 'rot') { canvas.style.cursor = 'crosshair'; return; }
    if (hit)            { canvas.style.cursor = 'nwse-resize'; return; }
    if (hitTestElement(el, pt)) { canvas.style.cursor = 'move'; return; }
  }

  // Check if over any element
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitTestElement(elements[i], pt)) { canvas.style.cursor = 'pointer'; return; }
  }

  canvas.style.cursor = 'default';
}

/** getTextBounds for an arbitrary el object (not necessarily the live one) */
function getTextBoundsOf(el) {
  const { ctx } = state;
  ctx.font = `${el.fontWeight || 'normal'} ${el.fontSize || 32}px ${el.fontFamily || 'sans-serif'}`;
  const lines = (el.content || '').split('\n');
  const lineH = (el.fontSize || 32) * 1.2;
  let maxW = 0;
  lines.forEach(l => { const m = ctx.measureText(l); if (m.width > maxW) maxW = m.width; });
  return { w: maxW, h: lineH * lines.length };
}

// ─── Event Binding ────────────────────────────────────
function bindEvents() {
  // Background upload button (topbar + placeholder)
  const triggerBgUpload = () => dom.bgFileInput().click();
  document.getElementById('btn-bg-upload').addEventListener('click', triggerBgUpload);
  document.getElementById('btn-bg-upload-placeholder').addEventListener('click', triggerBgUpload);
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

  // ── Download ───────────────────────────────────────
  document.getElementById('btn-download').addEventListener('click', downloadPNG);

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

      // Refresh layer list when layers tab becomes visible
      if (panel === 'right' && tabName === 'layers') updateLayersPanel();
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
      updatePropsPanel();
      saveRecentImage(src, file.name || 'image');
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
  updatePropsPanel();
  saveRecentText(content, el.id);
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

// ─── Layers Panel ─────────────────────────────────────
function updateLayersPanel() {
  const list = document.getElementById('layers-list');
  list.innerHTML = '';

  if (state.elements.length === 0) {
    list.innerHTML = '<p class="empty-msg">요소가 없습니다</p>';
    return;
  }

  // Render top → bottom (reverse of array order so topmost is first)
  [...state.elements].reverse().forEach((el, revIdx) => {
    const i    = state.elements.length - 1 - revIdx; // actual index
    const item = document.createElement('div');
    item.className = 'layer-item' + (i === state.selectedIndex ? ' selected' : '');
    item.dataset.index = i;

    const icon = el.type === 'image' ? '🖼' : '✏️';
    const name = el.type === 'image'
      ? (el.name || 'image').replace(/\.[^.]+$/, '')
      : (el.content || '').split('\n')[0].slice(0, 18) || 'text';

    item.innerHTML = `
      <span class="layer-icon">${icon}</span>
      <span class="layer-name" title="${name}">${name}</span>
      <button class="layer-btn" data-action="up"    title="위로">↑</button>
      <button class="layer-btn" data-action="down"  title="아래로">↓</button>
      <button class="layer-btn" data-action="del"   title="삭제">✕</button>
    `;

    // Click on the row → select
    item.addEventListener('click', (e) => {
      if (e.target.dataset.action) return; // handled by button
      state.selectedIndex = i;
      renderAll();
      updatePropsPanel();
      updateLayersPanel();
    });

    // Buttons
    item.querySelector('[data-action="up"]').addEventListener('click', (e) => {
      e.stopPropagation();
      moveLayer(i, 1);   // move toward end of array = visually up
    });
    item.querySelector('[data-action="down"]').addEventListener('click', (e) => {
      e.stopPropagation();
      moveLayer(i, -1);  // move toward start = visually down
    });
    item.querySelector('[data-action="del"]').addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedIndex = i;
      deleteSelected();
    });

    list.appendChild(item);
  });
}

/** Move element at index i by delta (+1 = up, -1 = down) in render order */
function moveLayer(i, delta) {
  const els  = state.elements;
  const newI = i + delta;
  if (newI < 0 || newI >= els.length) return;

  // Swap
  [els[i], els[newI]] = [els[newI], els[i]];

  // Keep selection tracking
  if (state.selectedIndex === i)    state.selectedIndex = newI;
  else if (state.selectedIndex === newI) state.selectedIndex = i;

  renderAll();
  updateLayersPanel();
  updatePropsPanel();
}

// ─── Properties Panel ─────────────────────────────────
function updatePropsPanel() {
  const { selectedIndex, elements } = state;
  const noSel   = document.getElementById('no-selection-msg');
  const imgPanel = document.getElementById('props-image');
  const txtPanel = document.getElementById('props-text');

  if (selectedIndex < 0 || selectedIndex >= elements.length) {
    noSel.style.display    = '';
    imgPanel.style.display = 'none';
    txtPanel.style.display = 'none';
    return;
  }

  const el = elements[selectedIndex];
  noSel.style.display = 'none';

  if (el.type === 'image') {
    imgPanel.style.display = '';
    txtPanel.style.display = 'none';
    _setVal('prop-img-x',       Math.round(el.x));
    _setVal('prop-img-y',       Math.round(el.y));
    _setVal('prop-img-w',       Math.round(el.w));
    _setVal('prop-img-h',       Math.round(el.h));
    _setRange('prop-img-rot',    el.rotation   || 0,  'prop-img-rot-val',    v => v + '°');
    _setRange('prop-img-radius', el.borderRadius || 0, 'prop-img-radius-val', v => v + '%');
    _setRange('prop-img-opacity', Math.round((el.opacity ?? 1) * 100), 'prop-img-opacity-val', v => v + '%');
  } else {
    imgPanel.style.display = 'none';
    txtPanel.style.display = '';
    _setTextareaVal('prop-text-content', el.content || '');
    _setVal('prop-text-x',    Math.round(el.x));
    _setVal('prop-text-y',    Math.round(el.y));
    _setRange('prop-text-size',    el.fontSize  || 32,  'prop-text-size-val',    v => v + 'px');
    _setRange('prop-text-rot',     el.rotation  || 0,   'prop-text-rot-val',     v => v + '°');
    _setRange('prop-text-opacity', Math.round((el.opacity ?? 1) * 100), 'prop-text-opacity-val', v => v + '%');
    document.getElementById('prop-text-color').value  = el.color      || '#ffffff';
    document.getElementById('prop-text-font').value   = el.fontFamily || 'sans-serif';
    document.getElementById('prop-text-weight').value = el.fontWeight || 'bold';
  }

  // Switch right panel to Props tab
  _activateRightTab('props');
}

function _setVal(id, v)              { document.getElementById(id).value = v; }
function _setTextareaVal(id, v)      { document.getElementById(id).value = v; }
function _setRange(id, v, labelId, fmt) {
  document.getElementById(id).value           = v;
  document.getElementById(labelId).textContent = fmt(v);
}
function _activateRightTab(tabName) {
  document.querySelectorAll('.panel-tab[data-panel="right"]').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  document.querySelectorAll('[id^="right-tab-"]').forEach(p => {
    p.classList.toggle('active', p.id === 'right-tab-' + tabName);
  });
}

// ─── Wire up property input → element ─────────────────
function bindPropsPanel() {
  // ── Image props ───────────────────────────────────────
  _onNum('prop-img-x', v => { _elProp('x', v); });
  _onNum('prop-img-y', v => { _elProp('y', v); });
  _onNum('prop-img-w', v => { _elProp('w', Math.max(1, v)); });
  _onNum('prop-img-h', v => { _elProp('h', Math.max(1, v)); });

  _onRange('prop-img-rot',    'prop-img-rot-val',    v => v + '°',  v => { _elProp('rotation', v); });
  _onRange('prop-img-radius', 'prop-img-radius-val', v => v + '%',  v => { _elProp('borderRadius', v); });
  _onRange('prop-img-opacity', 'prop-img-opacity-val', v => v + '%', v => { _elProp('opacity', v / 100); });

  document.getElementById('btn-delete-element').addEventListener('click', deleteSelected);

  // ── Text props ────────────────────────────────────────
  document.getElementById('prop-text-content').addEventListener('input', (e) => {
    _elProp('content', e.target.value);
  });
  _onNum('prop-text-x', v => { _elProp('x', v); });
  _onNum('prop-text-y', v => { _elProp('y', v); });

  _onRange('prop-text-size',    'prop-text-size-val',    v => v + 'px', v => { _elProp('fontSize', v); });
  _onRange('prop-text-rot',     'prop-text-rot-val',     v => v + '°',  v => { _elProp('rotation', v); });
  _onRange('prop-text-opacity', 'prop-text-opacity-val', v => v + '%',  v => { _elProp('opacity', v / 100); });

  document.getElementById('prop-text-color').addEventListener('input', (e) => {
    _elProp('color', e.target.value);
  });
  document.getElementById('prop-text-font').addEventListener('change', (e) => {
    _elProp('fontFamily', e.target.value);
  });
  document.getElementById('prop-text-weight').addEventListener('change', (e) => {
    _elProp('fontWeight', e.target.value);
  });

  document.getElementById('btn-delete-element-text').addEventListener('click', deleteSelected);
}

/** Set a property on the currently selected element and re-render */
function _elProp(key, val) {
  const el = state.elements[state.selectedIndex];
  if (!el) return;
  el[key] = val;
  renderAll();
}

/** Bind number input → callback */
function _onNum(id, cb) {
  document.getElementById(id).addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) cb(v);
  });
}

/** Bind range input → label + callback */
function _onRange(id, labelId, fmt, cb) {
  document.getElementById(id).addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById(labelId).textContent = fmt(v);
    cb(v);
  });
}

// ─── LocalStorage — Recent Resources ─────────────────
const LS_IMAGES = 'bge_recentImages';
const LS_TEXTS  = 'bge_recentTexts';
const MAX_RECENT = 10;

function lsGet(key)       { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
function lsSet(key, val)  { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('localStorage full', e); } }

// ── Save ─────────────────────────────────────────────
function saveRecentImage(src, name) {
  let items = lsGet(LS_IMAGES);
  // Deduplicate by src
  items = items.filter(it => it.src !== src);
  items.unshift({ src, name, ts: Date.now() });
  items = items.slice(0, MAX_RECENT);
  lsSet(LS_IMAGES, items);
  renderRecentImages();
}

/** Called when a text element is deselected — updates its recent entry in-place */
function syncRecentText(el) {
  const items = lsGet(LS_TEXTS);
  const idx   = items.findIndex(it => it.id === el.id);
  if (idx < 0) return; // not in recent list, nothing to sync
  if (items[idx].content === el.content) return; // no change
  items[idx].content = el.content;
  items[idx].ts      = Date.now();
  lsSet(LS_TEXTS, items);
  renderRecentTexts();
}

function saveRecentText(content, elementId) {
  let items = lsGet(LS_TEXTS);
  // Deduplicate: remove existing entry with same id or same content
  items = items.filter(it => it.id !== elementId && it.content !== content);
  items.unshift({ content, id: elementId || null, ts: Date.now() });
  items = items.slice(0, MAX_RECENT);
  lsSet(LS_TEXTS, items);
  renderRecentTexts();
}

// ── Remove ────────────────────────────────────────────
function removeRecentImage(idx) {
  const items = lsGet(LS_IMAGES);
  items.splice(idx, 1);
  lsSet(LS_IMAGES, items);
  renderRecentImages();
}

function removeRecentText(idx) {
  const items = lsGet(LS_TEXTS);
  items.splice(idx, 1);
  lsSet(LS_TEXTS, items);
  renderRecentTexts();
}

// ── Render Recent Images ──────────────────────────────
function renderRecentImages() {
  const grid  = document.getElementById('recent-images-grid');
  const items = lsGet(LS_IMAGES);
  grid.innerHTML = '';

  if (items.length === 0) {
    grid.innerHTML = '<p class="empty-msg" style="grid-column:1/-1">없음</p>';
    return;
  }

  items.forEach((item, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'resource-item';

    const img = document.createElement('img');
    img.src   = item.src;
    img.title = item.name || 'image';
    img.addEventListener('click', () => addImageFromSrc(item.src, item.name));

    const del = document.createElement('button');
    del.className   = 'del-btn';
    del.textContent = '✕';
    del.title       = '삭제';
    del.addEventListener('click', (e) => { e.stopPropagation(); removeRecentImage(idx); });

    wrap.appendChild(img);
    wrap.appendChild(del);
    grid.appendChild(wrap);
  });
}

// ── Render Recent Texts ───────────────────────────────
function renderRecentTexts() {
  const list  = document.getElementById('recent-texts-list');
  const items = lsGet(LS_TEXTS);
  list.innerHTML = '';

  if (items.length === 0) {
    list.innerHTML = '<p class="empty-msg">없음</p>';
    return;
  }

  items.forEach((item, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'resource-item text-resource';
    wrap.style.cssText = 'aspect-ratio:auto; padding:6px 8px; min-height:36px; margin-bottom:4px; display:flex; align-items:center; gap:4px; border-radius:6px;';

    const label = document.createElement('span');
    label.style.cssText = 'flex:1; font-size:12px; color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
    label.textContent   = item.content.split('\n')[0].slice(0, 30) || '(빈 텍스트)';
    label.title         = item.content;
    label.style.cursor  = 'pointer';
    label.addEventListener('click', () => addTextElement(item.content));

    const del = document.createElement('button');
    del.className   = 'del-btn';
    del.textContent = '✕';
    del.title       = '삭제';
    del.style.cssText = 'position:static; display:flex; flex-shrink:0;';
    del.addEventListener('click', () => removeRecentText(idx));

    wrap.appendChild(label);
    wrap.appendChild(del);
    list.appendChild(wrap);
  });
}

// ── Add image from stored src (no File object) ────────
function addImageFromSrc(src, name) {
  const img = new Image();
  img.onload = () => {
    const maxSide = 400;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxSide || h > maxSide) {
      const ratio = Math.min(maxSide / w, maxSide / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    const el = {
      type: 'image', id: uid(),
      x: Math.round(state.canvasW / 2),
      y: Math.round(state.canvasH / 2),
      w, h, rotation: 0, borderRadius: 0, opacity: 1,
      src, name: name || 'image', img,
    };
    state.elements.push(el);
    state.selectedIndex = state.elements.length - 1;
    showCanvas();
    renderAll();
    onElementsChanged();
    updatePropsPanel();
  };
  img.src = src;
}

// ─── Presets ──────────────────────────────────────────
const LS_PRESETS = 'bge_presets';

function lsGetPresets()        { return lsGet(LS_PRESETS); }
function lsSetPresets(arr)     { lsSet(LS_PRESETS, arr); }

/** Serialize elements[] → JSON-safe (strips HTMLImageElement) */
function serializeElements() {
  return state.elements.map(el => {
    if (el.type === 'image') {
      const { img, ...rest } = el;  // drop the live Image object
      return rest;
    }
    return { ...el };
  });
}

/** Restore serialized elements → live elements[] (rebuilds img from src) */
function deserializeElements(serialized, onDone) {
  const result  = [];
  let   pending = 0;

  if (serialized.length === 0) { onDone(result); return; }

  serialized.forEach((data, i) => {
    result.push(null); // placeholder
    if (data.type === 'image') {
      pending++;
      const img = new Image();
      img.onload = () => {
        result[i] = { ...data, img };
        pending--;
        if (pending === 0) onDone(result);
      };
      img.onerror = () => {
        result[i] = { ...data, img: null };
        pending--;
        if (pending === 0) onDone(result);
      };
      img.src = data.src;
    } else {
      result[i] = { ...data };
    }
  });

  // If no images at all, fire immediately
  if (pending === 0) onDone(result);
}

// ── Save current layout as preset ────────────────────
function savePreset(name) {
  if (!name.trim()) return;
  const presets = lsGetPresets();
  // Overwrite if name already exists
  const existing = presets.findIndex(p => p.name === name.trim());
  const entry = { name: name.trim(), ts: Date.now(), elements: serializeElements() };
  if (existing >= 0) presets[existing] = entry;
  else presets.unshift(entry);
  lsSetPresets(presets);
  renderPresets();
}

// ── Load preset → restore elements[] ─────────────────
function loadPreset(idx) {
  const presets = lsGetPresets();
  const preset  = presets[idx];
  if (!preset) return;

  deserializeElements(preset.elements, (restored) => {
    state.elements      = restored.filter(Boolean);
    state.selectedIndex = -1;
    renderAll();
    onElementsChanged();
    updatePropsPanel();
  });
}

// ── Delete preset ─────────────────────────────────────
function deletePreset(idx) {
  const presets = lsGetPresets();
  presets.splice(idx, 1);
  lsSetPresets(presets);
  renderPresets();
}

// ── Render preset list ────────────────────────────────
function renderPresets() {
  const list    = document.getElementById('presets-list');
  const presets = lsGetPresets();
  list.innerHTML = '';

  if (presets.length === 0) {
    list.innerHTML = '<p class="empty-msg">저장된 프리셋이 없습니다</p>';
    return;
  }

  presets.forEach((preset, idx) => {
    const item = document.createElement('div');
    item.className = 'preset-item';

    const date    = new Date(preset.ts);
    const dateStr = `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    const count   = preset.elements.length;

    item.innerHTML = `
      <span class="preset-name" title="${preset.name}">${preset.name}</span>
      <small style="color:#666;font-size:10px;flex-shrink:0">${count}개 · ${dateStr}</small>
      <button title="불러오기" style="color:#2ecc71">▶</button>
      <button title="삭제"     style="color:#e94560">✕</button>
    `;

    item.querySelectorAll('button')[0].addEventListener('click', (e) => {
      e.stopPropagation();
      loadPreset(idx);
    });
    item.querySelectorAll('button')[1].addEventListener('click', (e) => {
      e.stopPropagation();
      deletePreset(idx);
    });

    // Click on row body also loads
    item.addEventListener('click', () => loadPreset(idx));

    list.appendChild(item);
  });
}

// ── Wire save button ──────────────────────────────────
function bindPresets() {
  document.getElementById('btn-save-preset').addEventListener('click', () => {
    const input = document.getElementById('preset-name-input');
    const name  = input.value.trim();
    if (!name) { input.focus(); return; }
    savePreset(name);
    input.value = '';
  });

  document.getElementById('preset-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const name = e.target.value.trim();
      if (name) { savePreset(name); e.target.value = ''; }
    }
  });
}

// ─── Download (PNG Export) ────────────────────────────
function downloadPNG() {
  // Temporarily deselect so handles don't appear in export
  const prevSelected   = state.selectedIndex;
  state.selectedIndex  = -1;
  renderAll();

  try {
    const dataURL  = state.canvas.toDataURL('image/png');
    const a        = document.createElement('a');
    a.href         = dataURL;
    a.download     = 'bg-editor-' + new Date().toISOString().slice(0,19).replace(/[T:]/g, '-') + '.png';
    a.click();
  } finally {
    // Restore selection
    state.selectedIndex = prevSelected;
    renderAll();
  }
}

// ─── Start ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
