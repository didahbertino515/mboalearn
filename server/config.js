const fs = require('fs');
const path = require('path');

// Chargement minimal du fichier .env (sans dépendance externe)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
module.exports = {
  port: Number(env.PORT || 3000),
  appUrl: env.APP_URL || `http://localhost:${env.PORT || 3000}`,
  jwtSecret: env.JWT_SECRET || 'dev-secret',
  paymentProvider: env.PAYMENT_PROVIDER || 'simulator',
  commissionRate: Number(env.COMMISSION_RATE || 12),
  notchpay: { publicKey: env.NOTCHPAY_PUBLIC_KEY, privateKey: env.NOTCHPAY_PRIVATE_KEY, hashKey: env.NOTCHPAY_HASH_KEY },
  campay: { baseUrl: env.CAMPAY_BASE_URL || 'https://demo.campay.net/api', username: env.CAMPAY_USERNAME, password: env.CAMPAY_PASSWORD, webhookKey: env.CAMPAY_WEBHOOK_KEY },
  flutterwave: { secretKey: env.FLW_SECRET_KEY, secretHash: env.FLW_SECRET_HASH },
  turn: env.TURN_URL ? { urls: env.TURN_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL } : null,
  dataDir: path.join(__dirname, '..', 'data'),
  uploadDir: path.join(__dirname, '..', 'uploads'),
};
