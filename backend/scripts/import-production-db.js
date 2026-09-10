const { importPendingDatabase, sourcePath, markerPath } = require('../src/db/import-persistent-db');

try {
  const result = importPendingDatabase();
  if (!result) {
    console.log(`No import marker found. Stage a source DB at ${sourcePath} and create ${markerPath}.`);
    process.exitCode = 1;
  } else {
    console.log('Persistent SQLite import completed:', result);
  }
} catch (error) {
  console.error(`Persistent SQLite import failed: ${error.message}`);
  process.exitCode = 1;
}
