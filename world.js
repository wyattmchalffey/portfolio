// world.js — Map grid, tile definitions, NPC/portal placements, sprite data

const TILE_SIZE = 16; // pixels per tile
const MAP_W = 40;
const MAP_H = 35;

// ── Tile palette ────────────────────────────────────────────
// Each tile: { solid, color, [topColor] }
// topColor is used for the object layer to draw on top of ground
const TILES = {
  // Ground tiles
  0: { solid: false, color: '#4a7a3a' },  // grass
  1: { solid: false, color: '#c8b07a' },  // path (sand)
  2: { solid: true,  color: '#6b5b3a' },  // wall (wood)
  3: { solid: false, color: '#8b7355' },  // floor (indoor)
  4: { solid: true,  color: '#555555' },  // stone wall
  5: { solid: true,  color: '#3a6a8a' },  // water
  6: { solid: false, color: '#5a8a4a' },  // dark grass
  7: { solid: false, color: '#d4c49a' },  // light path
  8: { solid: true,  color: '#7a6a5a' },  // fence
  9: { solid: false, color: '#9a8a6a' },  // cobblestone
  10: { solid: false, color: '#3a3a3a' }, // dark floor
  11: { solid: true,  color: '#8a4a3a' }, // brick wall
  12: { solid: false, color: '#6a9a5a' }, // garden grass
  13: { solid: false, color: '#b0a080' }, // doormat
};

// Object layer tiles (drawn on top of ground)
const OBJECTS = {
  0:  null,                                           // empty
  20: { solid: true,  color: '#2a5a2a', char: 'T' },  // tree
  21: { solid: true,  color: '#4a8ada', char: 'F' },  // fountain
  22: { solid: true,  color: '#7a5a3a', char: 'D' },  // desk
  23: { solid: true,  color: '#5a5a7a', char: 'B' },  // bookshelf
  24: { solid: true,  color: '#aa7a3a', char: 'C' },  // crate
  25: { solid: true,  color: '#9a3a3a', char: 'R' },  // red banner
  26: { solid: true,  color: '#3a7a6a', char: 'P' },  // plant pot
  27: { solid: true,  color: '#6a6a6a', char: 'S' },  // statue
  28: { solid: false, color: '#8a6ada', char: 'G' },  // portal glow
  29: { solid: true,  color: '#4a4a4a', char: 'M' },  // machine
  30: { solid: true,  color: '#aa8a3a', char: 'E' },  // easel
  31: { solid: true,  color: '#da5a3a', char: 'A' },  // arcade cab
  32: { solid: true,  color: '#5aaa5a', char: 'H' },  // hedge
  33: { solid: true,  color: '#daba3a', char: 'L' },  // lamp post
  34: { solid: true,  color: '#8a7a6a', char: 'W' },  // well
  35: { solid: false, color: '#e8d8b8', char: '.' },  // rug
};

// Helper: create a row filled with a value
function row(val, len) { const r = []; for (let i = 0; i < len; i++) r.push(val); return r; }

// Helper: build a row from a pattern string (each char = 2 digit hex tile index)
function parseRow(s) {
  const r = [];
  for (let i = 0; i < s.length; i += 2) {
    r.push(parseInt(s.substr(i, 2), 10));
  }
  return r;
}

// ── Ground layer (40 wide x 35 tall) ─────────────────────
// Legend: 00=grass, 01=path, 02=wood wall, 03=floor, 04=stone wall,
//         05=water, 06=dark grass, 07=light path, 08=fence, 09=cobble,
//         10=dark floor, 11=brick wall, 12=garden grass, 13=doormat
function buildGroundLayer() {
  const g = [];
  // Row 0-3: Top trees/grass with room walls
  // Row 0: top border
  g.push([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
  // Row 1: room top walls
  g.push([0,0,0,4,4,4,4,4,4,4,4,4,4,4,0,0,0,0,0,0,0,0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0]);
  // Row 2-6: Room 1 (Workshop) left, Room 2 (Lab) right
  g.push([0,0,0,4,3,3,3,3,3,3,3,3,3,4,0,0,0,0,0,0,0,0,0,4,3,3,3,3,3,3,3,3,3,3,3,3,3,4,0,0]);
  g.push([0,0,0,4,3,3,3,3,3,3,3,3,3,4,0,0,0,0,0,0,0,0,0,4,3,3,3,3,3,3,3,3,3,3,3,3,3,4,0,0]);
  g.push([0,0,0,4,3,3,3,3,3,3,3,3,3,4,0,0,0,0,0,0,0,0,0,4,3,3,3,3,3,3,3,3,3,3,3,3,3,4,0,0]);
  g.push([0,0,0,4,3,3,3,3,3,3,3,3,3,4,0,0,0,0,0,0,0,0,0,4,3,3,3,3,3,3,3,3,3,3,3,3,3,4,0,0]);
  g.push([0,0,0,4,3,3,3,3,3,3,3,3,3,4,0,0,0,0,0,0,0,0,0,4,3,3,3,3,3,3,3,3,3,3,3,3,3,4,0,0]);
  // Row 7: Room bottom walls with doors (3-wide)
  g.push([0,0,0,4,4,4,4,13,13,13,4,4,4,4,0,0,0,0,0,0,0,0,0,4,3,3,3,3,3,3,3,3,3,3,3,3,3,4,0,0]);
  // Row 8: path / library interior
  g.push([0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,4,3,3,3,3,3,3,3,3,3,3,3,3,3,4,0,0]);
  // Row 9: library bottom wall with door
  g.push([0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,4,4,4,13,13,13,4,4,4,4,4,4,0,0]);
  // Row 10-11: Town square border top (3-wide openings)
  g.push([0,0,8,8,8,8,8,1,1,1,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,1,1,1,8,8,8,8,8,8,0,0]);
  g.push([0,0,8,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,8,0,0]);
  // Row 12-16: Town square interior
  g.push([0,0,8,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,8,0,0]);
  g.push([0,0,8,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,8,0,0]);
  g.push([0,0,8,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,5,5,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,8,0,0]);
  g.push([0,0,8,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,5,5,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,8,0,0]);
  g.push([0,0,8,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,8,0,0]);
  // Row 17: Town square border bottom
  g.push([0,0,8,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,8,0,0]);
  g.push([0,0,8,8,8,8,8,1,1,1,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,1,1,1,8,8,8,8,8,8,0,0]);
  // Row 19-20: paths from town square to bottom rooms (3-wide)
  g.push([0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0]);
  g.push([0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0]);
  // Row 21: Room 3 & 4 top walls (3-wide doors)
  g.push([0,0,0,11,11,11,11,13,13,13,11,11,11,11,0,0,0,0,0,0,0,0,0,0,0,0,11,11,11,13,13,13,11,11,11,11,11,0,0,0]);
  // Row 22-26: Room 3 (Gallery) left, Room 4 (Arcade) right
  g.push([0,0,0,11,3,3,3,3,3,3,3,3,3,11,0,0,0,0,0,0,0,0,0,0,0,0,11,10,10,10,10,10,10,10,10,10,11,0,0,0]);
  g.push([0,0,0,11,3,3,3,3,3,3,3,3,3,11,0,0,0,0,0,0,0,0,0,0,0,0,11,10,10,10,10,10,10,10,10,10,11,0,0,0]);
  g.push([0,0,0,11,3,3,3,3,3,3,3,3,3,11,0,0,0,0,0,0,0,0,0,0,0,0,11,10,10,10,10,10,10,10,10,10,11,0,0,0]);
  g.push([0,0,0,11,3,3,3,3,3,3,3,3,3,11,0,0,0,0,0,0,0,0,0,0,0,0,11,10,10,10,10,10,10,10,10,10,11,0,0,0]);
  g.push([0,0,0,11,3,3,3,3,3,3,3,3,3,11,0,0,0,0,0,0,0,0,0,0,0,0,11,10,10,10,10,10,10,10,10,10,11,0,0,0]);
  // Row 27: bottom walls (3-wide exits)
  g.push([0,0,0,11,11,11,11,11,11,1,1,1,11,11,0,0,0,0,0,0,0,0,0,0,0,0,11,11,11,11,1,1,1,11,11,11,11,0,0,0]);
  // Row 28: paths to south garden (3-wide)
  g.push([0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0]);
  // Row 29: South garden top border (3-wide openings)
  g.push([0,0,8,8,8,8,8,8,8,1,1,1,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,1,1,1,8,8,8,8,8,0,0]);
  // Row 30-33: South garden
  g.push([0,0,8,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,8,0,0]);
  g.push([0,0,8,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,8,0,0]);
  g.push([0,0,8,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,8,0,0]);
  g.push([0,0,8,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,8,0,0]);
  // Row 34: bottom border
  g.push([0,0,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,0,0]);

  return g;
}

// ── Object layer (40 wide x 35 tall) ─────────────────────
function buildObjectLayer() {
  const o = [];
  for (let y = 0; y < MAP_H; y++) o.push(row(0, MAP_W));

  // Trees scattered around exterior
  const trees = [
    [0,0],[1,0],[0,1],[1,1],[14,0],[15,0],[16,0],[17,0],[22,0],
    [38,0],[39,0],[38,1],[39,1],[0,8],[1,8],[0,9],[1,9],
    [14,8],[15,8],[16,8],[22,8],
    [38,8],[39,8],[38,9],[39,9],
    [14,19],[15,19],[16,19],[22,19],[23,19],[24,19],
    [0,19],[1,19],[0,20],[1,20],[38,19],[39,19],[38,20],[39,20],
    [14,28],[15,28],[22,28],[23,28],[24,28],
    [0,28],[1,28],[0,29],[38,28],[39,28],[39,29],
  ];
  trees.forEach(([x,y]) => { if (y < MAP_H && x < MAP_W) o[y][x] = 20; });

  // Workshop (Room 1) furniture — top-left
  o[2][5] = 22;  // desk
  o[2][6] = 22;  // desk
  o[3][4] = 23;  // bookshelf
  o[3][10] = 29; // machine
  o[5][5] = 24;  // crate
  o[5][10] = 24; // crate
  o[2][12] = 25; // banner

  // Library (Room 2) — top-right (expanded)
  // North wall bookshelves
  o[2][24] = 23; o[2][25] = 23; // spring section
  o[2][27] = 23; o[2][28] = 23; // summer section
  o[2][30] = 33; // lamp
  o[2][32] = 23; o[2][33] = 23; // autumn section
  o[2][35] = 23; o[2][36] = 23; // winter section
  // West wall
  o[4][24] = 23; // gardener's handbook shelf
  o[6][24] = 26; // plant pot
  // East wall
  o[4][36] = 26; // plant pot
  o[6][36] = 23; // rare species shelf
  // Center reading area
  o[5][29] = 22; o[5][30] = 22; o[5][31] = 22; // desks
  o[7][29] = 35; o[7][30] = 35; o[7][31] = 35; // rug
  o[4][28] = 33; o[4][32] = 33; // lamps

  // Town square objects
  o[14][19] = 21; // fountain
  o[14][20] = 21; // fountain
  o[15][19] = 21; // fountain
  o[15][20] = 21; // fountain
  o[11][5]  = 33; // lamp post
  o[11][15] = 33; // lamp post
  o[11][24] = 33; // lamp post
  o[11][34] = 33; // lamp post
  o[17][5]  = 33; // lamp post
  o[17][15] = 33; // lamp post
  o[17][24] = 33; // lamp post
  o[17][34] = 33; // lamp post
  o[12][10] = 26; // plant pot
  o[12][29] = 26; // plant pot
  o[16][10] = 27; // statue
  o[16][29] = 27; // statue

  // Store (Room 3) furniture — bottom-left
  // Shelves on sides (away from doorway at cols 7-9)
  o[22][4]  = 23; // shelf (left)
  o[22][5]  = 23; // shelf (left)
  o[22][11] = 23; // shelf (right)
  o[22][12] = 23; // shelf (right)
  // Counter row (gap on left for walkway)
  o[23][7]  = 22; // counter (desk)
  o[23][8]  = 22; // counter
  o[23][9]  = 22; // counter
  o[23][10] = 22; // counter
  o[23][11] = 22; // counter
  // Crates and rugs behind counter
  o[25][5]  = 24; // crate
  o[25][11] = 24; // crate
  o[26][7]  = 35; // rug
  o[26][8]  = 35; // rug
  o[26][9]  = 35; // rug

  // Arcade (Room 4) furniture — bottom-right
  o[22][28] = 31; // arcade cabinet
  o[22][31] = 31; // arcade cabinet
  o[22][34] = 31; // arcade cabinet
  o[24][28] = 31; // arcade cabinet
  o[24][34] = 29; // machine
  o[25][31] = 35; // rug
  o[26][31] = 35; // rug

  // South garden objects
  o[30][3]  = 32; // corner hedge left
  o[30][36] = 32; // corner hedge right
  o[30][19] = 34; // well (moved up)
  o[30][20] = 34; // well

  return o;
}

const GROUND = buildGroundLayer();
const OBJECT_LAYER = buildObjectLayer();

// ── NPC Placements ────────────────────────────────────────
const NPCS = [
  { id: 'guide',    x: 12, y: 13, dir: 'down', projectId: null,       sprite: 'npc_guide'   },
  { id: 'npc1',     x: 8,  y: 4,  dir: 'down', projectId: 'project1', sprite: 'npc_worker'  },
  { id: 'librarian', x: 30, y: 4,  dir: 'down', projectId: null, sprite: 'npc_librarian', name: 'Librarian', dialog: ['Welcome to the Library.', 'Browse the shelves to learn about the plants of this world.', 'Each tome costs a single gold coin to read.'] },
  { id: 'shopkeeper', x: 5, y: 24, dir: 'up', projectId: null, sprite: 'npc_shopkeeper', name: 'Shopkeeper', dialog: ['Welcome to the Store!','I buy plants and sell supplies.','Step up to the counter to browse!'] },
  { id: 'npc4',     x: 32, y: 24, dir: 'down', projectId: 'project4', sprite: 'npc_gamer'   },
  { id: 'npc5',     x: 5,  y: 31, dir: 'down', projectId: 'project5', sprite: 'npc_gardener'},
];

// ── Portal Placements ─────────────────────────────────────
const PORTALS = [
  { x: 33, y: 25, projectId: 'project4' },
];

// ── Area definitions (for area label UI) ──────────────────
const AREAS = [
  { name: 'Workshop',     x1: 3,  y1: 1,  x2: 13, y2: 7  },
  { name: 'Library',      x1: 23, y1: 1,  x2: 37, y2: 9  },
  { name: 'Town Square',  x1: 2,  y1: 10, x2: 37, y2: 18 },
  { name: 'Store',         x1: 3,  y1: 21, x2: 13, y2: 27 },
  { name: 'Arcade',       x1: 26, y1: 21, x2: 36, y2: 27 },
  { name: 'South Garden', x1: 2,  y1: 29, x2: 37, y2: 34 },
];

// ── Sprite data (pixel art as string arrays) ──────────────
// Each string = one row, each char = one pixel
// Color keys defined per sprite
const SPRITE_DATA = {
  player: {
    down: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '..0ee0..',
      '..0FF0..',
      '.11FF11.',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '..2..2..',
      '..2..2..',
      '..2..2..',
    ],
    up: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '..0000..',
      '..0FF0..',
      '.11FF11.',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '..2..2..',
      '..2..2..',
      '..2..2..',
    ],
    left: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '.eF000..',
      '..0FF0..',
      '..1FF11.',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '..2..2..',
      '..2..2..',
      '..2..2..',
    ],
    right: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '..000Fe.',
      '..0FF0..',
      '.11FF1..',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '..2..2..',
      '..2..2..',
      '..2..2..',
    ],
    walk_down_1: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '..0ee0..',
      '..0FF0..',
      '.11FF11.',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '.2...2..',
      '.2...2..',
      '.2......',
    ],
    walk_down_2: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '..0ee0..',
      '..0FF0..',
      '.11FF11.',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '..2...2.',
      '..2...2.',
      '......2.',
    ],
    walk_up_1: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '..0000..',
      '..0FF0..',
      '.11FF11.',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '.2...2..',
      '.2...2..',
      '.2......',
    ],
    walk_up_2: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '..0000..',
      '..0FF0..',
      '.11FF11.',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '..2...2.',
      '..2...2.',
      '......2.',
    ],
    walk_left_1: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '.eF000..',
      '..0FF0..',
      '..1FF11.',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '.2...2..',
      '.2...2..',
      '.2......',
    ],
    walk_left_2: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '.eF000..',
      '..0FF0..',
      '..1FF11.',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '..2...2.',
      '..2...2.',
      '......2.',
    ],
    walk_right_1: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '..000Fe.',
      '..0FF0..',
      '.11FF1..',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '.2...2..',
      '.2...2..',
      '.2......',
    ],
    walk_right_2: [
      '..0HH0..',
      '.0H44H0.',
      '.044440.',
      '..000Fe.',
      '..0FF0..',
      '.11FF1..',
      '..1FF1..',
      '..1111..',
      '..2222..',
      '..2...2.',
      '..2...2.',
      '......2.',
    ],
    palette: { '0': '#3a2a1a', '1': '#2255aa', '2': '#3344aa', '4': '#c8a060', 'H': '#dbb878', 'F': '#f0c8a0', 'e': '#1a1a2e' }
  },

  npc_guide: {
    down: [
      '.888888.',
      '8.8888.8',
      '.888888.',
      '..8ee8..',
      '..8FF8..',
      '.33FF33.',
      '.3F33F3.',
      '..3333..',
      '..5FF5..',
      '..5..5..',
      '..5..5..',
      '..5..5..',
    ],
    palette: { '8': '#daa520', '3': '#cc3333', '5': '#553322', 'F': '#f0c8a0', 'e': '#1a1a2e' }
  },

  npc_worker: {
    down: [
      '..7777..',
      '.777777.',
      '.777777.',
      '..7ee7..',
      '..7FF7..',
      '.66FF66.',
      '.6FFFF6.',
      '..6666..',
      '..5FF5..',
      '..5..5..',
      '..5..5..',
      '..5..5..',
    ],
    palette: { '7': '#ff8800', '6': '#557755', '5': '#553322', 'F': '#e8c098', 'e': '#1a1a2e' }
  },

  npc_librarian: {
    down: [
      '..AAAA..',
      '.AAAAAA.',
      '.AAAAAA.',
      '..AeeA..',
      '..AFFA..',
      '.77FF77.',
      '.7F77F7.',
      '..7777..',
      '..5FF5..',
      '..5..5..',
      '..5..5..',
      '..5..5..',
    ],
    palette: { 'A': '#aaaaaa', '7': '#445566', '5': '#332222', 'F': '#f0c8a0', 'e': '#1a1a2e' }
  },

  npc_artist: {
    down: [
      '..AAAA..',
      '.AAAAAA.',
      'AAAAAAAA',
      '..AeeA..',
      '..AFFA..',
      '.CCFFCC.',
      '.CFFFFC.',
      '..CCCC..',
      '..5FF5..',
      '..5..5..',
      '..5..5..',
      '..5..5..',
    ],
    palette: { 'A': '#aa44aa', 'C': '#cc66cc', '5': '#443322', 'F': '#f0c8a0', 'e': '#1a1a2e' }
  },

  npc_shopkeeper: {
    down: [
      '..7777..',
      '.777777.',
      '.777777.',
      '..7ee7..',
      '..7FF7..',
      '.GGFFGG.',
      '.GFFFFG.',
      '..GGGG..',
      '..5FF5..',
      '..5..5..',
      '..5..5..',
      '..5..5..',
    ],
    palette: { '7': '#cc8833', 'G': '#ddaa44', '5': '#553322', 'F': '#f0c8a0', 'e': '#1a1a2e' }
  },

  npc_gamer: {
    down: [
      '..3333..',
      '.333333.',
      '.333333.',
      '..3ee3..',
      '..3FF3..',
      '.BBFFBB.',
      '.BFFFFB.',
      '..BBBB..',
      '..5FF5..',
      '..5..5..',
      '..5..5..',
      '..5..5..',
    ],
    palette: { '3': '#333333', 'B': '#2222aa', '5': '#332222', 'F': '#f0c8a0', 'e': '#1a1a2e' }
  },

  npc_gardener: {
    down: [
      '.GGGGGG.',
      'GGGGGGGG',
      '.GGGGGG.',
      '..GeeG..',
      '..GFFG..',
      '.55FF55.',
      '.5FFFF5.',
      '..5555..',
      '..4FF4..',
      '..4..4..',
      '..4..4..',
      '..4..4..',
    ],
    palette: { 'G': '#44aa44', '5': '#448844', '4': '#664422', 'F': '#e8c898', 'e': '#1a1a2e' }
  },
};

// Player start position (tile coords)
const PLAYER_START = { x: 19, y: 16 };
