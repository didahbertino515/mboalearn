// Point d'entrée : restaure la sauvegarde PostgreSQL (si configurée) avant d'ouvrir la base
const persist = require('./persist');

persist.restore()
  .catch((e) => {
    console.error('[persist] restauration impossible :', e.message);
    // Sans restauration, on refuse de démarrer : sinon une base vide écraserait la sauvegarde
    process.exit(1);
  })
  .then(() => {
    require('./index');
    persist.start();
  });
