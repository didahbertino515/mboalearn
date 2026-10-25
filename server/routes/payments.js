const express = require('express');
const config = require('../config');
const { get, all } = require('../db');
const { requireAuth } = require('../auth');
const pay = require('../payments/service');
const { providers, isConfigured } = require('../payments/providers');
const { wrap } = require('../util');
const { limit, byUser } = require('../ratelimit');

const r = express.Router();

r.get('/config', (_req, res) => {
  res.json({
    currency: 'XAF',
    simulator: !isConfigured(config.paymentProvider) || config.paymentProvider === 'simulator',
    provider: config.paymentProvider,
    card_enabled: isConfigured('flutterwave') || isConfigured('notchpay'),
    min_deposit: pay.MIN_DEPOSIT,
    min_withdrawal: pay.MIN_WITHDRAWAL,
    commission_rate: pay.commissionRate(),
    // Taux indicatifs pour l'affichage aux utilisateurs de la diaspora (1 EUR = 655,957 XAF, parité fixe)
    rates: { XAF: 1, EUR: 1 / 655.957, USD: 1 / 605 },
  });
});

r.get('/wallet', requireAuth(), (req, res) => {
  const u = get('SELECT wallet_balance, held_balance FROM users WHERE id = ?', req.user.id);
  const stats = get(`SELECT
      COALESCE(SUM(CASE WHEN type = 'earning' THEN amount END), 0) AS earned,
      COALESCE(SUM(CASE WHEN type = 'earning' AND created_at >= date('now', 'start of month') THEN amount END), 0) AS earned_month,
      COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'success' THEN amount END), 0) AS withdrawn
    FROM transactions WHERE user_id = ?`, req.user.id);
  res.json({ ...u, ...stats, transactions: all('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100', req.user.id) });
});

r.get('/operator', (req, res) => {
  const phone = pay.normalizePhone(req.query.phone);
  res.json({ phone, operator: pay.detectOperator(phone) });
});

r.post('/deposit', requireAuth(), limit('deposit', 10, 10 * 60 * 1000, byUser), wrap(async (req, res) => {
  res.json(await pay.startDeposit(req.user, req.body));
}));

r.post('/withdraw', requireAuth('tutor', 'admin'), limit('withdraw', 5, 60 * 60 * 1000, byUser), wrap(async (req, res) => {
  res.json(await pay.startWithdrawal(req.user, req.body));
}));

r.get('/status/:reference', requireAuth(), wrap(async (req, res) => {
  const t = get('SELECT * FROM transactions WHERE reference = ? AND user_id = ?', req.params.reference, req.user.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
  res.json(await pay.refreshStatus(t.reference));
}));

// Simulateur uniquement : valide (ou refuse) un paiement en attente
r.post('/simulate/:reference', requireAuth(), (req, res) => {
  const t = get('SELECT * FROM transactions WHERE reference = ? AND user_id = ?', req.params.reference, req.user.id);
  if (!t || t.provider !== 'simulator') return res.status(404).json({ error: 'Transaction de test introuvable' });
  res.json(pay.finalize(t.reference, req.body.fail ? 'failed' : 'success'));
});

// Webhooks des fournisseurs (NotchPay : POST, CamPay : GET/POST, Flutterwave : POST)
const webhook = wrap(async (req, res) => {
  const p = providers[req.params.provider];
  if (!p || !p.verifyWebhook) return res.status(404).end();
  const ev = p.verifyWebhook(req);
  if (!ev || !ev.reference) return res.status(401).json({ error: 'Signature invalide' });
  if (ev.status === 'verify') await pay.refreshStatus(ev.reference);
  else pay.finalize(ev.reference, ev.status);
  res.json({ received: true });
});
r.post('/webhook/:provider', webhook);
r.get('/webhook/:provider', webhook);

// Retour navigateur après paiement hébergé (Flutterwave)
r.get('/return/flutterwave', wrap(async (req, res) => {
  if (req.query.tx_ref) await pay.refreshStatus(String(req.query.tx_ref));
  res.redirect(`/#/wallet?ref=${encodeURIComponent(req.query.tx_ref || '')}`);
}));

module.exports = { router: r };
