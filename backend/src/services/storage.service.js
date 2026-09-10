const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const normalize = value => String(value || '').replace(/\\/g, '/');

function resolveStoredPath(storedPath) {
  if (!storedPath) return null;
  if (path.isAbsolute(storedPath)) return path.resolve(storedPath);
  const normalized = normalize(storedPath);
  const uploadRelativeToRoot = normalize(path.relative(env.rootDir, env.uploadDir));
  // Imported local databases store uploads as `uploads/<file>`. On Railway the
  // configured upload directory is `/app/persist/uploads`, so map that legacy
  // prefix to the configured directory without rewriting historic DB rows.
  if (normalized.startsWith('uploads/') && uploadRelativeToRoot !== 'uploads') {
    return path.resolve(env.uploadDir, normalized.slice('uploads/'.length));
  }
  return path.resolve(env.rootDir, normalized);
}

function toStoredPath(absolutePath) {
  return normalize(path.relative(env.rootDir, absolutePath));
}

function removeStoredFiles(paths) {
  const permittedRoots = [env.uploadDir, env.reportDir].map(directory => path.resolve(directory));
  for (const storedPath of paths.filter(Boolean)) {
    const absolutePath = resolveStoredPath(storedPath);
    if (absolutePath && permittedRoots.some(root => absolutePath.startsWith(`${root}${path.sep}`))) fs.rmSync(absolutePath, { force: true });
  }
}

module.exports = { resolveStoredPath, toStoredPath, removeStoredFiles };
