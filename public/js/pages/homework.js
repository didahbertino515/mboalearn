import { state, api, t, html, modal, toast, fmtDate } from '../core.js';
import { statusBadge, emptyState } from '../components.js';

export default async function homework(app) {
  const list = await api('/learning/homework');
  const role = state.user.role;
  app.innerHTML = html`
  <div class="container page">
    <h1 class="page-title">📝 ${t('Devoirs & quiz', 'Homework & quizzes')}</h1>
    <div class="hw-list">
      ${list.length ? list.map((h) => html`
        <article class="card hw">
          <div class="row between wrap">
            <div><h3>${h.title} ${h.quiz ? html`<span class="badge blue">Quiz · ${h.quiz.length} ${t('questions', 'questions')}</span>` : ''}</h3>
              <small class="muted">${role === 'tutor' ? `👤 ${h.student_name}` : `🧑‍🏫 ${h.tutor_name}`}${role === 'parent' ? ` · ${h.student_name}` : ''}${h.due_at ? ` · ${t('À rendre le', 'Due')} ${fmtDate(h.due_at, { dateStyle: 'medium' })}` : ''}</small></div>
            <div class="row gap">${h.score != null ? html`<b class="score">${h.score}/100</b>` : ''}${statusBadge(h.status)}</div>
          </div>
          ${h.instructions ? html`<p class="pre">${h.instructions}</p>` : ''}
          ${h.answer ? html`<div class="answer"><small class="muted">${t('Réponse', 'Answer')}</small><p class="pre">${h.answer}</p></div>` : ''}
          ${h.feedback ? html`<div class="feedback">💬 ${h.feedback}</div>` : ''}
          ${h.quiz && h.status !== 'assigned' ? html`<ol class="quiz-review">${h.quiz.map((q, i) => html`<li class="${h.quiz_answers?.[i] === q.answer ? 'ok' : 'ko'}">${q.question} — <b>${q.choices[h.quiz_answers?.[i]] ?? '—'}</b>${h.quiz_answers?.[i] !== q.answer && q.answer !== undefined ? html` <small>(${t('bonne réponse', 'correct')} : ${q.choices[q.answer]})</small>` : ''}</li>`)}</ol>` : ''}
          <div class="row end gap">
            ${role === 'student' && h.status === 'assigned' ? html`<button class="btn primary sm" data-do="${h.id}">${h.quiz ? t('Commencer le quiz', 'Start quiz') : t('Rendre le devoir', 'Submit')}</button>` : ''}
            ${role === 'tutor' && h.status === 'submitted' ? html`<button class="btn primary sm" data-grade="${h.id}">${t('Corriger', 'Grade')}</button>` : ''}
          </div>
        </article>`) : emptyState('📝', t('Aucun devoir pour le moment', 'No homework yet'), role === 'tutor' ? t('Donnez des devoirs à vos élèves depuis votre tableau de bord ou après un cours.', 'Assign homework from your dashboard.') : '')}
    </div>
  </div>`;
  const byId = Object.fromEntries(list.map((h) => [h.id, h]));
  const reload = () => homework(app);
  app.querySelectorAll('[data-do]').forEach((b) => { b.onclick = () => doHomework(byId[b.dataset.do], reload); });
  app.querySelectorAll('[data-grade]').forEach((b) => { b.onclick = () => gradeHomework(byId[b.dataset.grade], reload); });
}

function doHomework(h, done) {
  const m = modal(html`
    <h2>${h.title}</h2>
    ${h.instructions ? html`<p class="pre muted">${h.instructions}</p>` : ''}
    <form class="stack" data-f>
      ${h.quiz ? h.quiz.map((q, i) => html`<fieldset class="quiz-q"><legend>${i + 1}. ${q.question}</legend>${q.choices.map((c, j) => html`<label class="check"><input type="radio" name="q${i}" value="${j}" required> ${c}</label>`)}</fieldset>`) : ''}
      ${h.instructions || !h.quiz ? html`<label class="field"><span>${t('Votre réponse', 'Your answer')}</span><textarea name="answer" rows="6"></textarea></label>` : ''}
      <button class="btn primary" type="submit">${t('Envoyer', 'Submit')}</button>
    </form>`, { wide: true });
  m.el.querySelector('[data-f]').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await api(`/learning/homework/${h.id}/submit`, { method: 'POST', body: { answer: f.answer?.value || '', quiz_answers: (h.quiz || []).map((_, i) => Number(f[`q${i}`].value)) } });
      m.close();
      toast(r.score != null ? `${t('Score', 'Score')} : ${r.score}% 🎯` : t('Devoir rendu !', 'Submitted!'), 'success');
      done();
    } catch (err) { toast(err.message, 'error'); }
  };
}

function gradeHomework(h, done) {
  const m = modal(html`<h2>${t('Corriger', 'Grade')} : ${h.title}</h2><p class="pre">${h.answer}</p>
    <form class="stack" data-f><label class="field"><span>${t('Note /100', 'Score /100')}</span><input name="score" type="number" min="0" max="100" value="${h.score ?? ''}"></label>
    <label class="field"><span>${t('Commentaire', 'Feedback')}</span><textarea name="feedback" rows="4"></textarea></label><button class="btn primary" type="submit">${t('Valider', 'Save')}</button></form>`);
  m.el.querySelector('[data-f]').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/learning/homework/${h.id}/grade`, { method: 'POST', body: { score: e.target.score.value, feedback: e.target.feedback.value } });
      m.close();
      done();
    } catch (err) { toast(err.message, 'error'); }
  };
}

// Création d'un devoir (texte libre et/ou quiz QCM auto-corrigé)
export function assignHomework(studentId, studentName, bookingId) {
  const m = modal(html`
    <h2>${t('Nouveau devoir pour', 'New homework for')} ${studentName}</h2>
    <form class="stack" data-f>
      <label class="field"><span>${t('Titre', 'Title')}</span><input name="title" required></label>
      <label class="field"><span>${t('Consignes (laisser vide pour un quiz auto-corrigé)', 'Instructions (leave empty for an auto-graded quiz)')}</span><textarea name="instructions" rows="3"></textarea></label>
      <label class="field"><span>${t('À rendre le', 'Due')}</span><input name="due_at" type="date"></label>
      <div data-qs></div>
      <button type="button" class="btn ghost sm" data-addq>+ ${t('Ajouter une question QCM', 'Add a multiple-choice question')}</button>
      <button class="btn primary" type="submit">${t('Envoyer le devoir', 'Send homework')}</button>
    </form>`, { wide: true });
  const qs = m.el.querySelector('[data-qs]');
  let n = 0;
  m.el.querySelector('[data-addq]').onclick = () => {
    const i = n++;
    qs.insertAdjacentHTML('beforeend', html`<fieldset class="quiz-q" data-q="${i}"><legend>Question ${i + 1}</legend>
      <input name="q${i}" placeholder="${t('Énoncé', 'Question')}" required>
      ${[0, 1, 2, 3].map((j) => html`<label class="check"><input type="radio" name="a${i}" value="${j}" ${j === 0 ? 'checked' : ''} title="${t('Bonne réponse', 'Correct answer')}"><input name="c${i}_${j}" placeholder="${t('Choix', 'Choice')} ${j + 1}${j < 2 ? ' *' : ''}" ${j < 2 ? 'required' : ''}></label>`)}
      <small class="muted">${t('Cochez la bonne réponse', 'Tick the correct answer')}</small></fieldset>`.toString());
  };
  m.el.querySelector('[data-f]').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const quiz = [...qs.querySelectorAll('[data-q]')].map((el) => {
      const i = el.dataset.q;
      const choices = [0, 1, 2, 3].map((j) => f[`c${i}_${j}`].value.trim());
      const answer = Number(f[`a${i}`].value);
      const kept = choices.map((c, j) => [c, j]).filter(([c]) => c);
      return { question: f[`q${i}`].value, choices: kept.map(([c]) => c), answer: Math.max(0, kept.findIndex(([, j]) => j === answer)) };
    });
    try {
      await api('/learning/homework', { method: 'POST', body: { student_id: studentId, booking_id: bookingId, title: f.title.value, instructions: f.instructions.value, due_at: f.due_at.value || null, quiz } });
      m.close();
      toast(t('Devoir envoyé à', 'Homework sent to') + ' ' + studentName, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
}
