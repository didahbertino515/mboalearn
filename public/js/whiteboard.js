// Tableau blanc collaboratif. Coordonnées logiques 1600×900, mises à l'échelle à l'affichage.
const W = 1600;
const H = 900;
const COLORS = ['#111827', '#dc2626', '#2563eb', '#0b7a4b', '#f59e0b', '#7c3aed', '#ffffff'];
const TOOLS = [
  ['pen', '✏️', 'Stylo', 'Pen'], ['hl', '🖍', 'Surligneur', 'Highlighter'], ['eraser', '🧽', 'Gomme', 'Eraser'],
  ['line', '╱', 'Ligne', 'Line'], ['arrow', '➜', 'Flèche', 'Arrow'], ['rect', '▭', 'Rectangle', 'Rectangle'],
  ['ellipse', '◯', 'Ellipse', 'Ellipse'], ['text', 'T', 'Texte', 'Text'], ['laser', '🔴', 'Pointeur laser', 'Laser'],
];

export class Whiteboard {
  constructor({ bg, ink, live, tools, onOp, upload, labels }) {
    Object.assign(this, { bg, ink, live, toolsEl: tools, onOp, upload, t: labels.t });
    this.strokes = [];
    this.remoteLive = new Map();
    this.images = new Map();
    this.tool = 'pen';
    this.color = COLORS[0];
    this.size = 4;
    this.bgMode = 'grid';
    this.current = null;
    this.lastLiveSent = 0;
    this.renderTools();
    this.bindPointer();
    this.resize();
  }

  renderTools() {
    const t = this.t;
    this.toolsEl.innerHTML = `
      <div class="tool-group">${TOOLS.map(([k, i, fr, en]) => `<button data-tool="${k}" class="${k === this.tool ? 'on' : ''}" title="${t(fr, en)}">${i}</button>`).join('')}</div>
      <div class="tool-group">${COLORS.map((c) => `<button data-color="${c}" class="swatch ${c === this.color ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}<input type="color" data-colorpick value="#111827" title="${t('Couleur', 'Colour')}"></div>
      <div class="tool-group">${[2, 4, 8, 14].map((s) => `<button data-size="${s}" class="${s === this.size ? 'on' : ''}" title="${s}px"><i class="dotsz" style="width:${s + 2}px;height:${s + 2}px"></i></button>`).join('')}</div>
      <div class="tool-group">
        <label class="tbtn" title="${t('Insérer une image / exercice', 'Insert image')}">🖼<input type="file" accept="image/*" hidden data-img></label>
        <select data-bgmode title="${t('Fond', 'Background')}"><option value="grid">▦ ${t('Quadrillé', 'Grid')}</option><option value="lines">☰ ${t('Ligné', 'Lined')}</option><option value="blank">□ ${t('Blanc', 'Blank')}</option></select>
        <button data-act="undo" title="${t('Annuler', 'Undo')}">↶</button>
        <button data-act="clear" title="${t('Tout effacer', 'Clear all')}">🗑</button>
        <button data-act="export" title="${t('Télécharger en image', 'Download as image')}">⬇</button>
      </div>`;
    const el = this.toolsEl;
    el.querySelectorAll('[data-tool]').forEach((b) => { b.onclick = () => { this.tool = b.dataset.tool; this.mark('[data-tool]', b); }; });
    el.querySelectorAll('[data-color]').forEach((b) => { b.onclick = () => { this.color = b.dataset.color; this.mark('[data-color]', b); }; });
    el.querySelector('[data-colorpick]').oninput = (e) => { this.color = e.target.value; this.mark('[data-color]', null); };
    el.querySelectorAll('[data-size]').forEach((b) => { b.onclick = () => { this.size = Number(b.dataset.size); this.mark('[data-size]', b); }; });
    el.querySelector('[data-bgmode]').onchange = (e) => { this.bgMode = e.target.value; this.drawBg(); };
    el.querySelector('[data-act=undo]').onclick = () => this.undo();
    el.querySelector('[data-act=clear]').onclick = () => { if (confirm(t('Effacer tout le tableau pour tout le monde ?', 'Clear the board for everyone?'))) { this.strokes = []; this.redraw(); this.onOp({ type: 'clear' }); } };
    el.querySelector('[data-act=export]').onclick = () => this.export();
    el.querySelector('[data-img]').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const url = await this.upload(f);
      const img = await this.loadImage(url);
      const scale = Math.min(1, (W * 0.6) / img.width, (H * 0.6) / img.height);
      this.commit({ tool: 'image', url, x: 80, y: 80, w: img.width * scale, h: img.height * scale });
      e.target.value = '';
    };
  }

  mark(sel, btn) { this.toolsEl.querySelectorAll(sel).forEach((x) => x.classList.toggle('on', x === btn)); }

  resize() {
    const box = this.live.parentElement;
    const w = box.clientWidth;
    if (!w) return;
    const dpr = window.devicePixelRatio || 1;
    for (const c of [this.bg, this.ink, this.live]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round((w * H / W) * dpr);
    }
    this.scale = this.ink.width / W;
    this.drawBg();
    this.redraw();
  }

  point(e) {
    const r = this.live.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)];
  }

  bindPointer() {
    const c = this.live;
    c.style.touchAction = 'none';
    c.onpointerdown = (e) => {
      const p = this.point(e);
      if (this.tool === 'text') return this.textInput(p, e);
      c.setPointerCapture(e.pointerId);
      this.current = { tool: this.tool, color: this.color, size: this.size, points: [p] };
    };
    c.onpointermove = (e) => {
      if (!this.current) return;
      const p = this.point(e);
      if (['line', 'arrow', 'rect', 'ellipse'].includes(this.current.tool)) this.current.points[1] = p;
      else this.current.points.push(p);
      this.drawLive();
      const now = Date.now();
      if (now - this.lastLiveSent > 60) { this.lastLiveSent = now; this.onOp({ type: 'live', stroke: this.current }); }
    };
    const up = () => {
      if (!this.current) return;
      const s = this.current;
      this.current = null;
      if (s.tool === 'laser') { this.onOp({ type: 'live-end' }); this.drawLive(); return; }
      if (s.points.length === 1) s.points.push([s.points[0][0] + 0.5, s.points[0][1] + 0.5]);
      this.commit(s);
    };
    c.onpointerup = up;
    c.onpointercancel = up;
  }

  textInput([x, y], e) {
    const input = document.createElement('input');
    input.className = 'wb-text';
    const r = this.live.getBoundingClientRect();
    input.style.left = `${e.clientX - r.left}px`;
    input.style.top = `${e.clientY - r.top - 14}px`;
    input.style.color = this.color;
    this.live.parentElement.append(input);
    setTimeout(() => input.focus());
    const done = () => {
      const text = input.value.trim();
      input.remove();
      if (text) this.commit({ tool: 'text', color: this.color, size: this.size, x, y, text });
    };
    input.onkeydown = (ev) => { if (ev.key === 'Enter') done(); if (ev.key === 'Escape') { input.value = ''; done(); } };
    input.onblur = done;
  }

  commit(stroke) {
    stroke.author = 'me';
    this.strokes.push(stroke);
    this.drawStroke(this.ink.getContext('2d'), stroke);
    this.drawLive();
    const { author, ...clean } = stroke;
    this.onOp({ type: 'stroke', stroke: clean });
  }

  undo() {
    const idx = this.strokes.map((s) => s.author).lastIndexOf('me');
    if (idx < 0) return;
    this.strokes.splice(idx, 1);
    this.redraw();
    this.onOp({ type: 'undo' });
  }

  load(strokes) { this.strokes = strokes || []; this.redraw(); }

  apply(op) {
    if (op.type === 'stroke') {
      this.remoteLive.delete(op.author);
      this.strokes.push({ ...op.stroke, author: op.author });
      this.drawStroke(this.ink.getContext('2d'), op.stroke);
      this.drawLive();
    } else if (op.type === 'live') {
      this.remoteLive.set(op.author, op.stroke);
      this.drawLive();
    } else if (op.type === 'live-end') {
      this.remoteLive.delete(op.author);
      this.drawLive();
    } else if (op.type === 'clear') {
      this.strokes = [];
      this.redraw();
    } else if (op.type === 'undo') {
      const idx = this.strokes.map((s) => s.author).lastIndexOf(op.author);
      if (idx >= 0) { this.strokes.splice(idx, 1); this.redraw(); }
    }
  }

  drawBg() {
    const ctx = this.bg.getContext('2d');
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    if (this.bgMode === 'blank') return;
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = this.bgMode === 'grid' ? 40 : 60;
    for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    if (this.bgMode === 'grid') for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    ctx.stroke();
  }

  redraw() {
    const ctx = this.ink.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.ink.width, this.ink.height);
    for (const s of this.strokes) this.drawStroke(ctx, s);
    this.drawLive();
  }

  drawLive() {
    const ctx = this.live.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.live.width, this.live.height);
    for (const s of this.remoteLive.values()) this.drawStroke(ctx, s, true);
    if (this.current) this.drawStroke(ctx, this.current, true);
  }

  loadImage(url) {
    if (this.images.has(url)) return this.images.get(url);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    this.images.set(url, p);
    p.then((img) => { p.img = img; });
    return p;
  }

  drawStroke(ctx, s, live = false) {
    ctx.save();
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.size;
    const pts = s.points || [];
    switch (s.tool) {
      case 'image': {
        const p = this.loadImage(s.url);
        if (p.img) ctx.drawImage(p.img, s.x, s.y, s.w, s.h);
        else p.then(() => this.redraw()).catch(() => {});
        break;
      }
      case 'text':
        ctx.font = `600 ${s.size * 5 + 18}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(s.text, s.x, s.y);
        break;
      case 'laser': {
        const last = pts[pts.length - 1];
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 6;
        this.path(ctx, pts.slice(-12));
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(last[0], last[1], 9, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'line':
      case 'arrow': {
        const [a, b] = [pts[0], pts[1] || pts[0]];
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        if (s.tool === 'arrow') {
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const len = 14 + s.size * 2;
          ctx.beginPath();
          ctx.moveTo(b[0], b[1]);
          ctx.lineTo(b[0] - len * Math.cos(ang - 0.45), b[1] - len * Math.sin(ang - 0.45));
          ctx.lineTo(b[0] - len * Math.cos(ang + 0.45), b[1] - len * Math.sin(ang + 0.45));
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'rect': {
        const [a, b] = [pts[0], pts[1] || pts[0]];
        ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        break;
      }
      case 'ellipse': {
        const [a, b] = [pts[0], pts[1] || pts[0]];
        ctx.beginPath();
        ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'hl':
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = s.size * 4;
        this.path(ctx, pts);
        break;
      case 'eraser':
        if (live) { ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = s.size * 5; this.path(ctx, pts); break; }
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = s.size * 5;
        this.path(ctx, pts);
        break;
      default:
        this.path(ctx, pts);
    }
    ctx.restore();
  }

  // Tracé lissé par courbes quadratiques
  path(ctx, pts) {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  }

  export() {
    const out = document.createElement('canvas');
    out.width = this.ink.width;
    out.height = this.ink.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(this.bg, 0, 0);
    ctx.drawImage(this.ink, 0, 0);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `tableau-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }
}
