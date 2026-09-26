const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const normalize = value => String(value || '').replace(/\\/g, '/');

function resolveStoredPath(storedPath) {
  if (!storedPath) return null;
  if (path.isAbsolute(storedPath)) return path.resolve(storedPath);
  return path.resolve(env.rootDir, normalize(storedPath));
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
