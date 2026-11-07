// Each pair of child squares sits on the legs of a right triangle.
// Their areas sum to the parent square's area, even as the angle changes.
export function pythagorasSquares(a, b, angle, maxDepth = 6) {
  const squares = [];
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  function branch(start, end, depth) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx * dx + dy * dy < 16) return;
    const c = { x: end.x + dy, y: end.y - dx };
    const d = { x: start.x + dy, y: start.y - dx };
    squares.push({ corners: [start, end, c, d], depth });
    if (depth >= maxDepth) return;

    const apex = {
      x: d.x + dx * cosine * cosine + dy * sine * cosine,
      y: d.y + dy * cosine * cosine - dx * sine * cosine,
    };
    branch(d, apex, depth + 1);
    branch(apex, c, depth + 1);
  }

  branch(a, b, 0);
  return squares;
}

function mountBackground(canvas) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let frameId = 0;
  let lastFrame = 0;
  let lineColor;
  let nodeColor;

  function draw(seconds) {
    context.clearRect(0, 0, width, height);
    const compact = width < 700;
    const size = compact ? Math.min(width * .24, height * .16, 125) : Math.min(width * .15, height * .2, 170);
    const baseY = height + size * .35;
    const angle = Math.PI / 4 + Math.sin(seconds * .16) * Math.PI / 18;
    const squares = pythagorasSquares(
      { x: width * .8, y: baseY },
      { x: width * .8 + size, y: baseY },
      angle, compact ? 5 : 6,
    );

    if (!compact) {
      const smallSize = size * .6;
      const leftY = height + smallSize * .2;
      squares.push(...pythagorasSquares(
        { x: -smallSize * .2, y: leftY },
        { x: smallSize * .8, y: leftY },
        Math.PI / 4 - Math.sin(seconds * .13 + .8) * Math.PI / 20, 5,
      ));
    }

    const nodes = new Map();
    context.lineWidth = .7;
    context.lineJoin = 'round';
    context.strokeStyle = lineColor;
    context.fillStyle = nodeColor;

    for (const square of squares) {
      context.globalAlpha = .3 - square.depth * .021;
      context.beginPath();
      square.corners.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
        const key = `${Math.round(point.x * 10)},${Math.round(point.y * 10)}`;
        if (!nodes.has(key)) nodes.set(key, { ...point, depth: square.depth });
      });
      context.closePath();
      context.stroke();
    }

    for (const node of nodes.values()) {
      context.globalAlpha = .52 - node.depth * .035;
      context.beginPath();
      context.arc(node.x, node.y, Math.max(.65, 1.25 - node.depth * .09), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const styles = getComputedStyle(document.documentElement);
    lineColor = styles.getPropertyValue('--geometry-line').trim() || '#9da7a2';
    nodeColor = styles.getPropertyValue('--geometry-node').trim() || '#8c9690';
    draw(reducedMotion.matches ? 0 : performance.now() / 1000);
  }

  function frame(timestamp) {
    if (timestamp - lastFrame >= 1000 / 24) {
      draw(timestamp / 1000);
      lastFrame = timestamp;
    }
    frameId = window.requestAnimationFrame(frame);
  }

  function syncPlayback() {
    window.cancelAnimationFrame(frameId);
    frameId = 0;
    if (document.hidden) return;
    draw(reducedMotion.matches ? 0 : performance.now() / 1000);
    if (!reducedMotion.matches) {
      lastFrame = 0;
      frameId = window.requestAnimationFrame(frame);
    }
  }

  resize();
  syncPlayback();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('themechange', resize);
  document.addEventListener('visibilitychange', syncPlayback);
  reducedMotion.addEventListener('change', syncPlayback);
}

if (typeof document !== 'undefined') {
  const canvas = document.getElementById('pythagoras-background');
  if (canvas) mountBackground(canvas);
}
