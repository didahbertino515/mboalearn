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
  // Sur Render, RENDER_EXTERNAL_URL est fourni automatiquement (https://xxx.onrender.com)
  appUrl: env.APP_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT || 3000}`,
  jwtSecret: env.JWT_SECRET || 'dev-secret',
  paymentProvider: env.PAYMENT_PROVIDER || 'simulator',
  commissionRate: Number(env.COMMISSION_RATE || 12),
  notchpay: { publicKey: env.NOTCHPAY_PUBLIC_KEY, privateKey: env.NOTCHPAY_PRIVATE_KEY, hashKey: env.NOTCHPAY_HASH_KEY },
  campay: { baseUrl: env.CAMPAY_BASE_URL || 'https://demo.campay.net/api', username: env.CAMPAY_USERNAME, password: env.CAMPAY_PASSWORD, webhookKey: env.CAMPAY_WEBHOOK_KEY },
  flutterwave: { secretKey: env.FLW_SECRET_KEY, secretHash: env.FLW_SECRET_HASH },
  mail: { apiKey: env.BREVO_API_KEY, from: env.MAIL_FROM || 'no-reply@mboalearn.cm', fromName: env.MAIL_FROM_NAME || 'MboaLearn' },
  turn: env.TURN_URL ? { urls: env.TURN_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL } : null,
  // En production, pointer ces dossiers vers un disque persistant (ex : /var/data)
  dataDir: env.DATA_DIR || path.join(__dirname, '..', 'data'),
  uploadDir: env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  seedDemo: env.SEED_DEMO !== 'false',
};
