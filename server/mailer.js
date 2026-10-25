// Envoi d'e-mails via l'API Brevo (offre gratuite : 300 e-mails/jour).
// Sans BREVO_API_KEY, les e-mails sont simplement écrits dans les journaux du serveur.
const config = require('./config');

function layout(title, body, cta) {
  return `<!doctype html><html><body style="margin:0;background:#f7f8fa;font-family:Segoe UI,Arial,sans-serif;color:#1e293b">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#0b7a4b;padding:18px 24px;color:#fff;font-size:20px;font-weight:600">Mboa<span style="color:#f5b700">Learn</span></div>
    <div style="padding:24px"><h2 style="margin:0 0 12px;color:#0f172a">${title}</h2>${body}
    ${cta ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#0b7a4b;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${cta.label}</a></p>` : ''}
    </div>
    <div style="padding:14px 24px;background:#f8fafc;font-size:12px;color:#64748b">MboaLearn — cours de langues et soutien scolaire en ligne</div>
  </div></body></html>`;
}

async function sendMail({ to, name, subject, title, body, cta }) {
  const html = layout(title || subject, body, cta);
  if (!config.mail.apiKey) {
    console.log(`[mail] (non envoyé : BREVO_API_KEY absente) à ${to} — ${subject}${cta ? ` — ${cta.url}` : ''}`);
    return false;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.mail.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: { email: config.mail.from, name: config.mail.fromName }, to: [{ email: to, name }], subject, htmlContent: html }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return true;
  } catch (e) {
    console.error('[mail] échec envoi', to, e.message);
    return false;
  }
}

module.exports = { sendMail, enabled: () => !!config.mail.apiKey };
