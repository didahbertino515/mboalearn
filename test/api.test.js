// Tests de bout en bout de l'API : un vrai serveur est lancé sur une base temporaire.
// Lancer avec : npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mboalearn-test-'));
let server;
let logs = '';
let sqlite; // accès direct à la base pour simuler le passage du temps

async function api(p, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const login = async (email, password = 'demo1234') => (await api('/auth/login', { method: 'POST', body: { email, password } })).data.token;
const me = async (token) => (await api('/auth/me', { token })).data;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

before(async () => {
  server = spawn(process.execPath, ['--no-warnings', 'server/start.js'], {
    cwd: path.join(__dirname, '..'),
    // APP_URL et clés vides : le fichier .env local ne doit pas influencer les tests
    env: { ...process.env, PORT: String(PORT), DATA_DIR, UPLOAD_DIR: path.join(DATA_DIR, 'up'), APP_URL: 'http://test.local', PAYMENT_PROVIDER: 'simulator', COMMISSION_RATE: '12', DATABASE_URL: '', BREVO_API_KEY: '' },
  });
  server.stdout.on('data', (d) => { logs += d; });
  server.stderr.on('data', (d) => { logs += d; });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* démarrage en cours */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const { DatabaseSync } = require('node:sqlite');
  sqlite = new DatabaseSync(path.join(DATA_DIR, 'mboalearn.db'));
});

after(() => {
  sqlite?.close();
  server?.kill();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test('le serveur répond et la démo est chargée', async () => {
  assert.equal((await api('/health')).data.ok, true);
  const tutors = (await api('/tutors?limit=50')).data;
  assert.ok(tutors.total >= 10);
});

test("l'inscription exige l'acceptation des conditions", async () => {
  const body = { name: 'Test Élève', email: 'cgu@test.cm', password: 'motdepasse1', role: 'student' };
  assert.equal((await api('/auth/register', { method: 'POST', body })).status, 400);
  const ok = await api('/auth/register', { method: 'POST', body: { ...body, accept_terms: true } });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.user.terms_accepted_at);
});

test('les tentatives de connexion sont limitées (429 au 11e échec)', async () => {
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await api('/auth/login', { method: 'POST', body: { email: 'laure@mboalearn.cm', password: 'faux' } })).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(401));
  assert.equal(codes[10], 429);
});

test('un élève ne peut pas accéder à l\'administration', async () => {
  const t = await login('eleve@mboalearn.cm');
  assert.equal((await api('/admin/stats', { token: t })).status, 403);
  assert.equal((await api('/admin/stats')).status, 401);
});

test('recharge Mobile Money : opérateur détecté, numéro invalide refusé, solde crédité', async () => {
  const t = await login('apprenant1@mboalearn.cm');
  assert.equal((await api('/payments/operator?phone=677123456')).data.operator, 'mtn');
  assert.equal((await api('/payments/operator?phone=699123456')).data.operator, 'orange');
  assert.equal((await api('/payments/deposit', { method: 'POST', token: t, body: { amount: 5000, phone: '612345678' } })).status, 400);
  const before = (await me(t)).wallet_balance;
  const dep = await api('/payments/deposit', { method: 'POST', token: t, body: { amount: 20000, phone: '699 55 44 33' } });
  assert.equal(dep.data.status, 'pending');
  await api(`/payments/simulate/${dep.data.reference}`, { method: 'POST', token: t, body: {} });
  assert.equal((await me(t)).wallet_balance, before + 20000);
  // Rejouer la validation ne crédite pas deux fois
  await api(`/payments/simulate/${dep.data.reference}`, { method: 'POST', token: t, body: {} });
  assert.equal((await me(t)).wallet_balance, before + 20000);
});

test('cours : séquestre, versement au tuteur moins 12 %, retrait', async () => {
  const s = await login('apprenant1@mboalearn.cm');
  const tutorEmail = 'tuteur1@mboalearn.cm'; // Brenda Ndip, 6 000 FCFA/h
  const tu = await login(tutorEmail);
  const tutorId = (await me(tu)).id;
  const slots = (await api(`/tutors/${tutorId}/slots?duration=60`)).data;
  const s0 = await me(s);
  const tutor0 = (await me(tu)).wallet_balance;
  const b = await api('/bookings', { method: 'POST', token: s, body: { tutor_id: tutorId, start_at: slots[0], duration: 60, subject: 'Anglais' } });
  assert.equal(b.status, 200, JSON.stringify(b.data));
  const booking = b.data[0];
  const s1 = await me(s);
  assert.equal(s1.wallet_balance, s0.wallet_balance - 6000);
  assert.equal(s1.held_balance, s0.held_balance + 6000);
  // Impossible de clôturer avant le début
  assert.equal((await api(`/bookings/${booking.id}/complete`, { method: 'POST', token: s })).status, 400);
  // Le cours a eu lieu
  sqlite.prepare('UPDATE bookings SET start_at = ? WHERE id = ?').run(new Date(Date.now() - 2 * 3600000).toISOString(), booking.id);
  assert.equal((await api(`/bookings/${booking.id}/complete`, { method: 'POST', token: s })).data.status, 'completed');
  assert.equal((await me(s)).held_balance, s0.held_balance);
  assert.equal((await me(tu)).wallet_balance, tutor0 + 5280);
  // Retrait : refusé au-delà du solde, accepté sinon
  assert.equal((await api('/payments/withdraw', { method: 'POST', token: tu, body: { amount: tutor0 + 999999, phone: '677000100' } })).status, 400);
  const w = await api('/payments/withdraw', { method: 'POST', token: tu, body: { amount: 5280, phone: '677000100' } });
  assert.equal(w.data.status, 'success');
  assert.equal((await me(tu)).wallet_balance, tutor0);
});

test('annulation plus de 12 h avant : remboursement intégral', async () => {
  const s = await login('apprenant2@mboalearn.cm');
  await api(`/payments/simulate/${(await api('/payments/deposit', { method: 'POST', token: s, body: { amount: 10000, phone: '677111222' } })).data.reference}`, { method: 'POST', token: s, body: {} });
  const tutorId = (await me(await login('tuteur3@mboalearn.cm'))).id;
  const slots = (await api(`/tutors/${tutorId}/slots?duration=60`)).data;
  const late = slots.find((x) => Date.parse(x) - Date.now() > 24 * 3600000);
  const before = await me(s);
  const b = (await api('/bookings', { method: 'POST', token: s, body: { tutor_id: tutorId, start_at: late, duration: 60 } })).data[0];
  const r = await api(`/bookings/${b.id}/cancel`, { method: 'POST', token: s });
  assert.equal(r.data.refunded, true);
  const after = await me(s);
  assert.equal(after.wallet_balance, before.wallet_balance);
  assert.equal(after.held_balance, before.held_balance);
});

test('mot de passe oublié : lien unique, valable une seule fois', async () => {
  assert.equal((await api('/auth/forgot', { method: 'POST', body: { email: 'inconnu@test.cm' } })).data.ok, true);
  await api('/auth/forgot', { method: 'POST', body: { email: 'apprenant3@mboalearn.cm' } });
  await new Promise((r) => setTimeout(r, 300));
  const token = [...logs.matchAll(/reset\?token=([\w-]+)/g)].pop()?.[1];
  assert.ok(token, 'le lien doit apparaître dans les journaux quand Brevo n\'est pas configuré');
  assert.equal((await api('/auth/reset', { method: 'POST', body: { token, password: 'court' } })).status, 400);
  assert.equal((await api('/auth/reset', { method: 'POST', body: { token, password: 'NouveauMdp2026' } })).status, 200);
  assert.equal((await api('/auth/reset', { method: 'POST', body: { token, password: 'EncoreUn2026' } })).status, 400);
  assert.ok(await login('apprenant3@mboalearn.cm', 'NouveauMdp2026'));
});

test('messagerie : coordonnées masquées sans cours réservé, autorisées après', async () => {
  const s = (await api('/auth/register', { method: 'POST', body: { name: 'Nouvel Élève', email: 'msg@test.cm', password: 'motdepasse1', accept_terms: true } })).data.token;
  const sid = (await me(s)).id;
  // Un tuteur avec lequel cet élève n'a jamais eu de cours
  const tutorId = sqlite.prepare(`SELECT user_id FROM tutor_profiles WHERE status = 'approved' AND user_id NOT IN
    (SELECT tutor_id FROM bookings WHERE student_id = ?) LIMIT 1`).get(sid).user_id;
  const conv = (await api(`/messages/with/${tutorId}`, { method: 'POST', token: s })).data;
  const m1 = (await api(`/messages/${conv.id}`, { method: 'POST', token: s, body: { body: 'Mon numéro : 6 77 12 34 56, mail moi@test.cm. Chapitre 3 page 112.' } })).data;
  assert.equal(m1.masked, true);
  assert.ok(!m1.body.includes('77 12') && !m1.body.includes('@test.cm') && m1.body.includes('page 112'));
  sqlite.prepare(`INSERT INTO bookings (student_id, tutor_id, start_at, price, status, room_id) VALUES (?, ?, ?, 0, 'completed', 'test-room')`).run(sid, tutorId, new Date().toISOString());
  const m2 = (await api(`/messages/${conv.id}`, { method: 'POST', token: s, body: { body: 'Mon numéro : 677123456' } })).data;
  assert.equal(m2.masked, false);
  assert.ok(m2.body.includes('677123456'));
});

test('justificatifs : privés, visibles par le tuteur et l\'admin seulement', async () => {
  const tu = await login('tuteur@mboalearn.cm');
  const doc = await api('/tutors/me/documents', { method: 'POST', token: tu, body: { kind: 'id', label: 'CNI', data: PNG } });
  assert.equal(doc.status, 200);
  const file = sqlite.prepare('SELECT file FROM tutor_documents WHERE id = ?').get(doc.data.id).file;
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/uploads/${file}`)).status, 404, 'jamais servi publiquement');
  assert.equal((await api(`/tutors/documents/${doc.data.id}/file`, { token: tu })).status, 200);
  assert.equal((await api(`/tutors/documents/${doc.data.id}/file`, { token: await login('tuteur1@mboalearn.cm') })).status, 404);
  assert.equal((await api(`/tutors/documents/${doc.data.id}/file`, { token: await login('eleve@mboalearn.cm') })).status, 403);
  const admin = await login('admin@mboalearn.cm');
  assert.equal((await api(`/tutors/documents/${doc.data.id}/file`, { token: admin })).status, 200);
  await api(`/admin/documents/${doc.data.id}/approve`, { method: 'POST', token: admin, body: {} });
  assert.equal((await api(`/tutors/${(await me(tu)).id}`)).data.id_verified, true);
});

test('mes données : export, puis suppression du compte (solde nul requis)', async () => {
  const s = await login('apprenant5@mboalearn.cm');
  const exp = await api('/auth/export', { token: s });
  assert.equal(exp.status, 200);
  assert.equal(exp.data.account.email, 'apprenant5@mboalearn.cm');
  assert.ok(!('password_hash' in exp.data.account));
  assert.equal((await api('/auth/me', { method: 'DELETE', token: s, body: { password: 'faux' } })).status, 401);
  const ok = await api('/auth/me', { method: 'DELETE', token: s, body: { password: 'demo1234' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await api('/auth/login', { method: 'POST', body: { email: 'apprenant5@mboalearn.cm', password: 'demo1234' } })).status, 401);
  // Un compte avec un solde positif ne peut pas être supprimé
  const k = await login('eleve@mboalearn.cm');
  assert.equal((await api('/auth/me', { method: 'DELETE', token: k, body: { password: 'demo1234' } })).status, 400);
});

test('recherche : le total respecte le filtre de disponibilité et la pagination', async () => {
  const all = (await api('/tutors?limit=50')).data;
  const weekend = (await api('/tutors?when=weekend&limit=50')).data;
  assert.equal(weekend.total, weekend.items.length);
  assert.ok(weekend.total <= all.total);
  const p1 = (await api('/tutors?limit=5')).data.items.map((x) => x.id);
  const p2 = (await api('/tutors?limit=5&offset=5')).data.items.map((x) => x.id);
  assert.equal(p1.filter((id) => p2.includes(id)).length, 0);
});
