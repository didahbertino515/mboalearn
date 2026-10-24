# MboaLearn — cours de langues et soutien scolaire en ligne (Cameroun et diaspora)

Une place de marché complète de tuteurs, sur le modèle de Preply, adaptée au Cameroun : prix en FCFA, paiements **MTN Mobile Money / Orange Money**, programmes **BEPC, Probatoire, Bac, GCE O/A Level**, langues nationales, espace parents et classe virtuelle conçue pour la 3G/4G.

## Démarrage rapide

```bash
npm install
cp .env.example .env      # facultatif : le mode simulateur marche sans clé
npm start                 # http://localhost:3000
```

Node.js 22.5 ou plus est requis (la base SQLite intégrée `node:sqlite` est utilisée). Au premier lancement, des données de démonstration sont créées automatiquement. Le mot de passe de tous les comptes est `demo1234`.

| Rôle   | E-mail                 |
|--------|------------------------|
| Élève  | eleve@mboalearn.cm     |
| Tuteur | tuteur@mboalearn.cm    |
| Parent | parent@mboalearn.cm    |
| Admin  | admin@mboalearn.cm     |

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

## Mise en production

- Définissez `APP_URL` (HTTPS obligatoire pour la caméra et le micro) et un `JWT_SECRET` long et aléatoire.
- **Serveur TURN** (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`, par exemple coturn) : indispensable sur les réseaux mobiles camerounais, où le STUN seul échoue souvent.
- Le maillage WebRTC convient aux cours individuels et aux petits groupes (jusqu'à environ 6 vidéos). Pour des groupes plus grands, remplacez la couche vidéo par un SFU (LiveKit ou mediasoup) en gardant la même signalisation Socket.IO.
- Placez le serveur derrière Nginx ou Caddy et sauvegardez régulièrement `data/` et `uploads/`.

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
