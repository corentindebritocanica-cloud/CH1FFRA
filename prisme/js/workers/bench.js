// Banc d'essai processeur : calcule des points de l'ensemble de Mandelbrot pendant une durée donnée
// et compte les itérations réalisées. Lancé dans un ou plusieurs Web Workers en parallèle.
self.onmessage = (e) => {
  const { id, ms } = e.data;
  const start = performance.now();
  let now = start;
  let last = start;
  let iters = 0;
  let seed = id * 7919 + 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  while (now - start < ms) {
    for (let k = 0; k < 4000; k++) {
      const cx = -2.1 + rand() * 2.7;
      const cy = -1.2 + rand() * 2.4;
      let x = 0, y = 0, n = 0;
      while (n < 256 && x * x + y * y < 4) {
        const xt = x * x - y * y + cx;
        y = 2 * x * y + cy;
        x = xt;
        n++;
      }
      iters += n;
    }
    now = performance.now();
    if (now - last > 60) {
      self.postMessage({ type: 'progress', id, p: Math.min(1, (now - start) / ms) });
      last = now;
    }
  }
  self.postMessage({ type: 'done', id, iters, ms: now - start });
};
