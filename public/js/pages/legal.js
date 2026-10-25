import { t, html, raw } from '../core.js';

// Les champs entre crochets sont à compléter par l'exploitant (raison sociale, RCCM, adresse…)
const UPDATED = '25 octobre 2026';
const OPERATOR = '[Raison sociale de l\'exploitant], [forme juridique], RCCM [numéro], [adresse], Cameroun — contact : [e-mail du support]';

const CGU = `
<h2>1. Objet</h2>
<p>MboaLearn est une plateforme qui met en relation des élèves, des parents et des tuteurs indépendants pour des cours de langues et de soutien scolaire en ligne (classe virtuelle) ou à domicile. Les présentes conditions régissent l'utilisation du site et de l'application.</p>
<p>Exploitant : ${OPERATOR}.</p>

<h2>2. Comptes</h2>
<ul>
  <li>L'inscription est gratuite. Les informations fournies doivent être exactes. Chacun est responsable de la confidentialité de son mot de passe.</li>
  <li>Un mineur utilise la plateforme sous la responsabilité d'un parent ou tuteur légal, qui peut créer un compte parent et y rattacher le compte de l'enfant.</li>
  <li>MboaLearn peut suspendre un compte en cas de fraude, de comportement inapproprié ou de non-respect des présentes conditions.</li>
</ul>

<h2>3. Tuteurs</h2>
<ul>
  <li>Les tuteurs sont des prestataires indépendants. Ils fixent librement leur tarif et leurs disponibilités, et sont responsables du contenu de leurs cours et de leurs obligations fiscales.</li>
  <li>Les profils sont vérifiés avant publication. Les badges « Identité vérifiée » et « Diplôme vérifié » indiquent qu'un justificatif a été contrôlé par l'équipe.</li>
  <li>MboaLearn prélève une commission sur chaque cours, indiquée dans l'espace tuteur (12 % par défaut, cours d'essai compris).</li>
</ul>

<h2>4. Paiements et séquestre</h2>
<ul>
  <li>Les prix sont exprimés en francs CFA (XAF). Le portefeuille se recharge par MTN Mobile Money, Orange Money ou carte bancaire, via des prestataires de paiement agréés.</li>
  <li>Le montant d'un cours est bloqué au moment de la réservation, puis versé au tuteur une fois le cours terminé (confirmation par l'une des parties ou automatiquement 24 h après la fin du cours en l'absence de réclamation).</li>
  <li>Les tuteurs retirent leurs gains vers un compte Mobile Money à leur nom.</li>
  <li>Le solde du portefeuille ne produit pas d'intérêts. Il peut être utilisé pour réserver des cours ; sa restitution peut être demandée au support.</li>
</ul>

<h2>5. Annulation, déplacement et remboursement</h2>
<ul>
  <li>L'élève peut annuler ou déplacer gratuitement un cours jusqu'à 12 h avant son début. Passé ce délai, le cours est dû au tuteur.</li>
  <li>Si le tuteur annule, l'élève est intégralement remboursé sur son portefeuille.</li>
  <li>En cas de problème (absence du tuteur, incident technique…), l'élève peut ouvrir une réclamation avant la clôture du cours. Le paiement reste bloqué jusqu'à la décision de l'équipe.</li>
</ul>

<h2>6. Règles de conduite</h2>
<ul>
  <li>Il est interdit de contourner la plateforme pour régler les cours en dehors de celle-ci. Les coordonnées (téléphone, e-mail) sont masquées dans la messagerie tant qu'aucun cours n'a été réservé.</li>
  <li>Sont interdits : propos injurieux, discriminatoires ou à caractère sexuel, harcèlement, contenus illicites, et tout comportement inapproprié envers un mineur.</li>
  <li>L'enregistrement d'un cours n'est permis qu'avec l'accord de tous les participants. Un message les en informe automatiquement.</li>
</ul>

<h2>7. Contenus</h2>
<p>Chacun reste propriétaire des documents qu'il partage, et garantit avoir le droit de les diffuser. Les avis doivent refléter une expérience réelle ; MboaLearn peut retirer un avis abusif.</p>

<h2>8. Responsabilité</h2>
<p>MboaLearn met tout en œuvre pour assurer la disponibilité du service, sans pouvoir garantir une absence totale d'interruption, notamment en cas de défaillance des réseaux de télécommunication. MboaLearn n'est pas partie au contrat de prestation conclu entre l'élève et le tuteur.</p>

<h2>9. Droit applicable et litiges</h2>
<p>Les présentes conditions sont soumises au droit camerounais. En cas de litige, une solution amiable est recherchée en priorité auprès du support ; à défaut, les tribunaux compétents du Cameroun sont saisis.</p>
`;

const PRIVACY = `
<h2>1. Responsable du traitement</h2>
<p>${OPERATOR}. Les données sont traitées conformément à la loi camerounaise relative à la protection des données à caractère personnel.</p>

<h2>2. Données collectées</h2>
<ul>
  <li><b>Compte</b> : nom, e-mail, téléphone, ville, photo, langue, mot de passe (stocké sous forme chiffrée irréversible).</li>
  <li><b>Tuteurs</b> : profil public, tarifs, disponibilités, numéro de versement Mobile Money, justificatifs (pièce d'identité, diplômes), consultables uniquement par l'équipe de vérification.</li>
  <li><b>Activité</b> : cours, messages, devoirs, notes de cours, tableau blanc, vocabulaire, avis.</li>
  <li><b>Paiements</b> : montants, opérateur, numéro utilisé, références de transaction. Les codes secrets Mobile Money et numéros de carte ne sont jamais reçus par MboaLearn : ils sont saisis chez l'opérateur ou le prestataire de paiement.</li>
  <li><b>Classe virtuelle</b> : la vidéo et le son circulent directement entre les participants et ne sont pas enregistrés par MboaLearn. Un enregistrement éventuel est réalisé localement par le participant qui le lance.</li>
</ul>

<h2>3. Finalités</h2>
<p>Fournir le service (réservations, classe virtuelle, messagerie), traiter les paiements et les versements, sécuriser la plateforme (prévention de la fraude, limitation des tentatives de connexion), envoyer les notifications et rappels de cours, assurer le support et respecter nos obligations légales et comptables.</p>

<h2>4. Destinataires</h2>
<p>Les données ne sont jamais vendues. Elles sont partagées uniquement avec : l'autre partie d'un cours (nom, photo, messages), les prestataires de paiement (NotchPay, CamPay ou Flutterwave), l'hébergeur et la base de données, et le service d'envoi d'e-mails. Les parents rattachés voient la progression, les cours et les devoirs de leur enfant.</p>

<h2>5. Durée de conservation</h2>
<p>Les données du compte sont conservées tant que le compte est actif. À la suppression du compte, les données personnelles sont effacées ou anonymisées ; les cours et transactions sont conservés sous forme anonymisée pendant la durée exigée par les obligations comptables et fiscales.</p>

<h2>6. Vos droits</h2>
<p>Vous pouvez à tout moment accéder à vos données et les télécharger, les rectifier, ou supprimer votre compte depuis <b>Paramètres → Mes données</b>. Pour toute autre demande (opposition, limitation, réclamation), écrivez au support. Vous pouvez également saisir l'autorité camerounaise compétente en matière de protection des données personnelles.</p>

<h2>7. Sécurité</h2>
<p>Connexions chiffrées (HTTPS), mots de passe hachés, liens de réinitialisation à usage unique, justificatifs stockés en accès restreint, limitation des tentatives de connexion et paiements en séquestre.</p>

<h2>8. Stockage local</h2>
<p>Le site utilise le stockage du navigateur uniquement pour vous garder connecté et mémoriser vos préférences (langue, devise), ainsi que pour fonctionner hors connexion lorsqu'il est installé comme application. Aucun cookie publicitaire n'est utilisé.</p>
`;

export default async function legal(app, { args }) {
  const page = args[0] === 'privacy' ? 'privacy' : 'cgu';
  app.innerHTML = html`
  <div class="container page narrow legal">
    <div class="tabs">
      <a href="#/legal/cgu" class="${page === 'cgu' ? 'active' : ''}">${t("Conditions d'utilisation", 'Terms of use')}</a>
      <a href="#/legal/privacy" class="${page === 'privacy' ? 'active' : ''}">${t('Confidentialité', 'Privacy')}</a>
    </div>
    <article class="card">
      <h1>${page === 'cgu' ? t("Conditions générales d'utilisation", 'Terms of use') : t('Politique de confidentialité', 'Privacy policy')}</h1>
      <p class="muted small">${t('Dernière mise à jour', 'Last updated')} : ${UPDATED}${t('', ' — this document is available in French only.')}</p>
      ${raw(page === 'cgu' ? CGU : PRIVACY)}
    </article>
  </div>`;
}
