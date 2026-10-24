// Portefeuille (XAF), séquestre des cours et opérations Mobile Money.
const crypto = require('crypto');
const config = require('../config');
const { get, run, tx, setting } = require('../db');
const { pick, providers } = require('./providers');
const { notify } = require('../notify');

const MIN_DEPOSIT = 500;
const MIN_WITHDRAWAL = 1000;

// Normalise un numéro camerounais en 2376XXXXXXXX
function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) d = `237${d}`;
  return /^2376\d{8}$/.test(d) ? d : null;
}

// Détecte l'opérateur à partir du préfixe (plan de numérotation ART Cameroun)
function detectOperator(phone) {
  const n = normalizePhone(phone);
  if (!n) return null;
  const p2 = n.slice(3, 5);
  const p3 = Number(n.slice(3, 6));
  if (p2 === '67' || (p3 >= 650 && p3 <= 654) || (p3 >= 680 && p3 <= 683)) return 'mtn';
  if (p2 === '69' || (p3 >= 655 && p3 <= 659) || (p3 >= 685 && p3 <= 689)) return 'orange';
  return null;
}

const newRef = (prefix) => `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
const commissionRate = () => Number(setting('commission_rate', config.commissionRate));

function ledger(userId, type, amount, description, extra = {}) {
  run(
    `INSERT INTO transactions (user_id, type, amount, status, provider, provider_ref, reference, phone, operator, description, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, type, amount, extra.status || 'success', extra.provider || null, extra.providerRef || null,
    extra.reference || newRef(type.slice(0, 3)), extra.phone || null, extra.operator || null, description,
    extra.meta ? JSON.stringify(extra.meta) : null,
  );
}

// ------------------------------------------------------------ Dépôts (collecte)
async function startDeposit(user, { amount, phone, method = 'momo' }) {
  amount = Math.round(Number(amount));
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) throw httpError(400, `Montant minimum : ${MIN_DEPOSIT} FCFA`);
  if (amount > 1_000_000) throw httpError(400, 'Montant maximum : 1 000 000 FCFA par opération');
  let operator = null;
  let normalized = null;
  if (method === 'momo') {
    normalized = normalizePhone(phone);
    operator = detectOperator(normalized);
    if (!normalized || !operator) throw httpError(400, 'Numéro MTN MoMo ou Orange Money camerounais invalide');
  }
  const provider = pick(method);
  const reference = newRef('DEP');
  const result = await provider.collect({
    reference, amount, phone: normalized, operator, method,
    email: user.email, name: user.name, description: `Recharge portefeuille MboaLearn (${amount} FCFA)`,
  });
  run(
    `INSERT INTO transactions (user_id, type, amount, status, provider, provider_ref, reference, phone, operator, description)
     VALUES (?, 'deposit', ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    user.id, amount, provider.name, result.providerRef, reference, normalized, operator || method,
    `Recharge via ${method === 'card' ? 'carte bancaire' : operator === 'orange' ? 'Orange Money' : 'MTN Mobile Money'}`,
  );
  return { reference, provider: provider.name, ...result };
}

// Finalise une transaction en attente (appelée par webhook, vérification ou simulateur). Idempotent.
function finalize(reference, status) {
  return tx(() => {
    const t = get('SELECT * FROM transactions WHERE reference = ?', reference);
    if (!t || t.status !== 'pending' || !['success', 'failed'].includes(status)) return t;
    run("UPDATE transactions SET status = ?, updated_at = datetime('now') WHERE id = ?", status, t.id);
    if (t.type === 'deposit' && status === 'success') {
      run('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', t.amount, t.user_id);
      notify(t.user_id, 'Recharge réussie', `${fmt(t.amount)} ont été ajoutés à votre portefeuille.`, '#/wallet');
      rewardReferrer(t.user_id);
    }
    if (t.type === 'withdrawal' && status === 'failed') {
      // Le montant avait été réservé : on le restitue
      run('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', t.amount, t.user_id);
      notify(t.user_id, 'Retrait échoué', `${fmt(t.amount)} ont été recrédités sur votre solde.`, '#/wallet');
    }
    if (t.type === 'withdrawal' && status === 'success') {
      notify(t.user_id, 'Retrait effectué', `${fmt(t.amount)} envoyés sur votre compte Mobile Money.`, '#/wallet');
    }
    return get('SELECT * FROM transactions WHERE id = ?', t.id);
  });
}

async function refreshStatus(reference) {
  const t = get('SELECT * FROM transactions WHERE reference = ?', reference);
  if (!t || t.status !== 'pending') return t;
  const p = providers[t.provider];
  if (!p || p.name === 'simulator') return t;
  try {
    const s = await p.status(t);
    if (s !== 'pending') return finalize(reference, s);
  } catch (e) {
    console.warn('[paiement] vérification impossible', reference, e.message);
  }
  return get('SELECT * FROM transactions WHERE reference = ?', reference);
}

// Parrainage : 1 000 FCFA offerts au parrain lors de la 1re recharge du filleul
function rewardReferrer(userId) {
  const u = get('SELECT referred_by FROM users WHERE id = ?', userId);
  if (!u?.referred_by) return;
  const deposits = get("SELECT COUNT(*) c FROM transactions WHERE user_id = ? AND type = 'deposit' AND status = 'success'", userId).c;
  if (deposits !== 1) return;
  run('UPDATE users SET wallet_balance = wallet_balance + 1000 WHERE id = ?', u.referred_by);
  ledger(u.referred_by, 'bonus', 1000, 'Bonus de parrainage');
  notify(u.referred_by, 'Bonus de parrainage', 'Votre filleul a effectué sa première recharge : +1 000 FCFA !', '#/wallet');
}

// ------------------------------------------------------------ Retraits (tuteurs)
async function startWithdrawal(user, { amount, phone }) {
  amount = Math.round(Number(amount));
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL) throw httpError(400, `Retrait minimum : ${MIN_WITHDRAWAL} FCFA`);
  const normalized = normalizePhone(phone);
  const operator = detectOperator(normalized);
  if (!normalized || !operator) throw httpError(400, 'Numéro MTN MoMo ou Orange Money invalide');
  const provider = pick('momo');
  const reference = newRef('WDR');
  tx(() => {
    const fresh = get('SELECT wallet_balance FROM users WHERE id = ?', user.id);
    if (fresh.wallet_balance < amount) throw httpError(400, 'Solde insuffisant');
    run('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', amount, user.id);
    run(
      `INSERT INTO transactions (user_id, type, amount, status, provider, reference, phone, operator, description)
       VALUES (?, 'withdrawal', ?, 'pending', ?, ?, ?, ?, ?)`,
      user.id, amount, provider.name, reference, normalized, operator,
      `Retrait vers ${operator === 'orange' ? 'Orange Money' : 'MTN MoMo'} ${normalized}`,
    );
  });
  try {
    const r = await provider.payout({ reference, amount, phone: normalized, operator, name: user.name, description: 'Paiement MboaLearn' });
    run('UPDATE transactions SET provider_ref = ? WHERE reference = ?', r.providerRef || null, reference);
    if (r.status === 'success') finalize(reference, 'success');
  } catch (e) {
    finalize(reference, 'failed');
    throw httpError(502, `Le fournisseur a refusé le retrait : ${e.message}`);
  }
  return get('SELECT * FROM transactions WHERE reference = ?', reference);
}

// ------------------------------------------------------------ Séquestre des cours
// Le montant du cours est bloqué au moment de la réservation puis versé au tuteur
// une fois le cours terminé (ou remboursé en cas d'annulation/litige).
function holdForLesson(studentId, amount, description) {
  const u = get('SELECT wallet_balance FROM users WHERE id = ?', studentId);
  if (u.wallet_balance < amount) throw httpError(402, `Solde insuffisant : rechargez votre portefeuille (${fmt(amount - u.wallet_balance)} manquants).`);
  run('UPDATE users SET wallet_balance = wallet_balance - ?, held_balance = held_balance + ? WHERE id = ?', amount, amount, studentId);
  ledger(studentId, 'payment', -amount, description);
}

function releaseToTutor(studentId, tutorId, amount, description) {
  const commission = Math.round((amount * commissionRate()) / 100);
  run('UPDATE users SET held_balance = MAX(0, held_balance - ?) WHERE id = ?', amount, studentId);
  run('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', amount - commission, tutorId);
  ledger(tutorId, 'earning', amount - commission, description, { meta: { gross: amount, commission } });
  return commission;
}

function refundStudent(studentId, amount, description) {
  run('UPDATE users SET held_balance = MAX(0, held_balance - ?), wallet_balance = wallet_balance + ? WHERE id = ?', amount, amount, studentId);
  ledger(studentId, 'refund', amount, description);
}

// Paiement direct depuis le solde (forfaits, cours collectifs), conservé en séquestre
function chargeWallet(studentId, amount, description) {
  holdForLesson(studentId, amount, description);
}

function fmt(n) {
  return `${Number(n).toLocaleString('fr-FR').replace(/ /g, ' ')} FCFA`;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = {
  normalizePhone, detectOperator, startDeposit, startWithdrawal, finalize, refreshStatus,
  holdForLesson, releaseToTutor, refundStudent, chargeWallet, ledger, commissionRate, httpError, fmt, newRef,
  MIN_DEPOSIT, MIN_WITHDRAWAL,
};
