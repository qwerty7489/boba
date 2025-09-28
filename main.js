// Simple Boba Maker in Phaser 3
// Single-file game logic for the boba maker

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1000, // widened so UI panel doesn't overlap cup
  height: 660,
  backgroundColor: 0xf7f2ee,
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

const game = new Phaser.Game(config);

let cupGroup, uiGroup;
let selectedSize = null;
let selectedFlavor = null;
let toppings = [];
let cupSprites = {};
let ordersContainer = null;
let ordersVisible = false;
let activeOrder = null; // only one customer at a time

function preload() {
  // No external assets required - we'll draw simple shapes and text
}

function create() {
  const scene = this;
  // expose size/flavor/topping choices for orders logic
  cupGroup = scene.add.group();
  uiGroup = scene.add.group();
  // Simple store background: wall, shelf, counter
  scene.add.rectangle(500, 330, 1000, 660, 0xf7f2ee); // overall
  const wall = scene.add.rectangle(500, 250, 920, 420, 0xfff6ec).setStrokeStyle(0, 0);
  // shelf (left area)
  const shelf = scene.add.rectangle(260, 110, 360, 22, 0xe6cfa9).setStrokeStyle(2, 0xd1b88a);
  for (let i = 0; i < 5; i++) {
    const jar = scene.add.circle(150 + i * 60, 110, 18, 0xd3b9a3).setStrokeStyle(2, 0xb58d78);
    uiGroup.add(jar);
  }
  // counter across bottom
  const counter = scene.add.rectangle(500, 520, 920, 220, 0xf0e6db).setStrokeStyle(2, 0xd6c3b4);

  // Right-side UI panel (distinct area so it never overlaps cup)
  const panelCenterX = 760;
  const panelCenterY = 330;
  const panelW = 420;
  const panelH = 560;
  const panel = scene.add.rectangle(panelCenterX, panelCenterY, panelW, panelH, 0xffffff).setStrokeStyle(2, 0xccc7c0);
  uiGroup.add(panel);

  // Title
  const titleText = scene.add.text(20, 12, 'Boba Maker', { font: '28px Arial', fill: '#4a2f2f' });
  uiGroup.add(titleText);

  // Cup display area (left side) - smaller rounded panel with no shadow so it doesn't cover the title
  const cupAreaBg = scene.add.graphics();
  cupAreaBg.fillStyle(0xffffff, 1);
  // make the cup panel just a little taller (height 480) and keep it centered at y=320
  cupAreaBg.fillRoundedRect(300 - 220, 320 - 240, 440, 480, 12);
  cupAreaBg.lineStyle(3, 0xdcdcdc, 1);
  cupAreaBg.strokeRoundedRect(300 - 220, 320 - 240, 440, 480, 12);
  uiGroup.add(cupAreaBg);

  // Create 4 cup size buttons
  const sizes = [
    { key: 'Tiny', radius: 60 },
    { key: 'Small', radius: 80 },
    { key: 'Medium', radius: 100 },
    { key: 'Large', radius: 120 }
  ];
  window._BA_SIZES = sizes;

  // Right-side UI panel
  // uiX is the left margin inside the panel where controls start
  const uiX = panelCenterX - panelW/2 + 24; // left padding inside panel
  // Sizes laid out horizontally at top of panel to save vertical space
  const chooseSizeText = scene.add.text(uiX, 54, 'Choose size:', { font: '18px Arial', fill: '#333' });
  uiGroup.add(chooseSizeText);

  sizes.forEach((s, i) => {
    const x = uiX + 20 + i * 96; // horizontal spacing
    const y = 110; // fixed row
    const btn = scene.add.rectangle(x + 36, y, 76, 76, 0xf1e6e6).setStrokeStyle(2, 0x9b7b7b);
    const label = scene.add.text(x + 10, y + 38, s.key, { font: '14px Arial', fill: '#3b2b2b' });
    btn.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => selectSize(scene, s))
      .on('pointerover', () => scene.tweens.add({ targets: btn, scale: 1.06, duration: 120 }))
      .on('pointerout', () => scene.tweens.add({ targets: btn, scale: 1.0, duration: 120 }));
  uiGroup.add(btn);
  uiGroup.add(label);
  });

  // Flavor buttons
  const flavors = [
    { key: 'Classic Milk Tea', color: 0xd6b08b },
    { key: 'Taro', color: 0xcaa1e8 },
    { key: 'Matcha', color: 0xa6d393 },
    { key: 'Brown Sugar', color: 0xd9b38a }
  ];
  window._BA_FLAVORS = flavors;

  // Two-column layout: flavors on the left, toppings on the right
  const colLeft = uiX + 12;
  const colRight = uiX + Math.floor(panelW / 2) + 6;

  const chooseFlavorText = scene.add.text(colLeft, 180, 'Choose flavor:', { font: '18px Arial', fill: '#333' });
  const toppingsTitleText = scene.add.text(colRight, 180, 'Toppings:', { font: '18px Arial', fill: '#333' });
  uiGroup.add(chooseFlavorText);
  uiGroup.add(toppingsTitleText);

  flavors.forEach((f, i) => {
    const x = colLeft;
    const y = 220 + i * 48; // spaced below sizes
    const btn = scene.add.rectangle(x + 110, y, 200, 36, 0xffffff).setStrokeStyle(2, 0x9b7b7b);
    const label = scene.add.text(x + 12, y - 8, f.key, { font: '14px Arial', fill: '#3b2b2b' });
    btn.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => selectFlavor(scene, f))
      .on('pointerover', () => scene.tweens.add({ targets: btn, scale: 1.03, duration: 120 }))
      .on('pointerout', () => scene.tweens.add({ targets: btn, scale: 1.0, duration: 120 }));
  uiGroup.add(btn);
  uiGroup.add(label);
  });

  // Toppings palette
  const toppingsList = [
    { key: 'Boba', color: 0x241f1f },
    { key: 'Mochi', color: 0xffc9d1 },
    { key: 'Pudding', color: 0xf0c969 },
    { key: 'Jelly', color: 0x8be3ff }
  ];
  window._BA_TOPPINGS = toppingsList;

  toppingsList.forEach((t, i) => {
    const x = colRight;
    const y = 220 + i * 48; // align vertically with flavors
    const btn = scene.add.rectangle(x + 90, y, 160, 36, 0xffffff).setStrokeStyle(2, 0x9b7b7b);
    const label = scene.add.text(x + 12, y - 8, t.key, { font: '14px Arial', fill: '#3b2b2b' });
    btn.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => addTopping(scene, t))
      .on('pointerover', () => scene.tweens.add({ targets: btn, scale: 1.03, duration: 120 }))
      .on('pointerout', () => scene.tweens.add({ targets: btn, scale: 1.0, duration: 120 }));
  uiGroup.add(btn);
  uiGroup.add(label);
  });

  // Serve button
  const serveBtn = scene.add.rectangle(panelCenterX, panelCenterY + panelH/2 - 56, 220, 56, 0x66bb6a).setStrokeStyle(2, 0x447a3d);
  const serveLabel = scene.add.text(serveBtn.x - 70, serveBtn.y - 18, 'Serve Drink', { font: '20px Arial', fill: '#fff' });
  serveBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
    serveDrink(scene);
  });
  uiGroup.add(serveBtn);
  uiGroup.add(serveLabel);
  serveBtn.on('pointerover', () => scene.tweens.add({ targets: serveBtn, scale: 1.04, duration: 140 }));
  serveBtn.on('pointerout', () => scene.tweens.add({ targets: serveBtn, scale: 1.0, duration: 120 }));

  // Reset button
  const resetBtn = scene.add.rectangle(panelCenterX - 140, panelCenterY + panelH/2 - 56, 140, 56, 0xff6b6b).setStrokeStyle(2, 0x8b3a3a);
  const resetLabel = scene.add.text(resetBtn.x - 40, resetBtn.y - 18, 'Reset', { font: '20px Arial', fill: '#fff' });
  resetBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
    reset(scene);
  });
  uiGroup.add(resetBtn);
  uiGroup.add(resetLabel);
  resetBtn.on('pointerover', () => scene.tweens.add({ targets: resetBtn, scale: 1.04, duration: 140 }));
  resetBtn.on('pointerout', () => scene.tweens.add({ targets: resetBtn, scale: 1.0, duration: 120 }));

  // Cup drawing container (left side) - moved down to fit inside the smaller panel
  cupSprites.container = scene.add.container(300, 320);
  drawCup(scene);

  // Orders UI (hidden by default)
  ordersContainer = scene.add.container(60, 100).setVisible(false);
  createOrdersUI(scene);

  // Nav buttons (Orders / Maker)
  const navOrders = scene.add.rectangle(860, 18, 120, 36, 0x5daee8).setOrigin(0,0).setInteractive({ useHandCursor: true }).setStrokeStyle(2,0x3b7ea6);
  const navOrdersLabel = scene.add.text(874, 24, 'Orders', { font: '16px Arial', fill: '#fff' });
  navOrders.on('pointerdown', () => showOrdersScreen(scene));

  const navMaker = scene.add.rectangle(740, 18, 120, 36, 0x9bd67a).setOrigin(0,0).setInteractive({ useHandCursor: true }).setStrokeStyle(2,0x6fa54e);
  const navMakerLabel = scene.add.text(760, 24, 'Maker', { font: '16px Arial', fill: '#fff' });
  navMaker.on('pointerdown', () => showMakerScreen(scene));

  // start with a single active order
  activeOrder = generateRandomOrder();
  refreshOrdersUI(scene);

  // Instructions
  const instructionsText = scene.add.text(20, 560, 'Tip: choose size first so the cup changes proportionally.', { font: '12px Arial', fill: '#555' });
  uiGroup.add(instructionsText);
}

function update() {
  // No continuous updates needed for this simple game
}

function selectSize(scene, size) {
  selectedSize = size;
  drawCup(scene);
}

function selectFlavor(scene, flavor) {
  selectedFlavor = flavor;
  drawCup(scene);
}

function addTopping(scene, topping) {
  // add multiple toppings so a click spawns a couple
  const counts = { 'Boba': 6, 'Mochi': 3, 'Pudding': 2, 'Jelly': 4 };
  const count = counts[topping.key] || 3;
  for (let i = 0; i < count; i++) {
    const t = { ...topping, id: Phaser.Utils.String.UUID() + '-' + i };
  toppings.push(t);
  }
  drawCup(scene);
}


function reset(scene) {
  selectedSize = null;
  selectedFlavor = null;
  toppings = [];
  drawCup(scene);
}

function serveDrink(scene) {
  if (!selectedSize || !selectedFlavor) {
    showTemporaryMessage(scene, 'Select size and flavor before serving!', 2000);
    return;
  }
  const summary = `Served: ${selectedSize.key} / ${selectedFlavor.key} / Toppings: ${toppings.map(t=>t.key).join(', ') || 'None'}`;
  showTemporaryMessage(scene, summary, 3500);
}

function showTemporaryMessage(scene, text, duration=2000) {
  const box = scene.add.rectangle(400, 80, 640, 56, 0x222222, 0.85).setStrokeStyle(2, 0xffffff, 0.6);
  const label = scene.add.text(120, 64, text, { font: '18px Arial', fill: '#fff' });
  scene.time.delayedCall(duration, () => {
    box.destroy();
    label.destroy();
  });
}

function drawCup(scene) {
  const c = cupSprites.container;
  // destroy any previous scene-level info text so we don't leak
  if (cupSprites.infoText) {
    cupSprites.infoText.destroy();
    cupSprites.infoText = null;
  }
  c.removeAll(true);
  // Aesthetic tapered boba cup rendering
  const size = selectedSize || { radius: 80 };
  const cupRadius = size.radius;
  const cupWidth = cupRadius * 1.6; // a bit wider for a realistic cup
  const cupHeight = cupRadius * 2.0; // taller cup

  // cup glass body (tapered)
  const topW = cupWidth;
  const bottomW = Math.max(40, Math.floor(cupWidth * 0.6));
  const h = cupHeight;

  // light glass fill (behind liquid)
  const glassFill = scene.add.graphics();
  glassFill.fillStyle(0xffffff, 0.06);
  glassFill.beginPath();
  glassFill.moveTo(-topW/2, -h/2);
  glassFill.lineTo(topW/2, -h/2);
  glassFill.lineTo(bottomW/2, h/2);
  glassFill.lineTo(-bottomW/2, h/2);
  glassFill.closePath();
  glassFill.fillPath();
  c.add(glassFill);
  // stop any existing cup bob tween so the cup stays static
  if (cupSprites.bobTween) {
    cupSprites.bobTween.stop();
    cupSprites.bobTween = null;
  }
  // draw the full straw first (it will be partially covered by liquid)
  const strawX = Math.floor(topW / 6);
  // slightly shorten the straw bottom so a small portion is cut off visually
  const strawCut = Math.max(6, Math.floor(cupRadius * 0.06));
  const strawFullH = Math.floor(h * 1.05) - strawCut;
  const strawTopY = Math.floor(-h/2 - 42); // keep the top of the straw anchored
  const strawFullCY = Math.floor(strawTopY + strawFullH / 2);
  const strawFull = scene.add.rectangle(strawX, strawFullCY, 16, strawFullH, 0xff8b9b).setAngle(-12).setOrigin(0.5);
  strawFull.setStrokeStyle(1, 0xcc6b75);
  const strawFullStripe = scene.add.rectangle(strawX, strawFullCY, 6, strawFullH, 0xffffff).setAngle(-12).setOrigin(0.5).setAlpha(0.85);
  c.add(strawFull);
  c.add(strawFullStripe);

  // remove separate straw sway tween so straw follows the cup tilt
  if (cupSprites.strawTween) cupSprites.strawTween.stop();

  // liquid (tapered to match the cup shape)
  const flavor = selectedFlavor ? selectedFlavor.color : 0xf0e7df;
  const liquid = scene.add.graphics();
  liquid.fillStyle(flavor, 1);
  const liquidTop = -h/2 + 26;
  // place liquid bottom at the cup inner bottom edge (no rim gap)
  const rimGap = 0;
  const liquidBottom = Math.floor(h/2);
  let liquidHeight = liquidBottom - liquidTop;
  if (liquidHeight < 28) liquidHeight = 28; // clamp for very small cups

  // inner widths for liquid: make the liquid reach the cup edges with a tiny rim
  const innerTopW = Math.max(12, topW - 4);
  const innerBottomW = Math.max(12, bottomW);

  // draw tapered liquid as polygon (top edge straight, bottom follows cup bottom width)
  liquid.beginPath();
  liquid.moveTo(-innerTopW/2, liquidTop);
  liquid.lineTo(innerTopW/2, liquidTop);
  liquid.lineTo(innerBottomW/2, liquidBottom);
  liquid.lineTo(-innerBottomW/2, liquidBottom);
  liquid.closePath();
  liquid.fillPath();
  c.add(liquid);

  // ensure liquid is static (no ripple)
  if (cupSprites.liquidTween) {
    cupSprites.liquidTween.stop();
    cupSprites.liquidTween = null;
  }
  liquid.setScale(1, 1);

  // subtle glare on the left side of the liquid
  const glare = scene.add.graphics();
  glare.fillStyle(0xffffff, 0.12);
  glare.fillEllipseShape(new Phaser.Geom.Ellipse(-innerTopW*0.22, liquidTop + Math.max(8, liquidHeight*0.18), innerTopW*0.24, Math.max(12, liquidHeight*0.6)));
  c.add(glare);

  // lid removed per request (no top oval)

  // (old straw visuals removed - replaced by full straw drawn earlier and upper straw piece later)

  // glass outline (on top) to show border and rim
  const glassStroke = scene.add.graphics();
  glassStroke.lineStyle(3, 0xcfc7c3, 1);
  glassStroke.beginPath();
  glassStroke.moveTo(-topW/2, -h/2);
  glassStroke.lineTo(topW/2, -h/2);
  glassStroke.lineTo(bottomW/2, h/2);
  glassStroke.lineTo(-bottomW/2, h/2);
  glassStroke.closePath();
  glassStroke.strokePath();
  c.add(glassStroke);
  // (no separate upper straw piece — full straw drawn earlier)

  // draw toppings positioned toward the bottom of the liquid area
  const txArea = { left: -innerBottomW/2 + 8, right: innerBottomW/2 - 8, top: liquidBottom - Math.min(48, liquidHeight * 0.22), bottom: liquidBottom - 2 };
  // Place toppings without overlap: try random positions near the bottom band but enforce min distance
  const placed = [];
  const totalT = toppings.length;
  for (let idx = 0; idx < totalT; idx++) {
    const t = toppings[idx];
    // estimate a radius/size for spacing
    const estRadius = (t.key === 'Boba') ? Math.max(6, Math.floor(cupRadius * 0.06)) : (t.key === 'Pudding' ? Math.max(12, Math.floor(cupRadius * 0.12)) : Math.max(10, Math.floor(cupRadius * 0.1)));
    const minDist = estRadius * 2 + 6;
    let x, y;
    let tries = 0;
    do {
      x = Phaser.Math.Between(txArea.left + 6, txArea.right - 6);
      y = Phaser.Math.Between(txArea.top + 4, txArea.bottom - 4);
      tries++;
      // stop early if there are no placed items
      if (placed.length === 0) break;
      // check distance against placed
    } while (tries < 60 && placed.some(p => Phaser.Math.Distance.Between(p.x, p.y, x, y) < minDist));
    placed.push({ x, y, r: estRadius });

    if (t.key === 'Boba') {
      const radius = estRadius;
      const b = scene.add.circle(x, y, radius, t.color).setStrokeStyle(1, 0x241f1f).setAlpha(0.98);
      const sb = scene.add.ellipse(x - Math.floor(radius * 0.35), y - Math.floor(radius * 0.35), Math.max(3, radius * 0.4), Math.max(2, radius * 0.3), 0xffffff).setAlpha(0.6);
      c.add(b);
      c.add(sb);
  // pop/drop animation for newly placed topping
  b.setScale(0.2);
  scene.tweens.add({ targets: b, scale: 1.0, duration: 260, ease: 'Back.easeOut' });
  sb.setScale(0.2);
  scene.tweens.add({ targets: sb, scale: 1.0, duration: 260, ease: 'Back.easeOut' });
    } else if (t.key === 'Mochi') {
      const w = Math.max(14, cupRadius * 0.14);
      const hrect = Math.max(10, cupRadius * 0.06);
      const r = scene.add.rectangle(x, y, w, hrect, t.color).setAngle(10).setStrokeStyle(1, 0xa06b7a).setAlpha(0.98);
      const hm = scene.add.ellipse(x - Math.floor(w * 0.2), y - Math.floor(hrect * 0.25), Math.max(6, w * 0.25), Math.max(4, hrect * 0.45), 0xffffff).setAlpha(0.5);
      c.add(r);
      c.add(hm);
  r.setScale(0.4);
  scene.tweens.add({ targets: r, scale: 1.0, duration: 300, ease: 'Back.easeOut' });
  hm.setScale(0.4);
  scene.tweens.add({ targets: hm, scale: 1.0, duration: 300, ease: 'Back.easeOut' });
    } else if (t.key === 'Pudding') {
      const p = scene.add.ellipse(x, y, Math.max(24, cupRadius * 0.26), Math.max(14, cupRadius * 0.12), t.color).setStrokeStyle(1, 0xcaa86a).setAlpha(0.98);
      const hp = scene.add.ellipse(x - 6, y - 6, Math.max(6, cupRadius * 0.12), Math.max(4, cupRadius * 0.07), 0xffffff).setAlpha(0.55);
      c.add(p);
      c.add(hp);
  p.setScale(0.4);
  scene.tweens.add({ targets: p, scale: 1.0, duration: 300, ease: 'Back.easeOut' });
  hp.setScale(0.4);
  scene.tweens.add({ targets: hp, scale: 1.0, duration: 300, ease: 'Back.easeOut' });
    } else {
      const poly = scene.add.polygon(x, y, [0, -10, 10, 0, 0, 10, -10, 0], t.color).setStrokeStyle(1, 0x4b9fb8).setAlpha(0.96);
      c.add(poly);
  poly.setScale(0.4);
  scene.tweens.add({ targets: poly, scale: 1.0, duration: 300, ease: 'Back.easeOut' });
    }
  }

  // info text below cup (scene-level so it doesn't move with the cup)
  const uniqueToppings = [...new Set(toppings.map(t => t.key))];
  const infoX = c.x - 140;
  const infoY = c.y + h / 2 + 46;
  cupSprites.infoText = scene.add.text(infoX, infoY, `Size: ${selectedSize ? selectedSize.key : '—'}  |  Flavor: ${selectedFlavor ? selectedFlavor.key : '—'}  |  Toppings: ${uniqueToppings.join(', ') || 'None'}`, { font: '16px Arial', fill: '#333' });
}

// --- Orders / Customers UI ---
function generateRandomOrder() {
  const sizes = window._BA_SIZES || [{key:'Medium', radius:100}];
  const flavors = window._BA_FLAVORS || [{key:'Classic Milk Tea', color:0xd6b08b}];
  const tops = window._BA_TOPPINGS || [{key:'Boba', color:0x241f1f}];
  const size = Phaser.Utils.Array.GetRandom(sizes);
  const flavor = Phaser.Utils.Array.GetRandom(flavors);
  const topCount = Phaser.Math.Between(1,3);
  const chosen = [];
  for (let i=0;i<topCount;i++) chosen.push(Phaser.Utils.Array.GetRandom(tops));
  return { id: Phaser.Utils.String.UUID(), size, flavor, toppings: chosen, served: false };
}

function createOrdersUI(scene) {
  // container themed background (shop wall, shelf, counter)
  const g = scene.add.graphics();
  // wall
  g.fillStyle(0xfff6ee, 1);
  g.fillRoundedRect(0, 0, 560, 480, 12);
  // subtle wall panel strip
  g.fillStyle(0xffefe3, 1);
  for (let i = 0; i < 6; i++) {
    g.fillRect(12 + i * 88, 16, 56, 6);
  }
  // shelf
  g.fillStyle(0xe6cfa9, 1);
  g.fillRect(36, 56, 488, 18);
  // jars on shelf
  for (let i = 0; i < 6; i++) {
    g.fillStyle(0xd3b9a3, 1);
    g.fillCircle(70 + i * 76, 66, 12);
    g.lineStyle(1, 0xb58d78, 1);
    g.strokeCircle(70 + i * 76, 66, 12);
  }
  // counter at bottom
  g.fillStyle(0xf0e6db, 1);
  g.fillRoundedRect(0, 360, 560, 120, 10);
  g.lineStyle(2, 0xd0c4b3, 1);
  g.strokeRoundedRect(0, 360, 560, 120, 10);
  ordersContainer.add(g);
  const title = scene.add.text(18, 12, 'Customer Orders', { font: '20px Arial', fill: '#4a2f2f' });
  ordersContainer.add(title);
  // orders list area placeholder
  const listArea = scene.add.container(12,48);
  ordersContainer.add(listArea);
  ordersContainer.listArea = listArea;
  // make a small counter for customers
  const hint = scene.add.text(12,440,'Customers will arrive over time...', { font: '12px Arial', fill: '#666' });
  ordersContainer.add(hint);
}

function refreshOrdersUI(scene) {
  const list = ordersContainer.listArea;
  list.removeAll(true);
  if (!activeOrder) {
    const empty = scene.add.text(12, 8, 'No customers right now. Wait a moment...', { font: '14px Arial', fill: '#666' });
    list.add(empty);
    return;
  }
  const o = activeOrder;
  const card = scene.add.rectangle(0,0,520,120,0xf8f8f8).setStrokeStyle(1,0xd8d8d8).setOrigin(0);
  const txt = scene.add.text(12, 8, `${o.size.key} | ${o.flavor.key}`, { font: '16px Arial', fill: '#222' });
  const ttxt = scene.add.text(12, 34, `Toppings: ${o.toppings.map(t=>t.key).join(', ')}`, { font: '14px Arial', fill: '#555' });
  const btn = scene.add.rectangle(420, 64, 84, 36, 0x6fc1d8).setOrigin(0.5).setInteractive({ useHandCursor: true });
  const bl = scene.add.text(396, 52, 'Make', { font: '14px Arial', fill: '#fff' }).setOrigin(0.5);
  btn.on('pointerdown', ()=> { loadOrderIntoMaker(scene, o); activeOrder = null; refreshOrdersUI(scene);
    // schedule next customer after a delay
    scene.time.delayedCall(3000, () => { activeOrder = generateRandomOrder(); refreshOrdersUI(scene); });
  });
  list.add(card); list.add(txt); list.add(ttxt); list.add(btn); list.add(bl);
}

function showOrdersScreen(scene) {
  ordersVisible = true;
  ordersContainer.setVisible(true);
  // hide maker UI (container and controls): we'll hide uiGroup for simplicity
  uiGroup.getChildren().forEach(ch => ch.setVisible(false));
  cupSprites.container.setVisible(false);
}

function showMakerScreen(scene) {
  ordersVisible = false;
  ordersContainer.setVisible(false);
  uiGroup.getChildren().forEach(ch => ch.setVisible(true));
  cupSprites.container.setVisible(true);
}

function loadOrderIntoMaker(scene, order) {
  // set choices and draw
  selectedSize = order.size;
  selectedFlavor = order.flavor;
  toppings = [...order.toppings];
  drawCup(scene);
  // switch to maker screen
  showMakerScreen(scene);
  showTemporaryMessage(scene, 'Loaded order — make it!', 1800);
}

// Expose some functions to window for debugging/test
window._boba = { reset, selectSize, selectFlavor, addTopping };
