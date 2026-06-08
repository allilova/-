// Procedural scene generator for realistic computer vision demonstration presets

export interface ScenePreset {
  id: string;
  name: string;
  description: string;
  imagePath: string; // Will hold the generated Base64 Data URL
}

export function generatePresetDataUrl(type: 'coins' | 'screws' | 'caps'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 450;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  if (type === 'coins') {
    // Elegant wooden-like desk or soft gray card background
    const grad = ctx.createLinearGradient(0, 0, 450, 300);
    grad.addColorStop(0, '#f1f5f9'); // slate-100
    grad.addColorStop(1, '#e2e8f0'); // slate-200
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 450, 300);

    // Some paper fiber pattern
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 450; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i + Math.random() * 5, 0);
      ctx.lineTo(i + Math.random() * 5, 300);
      ctx.stroke();
    }
    
    // Draw 9 Scattered Coins (some touching / overlapping to demonstrate Watershed)
    // Coords: x, y, r, isGold, value/shading
    const coins = [
      { x: 90, y: 80, r: 24, isGold: true, text: "50" },
      { x: 140, y: 70, r: 22, isGold: false, text: "20" }, // touching first coin!
      { x: 280, y: 90, r: 18, isGold: false, text: "10" },
      { x: 360, y: 120, r: 26, isGold: true, text: "1" },
      { x: 120, y: 180, r: 24, isGold: true, text: "2" }, // Touching the one below!
      { x: 154, y: 210, r: 20, isGold: false, text: "5" },   // Overlapping / touching!
      { x: 230, y: 220, r: 16, isGold: true, text: "5" },
      { x: 80, y: 240, r: 15, isGold: false, text: "2" },
      { x: 310, y: 230, r: 25, isGold: false, text: "50" }
    ];

    coins.forEach(coin => {
      ctx.save();
      
      // Coin shadow
      ctx.shadowColor = 'rgba(15, 23, 42, 0.15)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 3;

      // Coin base gradient
      const coinGrad = ctx.createRadialGradient(coin.x - 5, coin.y - 5, 2, coin.x, coin.y, coin.r);
      if (coin.isGold) {
        coinGrad.addColorStop(0, '#fef08a'); // yellow 200
        coinGrad.addColorStop(0.7, '#ca8a04'); // yellow 600
        coinGrad.addColorStop(1, '#854d0e'); // yellow 800
      } else {
        coinGrad.addColorStop(0, '#f1f5f9'); // slate 100
        coinGrad.addColorStop(0.7, '#94a3b8'); // slate 400
        coinGrad.addColorStop(1, '#475569'); // slate 600
      }
      
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, coin.r, 0, 2 * Math.PI);
      ctx.fillStyle = coinGrad;
      ctx.fill();

      // Disable shadow for internal details
      ctx.shadowColor = 'transparent';

      // Coin rim
      ctx.strokeStyle = coin.isGold ? '#b45309' : '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner rim circle
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, coin.r - 3, 0, 2 * Math.PI);
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Face value indicator text
      ctx.fillStyle = coin.isGold ? '#78350f' : '#334155';
      ctx.font = `bold ${Math.round(coin.r * 0.7)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(coin.text, coin.x, coin.y);

      ctx.restore();
    });

  } else if (type === 'screws') {
    // Beautiful blueprint background or soft technical surface
    ctx.fillStyle = '#f8fafc'; // slate 50
    ctx.fillRect(0, 0, 450, 300);

    // Blue drafting grid lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)'; // sky 400 with opacity
    ctx.lineWidth = 1;
    for (let x = 0; x < 450; x += 15) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 300); ctx.stroke();
    }
    for (let y = 0; y < 300; y += 15) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(450, y); ctx.stroke();
    }

    // Presets: Washers (rings) and Screws (rectangles)
    // Washers (rings)
    const washers = [
      { x: 80, y: 90, outerR: 20, innerR: 8 },
      { x: 380, y: 70, outerR: 16, innerR: 6 },
      { x: 190, y: 220, outerR: 18, innerR: 7 }
    ];

    // Metallic fill gradient for flat elements
    const steelGrad = ctx.createLinearGradient(0, 0, 450, 300);
    steelGrad.addColorStop(0, '#94a3b8');
    steelGrad.addColorStop(0.5, '#cbd5e1');
    steelGrad.addColorStop(1, '#475569');

    washers.forEach(w => {
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;

      // Outer circle
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.outerR, 0, 2 * Math.PI);
      ctx.fillStyle = '#64748b';
      ctx.fill();

      // Inner hole cutout (erase)
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.innerR, 0, 2 * Math.PI);
      ctx.fillStyle = '#f8fafc'; // background color to simulate hole
      ctx.fill();

      // Stroke borders
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#334155';
      ctx.beginPath(); ctx.arc(w.x, w.y, w.outerR, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(w.x, w.y, w.innerR, 0, 2 * Math.PI); ctx.stroke();

      ctx.restore();
    });

    // Drawing elongated Screws/Bolts of darker oxide steel
    const screws = [
      { x: 260, y: 60, angle: 25, len: 65, thick: 10 },
      { x: 120, y: 180, angle: -45, len: 50, thick: 8 },
      { x: 320, y: 190, angle: 105, len: 70, thick: 12 }
    ];

    screws.forEach(s => {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate((s.angle * Math.PI) / 180);

      ctx.shadowColor = 'rgba(15, 23, 42, 0.15)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 3;

      // Dark steel / black oxide gradient
      const darkGrad = ctx.createLinearGradient(0, 0, 0, s.thick);
      darkGrad.addColorStop(0, '#334155');
      darkGrad.addColorStop(0.4, '#475569');
      darkGrad.addColorStop(1, '#1e293b');

      ctx.fillStyle = darkGrad;
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#0f172a';

      // 1. Bolt head (hexagon/rectangle at start)
      ctx.beginPath();
      ctx.rect(-6, -s.thick * 0.4, 6, s.thick * 1.8);
      ctx.fill();
      ctx.stroke();

      // 2. Bolt body
      ctx.beginPath();
      ctx.rect(0, 0, s.len, s.thick);
      ctx.fill();
      ctx.stroke();

      // Draw thread ridges
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      for (let rx = 10; rx < s.len - 5; rx += 4) {
        ctx.beginPath();
        ctx.moveTo(rx, 0);
        ctx.lineTo(rx, s.thick);
        ctx.stroke();
      }

      ctx.restore();
    });

  } else if (type === 'caps') {
    // Elegant light mint colored table surface
    ctx.fillStyle = '#fdfdfd';
    ctx.fillRect(0, 0, 450, 300);

    // Subtle radial floor gradient
    const ambient = ctx.createRadialGradient(225, 150, 50, 225, 150, 250);
    ambient.addColorStop(0, '#f8fafc');
    ambient.addColorStop(1, '#f1f5f9');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, 450, 300);

    // Scattered colorful caps: red, green, blue, yellow, orange
    // Perfect for RGB/HSV extraction demo!
    const caps = [
      { x: 100, y: 90, r: 28, color: '#ef4444', rimColor: '#b91c1c', label: 'RED' }, // Red
      { x: 230, y: 70, r: 26, color: '#3b82f6', rimColor: '#1d4ed8', label: 'BLUE' }, // Blue
      { x: 340, y: 110, r: 27, color: '#22c55e', rimColor: '#15803d', label: 'GREEN' }, // Green
      { x: 155, y: 210, r: 25, color: '#eab308', rimColor: '#a16207', label: 'YELLOW' }, // Yellow
      { x: 280, y: 220, r: 29, color: '#f97316', rimColor: '#c2410c', label: 'ORANGE' } // Orange
    ];

    caps.forEach(cap => {
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 4;

      // Cap Outer Rim
      ctx.beginPath();
      ctx.arc(cap.x, cap.y, cap.r, 0, 2 * Math.PI);
      ctx.fillStyle = cap.color;
      ctx.fill();

      // Disable shadow for inner folds
      ctx.shadowColor = 'transparent';

      // Cap ridges around outer circle
      ctx.strokeStyle = cap.rimColor;
      ctx.lineWidth = 1.5;
      for (let angle = 0; angle < 360; angle += 15) {
        const rad = (angle * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cap.x + (cap.r - 3) * Math.cos(rad), cap.y + (cap.r - 3) * Math.sin(rad));
        ctx.lineTo(cap.x + cap.r * Math.cos(rad), cap.y + cap.r * Math.sin(rad));
        ctx.stroke();
      }

      // Cap Inner Area
      ctx.beginPath();
      ctx.arc(cap.x, cap.y, cap.r - 4, 0, 2 * Math.PI);
      const innerGrad = ctx.createRadialGradient(cap.x - 3, cap.y - 3, 2, cap.x, cap.y, cap.r - 4);
      innerGrad.addColorStop(0, '#ffffff');
      innerGrad.addColorStop(0.1, cap.color);
      innerGrad.addColorStop(1, cap.rimColor);
      ctx.fillStyle = innerGrad;
      ctx.fill();

      // Cap center circle
      ctx.beginPath();
      ctx.arc(cap.x, cap.y, cap.r - 12, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    });
  }

  return canvas.toDataURL('image/png');
}
