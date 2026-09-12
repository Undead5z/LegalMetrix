function memoryMegabytes(value) { return Math.round((value || 0) / 1024 / 1024); }
function logMemory(stage) {
  const usage = process.memoryUsage();
  console.log(`[MEM] ${stage} rss=${memoryMegabytes(usage.rss)}MB heap=${memoryMegabytes(usage.heapUsed)}MB external=${memoryMegabytes(usage.external)}MB buffers=${memoryMegabytes(usage.arrayBuffers)}MB`);
}
module.exports = { logMemory };
