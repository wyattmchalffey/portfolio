// game.js — Game engine: loop, rendering, input, collision, camera, UI

(() => {
'use strict';

// ── Constants ──────────────────────────────────────────────
const CANVAS_W = 384;
const CANVAS_H = 256;
const TS = TILE_SIZE; // from world.js
const PLAYER_SPEED = 1.5; // pixels per frame
const INTERACT_DIST = 1.2; // tiles
const TYPEWRITER_SPEED = 30; // ms per character
const PORTAL_ANIM_SPEED = 0.03;

// Water source tile positions (fountain + well)
const WATER_SOURCES = [
  { x: 19, y: 14 }, { x: 20, y: 14 },
  { x: 19, y: 15 }, { x: 20, y: 15 },
  { x: 19, y: 30 }, { x: 20, y: 30 },
];

// ── Canvas setup ───────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

// ── Sprite cache ───────────────────────────────────────────
const spriteCache = {};
const remoteSpriteCache = {}; // keyed by palette hash

function prerenderSprite(name, rows, palette) {
  const w = rows[0].length;
  const h = rows.length;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const oc = off.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      if (palette[ch]) {
        oc.fillStyle = palette[ch];
        oc.fillRect(x, y, 1, 1);
      }
    }
  }
  return off;
}

// Build a recolored player sprite set for a remote player's palette
function buildRemoteSprites(palette) {
  const key = palette.shirt + palette.pants + palette.hair;
  if (remoteSpriteCache[key]) return remoteSpriteCache[key];

  // Override the player palette colors with the remote palette
  const customPalette = {
    '0': '#3a2a1a',              // outline (keep)
    '1': palette.shirt,          // shirt
    '2': palette.pants,          // pants
    '4': palette.hair,           // hair dark
    'H': palette.hairLight,      // hair light
    'F': '#f0c8a0',              // skin (keep)
    'e': '#1a1a2e',              // eyes (keep)
  };

  const playerData = SPRITE_DATA.player;
  const cache = {};
  for (const [frameKey, frameRows] of Object.entries(playerData)) {
    if (frameKey === 'palette') continue;
    cache[frameKey] = prerenderSprite('remote_' + frameKey, frameRows, customPalette);
  }

  remoteSpriteCache[key] = cache;
  return cache;
}

function initSprites() {
  for (const [spriteName, data] of Object.entries(SPRITE_DATA)) {
    spriteCache[spriteName] = {};
    for (const [key, val] of Object.entries(data)) {
      if (key === 'palette') continue;
      spriteCache[spriteName][key] = prerenderSprite(
        `${spriteName}_${key}`, val, data.palette
      );
    }
  }
}

// ── Game state ─────────────────────────────────────────────
const state = {
  player: {
    x: PLAYER_START.x * TS + TS / 2,
    y: PLAYER_START.y * TS + TS / 2,
    w: 10, h: 8,  // collision box (smaller than sprite)
    dir: 'down',
    moving: false,
    animFrame: 0,
    animTimer: 0,
  },
  camera: { x: 0, y: 0 },
  keys: {},
  dialog: null,       // { lines, currentLine, charIndex, text, done, projectId }
  modal: null,        // project object or null
  interactTarget: null,  // nearest interactable
  areaLabel: { text: '', alpha: 0, timer: 0 },
  toast: { text: '', alpha: 0, timer: 0 },
  currentArea: '',
  showInstructions: true,
  portalAngle: 0,
  gameTime: 0,
};

// ── Input ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  state.keys[e.key.toLowerCase()] = true;
  state.keys[e.code] = true;

  // Dismiss instructions
  if (state.showInstructions) {
    state.showInstructions = false;
    document.getElementById('instructions').style.display = 'none';
    return;
  }

  // Library keyboard navigation
  if (Library.isUIOpen()) {
    e.preventDefault();
    if (e.key === 'Escape') {
      Library.closeUI();
    } else {
      Library.handleKey(e.key.toLowerCase(), e.code);
    }
    return;
  }

  // Store keyboard navigation
  if (Store.isUIOpen()) {
    e.preventDefault();
    if (e.key === 'Escape') {
      Store.closeUI();
    } else {
      Store.handleKey(e.key.toLowerCase(), e.code);
    }
    return;
  }

  // Crafting keyboard navigation
  if (Crafting.isUIOpen()) {
    e.preventDefault();
    if (e.key === 'Escape') {
      Crafting.closeUI();
    } else {
      Crafting.handleKey(e.key.toLowerCase(), e.code);
    }
    return;
  }

  // Garden keyboard navigation (when garden UI is open)
  if (Garden.isUIOpen()) {
    e.preventDefault();
    if (e.key === 'Escape') {
      Garden.closeUI();
    } else {
      Garden.handleKey(e.key.toLowerCase(), e.code);
    }
    return;
  }

  // Interact
  if (e.key.toLowerCase() === 'e' || e.code === 'Space') {
    e.preventDefault();
    handleInteract();
  }

  // Open journal to specific tabs
  if (!state.dialog && !state.modal) {
    var journalKeys = { 'i': 0, 'j': 2, 'm': 3 };
    var jk = journalKeys[e.key.toLowerCase()];
    if (jk !== undefined) {
      Garden.showJournal(jk);
      return;
    }
  }

  // Close modal
  if (e.key === 'Escape') {
    if (state.modal) closeModal();
    else if (state.dialog) closeDialog();
  }
});

document.addEventListener('keyup', (e) => {
  state.keys[e.key.toLowerCase()] = false;
  state.keys[e.code] = false;
});

function isKeyDown(key) {
  return !!state.keys[key];
}

// ── Collision detection ────────────────────────────────────
function isSolid(tileX, tileY) {
  if (tileX < 0 || tileY < 0 || tileX >= MAP_W || tileY >= MAP_H) return true;

  const ground = GROUND[tileY][tileX];
  const obj = OBJECT_LAYER[tileY][tileX];

  if (TILES[ground] && TILES[ground].solid) return true;
  if (obj !== 0 && OBJECTS[obj] && OBJECTS[obj].solid) return true;

  // NPC collision
  for (const npc of NPCS) {
    if (tileX === npc.x && tileY === npc.y) return true;
  }

  return false;
}

function collides(px, py, pw, ph) {
  // Check all tiles the player box overlaps
  const left   = Math.floor((px - pw / 2) / TS);
  const right  = Math.floor((px + pw / 2 - 0.1) / TS);
  const top    = Math.floor((py - ph / 2) / TS);
  const bottom = Math.floor((py + ph / 2 - 0.1) / TS);

  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (isSolid(tx, ty)) return true;
    }
  }
  return false;
}

// ── Toast ───────────────────────────────────────────────────
function showToast(text) {
  state.toast.text = text;
  state.toast.alpha = 1;
  state.toast.timer = 90; // frames
}
window.showToast = showToast;

// ── Movement & Update ──────────────────────────────────────
function update() {
  if (state.showInstructions || state.modal) return;

  state.gameTime++;
  state.portalAngle += PORTAL_ANIM_SPEED;

  // Toast fade
  if (state.toast.timer > 0) {
    state.toast.timer--;
    if (state.toast.timer < 20) {
      state.toast.alpha = state.toast.timer / 20;
    }
  }

  // Periodic garden recompute (~every 10s = 600 frames at 60fps)
  if (state.gameTime % 600 === 0) {
    Garden.recomputeAllPlots();
  }

  // Update dialog typewriter
  if (state.dialog && !state.dialog.done) {
    updateTypewriter();
    return; // Don't move while dialog is playing
  }
  if (state.dialog) return; // Dialog open but done typing — wait for dismiss
  if (Garden.isUIOpen()) return; // Garden UI open — block movement
  if (Library.isUIOpen()) return; // Library UI open — block movement
  if (Store.isUIOpen()) return;   // Store UI open — block movement
  if (Crafting.isUIOpen()) return; // Crafting UI open — block movement

  const p = state.player;
  let dx = 0, dy = 0;

  if (isKeyDown('w') || isKeyDown('arrowup'))    dy = -PLAYER_SPEED;
  if (isKeyDown('s') || isKeyDown('arrowdown'))   dy =  PLAYER_SPEED;
  if (isKeyDown('a') || isKeyDown('arrowleft'))   dx = -PLAYER_SPEED;
  if (isKeyDown('d') || isKeyDown('arrowright'))   dx =  PLAYER_SPEED;

  // Normalize diagonal
  if (dx !== 0 && dy !== 0) {
    dx *= 0.707;
    dy *= 0.707;
  }

  // Axis-independent collision
  if (dx !== 0 && !collides(p.x + dx, p.y, p.w, p.h)) {
    p.x += dx;
  }
  if (dy !== 0 && !collides(p.x, p.y + dy, p.w, p.h)) {
    p.y += dy;
  }

  // Clamp to world bounds
  p.x = Math.max(p.w / 2, Math.min(MAP_W * TS - p.w / 2, p.x));
  p.y = Math.max(p.h / 2, Math.min(MAP_H * TS - p.h / 2, p.y));

  // Direction
  p.moving = dx !== 0 || dy !== 0;
  if (p.moving) {
    if (Math.abs(dx) > Math.abs(dy)) {
      p.dir = dx > 0 ? 'right' : 'left';
    } else {
      p.dir = dy > 0 ? 'down' : 'up';
    }
    // Walk animation: 4-phase cycle (stand, step1, stand, step2)
    p.animTimer++;
    if (p.animTimer > 7) {
      p.animTimer = 0;
      p.animFrame = (p.animFrame + 1) % 4;
    }
  } else {
    p.animFrame = 0;
    p.animTimer = 0;
  }

  // Camera follow
  state.camera.x = Math.round(p.x - CANVAS_W / 2);
  state.camera.y = Math.round(p.y - CANVAS_H / 2);
  state.camera.x = Math.max(0, Math.min(MAP_W * TS - CANVAS_W, state.camera.x));
  state.camera.y = Math.max(0, Math.min(MAP_H * TS - CANVAS_H, state.camera.y));

  // Check interact target
  updateInteractTarget();

  // Update area label
  updateAreaLabel();

  // Multiplayer: broadcast position and interpolate remote players
  Multiplayer.broadcastPosition(state.player);
  Multiplayer.lerpRemotePlayers();
}

// ── Interaction ────────────────────────────────────────────
function updateInteractTarget() {
  const ptx = Math.floor(state.player.x / TS);
  const pty = Math.floor(state.player.y / TS);
  let nearest = null;
  let nearestDist = INTERACT_DIST + 1;

  // Check NPCs
  for (const npc of NPCS) {
    const dist = Math.hypot(npc.x - ptx, npc.y - pty);
    if (dist < INTERACT_DIST && dist < nearestDist) {
      nearest = { type: 'npc', data: npc };
      nearestDist = dist;
    }
  }

  // Check portals
  for (const portal of PORTALS) {
    const dist = Math.hypot(portal.x - ptx, portal.y - pty);
    if (dist < INTERACT_DIST && dist < nearestDist) {
      nearest = { type: 'portal', data: portal };
      nearestDist = dist;
    }
  }

  // Check library shelves
  const shelfHit = Library.getShelfNearPlayer(ptx, pty);
  if (shelfHit) {
    const dist = Math.hypot(shelfHit.tileX - ptx, shelfHit.tileY - pty);
    if (dist < INTERACT_DIST && dist < nearestDist) {
      nearest = { type: 'library_shelf', data: shelfHit };
      nearestDist = dist;
    }
  }

  // Check water sources
  for (const ws of WATER_SOURCES) {
    const dist = Math.hypot(ws.x - ptx, ws.y - pty);
    if (dist < INTERACT_DIST && dist < nearestDist) {
      nearest = { type: 'water_source', data: ws };
      nearestDist = dist;
    }
  }

  // Check garden plots
  const gardenHit = Garden.getPlotNearPlayer(ptx, pty);
  if (gardenHit) {
    const dist = Math.hypot(gardenHit.tileX - ptx, gardenHit.tileY - pty);
    if (dist < INTERACT_DIST && dist < nearestDist) {
      nearest = { type: 'garden_plot', data: gardenHit };
      nearestDist = dist;
    }
  }

  // Check store counter
  const counterHit = Store.getCounterNearPlayer(ptx, pty);
  if (counterHit) {
    const dist = Math.hypot(counterHit.tileX - ptx, counterHit.tileY - pty);
    if (dist < INTERACT_DIST && dist < nearestDist) {
      nearest = { type: 'store_counter', data: counterHit };
      nearestDist = dist;
    }
  }

  // Check crafting station
  const stationHit = Crafting.getStationNearPlayer(ptx, pty);
  if (stationHit) {
    const dist = Math.hypot(stationHit.tileX - ptx, stationHit.tileY - pty);
    if (dist < INTERACT_DIST && dist < nearestDist) {
      nearest = { type: 'crafting_station', data: stationHit };
      nearestDist = dist;
    }
  }

  state.interactTarget = nearest;

  // Show/hide prompt with context-sensitive text
  const prompt = document.getElementById('interact-prompt');
  if (nearest && !state.dialog && !state.modal && !Garden.isUIOpen() && !Library.isUIOpen() && !Store.isUIOpen() && !Crafting.isUIOpen()) {
    const labels = {
      npc: 'Talk',
      portal: 'Open',
      water_source: 'Collect Water',
      garden_plot: 'Garden',
      library_shelf: 'Read',
      store_counter: 'Shop',
      crafting_station: Crafting.isStationUnlocked() ? 'Craft' : 'Craft (locked)',
    };
    prompt.textContent = 'E: ' + (labels[nearest.type] || 'Interact');
    prompt.style.display = 'block';
  } else {
    prompt.style.display = 'none';
  }
}

function handleInteract() {
  // Advance dialog
  if (state.dialog) {
    if (!state.dialog.done) {
      // Skip to end of current line
      state.dialog.charIndex = state.dialog.lines[state.dialog.currentLine].length;
      state.dialog.done = true;
      renderDialogText();
    } else {
      // Next line
      state.dialog.currentLine++;
      if (state.dialog.currentLine >= state.dialog.lines.length) {
        closeDialog();
      } else {
        state.dialog.charIndex = 0;
        state.dialog.done = false;
        state.dialog.lastTick = performance.now();
      }
    }
    return;
  }

  if (!state.interactTarget) return;

  if (state.interactTarget.type === 'npc') {
    openNPCDialog(state.interactTarget.data);
  } else if (state.interactTarget.type === 'portal') {
    openPortalModal(state.interactTarget.data);
  } else if (state.interactTarget.type === 'library_shelf') {
    Library.handleShelfInteract(state.interactTarget.data.shelfIndex);
  } else if (state.interactTarget.type === 'water_source') {
    const result = Garden.collectWater();
    if (result === 'ok') {
      showToast('Water collected');
    } else if (result === 'full') {
      showToast('Water full');
    }
  } else if (state.interactTarget.type === 'garden_plot') {
    Garden.handlePlotInteract(state.interactTarget.data.plotIndex);
  } else if (state.interactTarget.type === 'store_counter') {
    Store.handleCounterInteract();
  } else if (state.interactTarget.type === 'crafting_station') {
    Crafting.handleStationInteract();
  }
}

// ── NPC Dialog ─────────────────────────────────────────────
function openNPCDialog(npc) {
  // Track NPC talk for quests
  if (window.Quests) Quests.onAction('talk_npc', npc.id);

  // Quest dialog interception
  let questDialog = null;
  if (window.Quests) {
    questDialog = Quests.getDialogForNPC(npc.id);
  }

  let lines;
  let projectId = npc.projectId;
  let questAction = null;
  let questId = null;

  if (questDialog) {
    lines = questDialog.lines;
    questAction = questDialog.action;
    questId = questDialog.questId;
  } else if (npc.id === 'guide') {
    lines = GUIDE_NPC.dialog;
  } else if (npc.dialog) {
    lines = npc.dialog;
  } else {
    const proj = PROJECTS.find(p => p.id === npc.projectId);
    lines = proj ? proj.npcDialog : ['...'];
  }

  // Face player
  const ptx = Math.floor(state.player.x / TS);
  const pty = Math.floor(state.player.y / TS);
  const dx = ptx - npc.x;
  const dy = pty - npc.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    npc.dir = dx > 0 ? 'right' : 'left';
  } else {
    npc.dir = dy > 0 ? 'down' : 'up';
  }

  state.dialog = {
    lines,
    currentLine: 0,
    charIndex: 0,
    done: false,
    projectId,
    questAction,
    questId,
    npcName: npc.id === 'guide' ? 'Guide' : (npc.name || PROJECTS.find(p => p.id === npc.projectId)?.name || 'NPC'),
    lastTick: performance.now(),
  };

  const dialogEl = document.getElementById('dialog-box');
  const nameEl = document.getElementById('dialog-name');
  nameEl.textContent = state.dialog.npcName;
  dialogEl.style.display = 'block';
  document.getElementById('interact-prompt').style.display = 'none';
}

function updateTypewriter() {
  const d = state.dialog;
  if (!d || d.done) return;

  const now = performance.now();
  if (now - d.lastTick >= TYPEWRITER_SPEED) {
    d.charIndex++;
    d.lastTick = now;
    const line = d.lines[d.currentLine];
    if (d.charIndex >= line.length) {
      d.charIndex = line.length;
      d.done = true;
    }
    renderDialogText();
  }
}

function renderDialogText() {
  const d = state.dialog;
  if (!d) return;
  const textEl = document.getElementById('dialog-text');
  const line = d.lines[d.currentLine];
  textEl.textContent = line.substring(0, d.charIndex);

  // Hide link (project links are accessed via portals)
  document.getElementById('dialog-link').style.display = 'none';

  // Show continue hint
  const hintEl = document.getElementById('dialog-hint');
  if (d.done) {
    hintEl.textContent = d.currentLine < d.lines.length - 1 ? '▼ Press E' : '✕ Press E';
    hintEl.style.display = 'block';
  } else {
    hintEl.style.display = 'none';
  }
}

function closeDialog() {
  // Handle quest actions before clearing state
  if (state.dialog && state.dialog.questAction && window.Quests) {
    var qa = state.dialog.questAction;
    var qi = state.dialog.questId;
    if (qa === 'offer') {
      Quests.acceptQuest(qi);
    } else if (qa === 'turnin') {
      Quests.completeQuest(qi);
    }
  }

  state.dialog = null;
  document.getElementById('dialog-box').style.display = 'none';
  document.getElementById('dialog-link').style.display = 'none';
  document.getElementById('dialog-hint').style.display = 'none';
}

// ── Portal Modal ───────────────────────────────────────────
function openPortalModal(portal) {
  const proj = PROJECTS.find(p => p.id === portal.projectId);
  if (!proj) return;
  state.modal = proj;

  const modal = document.getElementById('project-modal');
  document.getElementById('modal-title').textContent = proj.name;
  document.getElementById('modal-desc').textContent = proj.description;

  const tagsEl = document.getElementById('modal-tags');
  tagsEl.innerHTML = '';
  proj.tech.forEach(t => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = t;
    tagsEl.appendChild(span);
  });

  document.getElementById('modal-link').href = proj.url;
  modal.style.display = 'flex';
  document.getElementById('interact-prompt').style.display = 'none';
}

function closeModal() {
  state.modal = null;
  document.getElementById('project-modal').style.display = 'none';
}

// Wire up modal close
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('project-modal').addEventListener('click', (e) => {
  if (e.target.id === 'project-modal') closeModal();
});

// ── Area Labels ────────────────────────────────────────────
function updateAreaLabel() {
  const ptx = Math.floor(state.player.x / TS);
  const pty = Math.floor(state.player.y / TS);

  let current = '';
  for (const area of AREAS) {
    if (ptx >= area.x1 && ptx <= area.x2 && pty >= area.y1 && pty <= area.y2) {
      current = area.name;
      break;
    }
  }

  const al = state.areaLabel;
  if (current !== state.currentArea) {
    state.currentArea = current;
    if (current) {
      al.text = current;
      al.alpha = 1;
      al.timer = 120; // frames to display
      if (window.Quests) Quests.onAction('visit_area', current);
    }
  }

  if (al.timer > 0) {
    al.timer--;
    if (al.timer < 30) {
      al.alpha = al.timer / 30;
    }
  }
}

// ── Rendering ──────────────────────────────────────────────
function render() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const cam = state.camera;

  // Visible tile range
  const startCol = Math.max(0, Math.floor(cam.x / TS));
  const endCol   = Math.min(MAP_W - 1, Math.floor((cam.x + CANVAS_W) / TS));
  const startRow = Math.max(0, Math.floor(cam.y / TS));
  const endRow   = Math.min(MAP_H - 1, Math.floor((cam.y + CANVAS_H) / TS));

  // Draw ground layer
  for (let y = startRow; y <= endRow; y++) {
    for (let x = startCol; x <= endCol; x++) {
      const tileId = GROUND[y][x];
      const tile = TILES[tileId];
      if (!tile) continue;

      const dx = x * TS - cam.x;
      const dy = y * TS - cam.y;
      ctx.fillStyle = tile.color;
      ctx.fillRect(dx, dy, TS, TS);

      // Seeded pseudo-random per tile for stable texture
      const seed = (x * 7 + y * 13) & 0xFF;

      // Grass texture (tile 0, 6, 12)
      if (tileId === 0 || tileId === 6 || tileId === 12) {
        ctx.fillStyle = tileId === 12 ? 'rgba(80,160,80,0.25)' : 'rgba(60,100,40,0.2)';
        if (seed & 1)  ctx.fillRect(dx + 2, dy + 3, 1, 2);
        if (seed & 2)  ctx.fillRect(dx + 7, dy + 1, 1, 2);
        if (seed & 4)  ctx.fillRect(dx + 12, dy + 6, 1, 2);
        if (seed & 8)  ctx.fillRect(dx + 5, dy + 10, 1, 2);
        if (seed & 16) ctx.fillRect(dx + 10, dy + 12, 1, 2);
        if (seed & 32) ctx.fillRect(dx + 14, dy + 9, 1, 2);
        // Occasional flower dot on garden grass
        if (tileId === 12 && (seed & 0xC0) === 0xC0) {
          const flowerColors = ['#ff8888','#ffdd44','#88aaff','#ff88cc'];
          ctx.fillStyle = flowerColors[(seed >> 2) & 3];
          ctx.fillRect(dx + (seed & 7) + 4, dy + ((seed >> 3) & 7) + 4, 2, 2);
        }
      }

      // Cobblestone texture (tile 9)
      if (tileId === 9) {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        // Grid lines for stone edges
        ctx.fillRect(dx, dy + 7, TS, 1);
        ctx.fillRect(dx + (seed & 1 ? 5 : 8), dy, 1, 8);
        ctx.fillRect(dx + (seed & 2 ? 10 : 6), dy + 8, 1, 8);
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(dx + 1, dy + 1, 5, 5);
        ctx.fillRect(dx + 9, dy + 9, 5, 5);
      }

      // Path edge detail (tile 1, 7)
      if (tileId === 1 || tileId === 7) {
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        if (seed & 1) ctx.fillRect(dx + 1, dy + 14, 3, 1);
        if (seed & 2) ctx.fillRect(dx + 10, dy, 3, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        if (seed & 4) ctx.fillRect(dx + 4, dy + 4, 2, 1);
        if (seed & 8) ctx.fillRect(dx + 11, dy + 9, 2, 1);
      }

      // Floor wood grain (tile 3)
      if (tileId === 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(dx, dy + 4, TS, 1);
        ctx.fillRect(dx, dy + 11, TS, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(dx + (seed & 3), dy + 2, 6, 1);
        ctx.fillRect(dx + ((seed >> 2) & 3) + 5, dy + 9, 6, 1);
      }

      // Dark floor grain (tile 10)
      if (tileId === 10) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(dx, dy + 5, TS, 1);
        ctx.fillRect(dx, dy + 12, TS, 1);
        ctx.fillStyle = 'rgba(80,60,200,0.06)';
        ctx.fillRect(dx + 2, dy + 2, 4, 1);
      }

      // Wall top highlight (tile 2, 4, 11)
      if (tileId === 4 || tileId === 11 || tileId === 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(dx, dy, TS, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(dx, dy + 14, TS, 2);
      }

      // Water shimmer (tile 5)
      if (tileId === 5) {
        const shimmer = Math.sin(state.gameTime * 0.05 + x + y) * 0.15;
        ctx.fillStyle = `rgba(255,255,255,${0.1 + shimmer})`;
        ctx.fillRect(dx, dy, TS, TS);
        // Ripple lines
        const ripple = Math.sin(state.gameTime * 0.03 + x * 2) * 0.1;
        ctx.fillStyle = `rgba(100,180,220,${0.15 + ripple})`;
        ctx.fillRect(dx + 2, dy + 5, 12, 1);
        ctx.fillRect(dx + 4, dy + 11, 8, 1);
      }

      // Fence detail (tile 8)
      if (tileId === 8) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(dx, dy, TS, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(dx, dy + 15, TS, 1);
        // Vertical post marks
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(dx + 3, dy, 1, TS);
        ctx.fillRect(dx + 12, dy, 1, TS);
      }
    }
  }

  // Collect all entities for Y-sorting
  const entities = [];

  // Object layer entities
  for (let y = startRow; y <= endRow; y++) {
    for (let x = startCol; x <= endCol; x++) {
      const objId = OBJECT_LAYER[y][x];
      if (objId !== 0 && OBJECTS[objId]) {
        entities.push({ type: 'object', x, y, objId });
      }
    }
  }

  // Portals
  for (const portal of PORTALS) {
    if (portal.x >= startCol && portal.x <= endCol && portal.y >= startRow && portal.y <= endRow) {
      entities.push({ type: 'portal', x: portal.x, y: portal.y, data: portal });
    }
  }

  // NPCs
  for (const npc of NPCS) {
    if (npc.x >= startCol - 1 && npc.x <= endCol + 1 && npc.y >= startRow - 1 && npc.y <= endRow + 1) {
      entities.push({ type: 'npc', x: npc.x, y: npc.y, data: npc });
    }
  }

  // Garden plots
  const gardenPlots = Garden.getPlots();
  for (let i = 0; i < gardenPlots.length; i++) {
    const gp = gardenPlots[i];
    if (gp.tileX >= startCol - 1 && gp.tileX <= endCol + 1 &&
        gp.tileY >= startRow - 1 && gp.tileY <= endRow + 1) {
      entities.push({ type: 'garden_plot', x: gp.tileX, y: gp.tileY, plotIndex: i });
    }
  }

  // Remote players
  const remote = Multiplayer.getRemotePlayers();
  for (const id in remote) {
    const rp = remote[id];
    const rpTileX = rp.displayX / TS;
    const rpTileY = rp.displayY / TS;
    if (rpTileX >= startCol - 2 && rpTileX <= endCol + 2 &&
        rpTileY >= startRow - 2 && rpTileY <= endRow + 2) {
      entities.push({
        type: 'remote_player',
        x: rpTileX,
        y: rpTileY,
        data: rp,
      });
    }
  }

  // Player
  entities.push({
    type: 'player',
    x: state.player.x / TS,
    y: state.player.y / TS,
  });

  // Y-sort
  entities.sort((a, b) => a.y - b.y);

  // Draw entities
  for (const ent of entities) {
    switch (ent.type) {
      case 'object':        drawObject(ent.x, ent.y, ent.objId, cam); break;
      case 'portal':        drawPortal(ent.x, ent.y, cam); break;
      case 'npc':           drawNPC(ent.data, cam); break;
      case 'remote_player': drawRemotePlayer(ent.data, cam); break;
      case 'player':        drawPlayer(cam); break;
      case 'garden_plot':   Garden.drawPlot(ent.plotIndex, cam, ctx, state.gameTime); break;
    }
  }

  // Garden HUD: progress bars + harvest particles
  const gardenPlotsAll = Garden.getPlots();
  for (let i = 0; i < gardenPlotsAll.length; i++) {
    const gp = gardenPlotsAll[i];
    if (gp.tileX >= startCol - 1 && gp.tileX <= endCol + 1 &&
        gp.tileY >= startRow - 1 && gp.tileY <= endRow + 1) {
      Garden.drawPlotProgressIndicator(i, cam, ctx);
    }
  }
  Garden.drawHarvestParticles(cam, ctx);

  // Season indicator when in South Garden area
  if (state.currentArea === 'South Garden') {
    Garden.drawSeasonIndicator(ctx);
  }

  // Area label
  if (state.areaLabel.alpha > 0) {
    drawAreaLabel();
  }

  // Toast
  if (state.toast.alpha > 0) {
    drawToast();
  }

  // Minimap moved to journal Map tab
}

function drawObject(tx, ty, objId, cam) {
  const obj = OBJECTS[objId];
  if (!obj) return;

  const sx = tx * TS - cam.x;
  const sy = ty * TS - cam.y;

  ctx.fillStyle = obj.color;

  // Special rendering for some objects
  switch (objId) {
    case 20: // tree
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(sx + 3, sy + 13, 12, 3);
      // Trunk
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(sx + 6, sy + 8, 4, 8);
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(sx + 7, sy + 9, 2, 6); // bark highlight
      // Canopy layers
      ctx.fillStyle = '#1e5a1e';
      ctx.fillRect(sx + 1, sy + 2, 14, 8); // darkest
      ctx.fillStyle = '#2a6a2a';
      ctx.fillRect(sx + 2, sy + 1, 12, 8);
      ctx.fillStyle = '#3a7a3a';
      ctx.fillRect(sx + 3, sy + 0, 10, 7);
      ctx.fillStyle = '#4a8a4a';
      ctx.fillRect(sx + 5, sy + 1, 6, 4);  // top highlight
      // Leaf specks
      ctx.fillStyle = '#5a9a5a';
      ctx.fillRect(sx + 3, sy + 2, 2, 1);
      ctx.fillRect(sx + 10, sy + 4, 2, 1);
      break;
    case 21: // fountain
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(sx + 1, sy + 13, 14, 3);
      // Stone basin
      ctx.fillStyle = '#666677';
      ctx.fillRect(sx + 1, sy + 4, 14, 11);
      ctx.fillStyle = '#777788';
      ctx.fillRect(sx + 2, sy + 4, 12, 10);
      // Basin rim highlight
      ctx.fillStyle = '#888899';
      ctx.fillRect(sx + 2, sy + 4, 12, 1);
      // Water
      ctx.fillStyle = '#4477aa';
      ctx.fillRect(sx + 3, sy + 6, 10, 7);
      ctx.fillStyle = '#5588bb';
      ctx.fillRect(sx + 4, sy + 7, 8, 5);
      // Pillar
      ctx.fillStyle = '#8899aa';
      ctx.fillRect(sx + 6, sy + 1, 4, 9);
      ctx.fillStyle = '#99aabb';
      ctx.fillRect(sx + 7, sy + 2, 2, 7);
      // Pillar cap
      ctx.fillStyle = '#aabbcc';
      ctx.fillRect(sx + 5, sy + 1, 6, 2);
      // Animated water sparkles
      if (Math.sin(state.gameTime * 0.1 + tx) > 0.3) {
        ctx.fillStyle = 'rgba(200,230,255,0.8)';
        ctx.fillRect(sx + 5, sy + 3, 2, 1);
      }
      if (Math.cos(state.gameTime * 0.08 + ty) > 0.4) {
        ctx.fillStyle = 'rgba(180,220,255,0.6)';
        ctx.fillRect(sx + 9, sy + 4, 1, 1);
      }
      // Water ripple
      const fripple = Math.sin(state.gameTime * 0.06 + tx + ty);
      if (fripple > 0) {
        ctx.fillStyle = `rgba(150,200,240,${fripple * 0.3})`;
        ctx.fillRect(sx + 4, sy + 9, 8, 1);
      }
      break;
    case 33: // lamp post
      // Ground glow pool
      ctx.fillStyle = `rgba(255,220,100,${0.06 + Math.sin(state.gameTime * 0.04) * 0.03})`;
      ctx.fillRect(sx + 1, sy + 12, 14, 4);
      // Pole
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(sx + 7, sy + 4, 2, 12);
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(sx + 7, sy + 5, 1, 10); // highlight edge
      // Lamp housing
      ctx.fillStyle = '#444444';
      ctx.fillRect(sx + 4, sy + 2, 8, 4);
      ctx.fillStyle = '#ffdd66';
      ctx.fillRect(sx + 5, sy + 2, 6, 3);  // glass
      ctx.fillStyle = '#ffee88';
      ctx.fillRect(sx + 6, sy + 3, 4, 1);  // bright center
      // Top cap
      ctx.fillStyle = '#555555';
      ctx.fillRect(sx + 5, sy + 1, 6, 1);
      // Glow aura
      ctx.fillStyle = `rgba(255,220,100,${0.12 + Math.sin(state.gameTime * 0.04) * 0.05})`;
      ctx.fillRect(sx + 2, sy - 1, 12, 7);
      break;
    case 22: // desk
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(sx + 3, sy + 14, 12, 2);
      // Legs
      ctx.fillStyle = '#5a4020';
      ctx.fillRect(sx + 2, sy + 11, 2, 5);
      ctx.fillRect(sx + 12, sy + 11, 2, 5);
      // Desktop
      ctx.fillStyle = '#6a5030';
      ctx.fillRect(sx + 1, sy + 6, 14, 6);
      ctx.fillStyle = '#8a6a40';
      ctx.fillRect(sx + 2, sy + 7, 12, 4);
      // Surface shine
      ctx.fillStyle = '#9a7a50';
      ctx.fillRect(sx + 3, sy + 7, 8, 1);
      // Drawer knob
      ctx.fillStyle = '#c0a060';
      ctx.fillRect(sx + 7, sy + 10, 2, 1);
      break;
    case 23: // bookshelf
      // Frame
      ctx.fillStyle = '#4a3020';
      ctx.fillRect(sx + 1, sy + 1, 14, 14);
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(sx + 1, sy + 1, 14, 1);  // top edge
      // Shelf dividers
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(sx + 1, sy + 7, 14, 1);
      // Top row books
      ctx.fillStyle = '#cc4444';
      ctx.fillRect(sx + 2, sy + 2, 3, 5);
      ctx.fillStyle = '#dd5555';
      ctx.fillRect(sx + 3, sy + 2, 1, 5);  // spine highlight
      ctx.fillStyle = '#4488cc';
      ctx.fillRect(sx + 5, sy + 2, 3, 5);
      ctx.fillStyle = '#44aa44';
      ctx.fillRect(sx + 8, sy + 2, 3, 5);
      ctx.fillStyle = '#cc8844';
      ctx.fillRect(sx + 11, sy + 2, 3, 5);
      // Bottom row books
      ctx.fillStyle = '#ddaa44';
      ctx.fillRect(sx + 2, sy + 8, 4, 6);
      ctx.fillStyle = '#eebb55';
      ctx.fillRect(sx + 3, sy + 8, 1, 6);
      ctx.fillStyle = '#8855aa';
      ctx.fillRect(sx + 6, sy + 8, 4, 6);
      ctx.fillStyle = '#44aaaa';
      ctx.fillRect(sx + 10, sy + 8, 4, 6);
      break;
    case 24: // crate
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(sx + 3, sy + 14, 12, 2);
      // Body
      ctx.fillStyle = '#7a5a2a';
      ctx.fillRect(sx + 2, sy + 3, 12, 12);
      ctx.fillStyle = '#8a6a3a';
      ctx.fillRect(sx + 3, sy + 4, 10, 10);
      // Metal bands
      ctx.fillStyle = '#6a5020';
      ctx.fillRect(sx + 2, sy + 3, 12, 1);
      ctx.fillRect(sx + 7, sy + 3, 2, 12);
      ctx.fillRect(sx + 2, sy + 9, 12, 1);
      // Corner rivets
      ctx.fillStyle = '#aa8844';
      ctx.fillRect(sx + 3, sy + 4, 1, 1);
      ctx.fillRect(sx + 12, sy + 4, 1, 1);
      ctx.fillRect(sx + 3, sy + 13, 1, 1);
      ctx.fillRect(sx + 12, sy + 13, 1, 1);
      break;
    case 25: // banner
      // Pole
      ctx.fillStyle = '#555555';
      ctx.fillRect(sx + 7, sy + 0, 2, 4);
      ctx.fillStyle = '#666666';
      ctx.fillRect(sx + 7, sy + 0, 1, 4);
      // Flag body
      ctx.fillStyle = '#bb2222';
      ctx.fillRect(sx + 3, sy + 3, 10, 11);
      ctx.fillStyle = '#cc3333';
      ctx.fillRect(sx + 4, sy + 4, 8, 9);
      // Gold trim
      ctx.fillStyle = '#ddb833';
      ctx.fillRect(sx + 3, sy + 3, 10, 1);
      ctx.fillRect(sx + 3, sy + 13, 10, 1);
      // Emblem
      ctx.fillStyle = '#ffdd44';
      ctx.fillRect(sx + 6, sy + 6, 4, 4);
      ctx.fillStyle = '#ffee66';
      ctx.fillRect(sx + 7, sy + 7, 2, 2);
      break;
    case 26: // plant pot
      // Leaves
      ctx.fillStyle = '#339933';
      ctx.fillRect(sx + 3, sy + 1, 3, 4);
      ctx.fillRect(sx + 10, sy + 1, 3, 4);
      ctx.fillStyle = '#44aa44';
      ctx.fillRect(sx + 4, sy + 0, 2, 4);
      ctx.fillRect(sx + 10, sy + 0, 2, 4);
      // Center stem + leaves
      ctx.fillStyle = '#2a8a2a';
      ctx.fillRect(sx + 7, sy + 2, 2, 5);
      ctx.fillStyle = '#55bb55';
      ctx.fillRect(sx + 5, sy + 1, 2, 2);
      ctx.fillRect(sx + 9, sy + 2, 2, 2);
      // Pot
      ctx.fillStyle = '#994422';
      ctx.fillRect(sx + 4, sy + 7, 8, 3);
      ctx.fillStyle = '#aa5533';
      ctx.fillRect(sx + 5, sy + 7, 6, 2);  // rim highlight
      ctx.fillStyle = '#884420';
      ctx.fillRect(sx + 5, sy + 10, 6, 5);
      ctx.fillStyle = '#993a1a';
      ctx.fillRect(sx + 6, sy + 10, 4, 4);  // pot highlight
      break;
    case 27: // statue
      // Base shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(sx + 3, sy + 14, 12, 2);
      // Pedestal
      ctx.fillStyle = '#707070';
      ctx.fillRect(sx + 3, sy + 12, 10, 4);
      ctx.fillStyle = '#808080';
      ctx.fillRect(sx + 4, sy + 12, 8, 1);  // top edge
      // Body
      ctx.fillStyle = '#888888';
      ctx.fillRect(sx + 4, sy + 5, 8, 7);
      ctx.fillStyle = '#999999';
      ctx.fillRect(sx + 5, sy + 5, 6, 6);   // highlight
      // Arms
      ctx.fillStyle = '#888888';
      ctx.fillRect(sx + 3, sy + 6, 1, 4);
      ctx.fillRect(sx + 12, sy + 6, 1, 4);
      // Head
      ctx.fillStyle = '#999999';
      ctx.fillRect(sx + 5, sy + 1, 6, 5);
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(sx + 6, sy + 1, 4, 4);
      // Face
      ctx.fillStyle = '#bbbbbb';
      ctx.fillRect(sx + 7, sy + 2, 2, 2);
      break;
    case 29: // machine
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(sx + 2, sy + 14, 14, 2);
      // Body
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(sx + 1, sy + 2, 14, 13);
      ctx.fillStyle = '#4a4a5a';
      ctx.fillRect(sx + 2, sy + 2, 12, 12);
      // Beveled edge
      ctx.fillStyle = '#555566';
      ctx.fillRect(sx + 2, sy + 2, 12, 1);
      // Screen bezel
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(sx + 2, sy + 3, 12, 6);
      // Screen
      ctx.fillStyle = '#227744';
      ctx.fillRect(sx + 3, sy + 4, 10, 4);
      ctx.fillStyle = '#33aa66';
      ctx.fillRect(sx + 4, sy + 5, 8, 2);
      // Scan line effect
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(sx + 3, sy + 5, 10, 1);
      // Status lights
      ctx.fillStyle = '#cc4444';
      ctx.fillRect(sx + 3, sy + 10, 2, 2);
      ctx.fillStyle = '#44cc44';
      ctx.fillRect(sx + 7, sy + 10, 2, 2);
      ctx.fillStyle = '#4488cc';
      ctx.fillRect(sx + 11, sy + 10, 2, 2);
      // Vent grills
      ctx.fillStyle = '#333344';
      ctx.fillRect(sx + 3, sy + 13, 10, 1);
      break;
    case 30: // easel
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(sx + 3, sy + 14, 12, 2);
      // Legs
      ctx.fillStyle = '#7a5a2a';
      ctx.fillRect(sx + 4, sy + 9, 2, 7);
      ctx.fillRect(sx + 10, sy + 9, 2, 7);
      ctx.fillStyle = '#6a4a20';
      ctx.fillRect(sx + 7, sy + 11, 1, 5);  // back leg
      // Canvas frame
      ctx.fillStyle = '#8a6a3a';
      ctx.fillRect(sx + 3, sy + 1, 10, 10);
      // Canvas
      ctx.fillStyle = '#eeeedd';
      ctx.fillRect(sx + 4, sy + 2, 8, 8);
      // Painting content
      ctx.fillStyle = '#5588cc';
      ctx.fillRect(sx + 4, sy + 2, 8, 3);   // sky
      ctx.fillStyle = '#44aa44';
      ctx.fillRect(sx + 4, sy + 5, 8, 3);   // ground
      ctx.fillStyle = '#ffcc44';
      ctx.fillRect(sx + 9, sy + 2, 2, 2);   // sun
      ctx.fillStyle = '#cc5544';
      ctx.fillRect(sx + 5, sy + 5, 3, 4);   // house
      ctx.fillStyle = '#6a4a20';
      ctx.fillRect(sx + 6, sy + 7, 1, 2);   // door
      break;
    case 31: // arcade cabinet
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(sx + 4, sy + 14, 10, 2);
      // Cabinet body
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(sx + 3, sy + 1, 10, 14);
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(sx + 4, sy + 1, 8, 13);
      // Marquee
      ctx.fillStyle = '#cc3333';
      ctx.fillRect(sx + 4, sy + 1, 8, 2);
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(sx + 5, sy + 1, 6, 1);
      // Screen bezel
      ctx.fillStyle = '#111122';
      ctx.fillRect(sx + 4, sy + 3, 8, 6);
      // Screen
      ctx.fillStyle = '#2244aa';
      ctx.fillRect(sx + 5, sy + 4, 6, 4);
      // Screen content — little character
      ctx.fillStyle = '#44ddff';
      ctx.fillRect(sx + 6, sy + 5, 2, 2);
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(sx + 10, sy + 6, 1, 1);  // enemy dot
      // Control panel
      ctx.fillStyle = '#333344';
      ctx.fillRect(sx + 4, sy + 9, 8, 4);
      ctx.fillStyle = '#ffdd00';
      ctx.fillRect(sx + 6, sy + 10, 2, 2);  // joystick
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(sx + 10, sy + 10, 2, 1); // button
      ctx.fillStyle = '#44ff44';
      ctx.fillRect(sx + 10, sy + 11, 2, 1); // button 2
      break;
    case 32: // hedge
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(sx + 2, sy + 13, 14, 3);
      // Base
      ctx.fillStyle = '#1e5a1e';
      ctx.fillRect(sx + 1, sy + 2, 14, 13);
      // Body
      ctx.fillStyle = '#2a6a2a';
      ctx.fillRect(sx + 1, sy + 2, 14, 12);
      ctx.fillStyle = '#3a8a3a';
      ctx.fillRect(sx + 2, sy + 3, 12, 10);
      // Leaf detail
      ctx.fillStyle = '#4a9a4a';
      ctx.fillRect(sx + 3, sy + 3, 4, 3);
      ctx.fillRect(sx + 9, sy + 7, 4, 3);
      ctx.fillStyle = '#5aaa5a';
      ctx.fillRect(sx + 5, sy + 5, 2, 2);
      ctx.fillRect(sx + 10, sy + 4, 2, 2);
      break;
    case 34: // well
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(sx + 2, sy + 13, 14, 3);
      // Stone wall
      ctx.fillStyle = '#7a6a5a';
      ctx.fillRect(sx + 3, sy + 5, 10, 10);
      ctx.fillStyle = '#8a7a6a';
      ctx.fillRect(sx + 4, sy + 5, 8, 9);
      // Stone brick lines
      ctx.fillStyle = '#6a5a4a';
      ctx.fillRect(sx + 3, sy + 8, 10, 1);
      ctx.fillRect(sx + 3, sy + 11, 10, 1);
      // Water inside
      ctx.fillStyle = '#2a5a7a';
      ctx.fillRect(sx + 5, sy + 6, 6, 7);
      ctx.fillStyle = '#3a6a8a';
      ctx.fillRect(sx + 5, sy + 7, 6, 5);
      // Water shimmer
      if (Math.sin(state.gameTime * 0.08 + tx + ty) > 0.2) {
        ctx.fillStyle = 'rgba(150,200,240,0.4)';
        ctx.fillRect(sx + 6, sy + 8, 4, 1);
      }
      // Posts
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(sx + 2, sy + 1, 2, 12);
      ctx.fillRect(sx + 12, sy + 1, 2, 12);
      // Crossbeam
      ctx.fillStyle = '#6a5a4a';
      ctx.fillRect(sx + 2, sy + 1, 12, 2);
      // Roof peak
      ctx.fillStyle = '#7a6a5a';
      ctx.fillRect(sx + 4, sy + 0, 8, 1);
      // Rope/bucket detail
      ctx.fillStyle = '#8a7a5a';
      ctx.fillRect(sx + 7, sy + 3, 2, 3);
      break;
    case 35: // rug
      // Outer border
      ctx.fillStyle = '#b09050';
      ctx.fillRect(sx + 1, sy + 1, 14, 14);
      // Fringe detail
      ctx.fillStyle = '#c8a868';
      ctx.fillRect(sx + 2, sy + 2, 12, 12);
      // Inner pattern ring
      ctx.fillStyle = '#997744';
      ctx.fillRect(sx + 3, sy + 3, 10, 10);
      ctx.fillStyle = '#c8a868';
      ctx.fillRect(sx + 4, sy + 4, 8, 8);
      // Center diamond
      ctx.fillStyle = '#aa7733';
      ctx.fillRect(sx + 6, sy + 5, 4, 6);
      ctx.fillRect(sx + 5, sy + 6, 6, 4);
      ctx.fillStyle = '#bb8844';
      ctx.fillRect(sx + 7, sy + 7, 2, 2);  // center dot
      // Corner tassels
      ctx.fillStyle = '#c8a868';
      ctx.fillRect(sx + 1, sy + 0, 1, 1);
      ctx.fillRect(sx + 14, sy + 0, 1, 1);
      ctx.fillRect(sx + 1, sy + 15, 1, 1);
      ctx.fillRect(sx + 14, sy + 15, 1, 1);
      break;
    default:
      ctx.fillRect(sx + 2, sy + 2, 12, 12);
      break;
  }
}

function drawPortal(tx, ty, cam) {
  const sx = tx * TS - cam.x;
  const sy = ty * TS - cam.y;
  const t = state.portalAngle;

  // Animated glow
  const pulse = Math.sin(t * 3) * 0.3 + 0.5;
  const pulse2 = Math.cos(t * 2) * 0.2 + 0.3;

  // Ground shadow/glow
  ctx.fillStyle = `rgba(100,60,180,${0.1 + pulse2 * 0.1})`;
  ctx.fillRect(sx - 3, sy + 14, 22, 3);

  // Outer glow ring
  ctx.fillStyle = `rgba(100,70,200,${pulse2 * 0.7})`;
  ctx.fillRect(sx - 3, sy - 3, 22, 22);
  ctx.fillStyle = `rgba(130,100,220,${pulse2})`;
  ctx.fillRect(sx - 1, sy - 1, 18, 18);

  // Swirl layers
  ctx.fillStyle = `rgba(140,110,240,${pulse * 0.8})`;
  ctx.fillRect(sx + 1, sy + 1, 14, 14);
  ctx.fillStyle = `rgba(160,130,255,${pulse})`;
  ctx.fillRect(sx + 2, sy + 2, 12, 12);

  // Inner ring
  ctx.fillStyle = `rgba(180,160,255,${0.5 + pulse * 0.3})`;
  ctx.fillRect(sx + 3, sy + 3, 10, 10);

  // Core
  ctx.fillStyle = `rgba(210,200,255,${0.6 + pulse * 0.4})`;
  ctx.fillRect(sx + 5, sy + 5, 6, 6);

  // Bright center dot
  ctx.fillStyle = `rgba(240,235,255,${0.7 + pulse * 0.3})`;
  ctx.fillRect(sx + 6, sy + 6, 4, 4);

  // Multiple orbiting sparkles
  for (let i = 0; i < 3; i++) {
    const angle = t * (4 + i) + i * 2.1;
    const radius = 4 + i;
    const spX = sx + 7 + Math.sin(angle) * radius;
    const spY = sy + 7 + Math.cos(angle) * radius;
    const spAlpha = Math.sin(t * 5 + i * 1.5) * 0.3 + 0.6;
    ctx.fillStyle = `rgba(255,255,255,${spAlpha})`;
    ctx.fillRect(spX, spY, 2, 2);
  }

  // Rising particle motes
  for (let i = 0; i < 2; i++) {
    const moteY = sy + 12 - ((state.gameTime * 0.4 + i * 7) % 14);
    const moteX = sx + 4 + Math.sin(state.gameTime * 0.05 + i * 3) * 4;
    const moteAlpha = Math.max(0, 1 - Math.abs(moteY - sy - 5) / 8) * 0.6;
    ctx.fillStyle = `rgba(200,180,255,${moteAlpha})`;
    ctx.fillRect(moteX, moteY, 1, 1);
  }
}

function drawNPC(npc, cam) {
  const sx = npc.x * TS - cam.x;
  const sy = npc.y * TS - cam.y;
  const spriteSet = spriteCache[npc.sprite];
  if (!spriteSet) {
    // Fallback: simple colored rectangle
    ctx.fillStyle = '#ff88aa';
    ctx.fillRect(sx + 3, sy + 2, 10, 14);
    return;
  }

  // NPCs only have 'down' frame, use it for all directions
  // (or use direction if available)
  const frame = spriteSet[npc.dir] || spriteSet['down'];
  if (frame) {
    ctx.drawImage(frame, sx + 4, sy + 2);
  }

  // Quest indicator
  if (window.Quests) {
    const indicator = Quests.getIndicatorForNPC(npc.id);
    if (indicator) {
      const bounce = Math.sin(state.gameTime * 0.12) * 2;
      const ix = sx + 7;
      const iy = sy - 4 + bounce;
      if (indicator === '!') {
        // Yellow exclamation
        ctx.fillStyle = '#ffdd00';
        ctx.fillRect(ix, iy, 2, 3);
        ctx.fillRect(ix, iy + 4, 2, 1);
      } else {
        // Grey question mark
        ctx.fillStyle = '#999999';
        ctx.fillRect(ix, iy, 2, 1);
        ctx.fillRect(ix + 1, iy + 1, 1, 1);
        ctx.fillRect(ix, iy + 2, 2, 1);
        ctx.fillRect(ix, iy + 3, 1, 1);
        ctx.fillRect(ix, iy + 4, 1, 1);
      }
    }
  }
}

function drawPlayer(cam) {
  const p = state.player;
  const sx = Math.round(p.x - cam.x - 4); // center the 8-wide sprite
  const sy = Math.round(p.y - cam.y - 8); // offset upward for body height

  const spriteSet = spriteCache['player'];
  if (!spriteSet) return;

  // 4-phase walk cycle: 0=stand, 1=step1, 2=stand, 3=step2
  let frameKey;
  if (p.moving) {
    if (p.animFrame === 1) {
      frameKey = 'walk_' + p.dir + '_1';
    } else if (p.animFrame === 3) {
      frameKey = 'walk_' + p.dir + '_2';
    } else {
      frameKey = p.dir;
    }
  } else {
    frameKey = p.dir;
  }

  const frame = spriteSet[frameKey];
  if (frame) {
    ctx.drawImage(frame, sx, sy);
  }
}

function drawRemotePlayer(rp, cam) {
  if (!rp.palette || !rp.palette.shirt) return;

  const sprites = buildRemoteSprites(rp.palette);
  if (!sprites) return;

  const sx = Math.round(rp.displayX - cam.x - 4);
  const sy = Math.round(rp.displayY - cam.y - 8);

  // Same frame logic as local player
  let frameKey;
  if (rp.moving) {
    if (rp.animFrame === 1) {
      frameKey = 'walk_' + rp.dir + '_1';
    } else if (rp.animFrame === 3) {
      frameKey = 'walk_' + rp.dir + '_2';
    } else {
      frameKey = rp.dir;
    }
  } else {
    frameKey = rp.dir || 'down';
  }

  const frame = sprites[frameKey];
  if (frame) {
    // Draw slightly transparent so remote players are visually distinct
    ctx.globalAlpha = 0.85;
    ctx.drawImage(frame, sx, sy);
    ctx.globalAlpha = 1.0;
  }
}

function drawAreaLabel() {
  const al = state.areaLabel;
  ctx.save();
  ctx.globalAlpha = al.alpha;
  // Each pixel-font char is 3px wide + 1px gap = 4px per char, minus trailing gap
  const textWidth = al.text.replace(/ /g, '').length * 4 + (al.text.split(' ').length - 1) * 2 + 6;
  const x = Math.round((CANVAS_W - textWidth) / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, 8, textWidth, 9);
  Garden.drawPixelText(ctx, al.text, x + 3, 10, '#ffffff');
  ctx.restore();
}

function drawToast() {
  const t = state.toast;
  ctx.save();
  ctx.globalAlpha = t.alpha;
  const textWidth = t.text.replace(/ /g, '').length * 4 + (t.text.split(' ').length - 1) * 2 + 6;
  const x = Math.round((CANVAS_W - textWidth) / 2);
  const y = 20;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, textWidth, 9);
  Garden.drawPixelText(ctx, t.text, x + 3, y + 2, '#88bbff');
  ctx.restore();
}

function populateMapTab() {
  var canvas = document.getElementById('map-tab-canvas');
  if (!canvas) return;
  var mmScale = 6;
  canvas.width = MAP_W * mmScale;
  canvas.height = MAP_H * mmScale;
  var mc = canvas.getContext('2d');

  // Tiles
  for (var y = 0; y < MAP_H; y++) {
    for (var x = 0; x < MAP_W; x++) {
      var tileId = GROUND[y][x];
      var tile = TILES[tileId];
      if (tile) {
        mc.fillStyle = tile.color;
        mc.fillRect(x * mmScale, y * mmScale, mmScale, mmScale);
      }
    }
  }

  // Object outlines (walls, furniture feel)
  for (var y = 0; y < MAP_H; y++) {
    for (var x = 0; x < MAP_W; x++) {
      var objId = OBJECT_LAYER[y][x];
      if (objId) {
        var obj = OBJECTS[objId];
        if (obj) {
          mc.fillStyle = obj.color;
          mc.fillRect(x * mmScale, y * mmScale, mmScale, mmScale);
        }
      }
    }
  }

  // Area labels
  mc.font = 'bold 10px monospace';
  mc.textAlign = 'center';
  mc.textBaseline = 'middle';
  for (var i = 0; i < AREAS.length; i++) {
    var a = AREAS[i];
    var cx = ((a.x1 + a.x2) / 2) * mmScale;
    var cy = ((a.y1 + a.y2) / 2) * mmScale;
    mc.fillStyle = 'rgba(0,0,0,0.5)';
    var tw = mc.measureText(a.name).width;
    mc.fillRect(cx - tw/2 - 3, cy - 7, tw + 6, 14);
    mc.fillStyle = '#eeddcc';
    mc.fillText(a.name, cx, cy);
  }

  // Portal dots
  mc.fillStyle = '#aa77ff';
  for (var i = 0; i < PORTALS.length; i++) {
    var p = PORTALS[i];
    mc.beginPath();
    mc.arc(p.x * mmScale + mmScale/2, p.y * mmScale + mmScale/2, mmScale * 0.7, 0, Math.PI * 2);
    mc.fill();
  }

  // NPC dots
  mc.fillStyle = '#44ff44';
  for (var i = 0; i < NPCS.length; i++) {
    var npc = NPCS[i];
    mc.beginPath();
    mc.arc(npc.x * mmScale + mmScale/2, npc.y * mmScale + mmScale/2, mmScale * 0.6, 0, Math.PI * 2);
    mc.fill();
  }

  // Remote player dots
  mc.fillStyle = '#ffaa44';
  var remoteMap = Multiplayer.getRemotePlayers();
  for (var id in remoteMap) {
    var rp = remoteMap[id];
    var rpx = Math.floor(rp.displayX / TS);
    var rpy = Math.floor(rp.displayY / TS);
    mc.beginPath();
    mc.arc(rpx * mmScale + mmScale/2, rpy * mmScale + mmScale/2, mmScale * 0.6, 0, Math.PI * 2);
    mc.fill();
  }

  // Player dot (bigger, on top)
  var px = Math.floor(state.player.x / TS);
  var py = Math.floor(state.player.y / TS);
  mc.fillStyle = '#ff4444';
  mc.beginPath();
  mc.arc(px * mmScale + mmScale/2, py * mmScale + mmScale/2, mmScale * 0.8, 0, Math.PI * 2);
  mc.fill();
  mc.strokeStyle = '#ffffff';
  mc.lineWidth = 1;
  mc.stroke();
}
window.populateMapTab = populateMapTab;

// ── Game loop ──────────────────────────────────────────────
function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

// ── Responsive canvas sizing ───────────────────────────────
function resizeCanvas() {
  const container = document.getElementById('game-container');
  const maxW = window.innerWidth;
  const maxH = window.innerHeight;
  const scale = Math.min(Math.floor(maxW / CANVAS_W), Math.floor(maxH / CANVAS_H)) || 1;
  canvas.style.width = (CANVAS_W * scale) + 'px';
  canvas.style.height = (CANVAS_H * scale) + 'px';
}

window.addEventListener('resize', resizeCanvas);

// ── Init ───────────────────────────────────────────────────
function init() {
  initSprites();
  resizeCanvas();
  Multiplayer.init();
  Garden.init();
  Library.init();
  Store.init();
  Quests.init();
  Crafting.init();
  gameLoop();
}

init();

})();
