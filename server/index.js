const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const config = require('./config');
const { get, run } = require('./db');
const { authOptional, requireAuth, userFromToken } = require('./auth');
const { setIO } = require('./notify');
const { parseJSON, str } = require('./util');
const { saveDataUrl } = require('./uploads');
const bookings = require('./routes/bookings');

const app = express();
app.disable('x-powered-by');
app.use(express.json({
  limit: '15mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); }, // nécessaire pour vérifier les signatures webhook
}));
app.use(express.urlencoded({ extended: false }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self)');
  next();
});
app.use(authOptional);

app.use('/api/auth', require('./routes/auth').router);
app.use('/api/tutors', require('./routes/tutors').router);
app.use('/api/bookings', bookings.router);
app.use('/api/payments', require('./routes/payments').router);
app.use('/api/messages', require('./routes/messages').router);
app.use('/api/groups', require('./routes/groups').router);
app.use('/api/learning', require('./routes/learning').router);
app.use('/api/admin', require('./routes/admin').router);

// ------------------------------------------------------------ Salles de classe
// Une salle correspond à un cours individuel (bookings) ou collectif (group_classes)
function roomAccess(roomId, user) {
  if (!user) return null;
  const b = get(`SELECT b.*, t.name AS tutor_name, s.name AS student_name FROM bookings b
    JOIN users t ON t.id = b.tutor_id JOIN users s ON s.id = b.student_id WHERE b.room_id = ?`, roomId);
  if (b) {
    const parent = user.role === 'parent' && get('SELECT 1 FROM parent_links WHERE parent_id = ? AND child_id = ?', user.id, b.student_id);
    if (![b.student_id, b.tutor_id].includes(user.id) && user.role !== 'admin' && !parent) return null;
    return {
      kind: 'lesson', id: b.id, title: `${b.subject || 'Cours'} — ${b.tutor_name} & ${b.student_name}`,
      start_at: b.start_at, duration_min: b.duration_min, status: b.status,
      is_host: user.id === b.tutor_id, tutor_id: b.tutor_id, student_id: b.student_id,
    };
  }
  const g = get('SELECT g.*, u.name AS tutor_name FROM group_classes g JOIN users u ON u.id = g.tutor_id WHERE g.room_id = ?', roomId);
  if (g) {
    const enrolled = get('SELECT 1 FROM group_enrollments WHERE class_id = ? AND student_id = ?', g.id, user.id);
    if (g.tutor_id !== user.id && !enrolled && user.role !== 'admin') return null;
    return {
      kind: 'group', id: g.id, title: `${g.title} — ${g.tutor_name}`, start_at: g.start_at,
      duration_min: g.duration_min, status: g.status, is_host: user.id === g.tutor_id, tutor_id: g.tutor_id,
    };
  }
  return null;
}

app.get('/api/rooms/:roomId', requireAuth(), (req, res) => {
  const info = roomAccess(req.params.roomId, req.user);
  if (!info) return res.status(404).json({ error: "Salle introuvable ou accès non autorisé" });
  const saved = get('SELECT content, whiteboard FROM lesson_notes WHERE room_id = ?', req.params.roomId);
  const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (config.turn) ice.push(config.turn);
  res.json({ ...info, notes: saved?.content || '', ice_servers: ice });
});

app.post('/api/rooms/:roomId/files', requireAuth(), (req, res, next) => {
  try {
    if (!roomAccess(req.params.roomId, req.user)) return res.status(404).json({ error: 'Salle introuvable' });
    res.json({ url: saveDataUrl(req.body.data), name: str(req.body.name, 120) });
  } catch (e) { next(e); }
});

app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: 0 }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue' }));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erreur interne du serveur' : err.message });
});

// ------------------------------------------------------------ Temps réel
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6 });
setIO(io);

const rooms = new Map(); // roomId -> { strokes: [], notes, peers: Map(socketId -> user), saveTimer }

function roomState(roomId) {
  if (!rooms.has(roomId)) {
    const saved = get('SELECT content, whiteboard FROM lesson_notes WHERE room_id = ?', roomId);
    rooms.set(roomId, { strokes: parseJSON(saved?.whiteboard, []), notes: saved?.content || '', peers: new Map(), saveTimer: null });
  }
  return rooms.get(roomId);
}

function persist(roomId) {
  const st = rooms.get(roomId);
  if (!st) return;
  clearTimeout(st.saveTimer);
  st.saveTimer = setTimeout(() => {
    run(`INSERT INTO lesson_notes (room_id, content, whiteboard, updated_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(room_id) DO UPDATE SET content = excluded.content, whiteboard = excluded.whiteboard, updated_at = excluded.updated_at`,
    roomId, st.notes, JSON.stringify(st.strokes.slice(-5000)));
  }, 1500);
}

io.use((socket, next) => {
  const user = userFromToken(socket.handshake.auth?.token);
  if (!user) return next(new Error('unauthorized'));
  socket.user = { id: user.id, name: user.name, role: user.role, avatar: user.avatar };
  next();
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`);

  socket.on('room:join', (roomId, ack) => {
    const info = roomAccess(String(roomId), get('SELECT * FROM users WHERE id = ?', socket.user.id));
    if (!info) return ack?.({ error: 'Accès refusé' });
    const st = roomState(roomId);
    if (info.kind === 'lesson' && st.peers.size >= 6) return ack?.({ error: 'Salle pleine' });
    socket.data.roomId = roomId;
    socket.data.isHost = info.is_host;
    socket.join(`room:${roomId}`);
    const peers = [...st.peers.entries()].map(([id, u]) => ({ socketId: id, user: u }));
    st.peers.set(socket.id, { ...socket.user, isHost: info.is_host });
    socket.to(`room:${roomId}`).emit('room:peer-joined', { socketId: socket.id, user: { ...socket.user, isHost: info.is_host } });
    ack?.({ ok: true, peers, strokes: st.strokes, notes: st.notes });
  });

  const inRoom = (fn) => (payload) => {
    const roomId = socket.data.roomId;
    if (roomId && rooms.has(roomId)) fn(roomId, rooms.get(roomId), payload || {});
  };

  // Signalisation WebRTC (offre / réponse / candidats ICE) relayée entre pairs de la même salle
  socket.on('rtc:signal', inRoom((roomId, st, { to, data }) => {
    if (st.peers.has(to)) io.to(to).emit('rtc:signal', { from: socket.id, data });
  }));

  socket.on('wb:op', inRoom((roomId, st, op) => {
    if (op.type === 'clear') st.strokes = [];
    else if (op.type === 'undo') {
      const idx = st.strokes.map((s) => s.author).lastIndexOf(socket.id);
      if (idx >= 0) st.strokes.splice(idx, 1);
    } else if (op.type === 'stroke') st.strokes.push({ ...op.stroke, author: socket.id });
    socket.to(`room:${roomId}`).emit('wb:op', { ...op, author: socket.id });
    persist(roomId);
  }));

  socket.on('notes:update', inRoom((roomId, st, { content }) => {
    st.notes = String(content || '').slice(0, 50000);
    socket.to(`room:${roomId}`).emit('notes:update', { content: st.notes });
    persist(roomId);
  }));

  socket.on('room:chat', inRoom((roomId, _st, { text, file }) => {
    io.to(`room:${roomId}`).emit('room:chat', {
      from: socket.user, text: String(text || '').slice(0, 2000), file: file || null, at: new Date().toISOString(),
    });
  }));

  socket.on('room:media', inRoom((roomId, _st, state) => {
    socket.to(`room:${roomId}`).emit('room:media', { socketId: socket.id, state });
  }));

  socket.on('room:hand', inRoom((roomId, _st, { raised }) => {
    io.to(`room:${roomId}`).emit('room:hand', { socketId: socket.id, name: socket.user.name, raised: !!raised });
  }));

  socket.on('room:reaction', inRoom((roomId, _st, { emoji }) => {
    if (['👍', '👏', '😂', '❤️', '🎉', '❓'].includes(emoji)) io.to(`room:${roomId}`).emit('room:reaction', { name: socket.user.name, emoji });
  }));

  // Le professeur peut couper le micro d'un élève (cours collectifs)
  socket.on('room:mute', inRoom((roomId, st, { socketId }) => {
    if (socket.data.isHost && st.peers.has(socketId)) io.to(socketId).emit('room:force-mute');
  }));

  const leave = () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const st = rooms.get(roomId);
    st.peers.delete(socket.id);
    socket.to(`room:${roomId}`).emit('room:peer-left', { socketId: socket.id });
    socket.leave(`room:${roomId}`);
    socket.data.roomId = null;
    if (!st.peers.size) {
      persist(roomId);
      setTimeout(() => { if (rooms.get(roomId)?.peers.size === 0) rooms.delete(roomId); }, 5000);
    }
  };
  socket.on('room:leave', leave);
  socket.on('disconnect', leave);
});

// Clôture automatique des cours (paiement des tuteurs) toutes les 10 minutes
setInterval(bookings.autoComplete, 10 * 60 * 1000).unref();

if (!get('SELECT 1 FROM users LIMIT 1')) {
  console.log('Base vide : insertion des données de démonstration…');
  require('./seed');
}

server.listen(config.port, () => {
  console.log(`MboaLearn démarré sur ${config.appUrl} (paiements : ${config.paymentProvider})`);
});
