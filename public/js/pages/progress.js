import { api, t, html, avatar, fmtDate } from '../core.js';

export default async function progress(app, { args }) {
  const p = await api(`/learning/progress/${args[0]}`);
  const maxW = Math.max(1, ...p.weekly.map((w) => w.minutes));
  const maxS = Math.max(1, ...p.bySubject.map((s) => s.minutes));
  app.innerHTML = html`
  <div class="container page">
    <div class="dash-head"><div class="row gap">${avatar(p.student.name, p.student.avatar, 64)}<div><h1>${t('Progression de', 'Progress of')} ${p.student.name}</h1>
      <p class="muted">${t('Niveau', 'Level')} ${p.level} · ${p.student.xp} XP · 🔥 ${p.student.streak_days} ${t('jours consécutifs', 'day streak')}</p></div></div>
      <button class="btn ghost" onclick="window.print()">🖨 ${t('Imprimer le bulletin', 'Print report')}</button></div>
    <div class="kpis">
      <div class="card kpi"><small>${t('Cours suivis', 'Lessons taken')}</small><b>${p.lessons.total}</b></div>
      <div class="card kpi"><small>${t("Heures d'apprentissage", 'Learning hours')}</small><b>${(p.lessons.minutes / 60).toFixed(1)} h</b></div>
      <div class="card kpi"><small>${t('Moyenne aux devoirs', 'Homework average')}</small><b>${p.homework.avg_score ?? '—'}${p.homework.avg_score != null ? '/100' : ''}</b><span class="small muted">${p.homework.done || 0}/${p.homework.total} ${t('rendus', 'submitted')}</span></div>
      <div class="card kpi"><small>${t('Vocabulaire maîtrisé', 'Vocabulary mastered')}</small><b>${p.vocab.mastered || 0}</b><span class="small muted">/ ${p.vocab.total} ${t('mots', 'words')}</span></div>
    </div>
    <div class="dash-grid two">
      <section class="card"><h3>${t('Temps de cours par semaine', 'Lesson time per week')}</h3>
        ${p.weekly.length ? html`<div class="bars">${p.weekly.map((w) => html`<div class="bar-col"><div class="bar-v" style="height:${Math.round((w.minutes / maxW) * 100)}%" title="${w.minutes} min"></div><small>S${w.week.slice(5)}</small></div>`)}</div>` : html`<p class="muted">—</p>`}
      </section>
      <section class="card"><h3>${t('Notes aux devoirs', 'Homework scores')}</h3>
        ${p.scores.length ? html`<div class="bars">${p.scores.map((s) => html`<div class="bar-col"><div class="bar-v ${s.score >= 50 ? '' : 'low'}" style="height:${s.score}%" title="${s.title} : ${s.score}"></div><small>${s.score}</small></div>`)}</div>` : html`<p class="muted">—</p>`}
      </section>
    </div>
    <div class="dash-grid two">
      <section class="card"><h3>${t('Par matière', 'By subject')}</h3>
        ${p.bySubject.map((s) => html`<div class="hbar"><span>${s.subject}</span><div class="bar"><i style="width:${Math.round((s.minutes / maxS) * 100)}%"></i></div><small>${s.n} ${t('cours', 'lessons')}</small></div>`)}
      </section>
      <section class="card"><h3>${t('Prochains cours', 'Upcoming lessons')}</h3>
        ${p.upcoming.length ? p.upcoming.map((u) => html`<div class="line"><b>${u.subject || ''}</b> · ${u.tutor_name}<br><small class="muted">${fmtDate(u.start_at, { dateStyle: 'full', timeStyle: 'short' })}</small></div>`) : html`<p class="muted">—</p>`}
      </section>
    </div>
  </div>`;
}
