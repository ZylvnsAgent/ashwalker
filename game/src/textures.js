// Procedural textures for Ember Yard: every surface is painted at load from a
// 2D canvas — no image files, no network. A seeded RNG makes the paint
// deterministic, so the dossier build and the screenshots are reproducible.
// Palette stays bright late-afternoon: light warm sand, sunlit rust, one ember accent.
import * as THREE from 'three';

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size, draw, seed) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size, mulberry32(seed));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function speckle(ctx, size, rng, colors, count, minR, maxR, alpha = 0.5) {
  for (let i = 0; i < count; i += 1) {
    ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    const r = minR + rng() * (maxR - minR);
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function cracks(ctx, size, rng, count, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 0; i < count; i += 1) {
    let x = rng() * size;
    let y = rng() * size;
    ctx.globalAlpha = 0.25 + rng() * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(rng() * 4);
    for (let s = 0; s < steps; s += 1) {
      x += (rng() - 0.5) * 46;
      y += (rng() - 0.5) * 46;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function stains(ctx, size, rng, colors, count, maxR) {
  for (let i = 0; i < count; i += 1) {
    ctx.globalAlpha = 0.10 + rng() * 0.16;
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.beginPath();
    ctx.ellipse(rng() * size, rng() * size, 12 + rng() * maxR, 8 + rng() * maxR * 0.7, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Weathered concrete block: light warm-grey base, aggregate speckle, hairline
// cracks, dark damp stains, dirt streaks running down, and concrete-block
// courses (horizontal mortar lines + staggered vertical joints) so perimeter
// walls read as built block.
function concreteDraw(ctx, size, rng) {
  ctx.fillStyle = '#6f6046';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rng, ['#7d6d50', '#5d4e38', '#8a7a5c', '#4a3d2c'], 1100, 0.5, 2.2);
  stains(ctx, size, rng, ['#4a3d2c', '#5d4e38', '#2e2113'], 9, 42);
  cracks(ctx, size, rng, 6, '#4a3d2c');
  // Dirt streaks running down from the top, like the photo's back wall.
  for (let i = 0; i < 12; i += 1) {
    const x = rng() * size;
    const len = 30 + rng() * 110;
    const y0 = rng() * size * 0.4;
    ctx.globalAlpha = 0.12 + rng() * 0.18;
    ctx.fillStyle = '#2e2113';
    ctx.fillRect(x, y0, 2 + rng() * 5, len);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(42,32,18,0.55)';
  ctx.lineWidth = 2;
  const course = size / 4;
  for (let y = 0; y <= size; y += course) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  for (let row = 0; row < 4; row += 1) {
    const off = (row % 2 === 0) ? size / 4 : 0;
    for (let x = off; x <= size; x += size / 2) {
      ctx.beginPath(); ctx.moveTo(x, row * course); ctx.lineTo(x, (row + 1) * course); ctx.stroke();
    }
  }
  // A faint horizontal formwork seam, like poured panels.
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#4a3d2c';
  ctx.fillRect(0, size * 0.5 - 1, size, 2);
  ctx.globalAlpha = 1;
}

// Yard sand: light warm tan base, large soft worn patches for distance
// variation, dense grain speckle, pebbles, oil stains and twin tyre ruts.
function sandDraw(ctx, size, rng) {
  ctx.fillStyle = '#a08a62';
  ctx.fillRect(0, 0, size, size);
  // Large-scale variation: soft light/dark worn patches so the yard is not
  // one flat colour at a distance.
  for (let i = 0; i < 9; i += 1) {
    ctx.globalAlpha = 0.08 + rng() * 0.08;
    ctx.fillStyle = rng() < 0.5 ? '#b59a6c' : '#7d6a48';
    ctx.beginPath();
    ctx.ellipse(rng() * size, rng() * size, 40 + rng() * 55, 28 + rng() * 40, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  speckle(ctx, size, rng, ['#b09a6e', '#8a7757', '#c0a878', '#6b5638'], 1700, 0.5, 2.4);
  // Scattered pebbles and debris.
  speckle(ctx, size, rng, ['#8a7a58', '#c8b088', '#5d4c30', '#9a8a6a'], 220, 1.5, 3.6, 0.6);
  stains(ctx, size, rng, ['#6b5638', '#7d6a48', '#4a3a24'], 9, 60);
  // Twin tyre ruts down the tile, plus a fainter second pair.
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#4a3a24';
  ctx.fillRect(size * 0.2, 0, 14, size);
  ctx.fillRect(size * 0.68, 0, 14, size);
  ctx.globalAlpha = 0.09;
  ctx.fillRect(size * 0.42, 0, 9, size);
  ctx.fillRect(size * 0.88, 0, 9, size);
  ctx.globalAlpha = 1;
  cracks(ctx, size, rng, 4, '#7d6a48');
}

// Yard asphalt: near-black warm base, dense aggregate, oil stains, cracks.
function asphaltDraw(ctx, size, rng) {
  ctx.fillStyle = '#1d150c';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rng, ['#241b12', '#2e2418', '#120d08', '#3a2c1c'], 1600, 0.5, 1.8);
  stains(ctx, size, rng, ['#0e0906', '#141009'], 7, 52);
  cracks(ctx, size, rng, 8, '#0e0906');
  // Worn lighter patches where boots and wheels pass.
  speckle(ctx, size, rng, ['#2e2418', '#3a2c1c'], 260, 1, 3.4, 0.25);
}

// Rusted corrugated metal: vertical ribs (light edge / dark groove), rust
// streaks running down from the top, scratches. Base differs per variant.
function corrugatedDraw(base, rust, hi) {
  return (ctx, size, rng) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const rib = 16; // px per corrugation
    for (let x = 0; x < size; x += rib) {
      const grad = ctx.createLinearGradient(x, 0, x + rib, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(0.35, hi);
      grad.addColorStop(0.65, 'rgba(0,0,0,0.12)');
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, rib, size);
    }
    // Rust streaks: vertical drips from random top points.
    for (let i = 0; i < 26; i += 1) {
      const x = rng() * size;
      const len = 20 + rng() * 130;
      const grad = ctx.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, rust);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.25 + rng() * 0.4;
      ctx.fillStyle = grad;
      ctx.fillRect(x, rng() * 40, 2 + rng() * 5, len);
    }
    ctx.globalAlpha = 1;
    speckle(ctx, size, rng, [rust, '#1c140c', hi], 240, 0.5, 2.4, 0.4);
    // Edge rust: heavy rust speckle along the bottom edge and the corners,
    // where water sits — the photo's containers rust from the edges in.
    for (let i = 0; i < 90; i += 1) {
      const x = rng() * size;
      const y = size - rng() * rng() * 34; // biased to the bottom edge
      ctx.globalAlpha = 0.3 + rng() * 0.45;
      ctx.fillStyle = rust;
      ctx.beginPath();
      ctx.arc(x, y, 1 + rng() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [cx, cy] of [[0, 0], [size, 0], [0, size], [size, size]]) {
      for (let i = 0; i < 22; i += 1) {
        ctx.globalAlpha = 0.25 + rng() * 0.4;
        ctx.fillStyle = rust;
        ctx.beginPath();
        ctx.arc(cx + (rng() - 0.5) * 44, cy + (rng() - 0.5) * 44, 1 + rng() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // A darker kick plate along the bottom edge.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#1c140c';
    ctx.fillRect(0, size - 10, size, 10);
    ctx.globalAlpha = 1;
  };
}

// Crate wood: horizontal planks, grain lines, knots, nail dots.
function woodDraw(ctx, size, rng) {
  ctx.fillStyle = '#6a4f30';
  ctx.fillRect(0, 0, size, size);
  const plank = size / 4;
  for (let p = 0; p < 4; p += 1) {
    const y0 = p * plank;
    ctx.fillStyle = p % 2 === 0 ? '#63492a' : '#705633';
    ctx.fillRect(0, y0, size, plank);
    // Grain: wavy darker lines along the plank.
    ctx.strokeStyle = 'rgba(30,20,10,0.5)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 5; g += 1) {
      const gy = y0 + 6 + rng() * (plank - 12);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= size; x += 16) ctx.lineTo(x, gy + Math.sin(x * 0.05 + p) * 2 + (rng() - 0.5) * 2);
      ctx.stroke();
    }
    // Plank gap + nails.
    ctx.fillStyle = 'rgba(12,8,4,0.8)';
    ctx.fillRect(0, y0 + plank - 2, size, 2);
    ctx.fillStyle = '#2a1c0e';
    ctx.beginPath();
    ctx.arc(10, y0 + plank / 2, 2.4, 0, Math.PI * 2);
    ctx.arc(size - 10, y0 + plank / 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  speckle(ctx, size, rng, ['#3a2a16', '#6b4f2e'], 140, 0.5, 1.6, 0.35);
}

// Hazard chevrons: ember-yellow / near-black diagonal stripes.
function hazardDraw(ctx, size, rng) {
  void rng;
  ctx.fillStyle = '#1c140c';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#c98a2e';
  const stripe = 32;
  for (let x = -size; x < size * 2; x += stripe * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + stripe, 0);
    ctx.lineTo(x + stripe - size, size);
    ctx.lineTo(x - size, size);
    ctx.closePath();
    ctx.fill();
  }
  // Grime over the stripes.
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#241b12';
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;
}

// Yard concrete (photo floor): light warm-grey concrete slabs — one 2 m slab
// per tile, hairline cracks, aggregate speckle, worn dark asphalt patches
// and oil stains. A working yard, not a flat colour.
function yardDraw(ctx, size, rng) {
  ctx.fillStyle = '#a89a80';
  ctx.fillRect(0, 0, size, size);
  // Large soft worn patches.
  for (let i = 0; i < 7; i += 1) {
    ctx.globalAlpha = 0.07 + rng() * 0.08;
    ctx.fillStyle = rng() < 0.5 ? '#b8a888' : '#8a7a62';
    ctx.beginPath();
    ctx.ellipse(rng() * size, rng() * size, 36 + rng() * 48, 26 + rng() * 36, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  speckle(ctx, size, rng, ['#b5a486', '#97876a', '#c0b090', '#7d6e54'], 1500, 0.5, 2.2);
  // Worn dark asphalt patches.
  stains(ctx, size, rng, ['#3a3230', '#4a423c', '#2e2a28'], 5, 52);
  // Oil stains.
  stains(ctx, size, rng, ['#241d16', '#1c1610'], 6, 26);
  // Slab seams: one 2 m slab per tile — dark lines at the borders.
  ctx.strokeStyle = 'rgba(52,42,28,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  // Hairline cracks across the slab.
  cracks(ctx, size, rng, 7, '#6b5c44', 1);
  // A few pebbles.
  speckle(ctx, size, rng, ['#8a7a58', '#c8b088', '#5d4c30'], 140, 1.5, 3.2, 0.6);
}

// White directional arrow (yard marking): shaft + head on transparency,
// slightly worn.
function arrowDraw(ctx, size, rng) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(235,232,222,0.9)';
  ctx.fillRect(size * 0.42, size * 0.42, size * 0.16, size * 0.42);
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.08);
  ctx.lineTo(size * 0.78, size * 0.48);
  ctx.lineTo(size * 0.62, size * 0.48);
  ctx.lineTo(size * 0.62, size * 0.42);
  ctx.lineTo(size * 0.38, size * 0.42);
  ctx.lineTo(size * 0.38, size * 0.48);
  ctx.lineTo(size * 0.22, size * 0.48);
  ctx.closePath();
  ctx.fill();
  // Wear: punch holes out of the paint.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 120; i += 1) {
    ctx.globalAlpha = 0.4 + rng() * 0.6;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, 0.5 + rng() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// Base grime: transparent at the top fading to dark at the bottom, with
// vertical dirt streaks — a skirt plane along the wall bases.
function grimeDraw(ctx, size, rng) {
  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(38,28,16,0)');
  grad.addColorStop(0.55, 'rgba(38,28,16,0.18)');
  grad.addColorStop(1, 'rgba(30,22,12,0.62)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 22; i += 1) {
    const x = rng() * size;
    const len = 20 + rng() * (size * 0.5);
    ctx.globalAlpha = 0.12 + rng() * 0.2;
    ctx.fillStyle = '#241a0e';
    ctx.fillRect(x, size - len, 2 + rng() * 4, len);
  }
  ctx.globalAlpha = 1;
}

// Stencilled cargo label ("NF.U" style): faded red stencil + white small
// lines on transparency, worn. Painted on container faces as a decal plane.
function stencilDraw(ctx, size, rng) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(178,52,38,0.9)';
  ctx.font = `900 ${size * 0.28}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NF.U', size / 2, size * 0.32);
  ctx.fillStyle = 'rgba(235,230,220,0.85)';
  ctx.font = `${size * 0.09}px Arial, sans-serif`;
  ctx.fillText('CARGO  GRID', size / 2, size * 0.55);
  ctx.fillText('MAX 30 480 KG', size / 2, size * 0.68);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 160; i += 1) {
    ctx.globalAlpha = 0.4 + rng() * 0.6;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, 0.5 + rng() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// Chain-link wire mesh: diagonal diamond grid on a transparent background.
// Used with alphaTest so it reads as mesh, not a solid panel.
function wireDraw(ctx, size, rng) {
  void rng;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#cfd4da';
  ctx.lineWidth = 2;
  const step = 16;
  for (let i = -size; i < size * 2; i += step) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i + size, 0); ctx.lineTo(i, size); ctx.stroke();
  }
}

// Soft radial dot: dust / smoke puffs and explosion glow (tinted by material).
function softDotDraw(ctx, size, rng) {
  void rng;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

// Hot spark dot: bright core, short falloff.
function sparkDotDraw(ctx, size, rng) {
  void rng;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,220,150,0.9)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

// Impact decal: irregular dark blotch with a scorched centre.
function decalDraw(ctx, size, rng) {
  const cx = size / 2;
  const cy = size / 2;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 26; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = (0.12 + rng() * 0.3) * size;
    ctx.globalAlpha = 0.35 + rng() * 0.4;
    ctx.fillStyle = i < 6 ? '#050403' : '#14100a';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, 3 + rng() * 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Muzzle-flash starburst: hot core plus four spikes.
function flashDraw(ctx, size, rng) {
  void rng;
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,190,90,0.95)');
  grad.addColorStop(0.6, 'rgba(255,120,30,0.45)');
  grad.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,220,140,0.9)';
  // Horizontal + vertical spikes, tapered.
  ctx.beginPath();
  ctx.moveTo(cx - size / 2, cy - 3);
  ctx.lineTo(cx + size / 2, cy - 3);
  ctx.lineTo(cx + size / 2, cy + 3);
  ctx.lineTo(cx - size / 2, cy + 3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 3, cy - size / 2);
  ctx.lineTo(cx + 3, cy - size / 2);
  ctx.lineTo(cx + 3, cy + size / 2);
  ctx.lineTo(cx - 3, cy + size / 2);
  ctx.closePath();
  ctx.fill();
}

// Painted site letter: a rough stencil letter for the ground marking.
function letterDraw(letter, color) {
  return (ctx, size, rng) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color;
    ctx.font = `900 ${size * 0.72}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, size / 2, size / 2 + size * 0.03);
    // Erode the paint: punch worn holes out of the letter.
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i += 1) {
      ctx.globalAlpha = 0.5 + rng() * 0.5;
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size, 1 + rng() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
}

// Site boundary ring: yellow border band with black hazard diagonals,
// painted on transparency so it reads as a floor marking.
function siteRingDraw(ctx, size, rng) {
  ctx.clearRect(0, 0, size, size);
  const band = size * 0.09;
  // Yellow band around the edge.
  ctx.fillStyle = '#d8a018';
  ctx.fillRect(0, 0, size, band);
  ctx.fillRect(0, size - band, size, band);
  ctx.fillRect(0, 0, band, size);
  ctx.fillRect(size - band, 0, band, size);
  // Black diagonal stripes clipped to the band.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size, band);
  ctx.rect(0, size - band, size, band);
  ctx.rect(0, 0, band, size);
  ctx.rect(size - band, 0, band, size);
  ctx.clip();
  ctx.fillStyle = '#1c140c';
  const stripe = size * 0.11;
  for (let x = -size; x < size * 2; x += stripe * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + stripe, 0);
    ctx.lineTo(x + stripe - size, size);
    ctx.lineTo(x - size, size);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // Wear: punch holes out of the paint.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 160; i += 1) {
    ctx.globalAlpha = 0.4 + rng() * 0.6;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, 0.5 + rng() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// Wall direction sign: big site letter + down arrow, spray-painted.
// Drawn for a 1.6 x 1.0 plane, so x is pre-squashed (1/1.6) to keep the
// letter and arrow undistorted once the square texture stretches.
function signDraw(letter) {
  return (ctx, size, rng) => {
    ctx.clearRect(0, 0, size, size);
    const squash = 1 / 1.6;
    // Site letter, left.
    ctx.save();
    ctx.translate(size * 0.30, size * 0.54);
    ctx.scale(squash, 1);
    ctx.fillStyle = '#3fae8a';
    ctx.font = `900 ${size * 0.62}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 0, 0);
    ctx.restore();
    // Down arrow, right.
    ctx.save();
    ctx.translate(size * 0.74, size * 0.54);
    ctx.scale(squash, 1);
    ctx.fillStyle = '#e8b23a';
    const w = size * 0.18;
    const h = size * 0.32;
    ctx.fillRect(-w * 0.22, -h, w * 0.44, h * 1.1);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(-w * 0.55, -h * 0.1);
    ctx.lineTo(w * 0.55, -h * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Wear: punch holes out of the paint.
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 140; i += 1) {
      ctx.globalAlpha = 0.4 + rng() * 0.6;
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size, 0.5 + rng() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
}

export function createTextures() {
  return {
    concrete: canvasTexture(256, concreteDraw, 11),
    asphalt: canvasTexture(256, asphaltDraw, 23),
    sand: canvasTexture(256, sandDraw, 29),
    corrugated: canvasTexture(256, corrugatedDraw('#5d422c', 'rgba(122,74,32,0.9)', 'rgba(170,122,72,0.55)'), 37),
    corrugatedDark: canvasTexture(256, corrugatedDraw('#453626', 'rgba(96,58,26,0.9)', 'rgba(130,100,62,0.5)'), 41),
    corrugatedRed: canvasTexture(256, corrugatedDraw('#6e3c2c', 'rgba(140,70,40,0.9)', 'rgba(195,125,80,0.55)'), 43),
    corrugatedBlue: canvasTexture(256, corrugatedDraw('#3d4e5e', 'rgba(90,70,50,0.9)', 'rgba(115,140,160,0.5)'), 47),
    corrugatedGrey: canvasTexture(256, corrugatedDraw('#5e5950', 'rgba(110,80,55,0.9)', 'rgba(155,148,138,0.5)'), 49),
    wire: canvasTexture(256, wireDraw, 101),
    yard: canvasTexture(256, yardDraw, 107),
    arrow: canvasTexture(256, arrowDraw, 109),
    grime: canvasTexture(128, grimeDraw, 103),
    stencil: canvasTexture(128, stencilDraw, 113),
    wood: canvasTexture(256, woodDraw, 53),
    hazard: canvasTexture(128, hazardDraw, 67),
    softDot: canvasTexture(64, softDotDraw, 71),
    sparkDot: canvasTexture(64, sparkDotDraw, 73),
    decal: canvasTexture(128, decalDraw, 79),
    flash: canvasTexture(128, flashDraw, 83),
    letterA: canvasTexture(256, letterDraw('A', '#3fae8a'), 89),
    letterB: canvasTexture(256, letterDraw('B', '#3fae8a'), 97),
    siteRing: canvasTexture(256, siteRingDraw, 131),
    signA: canvasTexture(256, signDraw('A'), 137),
    signB: canvasTexture(256, signDraw('B'), 139),
  };
}
