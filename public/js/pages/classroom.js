// Classe virtuelle : visioconférence WebRTC (maillage pair-à-pair), tableau blanc collaboratif,
// notes partagées, chat, fichiers, vocabulaire, enregistrement local et mode économie de données.
import { state, api, t, html, avatar, toast, fileToDataUrl, fmtTime } from '../core.js';
import { Whiteboard } from '../whiteboard.js';

export default async function classroom(app, { args }) {
  const roomId = args[0];
  const info = await api(`/rooms/${roomId}`);
  const me = state.user;
  let local = null;            // MediaStream locale (micro + caméra)
  let screenTrack = null;
  let recorder = null;
  let eco = false;
  let handUp = false;
  const peers = new Map();     // socketId -> { pc, user, tile, polite, makingOffer, ignoreOffer, stream, media }
  const socket = state.socket;
  if (!socket) throw new Error(t('Connexion temps réel indisponible', 'Real-time connection unavailable'));

  // ------------------------------------------------------------------ Salle d'attente
  app.innerHTML = html`
  <div class="lobby container">
    <div class="card lobby-card">
      <h1>${info.title}</h1>
      <p class="muted">🗓 ${new Date(info.start_at).toLocaleString()} · ${info.duration_min} min</p>
      <div class="lobby-grid">
        <div class="preview"><video data-preview autoplay playsinline muted></video><div class="preview-off" data-preview-off hidden>${avatar(me.name, me.avatar, 80)}</div>
          <div class="meter"><i data-meter></i></div></div>
        <div class="stack">
          <label class="field"><span>🎥 ${t('Caméra', 'Camera')}</span><select data-cam></select></label>
          <label class="field"><span>🎙 ${t('Micro', 'Microphone')}</span><select data-mic></select></label>
          <label class="check"><input type="checkbox" data-eco-start> 📶 ${t('Mode économie de données (3G)', 'Data-saver mode (3G)')}</label>
          <p class="small muted">${t('Astuce : utilisez des écouteurs pour éviter l\'écho. En cas de réseau faible, activez le mode économie de données.', 'Tip: use headphones to avoid echo.')}</p>
          <button class="btn primary block" data-enter>${t('Entrer dans la classe', 'Enter the classroom')}</button>
        </div>
      </div>
    </div>
  </div>`;

  const preview = app.querySelector('[data-preview]');
  let meterStop = null;
  async function getMedia(camId, micId) {
    local?.getTracks().forEach((tr) => tr.stop());
    const attempts = [
      { video: camId ? { deviceId: { exact: camId } } : { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: micId ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true } },
      { audio: true },
    ];
    for (const c of attempts) {
      try { local = await navigator.mediaDevices.getUserMedia(c); return local; } catch { /* essai suivant */ }
    }
    local = new MediaStream();
    toast(t('Caméra/micro non disponibles : vous rejoignez en mode spectateur.', 'No camera/mic: joining as viewer.'), 'error');
    return local;
  }
  async function fillDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devs = await navigator.mediaDevices.enumerateDevices();
    const opt = (kind, sel) => {
      const cur = local?.getTracks().find((tr) => tr.kind === (kind === 'videoinput' ? 'video' : 'audio'))?.getSettings().deviceId;
      sel.innerHTML = devs.filter((d) => d.kind === kind).map((d, i) => html`<option value="${d.deviceId}" ${d.deviceId === cur ? 'selected' : ''}>${d.label || `${kind} ${i + 1}`}</option>`).join('') || `<option value="">${t('Aucun', 'None')}</option>`;
    };
    opt('videoinput', app.querySelector('[data-cam]'));
    opt('audioinput', app.querySelector('[data-mic]'));
  }
  function startMeter(stream, bar) {
    const track = stream.getAudioTracks()[0];
    if (!track || !window.AudioContext) return () => {};
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    ctx.createMediaStreamSource(new MediaStream([track])).connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    let raf;
    const loop = () => { an.getByteFrequencyData(data); bar.style.width = `${Math.min(100, (data.reduce((a, b) => a + b, 0) / data.length) * 2)}%`; raf = requestAnimationFrame(loop); };
    loop();
    return () => { cancelAnimationFrame(raf); ctx.close(); };
  }
  const refreshPreview = () => {
    preview.srcObject = local;
    app.querySelector('[data-preview-off]').hidden = !!local.getVideoTracks().length;
    meterStop?.();
    meterStop = startMeter(local, app.querySelector('[data-meter]'));
  };
  await getMedia();
  refreshPreview();
  await fillDevices();
  app.querySelector('[data-cam]').onchange = app.querySelector('[data-mic]').onchange = async () => {
    await getMedia(app.querySelector('[data-cam]').value, app.querySelector('[data-mic]').value);
    refreshPreview();
  };

  let teardown = () => { meterStop?.(); local?.getTracks().forEach((tr) => tr.stop()); };
  app.querySelector('[data-enter]').onclick = () => {
    eco = app.querySelector('[data-eco-start]').checked;
    meterStop?.();
    enterRoom();
  };

  // ------------------------------------------------------------------ Salle
  function enterRoom() {
    const end = Date.parse(info.start_at) + info.duration_min * 60000;
    app.innerHTML = html`
    <div class="room">
      <header class="room-top">
        <a href="#/lessons" class="room-logo">Mboa<b>Learn</b></a>
        <b class="room-title ellipsis">${info.title}</b>
        <span class="timer" data-timer></span>
        <span class="rec-ind" data-rec hidden>● REC</span>
        <span class="net" data-net title="${t('Qualité réseau', 'Network quality')}">📶</span>
      </header>
      <div class="room-body">
        <section class="stage" data-stage>
          <div class="board-wrap" data-boardwrap>
            <div class="board-tools" data-tools></div>
            <div class="board" data-board><canvas data-bg></canvas><canvas data-ink></canvas><canvas data-live></canvas></div>
          </div>
          <div class="tiles" data-tiles></div>
          <div class="reactions" data-reactions></div>
        </section>
        <aside class="side" data-side>
          <nav class="side-tabs">${[['chat', '💬', t('Chat', 'Chat')], ['notes', '🗒', t('Notes', 'Notes')], ['files', '📁', t('Fichiers', 'Files')], ['people', '👥', t('Participants', 'People')], ...(me.role === 'student' ? [['vocab', '🧠', t('Vocabulaire', 'Vocabulary')]] : [])]
            .map(([k, i, l], n) => html`<button data-tab="${k}" class="${n === 0 ? 'active' : ''}" title="${l}">${i}<span>${l}</span></button>`)}</nav>
          <div class="side-panel" data-panel="chat"><div class="room-chat" data-chat></div>
            <form class="chat-form" data-chatform><input name="text" placeholder="${t('Message…', 'Message…')}" autocomplete="off"><button class="btn primary sm">➤</button></form></div>
          <div class="side-panel" data-panel="notes" hidden><p class="small muted">${t('Notes partagées, enregistrées automatiquement et disponibles après le cours.', 'Shared notes, autosaved and available after the lesson.')}</p><textarea data-notes></textarea></div>
          <div class="side-panel" data-panel="files" hidden><label class="btn ghost block">⬆ ${t('Partager un document', 'Share a document')}<input type="file" hidden data-upload accept="image/*,.pdf,.doc,.docx,.pptx,.txt,audio/*"></label><div data-files class="files"></div></div>
          <div class="side-panel" data-panel="people" hidden><div data-people></div></div>
          <div class="side-panel" data-panel="vocab" hidden>
            <form class="stack" data-vocab><input name="word" placeholder="${t('Nouveau mot', 'New word')}" required><input name="translation" placeholder="${t('Traduction', 'Translation')}"><input name="example" placeholder="${t('Exemple', 'Example')}"><button class="btn primary sm">+ ${t('Enregistrer', 'Save')}</button></form>
            <ul data-vocablist class="vocab-mini"></ul></div>
        </aside>
      </div>
      <footer class="controls">
        <button class="ctl" data-c="mic" title="${t('Micro', 'Mic')}">🎙</button>
        <button class="ctl" data-c="cam" title="${t('Caméra', 'Camera')}">🎥</button>
        <button class="ctl" data-c="screen" title="${t("Partager l'écran", 'Share screen')}">🖥</button>
        <button class="ctl on" data-c="board" title="${t('Tableau blanc', 'Whiteboard')}">✏️</button>
        <button class="ctl ${eco ? 'on' : ''}" data-c="eco" title="${t('Économie de données', 'Data saver')}">📶</button>
        <button class="ctl" data-c="hand" title="${t('Lever la main', 'Raise hand')}">✋</button>
        <div class="react-pick">${['👍', '👏', '😂', '❤️', '🎉', '❓'].map((e) => html`<button data-react="${e}">${e}</button>`)}</div>
        <button class="ctl" data-c="rec" title="${t('Enregistrer', 'Record')}">⏺</button>
        <button class="ctl" data-c="side" title="${t('Panneau', 'Panel')}">☰</button>
        ${info.is_host && info.kind === 'lesson' ? html`<button class="btn ghost sm light" data-c="finish">✓ ${t('Terminer le cours', 'End lesson')}</button>` : ''}
        <button class="ctl leave" data-c="leave" title="${t('Quitter', 'Leave')}">📞</button>
      </footer>
    </div>`;

    const $ = (s) => app.querySelector(s);
    const tiles = $('[data-tiles]');

    // ------------------------------------------------ Tuiles vidéo
    function makeTile(id, user, stream, isLocal = false) {
      const el = document.createElement('div');
      el.className = `tile ${isLocal ? 'local' : ''}`;
      el.dataset.peer = id;
      el.innerHTML = html`<video autoplay playsinline ${isLocal ? 'muted' : ''}></video><div class="tile-off">${avatar(user.name, user.avatar, 64)}</div>
        <div class="tile-name">${isLocal ? t('Vous', 'You') : user.name}${user.isHost ? ' 🧑‍🏫' : ''} <span data-hand hidden>✋</span> <span data-muted hidden>🔇</span></div>`.toString();
      el.querySelector('video').srcObject = stream;
      el.ondblclick = () => el.classList.toggle('spot');
      tiles.append(el);
      updateTile(el, stream);
      return el;
    }
    function updateTile(el, stream) {
      const v = stream?.getVideoTracks().find((tr) => tr.readyState === 'live' && tr.enabled);
      el.classList.toggle('no-video', !v);
    }
    const localTile = makeTile('local', { ...me, isHost: info.is_host }, local, true);

    // ------------------------------------------------ WebRTC (négociation « parfaite »)
    const signal = (to, data) => socket.emit('rtc:signal', { to, data });
    // initiator = true pour le participant qui arrive : lui seul envoie la première offre.
    // Celui qui était déjà présent attend cette offre (évite les offres croisées, source de blocages).
    function createPeer(id, user, initiator) {
      const pc = new RTCPeerConnection({ iceServers: info.ice_servers });
      const stream = new MediaStream();
      const peer = { pc, user, polite: socket.id > id, makingOffer: false, ignoreOffer: false, stream, queue: Promise.resolve(), pendingIce: [], initiator, waitForOffer: !initiator };
      peer.tile = makeTile(id, user, stream);
      peers.set(id, peer);
      local.getTracks().forEach((tr) => pc.addTrack(tr, local));
      if (screenTrack) replaceVideo(pc, screenTrack);
      pc.ontrack = ({ track }) => {
        stream.addTrack(track);
        track.onunmute = () => updateTile(peer.tile, stream);
        track.onended = () => { stream.removeTrack(track); updateTile(peer.tile, stream); };
        peer.tile.querySelector('video').srcObject = stream;
        updateTile(peer.tile, stream);
      };
      pc.onicecandidate = ({ candidate }) => candidate && signal(id, { candidate });
      pc.onnegotiationneeded = async () => {
        if (peer.waitForOffer) return;
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          signal(id, { description: pc.localDescription });
        } catch (e) { console.warn(e); } finally { peer.makingOffer = false; }
      };
      // Filet de sécurité : si la connexion n'aboutit pas, on relance la négociation ICE
      peer.watchdog = setInterval(() => {
        if (['connected', 'closed'].includes(pc.connectionState)) { clearInterval(peer.watchdog); return; }
        if (peer.waitForOffer) { peer.waitForOffer = false; pc.dispatchEvent(new Event('negotiationneeded')); return; }
        if (pc.signalingState === 'stable' && !peer.makingOffer && peer.initiator) pc.restartIce();
      }, 8000);
      pc.onconnectionstatechange = () => {
        peer.tile.classList.toggle('reconnecting', ['disconnected', 'failed'].includes(pc.connectionState));
        if (pc.connectionState === 'failed') pc.restartIce();
      };
      applyEco(pc);
      return peer;
    }
    // Les messages de signalisation d'un même pair sont traités un par un, dans l'ordre d'arrivée :
    // sinon, lorsque les deux participants entrent en même temps (offres croisées), des candidats ICE
    // arrivent avant la description distante, sont rejetés et la connexion ne s'établit jamais.
    function onSignal(msg) {
      const peer = peers.get(msg.from);
      if (!peer) return;
      peer.queue = peer.queue.then(() => handleSignal(peer, msg)).catch((e) => console.warn('[rtc]', e));
    }
    async function handleSignal(peer, { from, data }) {
      const { pc } = peer;
      if (data.description) {
        const collision = data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          signal(from, { description: pc.localDescription });
          peer.waitForOffer = false;
        }
        // Candidats reçus trop tôt : on les applique maintenant que la description distante est connue
        const pending = peer.pendingIce.splice(0);
        for (const c of pending) await pc.addIceCandidate(c).catch(() => {});
      } else if (data.candidate) {
        if (!pc.remoteDescription) { peer.pendingIce.push(data.candidate); return; }
        try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!peer.ignoreOffer) throw e; }
      }
    }
    function removePeer(id) {
      const p = peers.get(id);
      if (!p) return;
      clearInterval(p.watchdog);
      p.pc.close();
      p.tile.remove();
      peers.delete(id);
      renderPeople();
    }
    function replaceVideo(pc, track) {
      const sender = pc.getSenders().find((s) => s._video || s.track?.kind === 'video');
      if (sender) { sender._video = true; return sender.replaceTrack(track); }
      if (track) pc.addTrack(track, local)._video = true;
      return null;
    }
    // Mode 3G : réduit fortement le débit vidéo envoyé
    function applyEco(pc) {
      for (const s of pc.getSenders()) {
        if (s.track?.kind !== 'video') continue;
        const p = s.getParameters();
        if (!p.encodings?.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = eco ? 120_000 : 1_200_000;
        p.encodings[0].scaleResolutionDownBy = eco ? 4 : 1;
        s.setParameters(p).catch(() => {});
      }
    }

    // ------------------------------------------------ Tableau blanc
    const wb = new Whiteboard({
      bg: $('[data-bg]'), ink: $('[data-ink]'), live: $('[data-live]'), tools: $('[data-tools]'),
      onOp: (op) => socket.emit('wb:op', op),
      upload: async (file) => (await api(`/rooms/${roomId}/files`, { method: 'POST', body: { name: file.name, data: await fileToDataUrl(file) } })).url,
      labels: { t },
    });

    // ------------------------------------------------ Événements socket
    const handlers = {
      'rtc:signal': onSignal,
      'room:peer-joined': ({ socketId, user }) => { createPeer(socketId, user, false); renderPeople(); sys(`${user.name} ${t('a rejoint la classe', 'joined')}`); },
      'room:peer-left': ({ socketId }) => { const n = peers.get(socketId)?.user.name; removePeer(socketId); if (n) sys(`${n} ${t('a quitté la classe', 'left')}`); },
      'wb:op': (op) => wb.apply(op),
      'notes:update': ({ content }) => { const ta = $('[data-notes]'); if (document.activeElement !== ta) ta.value = content; },
      'room:chat': (m) => addChat(m),
      'room:media': ({ socketId, state: st }) => {
        const p = peers.get(socketId);
        if (!p) return;
        p.tile.querySelector('[data-muted]').hidden = st.audio !== false;
        p.tile.classList.toggle('no-video', st.video === false);
      },
      'room:hand': ({ socketId, name, raised }) => {
        const tile = socketId === socket.id ? localTile : peers.get(socketId)?.tile;
        if (tile) tile.querySelector('[data-hand]').hidden = !raised;
        if (raised && socketId !== socket.id) toast(`✋ ${name} ${t('lève la main', 'raised a hand')}`);
        renderPeople();
      },
      'room:reaction': ({ name, emoji }) => {
        const el = document.createElement('span');
        el.className = 'float-emoji';
        el.textContent = emoji;
        el.title = name;
        el.style.left = `${10 + Math.random() * 70}%`;
        $('[data-reactions]').append(el);
        setTimeout(() => el.remove(), 2500);
      },
      'room:force-mute': () => { setMic(false); toast(t('Le professeur a coupé votre micro', 'The teacher muted you')); },
    };
    Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));

    socket.emit('room:join', roomId, (res) => {
      if (res.error) { toast(res.error, 'error'); location.hash = '#/lessons'; return; }
      res.peers.forEach(({ socketId, user }) => createPeer(socketId, user, true));
      wb.load(res.strokes);
      $('[data-notes]').value = res.notes || '';
      renderPeople();
      broadcastMedia();
      sys(t('Vous êtes dans la classe. Double-cliquez sur une vidéo pour l\'agrandir.', 'You are in. Double-click a video to enlarge it.'));
    });

    // ------------------------------------------------ Panneau latéral
    app.querySelectorAll('[data-tab]').forEach((b) => {
      b.onclick = () => {
        app.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
        app.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
        $('[data-side]').classList.add('open');
      };
    });
    const chatBox = $('[data-chat]');
    function addChat(m) {
      const mine = m.from.id === me.id;
      chatBox.insertAdjacentHTML('beforeend', html`<div class="bubble ${mine ? 'me' : ''}">${mine ? '' : html`<b>${m.from.name}</b><br>`}${m.text}${m.file ? html`<a class="att" href="${m.file.url}" target="_blank" rel="noopener">📄 ${m.file.name}</a>` : ''}<small>${fmtTime(m.at)}</small></div>`.toString());
      chatBox.scrollTop = chatBox.scrollHeight;
      if (m.file) $('[data-files]').insertAdjacentHTML('afterbegin', html`<a class="file" href="${m.file.url}" target="_blank" rel="noopener">📄 ${m.file.name}<small>${m.from.name}</small></a>`.toString());
      if (!mine && $('[data-panel=chat]').hidden) app.querySelector('[data-tab=chat]').classList.add('ping');
    }
    function sys(text) { chatBox.insertAdjacentHTML('beforeend', html`<div class="sys">${text}</div>`.toString()); chatBox.scrollTop = chatBox.scrollHeight; }
    $('[data-chatform]').onsubmit = (e) => {
      e.preventDefault();
      const text = e.target.text.value.trim();
      if (text) socket.emit('room:chat', { text });
      e.target.text.value = '';
    };
    let notesTimer;
    $('[data-notes]').oninput = (e) => { clearTimeout(notesTimer); notesTimer = setTimeout(() => socket.emit('notes:update', { content: e.target.value }), 400); };
    $('[data-upload]').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 10 * 1024 * 1024) return toast(t('Fichier trop volumineux (10 Mo max)', 'File too large'), 'error');
      try {
        const r = await api(`/rooms/${roomId}/files`, { method: 'POST', body: { name: f.name, data: await fileToDataUrl(f) } });
        socket.emit('room:chat', { text: t('a partagé un document', 'shared a document'), file: r });
      } catch (err) { toast(err.message, 'error'); }
      e.target.value = '';
    };
    function renderPeople() {
      const list = [{ id: socket.id, user: { ...me, isHost: info.is_host }, self: true }, ...[...peers.entries()].map(([id, p]) => ({ id, user: p.user }))];
      $('[data-people]').innerHTML = list.map((p) => html`<div class="line row between">${avatar(p.user.name, p.user.avatar, 30)}<span class="grow">${p.user.name}${p.self ? ` (${t('vous', 'you')})` : ''}${p.user.isHost ? ' 🧑‍🏫' : ''}</span>
        ${info.is_host && !p.self ? html`<button class="btn ghost sm" data-mute="${p.id}">🔇</button>` : ''}</div>`).join('');
      app.querySelectorAll('[data-mute]').forEach((b) => { b.onclick = () => socket.emit('room:mute', { socketId: b.dataset.mute }); });
    }
    const vocabForm = $('[data-vocab]');
    if (vocabForm) {
      vocabForm.onsubmit = async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(vocabForm).entries());
        await api('/learning/vocab', { method: 'POST', body: d });
        $('[data-vocablist]').insertAdjacentHTML('afterbegin', html`<li><b>${d.word}</b> — ${d.translation}</li>`.toString());
        vocabForm.reset();
      };
    }

    // ------------------------------------------------ Commandes
    const ctl = (k) => app.querySelector(`[data-c=${k}]`);
    function broadcastMedia() {
      const a = local.getAudioTracks()[0];
      const v = local.getVideoTracks()[0];
      ctl('mic').classList.toggle('off', !a?.enabled);
      ctl('cam').classList.toggle('off', !v?.enabled && !screenTrack);
      socket.emit('room:media', { audio: !!a?.enabled, video: !!(v?.enabled || screenTrack) });
      updateTile(localTile, screenTrack ? new MediaStream([screenTrack]) : local);
    }
    function setMic(on) { local.getAudioTracks().forEach((tr) => { tr.enabled = on; }); broadcastMedia(); }
    async function stopScreen() {
      if (!screenTrack) return;
      screenTrack.stop();
      screenTrack = null;
      const cam = local.getVideoTracks()[0] || null;
      for (const p of peers.values()) await replaceVideo(p.pc, cam);
      localTile.querySelector('video').srcObject = local;
      ctl('screen').classList.remove('on');
      broadcastMedia();
    }
    const actions = {
      mic: () => { const a = local.getAudioTracks()[0]; if (!a) return toast(t('Aucun micro', 'No microphone'), 'error'); setMic(!a.enabled); },
      cam: () => { const v = local.getVideoTracks()[0]; if (!v) return toast(t('Aucune caméra', 'No camera'), 'error'); v.enabled = !v.enabled; broadcastMedia(); },
      screen: async () => {
        if (screenTrack) return stopScreen();
        try {
          const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
          screenTrack = s.getVideoTracks()[0];
          screenTrack.contentHint = 'detail';
          screenTrack.onended = stopScreen;
          for (const p of peers.values()) replaceVideo(p.pc, screenTrack);
          localTile.querySelector('video').srcObject = new MediaStream([screenTrack, ...local.getAudioTracks()]);
          localTile.classList.remove('no-video');
          ctl('screen').classList.add('on');
          broadcastMedia();
        } catch { /* annulé */ }
      },
      board: () => { const on = $('[data-stage]').classList.toggle('no-board'); ctl('board').classList.toggle('on', !on); setTimeout(() => wb.resize(), 50); },
      eco: () => {
        eco = !eco;
        ctl('eco').classList.toggle('on', eco);
        peers.forEach((p) => applyEco(p.pc));
        toast(eco ? t('Mode économie de données activé (vidéo basse qualité)', 'Data saver on') : t('Qualité vidéo normale', 'Normal video quality'));
      },
      hand: () => { handUp = !handUp; ctl('hand').classList.toggle('on', handUp); socket.emit('room:hand', { raised: handUp }); },
      side: () => $('[data-side]').classList.toggle('open'),
      rec: async () => {
        if (recorder) { recorder.stop(); return; }
        try {
          const disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true });
          const ctx = new AudioContext();
          const dest = ctx.createMediaStreamDestination();
          [disp, local, ...[...peers.values()].map((p) => p.stream)].forEach((s) => { if (s.getAudioTracks().length) ctx.createMediaStreamSource(s).connect(dest); });
          const mixed = new MediaStream([...disp.getVideoTracks(), ...dest.stream.getAudioTracks()]);
          const chunks = [];
          recorder = new MediaRecorder(mixed, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm' });
          recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          recorder.onstop = () => {
            disp.getTracks().forEach((tr) => tr.stop());
            ctx.close();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
            a.download = `cours-${new Date().toISOString().slice(0, 16).replace(':', 'h')}.webm`;
            a.click();
            recorder = null;
            ctl('rec').classList.remove('on');
            $('[data-rec]').hidden = true;
          };
          disp.getVideoTracks()[0].onended = () => recorder?.state === 'recording' && recorder.stop();
          recorder.start(1000);
          ctl('rec').classList.add('on');
          $('[data-rec]').hidden = false;
          socket.emit('room:chat', { text: `⏺ ${t("a démarré l'enregistrement du cours", 'started recording')}` });
        } catch { toast(t('Enregistrement annulé', 'Recording cancelled')); }
      },
      finish: async () => {
        try {
          await api(`/bookings/${info.id}/complete`, { method: 'POST' });
          toast(t('Cours terminé, paiement libéré.', 'Lesson completed, payment released.'), 'success');
          location.hash = '#/dashboard';
        } catch (e) { toast(e.message, 'error'); }
      },
      leave: () => { location.hash = info.is_host ? '#/dashboard' : '#/lessons'; },
    };
    app.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => actions[b.dataset.c](); });
    app.querySelectorAll('[data-react]').forEach((b) => { b.onclick = () => socket.emit('room:reaction', { emoji: b.dataset.react }); });

    // ------------------------------------------------ Minuteur et qualité réseau
    const timerEl = $('[data-timer]');
    const tick = () => {
      const left = Math.round((end - Date.now()) / 60000);
      const start = Math.round((Date.parse(info.start_at) - Date.now()) / 60000);
      timerEl.textContent = start > 0 ? `${t('Début dans', 'Starts in')} ${start} min` : left > 0 ? `⏱ ${left} min ${t('restantes', 'left')}` : `⏱ ${t('Temps écoulé', 'Time is up')}`;
      timerEl.classList.toggle('late', left <= 5);
    };
    tick();
    const timerInt = setInterval(tick, 15000);
    const netInt = setInterval(async () => {
      let worst = 0;
      for (const p of peers.values()) {
        const stats = await p.pc.getStats().catch(() => null);
        stats?.forEach((r) => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime) worst = Math.max(worst, r.currentRoundTripTime); });
      }
      const net = $('[data-net]');
      if (!net) return;
      net.className = `net ${worst > 0.6 ? 'bad' : worst > 0.25 ? 'mid' : 'good'}`;
      net.title = peers.size ? `RTT ${Math.round(worst * 1000)} ms` : t('Seul dans la classe', 'Alone in the room');
    }, 5000);
    const onResize = () => wb.resize();
    window.addEventListener('resize', onResize);
    const onUnload = () => socket.emit('room:leave');
    window.addEventListener('beforeunload', onUnload);

    teardown = () => {
      clearInterval(timerInt);
      clearInterval(netInt);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeunload', onUnload);
      Object.entries(handlers).forEach(([ev, fn]) => socket.off(ev, fn));
      socket.emit('room:leave');
      peers.forEach((p) => { clearInterval(p.watchdog); p.pc.close(); });
      peers.clear();
      if (recorder?.state === 'recording') recorder.stop();
      screenTrack?.stop();
      local?.getTracks().forEach((tr) => tr.stop());
    };
  }

  return () => teardown();
}
