# MboaLearn — cours de langues et soutien scolaire en ligne (Cameroun et diaspora)

Une place de marché complète de tuteurs, sur le modèle de Preply, adaptée au Cameroun : prix en FCFA, paiements **MTN Mobile Money / Orange Money**, programmes **BEPC, Probatoire, Bac, GCE O/A Level**, langues nationales, espace parents et classe virtuelle conçue pour la 3G/4G.

## Démarrage rapide

```bash
npm install
cp .env.example .env      # facultatif : le mode simulateur marche sans clé
npm start                 # http://localhost:3000
```

Node.js 22.13 ou plus est requis (la base SQLite intégrée `node:sqlite` est utilisée). Au premier lancement, des données de démonstration sont créées automatiquement. Le mot de passe de tous les comptes est `demo1234`.

| Rôle   | E-mail                 |
|--------|------------------------|
| Élève  | eleve@mboalearn.cm     |
| Tuteur | tuteur@mboalearn.cm    |
| Parent | parent@mboalearn.cm    |
| Admin  | admin@mboalearn.cm (en ligne : `ADMIN_EMAIL` / `ADMIN_PASSWORD`) |

Un cours de démonstration (salle `demo-classe`) commence 5 minutes après le premier lancement. Connectez-vous en élève dans un navigateur et en tuteur dans un autre, puis cliquez sur **Rejoindre**. Pour régénérer les données, supprimez le dossier `data/`.

## Fonctionnalités

### Équivalentes à Preply
- Recherche de tuteurs avec filtres : matière, niveau, prix, disponibilité, langue parlée, locuteur natif, ville, Super tuteur, tri.
- Profils avec vidéo YouTube, présentation, diplômes, avis, statistiques et disponibilités affichées dans le fuseau horaire de l'élève.
- Cours d'essai (un par tuteur), réservation de créneaux de 30 à 120 min, **réservation hebdomadaire récurrente** (jusqu'à 12 semaines).
- Forfaits de 5, 10 ou 20 cours (−5 % / −10 %).
- Déplacement et annulation (gratuits jusqu'à 12 h avant), réclamations, avis et notes, badge Super tuteur.
- Messagerie en temps réel avec pièces jointes, notifications en direct, favoris.
- **Classe virtuelle** : vidéo multi-participants WebRTC, partage d'écran, tableau blanc collaboratif, chat, partage de documents, notes partagées.
- Tableau de bord tuteur : gains, élèves, calendrier, gestion des disponibilités.
- Administration : validation des tuteurs, litiges, transactions, utilisateurs, réglage de la commission.

### En plus de Preply
- **Paiement MTN MoMo, Orange Money et carte bancaire** (diaspora), avec détection automatique de l'opérateur selon le numéro.
- **Séquestre** : l'argent de l'élève est bloqué puis versé au tuteur après le cours. Validation automatique 24 h après la fin du cours.
- **Retraits instantanés** des tuteurs vers MoMo/OM. Commission de 12 % (modifiable), cours d'essai inclus.
- **Soutien scolaire camerounais** : niveaux du SIL au Bac, sous-systèmes francophone et anglophone (GCE).
- **Cours collectifs** (préparation aux examens, clubs de conversation) à prix réduit.
- **Espace parents** : rattacher ses enfants, payer leurs cours, suivre devoirs, notes et progression, imprimer un bulletin.
- **Devoirs et quiz QCM auto-corrigés**, correction par le tuteur.
- **Vocabulaire en répétition espacée** (méthode Leitner), enregistrable pendant le cours.
- Gamification (XP, niveaux, série de jours), parrainage (1 000 FCFA offerts).
- Classe virtuelle enrichie : **mode économie de données 3G**, enregistrement du cours, main levée, réactions, pointeur laser, formes, texte, insertion d'images d'exercices, fond quadrillé ou ligné, export PNG, micro coupé par le professeur, indicateur de qualité réseau, salle d'attente avec test caméra et micro.
- Interface **bilingue français / anglais**, affichage des prix en XAF, EUR ou USD.

## Paiements (Cameroun)

Les montants sont en XAF (sans décimales) et les numéros au format `2376XXXXXXXX`. Choisissez le fournisseur dans `.env` :

| `PAYMENT_PROVIDER` | Mobile Money | Carte | Variables |
|---|---|---|---|
| `simulator` (par défaut) | simulé | simulée | aucune |
| `notchpay` | MTN + Orange (USSD direct) | oui | `NOTCHPAY_PUBLIC_KEY`, `NOTCHPAY_PRIVATE_KEY`, `NOTCHPAY_HASH_KEY` |
| `campay` | MTN + Orange | non | `CAMPAY_USERNAME`, `CAMPAY_PASSWORD`, `CAMPAY_WEBHOOK_KEY` |
| `flutterwave` | XAF Mobile Money | oui | `FLW_SECRET_KEY`, `FLW_SECRET_HASH` |

Les paiements par carte passent par Flutterwave, ou à défaut par NotchPay, si l'un des deux est configuré.

URL de webhook à déclarer chez le fournisseur : `https://VOTRE-DOMAINE/api/payments/webhook/<notchpay|campay|flutterwave>`.
Les signatures sont vérifiées (HMAC NotchPay, JWT CamPay, `verif-hash` Flutterwave suivi d'une revérification par l'API). Le traitement est idempotent : une transaction n'est créditée qu'une seule fois.

> Les connecteurs suivent la documentation publique de chaque fournisseur. **Testez-les dans leur environnement sandbox** avec vos propres clés avant d'encaisser de l'argent réel : le mode simulateur ne valide que la logique interne.

Circuit de l'argent : recharge → `wallet_balance` → réservation (`held_balance`, séquestre) → fin du cours → crédit du tuteur moins la commission → retrait vers MoMo/OM.

## Conserver les données gratuitement (PostgreSQL)

Sur l'offre gratuite de Render, le disque est effacé à chaque mise en veille. Si vous définissez `DATABASE_URL`, MboaLearn :
- restaure la base au démarrage ;
- la sauvegarde toutes les 20 secondes si elle a changé, et une dernière fois à l'arrêt du serveur ;
- stocke aussi les fichiers envoyés (photos, documents) dans PostgreSQL.

Avec **Neon** (https://neon.tech, gratuit, sans carte bancaire) :
1. Créez un projet (région Europe, par exemple Frankfurt).
2. Copiez la *connection string* (`postgresql://…neon.tech/neondb?sslmode=require`).
3. Collez-la dans Render (**Environment → `DATABASE_URL`**), puis enregistrez. Render redémarre le service.

Limites : en cas de panne brutale du serveur (sans arrêt propre), au plus les 20 dernières secondes de modifications peuvent être perdues. Ce mécanisme suppose une seule instance du serveur.

## E-mails (mot de passe oublié, rappels de cours)

Avec **Brevo** (https://www.brevo.com, gratuit jusqu'à 300 e-mails par jour), créez une clé API (*SMTP & API → API Keys*) et validez une adresse d'expéditeur. Renseignez ensuite `BREVO_API_KEY` et `MAIL_FROM` dans Render.
Sans clé, les e-mails ne partent pas : ils sont seulement écrits dans les journaux du serveur. Un administrateur peut alors générer un lien de réinitialisation depuis **Admin → Utilisateurs → 🔑** et l'envoyer par WhatsApp.

## Application mobile (PWA)

Le site s'installe comme une application : bouton **📲 Installer l'app** sur Android (Chrome), ou *Partager → Sur l'écran d'accueil* sur iPhone. L'interface reste accessible même quand la connexion coupe.

## Vérification des tuteurs

Le tuteur envoie sa pièce d'identité et ses diplômes depuis **Paramètres → Vérification du profil**.
Ces fichiers sont privés : ils ne sont jamais servis publiquement, et seuls le tuteur et l'administrateur peuvent les ouvrir.
L'administrateur les valide dans **Admin → Validation tuteurs**. Les badges « Identité vérifiée » et « Diplôme vérifié » apparaissent alors sur le profil public.

## Pages légales et données personnelles

- Les conditions d'utilisation et la politique de confidentialité sont accessibles via `#/legal/cgu` et `#/legal/privacy`. Leur acceptation est obligatoire à l'inscription et horodatée.
- **À compléter avant le lancement :** les champs entre crochets (raison sociale, RCCM, adresse, e-mail du support) dans `public/js/pages/legal.js`.
- Ces textes sont un modèle : faites-les relire par un juriste au Cameroun.
- Dans **Paramètres → Mes données**, chaque utilisateur peut télécharger toutes ses données (JSON) ou supprimer son compte.
  - La suppression anonymise le compte ; les cours et paiements sont conservés sans identité, pour la comptabilité.
  - Elle n'est possible qu'avec un solde nul et sans cours à venir.

## Sécurité

- Les tentatives de connexion sont limitées : 10 par quart d'heure pour un même compte, 50 par adresse IP.
- Les inscriptions, demandes de mot de passe, recharges, retraits et messages sont aussi limités.
- Les liens de réinitialisation sont à usage unique et valables 1 heure. Seule une empreinte du jeton est conservée.
- Dans la messagerie, les numéros de téléphone, e-mails et liens WhatsApp/Telegram sont masqués tant qu'aucun cours n'a été réservé entre les deux personnes (anti-contournement).
- Les paiements Mobile Money restés en attente sont revérifiés auprès du fournisseur toutes les 3 minutes, puis annulés après 24 h.

## Déploiement sur Render

Le fichier `render.yaml` décrit tout le déploiement.

1. Créez un compte sur https://render.com, avec l'option « GitHub » pour la connexion.
2. Allez dans **New → Blueprint** et choisissez le dépôt `mboalearn`. Autorisez Render à y accéder s'il le demande.
3. Renseignez `ADMIN_EMAIL` et `ADMIN_PASSWORD`, vos identifiants d'administrateur. Les clés de paiement peuvent rester vides pour l'instant : le simulateur est actif.
4. Cliquez sur **Apply**. Au bout de 3 à 5 minutes, le site est en ligne sur `https://mboalearn-xxxx.onrender.com`.

Remarques :
- Par défaut, `render.yaml` utilise l'**offre gratuite**, idéale pour tester. Les données sont effacées à chaque redémarrage (la démo se recrée automatiquement) et le site s'endort après 15 minutes d'inactivité.
- Pour le vrai lancement, passez à `plan: starter` (environ 7 USD par mois) et décommentez le bloc `disk` ainsi que `DATA_DIR` et `UPLOAD_DIR` dans `render.yaml`. La base de données et les fichiers envoyés seront alors conservés sur un disque persistant.
- Chaque `git push` sur `main` redéploie automatiquement le site.
- Avant le vrai lancement, mettez `SEED_DEMO=false`, supprimez le disque (ou la base), puis redéployez pour partir d'une base vide. Le compte administrateur sera recréé à partir de `ADMIN_EMAIL` et `ADMIN_PASSWORD`.
- Paiements réels : renseignez les clés du fournisseur, passez `PAYMENT_PROVIDER` à `notchpay` (ou `campay`), puis déclarez le webhook `https://VOTRE-URL/api/payments/webhook/notchpay`.
- Pour un nom de domaine (par exemple `mboalearn.cm`), allez dans **Settings → Custom Domains**. Le HTTPS est fourni automatiquement.

## Mise en production

- Définissez `APP_URL` (HTTPS obligatoire pour la caméra et le micro) et un `JWT_SECRET` long et aléatoire.
- **Serveur TURN** (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`, par exemple coturn) : indispensable sur les réseaux mobiles camerounais, où le STUN seul échoue souvent.
- Le maillage WebRTC convient aux cours individuels et aux petits groupes (jusqu'à environ 6 vidéos). Pour des groupes plus grands, remplacez la couche vidéo par un SFU (LiveKit ou mediasoup) en gardant la même signalisation Socket.IO.
- Placez le serveur derrière Nginx ou Caddy et sauvegardez régulièrement `data/` et `uploads/`.

## Tests automatiques

```bash
npm test
```

Les tests lancent un vrai serveur sur une base temporaire et vérifient notamment :
- les recharges Mobile Money (y compris l'absence de double crédit) ;
- le séquestre, le versement au tuteur moins la commission, les retraits et les remboursements ;
- la limitation des tentatives de connexion et l'accès à l'administration ;
- le mot de passe oublié ;
- le masquage des coordonnées ;
- la confidentialité des justificatifs ;
- l'export et la suppression de compte ;
- la recherche.

Lancez-les avant chaque mise en ligne.

## Structure

```
server/
  index.js            Express + Socket.IO (signalisation WebRTC, tableau blanc, chat de classe)
  db.js / seed.js     Schéma SQLite et données de démonstration
  payments/           providers.js (NotchPay, CamPay, Flutterwave, simulateur) · service.js (portefeuille, séquestre)
  routes/             auth, tutors, bookings, payments, messages, groups, learning, admin
public/
  js/core.js          API, i18n, utilitaires     js/app.js   routeur et en-tête
  js/pages/*.js       pages                      js/whiteboard.js   tableau blanc
  js/pages/classroom.js   classe virtuelle WebRTC
```
