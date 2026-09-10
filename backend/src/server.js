const { importPendingDatabase } = require('./db/import-persistent-db');
const importResult = importPendingDatabase();
if (importResult) console.log('Persistent SQLite import completed:', importResult.counts);
require('./db/init');
const app = require('./app');
const env = require('./config/env');

app.listen(env.port, env.host, () => {
  console.log(`LegalMetrix backend listening on http://${env.host}:${env.port}`);
});
