/**
 * 科技动态背景 - 粒子连线效果
 */
(function() {
  const canvas = document.getElementById('tech-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width, height, particles, animId;
  const PARTICLE_COUNT = 80;
  const MAX_DIST = 180;
  const SPEED = 0.4;

  // 颜色池 - 深靛蓝 + 电光青
  const COLORS = [
    'rgba(79, 70, 229, 0.6)',    // primary indigo
    'rgba(6, 182, 212, 0.5)',     // secondary cyan
    'rgba(129, 140, 248, 0.4)',   // primary-light
    'rgba(103, 232, 249, 0.4)',   // secondary-light
    'rgba(245, 158, 11, 0.3)',    // accent amber
  ];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * SPEED * 2,
      vy: (Math.random() - 0.5) * SPEED * 2,
      r: Math.random() * 2.5 + 1.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };
  }

  function init() {
    resize();
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle());
    }
  }

  function drawParticle(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }

  function drawLine(p1, p2, dist) {
    const alpha = 1 - dist / MAX_DIST;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = `rgba(79, 70, 229, ${alpha * 0.25})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      // 边界反弹
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      // 保持在边界内
      p.x = Math.max(0, Math.min(width, p.x));
      p.y = Math.max(0, Math.min(height, p.y));

      drawParticle(p);

      // 连线
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          drawLine(p, p2, dist);
        }
      }
    }

    animId = requestAnimationFrame(animate);
  }

  function drawStatic() {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < particles.length; i++) {
      drawParticle(particles[i]);
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = particles[i].x - p2.x;
        const dy = particles[i].y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) drawLine(particles[i], p2, dist);
      }
    }
  }

  // 页面隐藏时暂停动画，节省性能
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(animId);
    } else if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animate();
    }
  });

  window.addEventListener('resize', () => {
    resize();
  });

  init();

  // Respect prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    drawStatic();
  } else {
    animate();
  }
})();
