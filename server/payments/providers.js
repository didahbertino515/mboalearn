// Connecteurs vers les agrégateurs de paiement disponibles au Cameroun.
// Chaque fournisseur expose : collect(), status(), payout() et verifyWebhook().
// Montants en XAF (Franc CFA, sans décimales). Téléphones au format 2376XXXXXXXX.
const crypto = require('crypto');
const config = require('../config');

async function http(method, url, { headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data.message || data.detail || `Erreur fournisseur (${res.status})`);
    err.data = data;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------- Simulateur
// Aucune clé requise : permet de tester tout le parcours (dépôt, retrait) en local.
const simulator = {
  name: 'simulator',
  async collect({ reference, operator }) {
    const ussd = operator === 'orange' ? '#150*50#' : '*126#';
    return {
      status: 'pending',
      providerRef: `SIM-${reference}`,
      instructions: `Mode test : en production, l'utilisateur valide le paiement sur son téléphone (${ussd}). Cliquez sur « Simuler la validation ».`,
    };
  },
  async status() { return 'pending'; },
  async payout({ reference }) { return { status: 'success', providerRef: `SIM-OUT-${reference}` }; },
};

// ---------------------------------------------------------------- NotchPay
// Docs : https://developer.notchpay.co — canaux cm.mtn, cm.orange, carte
const notchpay = {
  name: 'notchpay',
  base: 'https://api.notchpay.co',
  async collect({ reference, amount, phone, operator, method, email, name, description }) {
    const { publicKey } = config.notchpay;
    const init = await http('POST', `${this.base}/payments`, {
      headers: { Authorization: publicKey },
      body: {
        amount, currency: 'XAF', reference, description,
        customer: { email, name, phone: phone ? `+${phone}` : undefined },
        callback: `${config.appUrl}/#/wallet?ref=${reference}`,
      },
    });
    const trxRef = init.transaction?.reference;
    if (method === 'card') {
      return { status: 'pending', providerRef: trxRef, redirectUrl: init.authorization_url };
    }
    // Paiement direct Mobile Money : déclenche la demande USSD sur le téléphone du client
    await http('POST', `${this.base}/payments/${trxRef}`, {
      headers: { Authorization: publicKey },
      body: { channel: operator === 'orange' ? 'cm.orange' : 'cm.mtn', data: { phone: `+${phone}` } },
    });
    return { status: 'pending', providerRef: trxRef, instructions: 'Validez le paiement sur votre téléphone en saisissant votre code secret.' };
  },
  async status(tx) {
    const r = await http('GET', `${this.base}/payments/${tx.provider_ref}`, { headers: { Authorization: config.notchpay.publicKey } });
    const s = r.transaction?.status;
    if (s === 'complete') return 'success';
    if (['failed', 'canceled', 'expired', 'rejected'].includes(s)) return 'failed';
    return 'pending';
  },
  async payout({ reference, amount, phone, operator, name, description }) {
    const r = await http('POST', `${this.base}/transfers`, {
      headers: { Authorization: config.notchpay.publicKey, 'X-Grant': config.notchpay.privateKey },
      body: {
        amount, currency: 'XAF', reference, description,
        channel: operator === 'orange' ? 'cm.orange' : 'cm.mtn',
        beneficiary: { name, phone: `+${phone}` },
      },
    });
    return { status: r.transfer?.status === 'complete' ? 'success' : 'pending', providerRef: r.transfer?.reference };
  },
  // Webhook : en-tête x-notch-signature = HMAC-SHA256(corps brut, clé de hachage)
  verifyWebhook(req) {
    const sig = req.headers['x-notch-signature'];
    const expected = crypto.createHmac('sha256', config.notchpay.hashKey || '').update(req.rawBody || '').digest('hex');
    if (!sig || sig !== expected) return null;
    const ev = req.body;
    const data = ev.data || {};
    const reference = data.merchant_reference || data.reference;
    if (ev.event === 'payment.complete' || ev.event === 'transfer.complete') return { reference, status: 'success' };
    if (/failed|canceled|expired/.test(ev.event || '')) return { reference, status: 'failed' };
    return { reference, status: 'pending' };
  },
};

// ---------------------------------------------------------------- CamPay
// Docs : https://documenter.getpostman.com/view/2391374/T1LV8PVA
const campay = {
  name: 'campay',
  _token: null,
  _tokenAt: 0,
  async token() {
    if (this._token && Date.now() - this._tokenAt < 50 * 60 * 1000) return this._token;
    const r = await http('POST', `${config.campay.baseUrl}/token/`, { body: { username: config.campay.username, password: config.campay.password } });
    this._token = r.token;
    this._tokenAt = Date.now();
    return r.token;
  },
  async collect({ reference, amount, phone, description, method }) {
    if (method === 'card') throw new Error('CamPay ne gère que le Mobile Money. Configurez Flutterwave ou NotchPay pour les cartes.');
    const r = await http('POST', `${config.campay.baseUrl}/collect/`, {
      headers: { Authorization: `Token ${await this.token()}` },
      body: { amount: String(amount), currency: 'XAF', from: phone, description, external_reference: reference },
    });
    return { status: 'pending', providerRef: r.reference, instructions: `Composez ${r.ussd_code || '*126# (MTN) ou #150*50# (Orange)'} pour valider le paiement.` };
  },
  async status(tx) {
    const r = await http('GET', `${config.campay.baseUrl}/transaction/${tx.provider_ref}/`, { headers: { Authorization: `Token ${await this.token()}` } });
    if (r.status === 'SUCCESSFUL') return 'success';
    if (r.status === 'FAILED') return 'failed';
    return 'pending';
  },
  async payout({ reference, amount, phone, description }) {
    const r = await http('POST', `${config.campay.baseUrl}/withdraw/`, {
      headers: { Authorization: `Token ${await this.token()}` },
      body: { amount: String(amount), to: phone, description, external_reference: reference },
    });
    return { status: 'pending', providerRef: r.reference };
  },
  // Webhook CamPay : GET avec ?status=&external_reference=&signature=(JWT HS256 signé avec la clé webhook)
  verifyWebhook(req) {
    const q = { ...req.query, ...req.body };
    const sig = q.signature;
    if (!sig || !config.campay.webhookKey) return null;
    const [h, p, s] = String(sig).split('.');
    const expected = crypto.createHmac('sha256', config.campay.webhookKey).update(`${h}.${p}`).digest('base64url');
    if (s !== expected) return null;
    return { reference: q.external_reference, status: q.status === 'SUCCESSFUL' ? 'success' : q.status === 'FAILED' ? 'failed' : 'pending' };
  },
};

// ---------------------------------------------------------------- Flutterwave
// Paiement hébergé (cartes internationales pour la diaspora + Mobile Money XAF)
const flutterwave = {
  name: 'flutterwave',
  base: 'https://api.flutterwave.com/v3',
  auth() { return { Authorization: `Bearer ${config.flutterwave.secretKey}` }; },
  async collect({ reference, amount, phone, email, name, description, method }) {
    const r = await http('POST', `${this.base}/payments`, {
      headers: this.auth(),
      body: {
        tx_ref: reference, amount, currency: 'XAF',
        redirect_url: `${config.appUrl}/api/payments/return/flutterwave`,
        payment_options: method === 'card' ? 'card' : 'mobilemoneyfranco',
        customer: { email, name, phonenumber: phone },
        customizations: { title: 'MboaLearn', description },
      },
    });
    return { status: 'pending', providerRef: reference, redirectUrl: r.data?.link };
  },
  async status(tx) {
    const r = await http('GET', `${this.base}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(tx.reference)}`, { headers: this.auth() });
    if (r.data?.status === 'successful' && Number(r.data.amount) >= tx.amount && r.data.currency === 'XAF') return 'success';
    if (r.data?.status === 'failed') return 'failed';
    return 'pending';
  },
  async payout({ reference, amount, phone, operator, name, description }) {
    const r = await http('POST', `${this.base}/transfers`, {
      headers: this.auth(),
      body: {
        account_bank: 'FMM', account_number: phone, amount, currency: 'XAF', reference, narration: description,
        beneficiary_name: name, meta: { sender: 'MboaLearn', mobile_number: phone, operator },
      },
    });
    return { status: 'pending', providerRef: String(r.data?.id || reference) };
  },
  verifyWebhook(req) {
    if (!config.flutterwave.secretHash || req.headers['verif-hash'] !== config.flutterwave.secretHash) return null;
    const d = req.body.data || {};
    // Le statut est revérifié via l'API avant crédit (voir service de paiement)
    return { reference: d.tx_ref || d.reference, status: 'verify' };
  },
};

const providers = { simulator, notchpay, campay, flutterwave };

function isConfigured(name) {
  if (name === 'simulator') return true;
  if (name === 'notchpay') return !!config.notchpay.publicKey;
  if (name === 'campay') return !!(config.campay.username && config.campay.password);
  if (name === 'flutterwave') return !!config.flutterwave.secretKey;
  return false;
}

// Choix du fournisseur : Mobile Money -> fournisseur principal ; carte -> Flutterwave puis NotchPay
function pick(method) {
  if (method === 'card') {
    for (const n of ['flutterwave', 'notchpay']) if (isConfigured(n)) return providers[n];
    return simulator;
  }
  const main = config.paymentProvider;
  return isConfigured(main) && providers[main] ? providers[main] : simulator;
}

module.exports = { providers, pick, isConfigured };
