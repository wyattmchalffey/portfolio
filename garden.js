// garden.js — Interactive idle garden with shared Firebase state
var Garden = (function () {
  'use strict';

  // ── Plant Types ──────────────────────────────────────────
  var PLANT_TYPES = {
    sunpetal:       { name: 'Sunpetal',        rarity: 'common',    season: 'summer', baseGrow: 30*60*1000,   special: 'starter',        color: '#ffcc33', bloomColor: '#ffee66', value: 5,   desc: 'A cheerful golden flower that thrives in warm sunlight. The perfect first plant for any gardener.' },
    moonbloom:      { name: 'Moonbloom',       rarity: 'common',    season: 'winter', baseGrow: 45*60*1000,   special: 'glow',           color: '#aabbff', bloomColor: '#ccddff', value: 8,   desc: 'A pale blossom that emits a soft glow in winter. Its petals shimmer like moonlit frost.' },
    firethorn:      { name: 'Firethorn',       rarity: 'common',    season: 'summer', baseGrow: 40*60*1000,   special: null,             color: '#ff6633', bloomColor: '#ff8855', value: 6,   desc: 'A hardy plant with vivid orange blooms. Radiates warmth even on cool evenings.' },
    raindrop_fern:  { name: 'Raindrop Fern',   rarity: 'uncommon',  season: 'spring', baseGrow: 60*60*1000,   special: 'water_boost',    color: '#33cc88', bloomColor: '#55eebb', value: 15,  desc: 'Delicate fronds that collect morning dew. Grows 50% faster when watered.' },
    crystalbell:    { name: 'Crystalbell',     rarity: 'uncommon',  season: 'winter', baseGrow: 90*60*1000,   special: 'no_wilt_winter', color: '#88ddff', bloomColor: '#bbffff', value: 18,  desc: 'An icy bell-shaped flower that never wilts in winter. Chimes softly in the cold wind.' },
    starvine:       { name: 'Starvine',        rarity: 'uncommon',  season: 'autumn', baseGrow: 60*60*1000,   special: 'double_score',   color: '#cc88ff', bloomColor: '#ddaaff', value: 20,  desc: 'A twisting vine dotted with star-shaped blooms. Yields double harvest value.' },
    emberlily:      { name: 'Emberlily',       rarity: 'rare',      season: 'summer', baseGrow: 120*60*1000,  special: 'shimmer',        color: '#ff4422', bloomColor: '#ff7744', value: 40,  desc: 'A blazing flower that flickers like a candle flame. Highly prized by collectors.' },
    phantom_orchid: { name: 'Phantom Orchid',  rarity: 'rare',      season: 'autumn', baseGrow: 150*60*1000,  special: 'translucent',    color: '#ccbbdd', bloomColor: '#eeddff', value: 50,  desc: 'A ghostly translucent orchid that appears half-real. Said to bloom between worlds.' },
    aurora_blossom: { name: 'Aurora Blossom',  rarity: 'legendary', season: 'spring', baseGrow: 240*60*1000,  special: 'rainbow',        color: '#ff88cc', bloomColor: '#ffaaee', value: 100, desc: 'Its petals shift through every color like the northern lights. Extremely rare.' },
    worldtree:      { name: 'Worldtree Sprout',rarity: 'legendary', season: 'all',    baseGrow: 240*60*1000,  special: 'worldtree',      color: '#44dd44', bloomColor: '#88ff88', value: 150, desc: 'A tiny sprout from the mythical Worldtree. Grows in any season. Requires all other plants collected.' },
  };

  var RARITY_COLORS = {
    common:    '#aaaaaa',
    uncommon:  '#44cc44',
    rare:      '#4488ff',
    legendary: '#ff8800',
  };

  var RARITY_UNLOCK = { common: 0, uncommon: 3, rare: 10, legendary: 25 };

  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var SEASON_CYCLE = 6 * 60 * 60 * 1000; // 6 hours total
  var SEASON_DURATION = SEASON_CYCLE / 4;  // 1.5hr per season

  var WILT_THRESHOLD = 4 * 60 * 60 * 1000; // 4 hours without water
  var WATER_BOOST_DURATION = 30 * 60 * 1000; // 30 min

  // ── Garden Plot Positions (12 plots) ─────────────────────
  var GARDEN_PLOTS = [
    { tileX: 7,  tileY: 31 },
    { tileX: 10, tileY: 31 },
    { tileX: 13, tileY: 31 },
    { tileX: 23, tileY: 31 },
    { tileX: 26, tileY: 31 },
    { tileX: 29, tileY: 31 },
    { tileX: 7,  tileY: 33 },
    { tileX: 10, tileY: 33 },
    { tileX: 13, tileY: 33 },
    { tileX: 23, tileY: 33 },
    { tileX: 26, tileY: 33 },
    { tileX: 29, tileY: 33 },
  ];

  // ── State ────────────────────────────────────────────────
  var db = null;
  var gardenRef = null;
  var plotsRef = null;
  var statsRef = null;
  var plots = [];          // raw Firebase data per plot
  var computedPlots = [];  // derived stage/progress per plot
  var stats = { totalHarvests: 0, collection: {}, lastHarvestAt: 0, lastHarvestBy: '' };
  var uiOpen = '';         // '', 'seeds', 'actions', 'journal'
  var activePlotIndex = -1;
  var harvestParticles = [];
  var inventory = {};      // { plantType: count } — per-player inventory from Firebase
  var inventoryRef = null;
  var lastRecompute = 0;
  var seedPickerIndex = 0;   // keyboard selection index for seed picker
  var seedPickerSeeds = [];  // cached seeds list for keyboard nav
  var actionMenuIndex = 0;   // 0=water, 1=fertilize, 2=journal
  var journalTabs = ['inventory', 'quests', 'garden', 'map', 'about'];
  var journalTabIndex = 0;

  // ── Season Calculation ───────────────────────────────────
  function getCurrentSeason() {
    var now = Date.now();
    var pos = now % SEASON_CYCLE;
    var idx = Math.floor(pos / SEASON_DURATION);
    return SEASONS[idx];
  }

  function getSeasonProgress() {
    var now = Date.now();
    var pos = now % SEASON_CYCLE;
    var inSeason = pos % SEASON_DURATION;
    return inSeason / SEASON_DURATION;
  }

  function getOpposite(season) {
    var map = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' };
    return map[season];
  }

  // ── Growth Calculation ───────────────────────────────────
  function computePlot(plotData) {
    if (!plotData || !plotData.plantType) {
      return { stage: -1, progress: 0, plantType: null, wilted: false };
    }

    var type = PLANT_TYPES[plotData.plantType];
    if (!type) return { stage: -1, progress: 0, plantType: null, wilted: false };

    var now = Date.now();
    var plantedAt = plotData.plantedAt || now;
    var elapsed = now - plantedAt;

    // Calculate effective growth time with modifiers
    var effectiveGrow = type.baseGrow;

    // Season modifier (skip if seasonLocked by Essence of Seasons)
    var currentSeason = getCurrentSeason();
    if (plotData.seasonLocked) {
      effectiveGrow *= 0.75; // always in-season speed
    } else if (type.season !== 'all') {
      if (type.season === currentSeason) {
        effectiveGrow *= 0.75; // 25% faster
      } else if (getOpposite(type.season) === currentSeason) {
        effectiveGrow *= 1.5; // 50% slower
      }
    }

    // Fertilize: 10% reduction per use, max 3 (super fertilizer gives 20% per use)
    var fertCount = Math.min(plotData.fertilizeCount || 0, 3);
    var superFertCount = Math.min(plotData.superFertCount || 0, 3);
    effectiveGrow *= Math.pow(0.9, fertCount);
    effectiveGrow *= Math.pow(0.8, superFertCount);

    // Water boost: check active waterings
    var waterings = plotData.waterings || [];
    var activeWaterBoost = 0;
    for (var i = 0; i < waterings.length; i++) {
      var w = waterings[i];
      if (w && w.at && now - w.at < WATER_BOOST_DURATION) {
        activeWaterBoost++;
      }
    }
    // Each active watering gives 15% boost (multiplicative)
    if (activeWaterBoost > 0) {
      var waterMult = Math.pow(0.85, activeWaterBoost);
      effectiveGrow *= waterMult;
    }

    // Raindrop Fern special: 50% faster when watered
    if (plotData.plantType === 'raindrop_fern' && activeWaterBoost > 0) {
      effectiveGrow *= 0.5;
    }

    var progress = Math.min(1, elapsed / effectiveGrow);

    // Growth tonic: one-time 25% progress boost (stored as applied)
    if (plotData.growthTonic) {
      progress = Math.min(1, progress + 0.25);
    }

    // Wilting check: no watering in 4 hours
    var lastWaterTime = plantedAt;
    for (var j = 0; j < waterings.length; j++) {
      if (waterings[j] && waterings[j].at > lastWaterTime) {
        lastWaterTime = waterings[j].at;
      }
    }
    var wilted = false;
    // Crystalbell doesn't wilt in winter
    if (plotData.plantType === 'crystalbell' && currentSeason === 'winter') {
      wilted = false;
    } else if (now - lastWaterTime > WILT_THRESHOLD && progress < 1) {
      wilted = true;
    }

    // Determine stage (0-4)
    var stage;
    if (wilted) {
      stage = 5;
    } else if (progress < 0.10) {
      stage = 0; // seed
    } else if (progress < 0.30) {
      stage = 1; // sprout
    } else if (progress < 0.60) {
      stage = 2; // growing
    } else if (progress < 0.90) {
      stage = 3; // mature
    } else {
      stage = 4; // blooming
    }

    return {
      stage: stage,
      progress: progress,
      plantType: plotData.plantType,
      wilted: wilted,
      activeWaterBoost: activeWaterBoost,
      fertCount: fertCount,
      waterings: waterings,
      plantedBy: plotData.plantedBy || '',
    };
  }

  function recomputeAllPlots() {
    for (var i = 0; i < GARDEN_PLOTS.length; i++) {
      computedPlots[i] = computePlot(plots[i]);
    }
    lastRecompute = Date.now();
  }

  // ── Firebase Init ────────────────────────────────────────
  function init() {
    if (typeof firebase === 'undefined' || !firebase.database) {
      console.warn('Garden: Firebase not available');
      return;
    }

    try {
      db = firebase.database();
      gardenRef = db.ref('garden');
      plotsRef = gardenRef.child('plots');
      statsRef = gardenRef.child('stats');

      // Listen for plot changes
      plotsRef.on('value', function (snap) {
        var data = snap.val() || {};
        for (var i = 0; i < GARDEN_PLOTS.length; i++) {
          plots[i] = data['plot_' + i] || null;
        }
        recomputeAllPlots();
      });

      // Listen for stats
      statsRef.on('value', function (snap) {
        var data = snap.val();
        if (data) {
          stats.totalHarvests = data.totalHarvests || 0;
          stats.collection = data.collection || {};
          stats.lastHarvestAt = data.lastHarvestAt || 0;
          stats.lastHarvestBy = data.lastHarvestBy || '';
        }
      });

      // Listen for per-player inventory
      var sessionId = Multiplayer.getSessionId();
      inventoryRef = db.ref('inventory/' + sessionId);
      inventoryRef.on('value', function (snap) {
        inventory = snap.val() || {};
      });

      // Initialize empty plots
      for (var i = 0; i < GARDEN_PLOTS.length; i++) {
        plots[i] = null;
        computedPlots[i] = { stage: -1, progress: 0, plantType: null, wilted: false };
      }
    } catch (e) {
      console.warn('Garden init failed:', e);
    }
  }

  // ── Plot Interaction ─────────────────────────────────────
  function getPlotNearPlayer(tileX, tileY) {
    for (var i = 0; i < GARDEN_PLOTS.length; i++) {
      var p = GARDEN_PLOTS[i];
      var dist = Math.hypot(p.tileX - tileX, p.tileY - tileY);
      if (dist < 1.2) {
        return { type: 'garden_plot', plotIndex: i, tileX: p.tileX, tileY: p.tileY };
      }
    }
    return null;
  }

  function handlePlotInteract(plotIndex) {
    activePlotIndex = plotIndex;
    var cp = computedPlots[plotIndex];

    if (!cp || cp.stage === -1) {
      // Empty plot → show seed picker
      showSeedPicker();
    } else if (cp.stage === 4) {
      // Blooming → harvest
      harvestPlant(plotIndex);
    } else {
      // Show action menu
      showActionMenu(plotIndex);
    }
  }

  // ── Planting ─────────────────────────────────────────────
  function getAvailableSeeds() {
    var currentSeason = getCurrentSeason();
    var harvests = inventory.totalHarvests || 0;
    var seeds = [];

    for (var key in PLANT_TYPES) {
      var t = PLANT_TYPES[key];
      var reqHarvests = RARITY_UNLOCK[t.rarity];
      var unlocked = harvests >= reqHarvests;

      // Rare/Legendary also require correct season
      if ((t.rarity === 'rare' || t.rarity === 'legendary') && t.season !== 'all') {
        if (currentSeason !== t.season) unlocked = false;
      }

      // Worldtree: need all others collected
      if (key === 'worldtree') {
        var allCollected = true;
        for (var k in PLANT_TYPES) {
          if (k === 'worldtree') continue;
          if (!inventory[k]) { allCollected = false; break; }
        }
        if (!allCollected) unlocked = false;
      }

      seeds.push({
        id: key,
        type: t,
        unlocked: unlocked,
        hint: getUnlockHint(key, t, harvests, currentSeason),
      });
    }

    return seeds;
  }

  function getUnlockHint(key, type, harvests, season) {
    if (key === 'worldtree') {
      var count = 0;
      for (var k in PLANT_TYPES) { if (k !== 'worldtree' && inventory[k]) count++; }
      return 'Collect all ' + (Object.keys(PLANT_TYPES).length - 1) + ' plants (' + count + ' found)';
    }
    var req = RARITY_UNLOCK[type.rarity];
    if (harvests < req) return req + ' harvests needed (' + harvests + ' done)';
    if ((type.rarity === 'rare' || type.rarity === 'legendary') && type.season !== 'all' && season !== type.season) {
      return 'Available in ' + type.season;
    }
    return '';
  }

  function plantSeed(plotIndex, plantId) {
    if (!plotsRef) return;
    var sessionId = Multiplayer.getSessionId();

    plotsRef.child('plot_' + plotIndex).set({
      plantType: plantId,
      plantedAt: firebase.database.ServerValue.TIMESTAMP,
      plantedBy: sessionId,
      waterings: [],
      fertilizeCount: 0,
      fertilizedAt: 0,
    });

    if (window.Quests) Quests.onAction('plant', plantId);
    closeUI();
  }

  // ── Watering ─────────────────────────────────────────────
  function waterPlant(plotIndex) {
    if (!plotsRef) return;

    // Require water in inventory
    if ((inventory.water || 0) < 1) return;

    var now = Date.now();

    var plotData = plots[plotIndex];
    if (!plotData) return;

    var waterings = plotData.waterings || [];
    // Filter to keep only recent waterings (max 10)
    var recent = [];
    for (var i = 0; i < waterings.length; i++) {
      if (waterings[i] && now - waterings[i].at < WATER_BOOST_DURATION) {
        recent.push(waterings[i]);
      }
    }
    if (recent.length >= 10) return; // max waterings

    var sessionId = Multiplayer.getSessionId();
    recent.push({ at: now, by: sessionId });

    plotsRef.child('plot_' + plotIndex).update({
      waterings: recent,
    });

    // Consume one water from inventory
    inventoryRef.update({ water: (inventory.water || 1) - 1 });

    // If wilted, revive it
    var cp = computedPlots[plotIndex];
    if (cp && cp.wilted) {
      // Watering a wilted plant revives it — waterings are updated above
    }

    if (window.Quests) Quests.onAction('water');
    refreshActionMenu();
  }

  // ── Water Collection ─────────────────────────────────────
  var WATER_CAP = 3;

  function collectWater() {
    if (!inventoryRef) return 'no_ref';
    var current = inventory.water || 0;
    if (current >= WATER_CAP) return 'full';
    inventoryRef.update({ water: current + 1 });
    return 'ok';
  }

  // ── Fertilizing ──────────────────────────────────────────
  function fertilizePlant(plotIndex) {
    if (!plotsRef) return;
    var plotData = plots[plotIndex];
    if (!plotData) return;

    var fertCount = plotData.fertilizeCount || 0;
    if (fertCount >= 3) return; // maxed
    if ((inventory.fertilizer || 0) < 1) return; // need fertilizer item

    plotsRef.child('plot_' + plotIndex).update({
      fertilizeCount: fertCount + 1,
      fertilizedAt: firebase.database.ServerValue.TIMESTAMP,
    });

    // Consume one fertilizer from inventory
    inventoryRef.update({ fertilizer: (inventory.fertilizer || 1) - 1 });

    refreshActionMenu();
  }

  // ── Harvesting ───────────────────────────────────────────
  function harvestPlant(plotIndex) {
    if (!plotsRef || !statsRef) return;
    var cp = computedPlots[plotIndex];
    if (!cp || cp.stage !== 4) return;

    var plantType = cp.plantType;
    var sessionId = Multiplayer.getSessionId();

    // Spawn particles
    spawnHarvestParticles(plotIndex);

    // Clear the plot
    plotsRef.child('plot_' + plotIndex).remove();

    // Update stats
    var updates = {};
    updates.totalHarvests = (stats.totalHarvests || 0) + 1;
    updates.lastHarvestAt = firebase.database.ServerValue.TIMESTAMP;
    updates.lastHarvestBy = sessionId;
    updates['collection/' + plantType] = true;
    statsRef.update(updates);

    var type = PLANT_TYPES[plantType];

    // Check for lucky_charm on plot (x2 yield)
    var plotData = plots[plotIndex];
    var yieldCount = 1;
    if (plotData && plotData.luckyCharm) {
      yieldCount = 2;
      // Clear the lucky charm flag
      plotsRef.child('plot_' + plotIndex).update({ luckyCharm: null });
    }

    // Update per-player inventory
    if (inventoryRef) {
      var currentCount = inventory[plantType] || 0;
      var invUpdate = {};
      invUpdate[plantType] = currentCount + yieldCount;
      invUpdate.totalHarvests = (inventory.totalHarvests || 0) + 1;
      inventoryRef.update(invUpdate);
    }

    if (window.Quests) Quests.onAction('harvest', plantType);

    // Toast
    var typeName = type ? type.name : plantType;
    var toastText = typeName + ' harvested';
    if (yieldCount > 1) toastText += ' x' + yieldCount;
    if (window.showToast) window.showToast(toastText);

    closeUI();
  }

  // ── Harvest Particles ────────────────────────────────────
  function spawnHarvestParticles(plotIndex) {
    var plot = GARDEN_PLOTS[plotIndex];
    var cp = computedPlots[plotIndex];
    var color = cp && cp.plantType ? PLANT_TYPES[cp.plantType].bloomColor : '#ffff00';
    var cx = plot.tileX * 16 + 8;
    var cy = plot.tileY * 16 + 8;

    for (var i = 0; i < 6; i++) {
      var angle = (Math.PI * 2 / 6) * i + Math.random() * 0.5;
      harvestParticles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * (1 + Math.random()),
        vy: Math.sin(angle) * (1 + Math.random()) - 1.5,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: color,
        size: 2 + Math.random(),
      });
    }
  }

  function updateParticles() {
    for (var i = harvestParticles.length - 1; i >= 0; i--) {
      var p = harvestParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.life--;
      if (p.life <= 0) {
        harvestParticles.splice(i, 1);
      }
    }
  }

  // ── UI: Seed Picker ──────────────────────────────────────
  function showSeedPicker() {
    var seeds = getAvailableSeeds();
    var listEl = document.getElementById('garden-seed-list');
    listEl.innerHTML = '';

    for (var i = 0; i < seeds.length; i++) {
      (function (seed) {
        var row = document.createElement('div');
        row.className = 'garden-seed-row' + (seed.unlocked ? '' : ' locked');

        var dot = document.createElement('span');
        dot.className = 'seed-dot';
        dot.style.background = seed.type.color;
        row.appendChild(dot);

        var nameSpan = document.createElement('span');
        nameSpan.className = 'seed-name';
        nameSpan.textContent = seed.type.name;
        row.appendChild(nameSpan);

        var raritySpan = document.createElement('span');
        raritySpan.className = 'seed-rarity';
        raritySpan.textContent = seed.type.rarity;
        raritySpan.style.color = RARITY_COLORS[seed.type.rarity];
        row.appendChild(raritySpan);

        if (!seed.unlocked) {
          var hint = document.createElement('div');
          hint.className = 'seed-hint';
          hint.textContent = seed.hint;
          row.appendChild(hint);
        }

        if (seed.unlocked) {
          row.addEventListener('click', function () {
            plantSeed(activePlotIndex, seed.id);
          });
        }

        listEl.appendChild(row);
      })(seeds[i]);
    }

    // Update season display
    var seasonEl = document.getElementById('garden-seed-season');
    if (seasonEl) seasonEl.textContent = 'Season: ' + capitalize(getCurrentSeason());

    seedPickerSeeds = seeds;
    seedPickerIndex = 0;
    updateSeedPickerSelection();

    document.getElementById('garden-seed-picker').style.display = 'block';
    uiOpen = 'seeds';
  }

  function updateSeedPickerSelection() {
    var rows = document.getElementById('garden-seed-list').children;
    for (var i = 0; i < rows.length; i++) {
      if (i === seedPickerIndex) {
        rows[i].classList.add('selected');
        // Scroll into view
        rows[i].scrollIntoView({ block: 'nearest' });
      } else {
        rows[i].classList.remove('selected');
      }
    }
  }

  // ── UI: Action Menu ──────────────────────────────────────
  function showActionMenu(plotIndex) {
    var cp = computedPlots[plotIndex];
    if (!cp || cp.stage === -1) return;

    var type = PLANT_TYPES[cp.plantType];
    activePlotIndex = plotIndex;

    document.getElementById('garden-action-name').textContent = type.name;
    document.getElementById('garden-action-name').style.color = type.color;

    var stageNames = ['Seed', 'Sprout', 'Growing', 'Mature', 'Blooming', 'Wilted'];
    document.getElementById('garden-action-stage').textContent =
      stageNames[cp.stage] + ' — ' + Math.floor(cp.progress * 100) + '%';

    // Water button
    var waterBtn = document.getElementById('garden-water-btn');
    var waterCount = inventory.water || 0;
    var maxedWater = (cp.waterings || []).length >= 10;
    waterBtn.disabled = waterCount < 1 || maxedWater;
    if (maxedWater) {
      waterBtn.textContent = 'Water (max)';
    } else {
      waterBtn.textContent = 'Water (' + waterCount + '/' + WATER_CAP + ')';
    }

    // Fertilize button
    var fertBtn = document.getElementById('garden-fert-btn');
    var fertOwned = inventory.fertilizer || 0;
    var canFert = fertOwned >= 1 && cp.fertCount < 3;
    fertBtn.disabled = !canFert;
    if (fertOwned < 1) {
      fertBtn.textContent = 'Fertilize (buy at Store)';
    } else {
      fertBtn.textContent = 'Fertilize (' + cp.fertCount + '/3) [' + fertOwned + ' left]';
    }

    // Use Item button
    var useItemBtn = document.getElementById('garden-useitem-btn');
    if (!useItemBtn) {
      // Create the button dynamically if not present
      var btnsDiv = document.querySelector('.garden-action-btns');
      if (btnsDiv) {
        useItemBtn = document.createElement('button');
        useItemBtn.id = 'garden-useitem-btn';
        useItemBtn.textContent = 'Use Item';
        // Insert before the journal button (which is outside the btns div)
        btnsDiv.appendChild(useItemBtn);
        useItemBtn.addEventListener('click', function () {
          if (activePlotIndex >= 0) openUseItemMenu(activePlotIndex);
        });
      }
    }
    if (useItemBtn) {
      var plotD = plots[activePlotIndex];
      var applicableItems = (window.Crafting) ? Crafting.getApplicableItems(plotD, cp) : [];
      useItemBtn.disabled = applicableItems.length === 0;
      useItemBtn.textContent = 'Use Item' + (applicableItems.length > 0 ? ' (' + applicableItems.length + ')' : '');
    }

    actionMenuIndex = 0;
    updateActionMenuSelection();

    document.getElementById('garden-action-menu').style.display = 'block';
    uiOpen = 'actions';
  }

  function updateActionMenuSelection() {
    var btns = [
      document.getElementById('garden-water-btn'),
      document.getElementById('garden-fert-btn'),
      document.getElementById('garden-useitem-btn'),
      document.getElementById('garden-journal-btn'),
    ];
    for (var i = 0; i < btns.length; i++) {
      if (btns[i]) {
        if (i === actionMenuIndex) {
          btns[i].classList.add('selected');
        } else {
          btns[i].classList.remove('selected');
        }
      }
    }
  }

  function refreshActionMenu() {
    if (uiOpen === 'actions' && activePlotIndex >= 0) {
      recomputeAllPlots();
      showActionMenu(activePlotIndex);
    }
  }

  // ── UI: Journal ──────────────────────────────────────────
  function showJournal(startTab) {
    var gridEl = document.getElementById('garden-journal-grid');
    gridEl.innerHTML = '';

    for (var key in PLANT_TYPES) {
      var t = PLANT_TYPES[key];
      var discovered = !!inventory[key];

      var cell = document.createElement('div');
      cell.className = 'journal-cell' + (discovered ? ' discovered' : '');

      var dot = document.createElement('div');
      dot.className = 'journal-dot';
      dot.style.background = discovered ? t.color : '#333';
      cell.appendChild(dot);

      var name = document.createElement('div');
      name.className = 'journal-name';
      name.textContent = discovered ? t.name : '???';
      cell.appendChild(name);

      if (discovered) {
        var rarity = document.createElement('div');
        rarity.className = 'journal-rarity';
        rarity.textContent = t.rarity;
        rarity.style.color = RARITY_COLORS[t.rarity];
        cell.appendChild(rarity);

        var descEl = document.createElement('div');
        descEl.className = 'journal-desc';
        descEl.textContent = t.desc;
        cell.appendChild(descEl);

        var statsEl = document.createElement('div');
        statsEl.className = 'journal-stats';
        var growHrs = Math.round(t.baseGrow / (60*60*1000) * 10) / 10;
        var growLabel = growHrs >= 1 ? growHrs + 'h' : Math.round(t.baseGrow / (60*1000)) + 'm';
        statsEl.innerHTML =
          '<span>Season: ' + capitalize(t.season) + '</span>' +
          '<span>Grow: ' + growLabel + '</span>' +
          '<span>Value: ' + t.value + 'g</span>';
        cell.appendChild(statsEl);
      }

      gridEl.appendChild(cell);
    }

    // Stats
    var collectedCount = 0;
    for (var ck in PLANT_TYPES) { if (inventory[ck]) collectedCount++; }
    var totalTypes = Object.keys(PLANT_TYPES).length;
    document.getElementById('garden-journal-stats').textContent =
      'Harvests: ' + (inventory.totalHarvests || 0) + '  |  Collection: ' + collectedCount + '/' + totalTypes;

    // Populate inventory tab
    populateInventoryTab();

    // Populate quests tab
    if (window.Quests) {
      var questsContainer = document.getElementById('journal-tab-quests');
      if (questsContainer) Quests.populateQuestLog(questsContainer);
    }

    // Populate map tab
    if (window.populateMapTab) window.populateMapTab();

    var tabIdx = typeof startTab === 'number' ? startTab : 0;
    journalTabIndex = tabIdx;
    switchJournalTab(tabIdx);

    document.getElementById('garden-journal').style.display = 'flex';
    uiOpen = 'journal';
  }

  function populateInventoryTab() {
    var gridEl = document.getElementById('journal-inventory-grid');
    var statsEl = document.getElementById('journal-inventory-stats');
    gridEl.innerHTML = '';

    var hasItems = false;
    var totalItems = 0;

    // Gold entry
    var goldCount = inventory.gold || 0;
    if (goldCount > 0) {
      hasItems = true;

      var goldCell = document.createElement('div');
      goldCell.className = 'inventory-cell';

      var goldDot = document.createElement('div');
      goldDot.className = 'journal-dot';
      goldDot.style.background = '#ddaa33';
      goldCell.appendChild(goldDot);

      var goldName = document.createElement('div');
      goldName.className = 'journal-name';
      goldName.textContent = 'Gold';
      goldCell.appendChild(goldName);

      var goldCountEl = document.createElement('div');
      goldCountEl.className = 'inventory-count';
      goldCountEl.textContent = goldCount + 'g';
      goldCell.appendChild(goldCountEl);

      gridEl.appendChild(goldCell);
    }

    // Water entry
    var waterCount = inventory.water || 0;
    if (waterCount > 0) {
      hasItems = true;
      totalItems += waterCount;

      var waterCell = document.createElement('div');
      waterCell.className = 'inventory-cell';

      var waterDot = document.createElement('div');
      waterDot.className = 'journal-dot';
      waterDot.style.background = '#5588cc';
      waterCell.appendChild(waterDot);

      var waterName = document.createElement('div');
      waterName.className = 'journal-name';
      waterName.textContent = 'Water';
      waterCell.appendChild(waterName);

      var waterCountEl = document.createElement('div');
      waterCountEl.className = 'inventory-count';
      waterCountEl.textContent = 'x' + waterCount;
      waterCell.appendChild(waterCountEl);

      gridEl.appendChild(waterCell);
    }

    // Fertilizer entry
    var fertCount = inventory.fertilizer || 0;
    if (fertCount > 0) {
      hasItems = true;
      totalItems += fertCount;

      var fertCell = document.createElement('div');
      fertCell.className = 'inventory-cell';

      var fertDot = document.createElement('div');
      fertDot.className = 'journal-dot';
      fertDot.style.background = '#44cc44';
      fertCell.appendChild(fertDot);

      var fertName = document.createElement('div');
      fertName.className = 'journal-name';
      fertName.textContent = 'Fertilizer';
      fertCell.appendChild(fertName);

      var fertCountEl = document.createElement('div');
      fertCountEl.className = 'inventory-count';
      fertCountEl.textContent = 'x' + fertCount;
      fertCell.appendChild(fertCountEl);

      gridEl.appendChild(fertCell);
    }

    for (var key in inventory) {
      if (!inventory[key] || !PLANT_TYPES[key]) continue;
      hasItems = true;
      var count = inventory[key];
      totalItems += count;
      var t = PLANT_TYPES[key];

      var cell = document.createElement('div');
      cell.className = 'inventory-cell';

      var dot = document.createElement('div');
      dot.className = 'journal-dot';
      dot.style.background = t.color;
      cell.appendChild(dot);

      var name = document.createElement('div');
      name.className = 'journal-name';
      name.textContent = t.name;
      cell.appendChild(name);

      var rarity = document.createElement('div');
      rarity.className = 'journal-rarity';
      rarity.textContent = t.rarity;
      rarity.style.color = RARITY_COLORS[t.rarity];
      cell.appendChild(rarity);

      var countEl = document.createElement('div');
      countEl.className = 'inventory-count';
      countEl.textContent = 'x' + count;
      cell.appendChild(countEl);

      gridEl.appendChild(cell);
    }

    // Crafted items
    populateCraftedItemsInInventory(gridEl);

    // Re-check hasItems after crafted items
    if (gridEl.children.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'inventory-empty';
      empty.textContent = 'Nothing in your inventory.';
      gridEl.appendChild(empty);
      statsEl.textContent = '';
    } else {
      statsEl.textContent = 'Total items: ' + totalItems;
    }
  }

  function switchJournalTab(index) {
    journalTabIndex = index;
    var tabs = document.querySelectorAll('.journal-tab');
    var contents = document.querySelectorAll('.journal-tab-content');
    for (var i = 0; i < tabs.length; i++) {
      if (i === index) {
        tabs[i].classList.add('active');
        contents[i].classList.add('active');
      } else {
        tabs[i].classList.remove('active');
        contents[i].classList.remove('active');
      }
    }
  }

  // ── UI Close ─────────────────────────────────────────────
  function closeUI() {
    document.getElementById('garden-seed-picker').style.display = 'none';
    document.getElementById('garden-action-menu').style.display = 'none';
    document.getElementById('garden-journal').style.display = 'none';
    var useitemMenu = document.getElementById('garden-useitem-menu');
    if (useitemMenu) useitemMenu.style.display = 'none';
    uiOpen = '';
    activePlotIndex = -1;
  }

  function isUIOpen() {
    return uiOpen !== '';
  }

  // ── Rendering: Plot ──────────────────────────────────────
  function drawPlot(plotIndex, cam, ctx, gameTime) {
    var plot = GARDEN_PLOTS[plotIndex];
    var cp = computedPlots[plotIndex];
    var sx = plot.tileX * 16 - cam.x;
    var sy = plot.tileY * 16 - cam.y;

    // Draw soil base
    ctx.fillStyle = '#6a5533';
    ctx.fillRect(sx + 2, sy + 10, 12, 6);
    ctx.fillStyle = '#7a6543';
    ctx.fillRect(sx + 3, sy + 11, 10, 4);

    if (!cp || cp.stage === -1) {
      // Empty plot — just soil with small mound
      ctx.fillStyle = '#8a7553';
      ctx.fillRect(sx + 5, sy + 9, 6, 2);
      return;
    }

    var type = PLANT_TYPES[cp.plantType];
    if (!type) return;

    switch (cp.stage) {
      case 0: // Seed
        ctx.fillStyle = '#8a6633';
        ctx.fillRect(sx + 7, sy + 10, 2, 2);
        break;

      case 1: // Sprout
        ctx.fillStyle = '#44aa44';
        ctx.fillRect(sx + 7, sy + 7, 2, 5);
        ctx.fillStyle = '#55cc55';
        ctx.fillRect(sx + 6, sy + 6, 4, 2);
        break;

      case 2: // Growing
        ctx.fillStyle = '#338833';
        ctx.fillRect(sx + 7, sy + 4, 2, 8);
        ctx.fillStyle = '#44aa44';
        ctx.fillRect(sx + 4, sy + 5, 3, 2);
        ctx.fillRect(sx + 9, sy + 3, 3, 2);
        // Bud
        ctx.fillStyle = type.color;
        ctx.fillRect(sx + 6, sy + 2, 4, 3);
        break;

      case 3: // Mature
        ctx.fillStyle = '#338833';
        ctx.fillRect(sx + 7, sy + 3, 2, 9);
        ctx.fillStyle = '#44aa44';
        ctx.fillRect(sx + 3, sy + 5, 4, 2);
        ctx.fillRect(sx + 9, sy + 4, 4, 2);
        ctx.fillStyle = '#55bb55';
        ctx.fillRect(sx + 5, sy + 7, 2, 2);
        // Flower head
        ctx.fillStyle = type.color;
        ctx.fillRect(sx + 5, sy + 0, 6, 4);
        ctx.fillRect(sx + 4, sy + 1, 8, 2);

        // Emberlily shimmer
        if (cp.plantType === 'emberlily' && gameTime % 20 < 10) {
          ctx.fillStyle = 'rgba(255,180,60,0.3)';
          ctx.fillRect(sx + 3, sy - 1, 10, 6);
        }
        // Phantom Orchid translucent
        if (cp.plantType === 'phantom_orchid') {
          ctx.globalAlpha = 0.6;
        }
        break;

      case 4: // Blooming
        ctx.fillStyle = '#338833';
        ctx.fillRect(sx + 7, sy + 3, 2, 9);
        ctx.fillStyle = '#44aa44';
        ctx.fillRect(sx + 3, sy + 5, 4, 3);
        ctx.fillRect(sx + 9, sy + 4, 4, 3);
        ctx.fillStyle = '#55bb55';
        ctx.fillRect(sx + 5, sy + 7, 2, 2);
        // Full bloom
        ctx.fillStyle = type.bloomColor;
        ctx.fillRect(sx + 4, sy - 1, 8, 5);
        ctx.fillRect(sx + 3, sy + 0, 10, 3);

        // Sparkle animation
        var sparkle = Math.sin(gameTime * 0.15 + plotIndex * 2) > 0.3;
        if (sparkle) {
          ctx.fillStyle = 'rgba(255,255,200,0.8)';
          var spx = sx + 4 + Math.sin(gameTime * 0.08 + plotIndex) * 3;
          var spy = sy - 2 + Math.cos(gameTime * 0.1 + plotIndex) * 2;
          ctx.fillRect(spx, spy, 2, 2);
        }

        // Aurora Blossom rainbow
        if (cp.plantType === 'aurora_blossom') {
          var hue = (gameTime * 3 + plotIndex * 40) % 360;
          ctx.fillStyle = 'hsla(' + hue + ',80%,70%,0.4)';
          ctx.fillRect(sx + 2, sy - 2, 12, 7);
        }

        // Moonbloom glow in winter
        if (cp.plantType === 'moonbloom' && getCurrentSeason() === 'winter') {
          ctx.fillStyle = 'rgba(170,187,255,0.3)';
          ctx.fillRect(sx + 1, sy - 3, 14, 9);
        }

        // Emberlily shimmer
        if (cp.plantType === 'emberlily') {
          var flicker = Math.sin(gameTime * 0.2) * 0.2 + 0.2;
          ctx.fillStyle = 'rgba(255,120,30,' + flicker + ')';
          ctx.fillRect(sx + 2, sy - 2, 12, 7);
        }

        // Phantom Orchid
        if (cp.plantType === 'phantom_orchid') {
          ctx.globalAlpha = 0.55;
        }
        break;

      case 5: // Wilted
        ctx.fillStyle = '#886644';
        ctx.fillRect(sx + 7, sy + 5, 2, 7);
        ctx.fillStyle = '#776633';
        ctx.fillRect(sx + 5, sy + 4, 3, 3);
        ctx.fillRect(sx + 9, sy + 6, 3, 2);
        // Droopy flower
        ctx.fillStyle = '#997755';
        ctx.fillRect(sx + 5, sy + 2, 5, 3);
        break;
    }

    // Reset alpha for phantom orchid
    ctx.globalAlpha = 1.0;
  }

  // ── Pixel font for season indicator (3x5 glyphs) ────────
  var PIXEL_FONT = {
    'A': [0,1,0, 1,0,1, 1,1,1, 1,0,1, 1,0,1],
    'B': [1,1,0, 1,0,1, 1,1,0, 1,0,1, 1,1,0],
    'C': [0,1,1, 1,0,0, 1,0,0, 1,0,0, 0,1,1],
    'D': [1,1,0, 1,0,1, 1,0,1, 1,0,1, 1,1,0],
    'E': [1,1,1, 1,0,0, 1,1,0, 1,0,0, 1,1,1],
    'F': [1,1,1, 1,0,0, 1,1,0, 1,0,0, 1,0,0],
    'G': [0,1,1, 1,0,0, 1,0,1, 1,0,1, 0,1,1],
    'H': [1,0,1, 1,0,1, 1,1,1, 1,0,1, 1,0,1],
    'I': [1,1,1, 0,1,0, 0,1,0, 0,1,0, 1,1,1],
    'K': [1,0,1, 1,1,0, 1,0,0, 1,1,0, 1,0,1],
    'L': [1,0,0, 1,0,0, 1,0,0, 1,0,0, 1,1,1],
    'M': [1,0,1, 1,1,1, 1,0,1, 1,0,1, 1,0,1],
    'N': [1,0,1, 1,1,1, 1,1,1, 1,0,1, 1,0,1],
    'O': [0,1,0, 1,0,1, 1,0,1, 1,0,1, 0,1,0],
    'P': [1,1,0, 1,0,1, 1,1,0, 1,0,0, 1,0,0],
    'Q': [0,1,0, 1,0,1, 1,0,1, 1,1,0, 0,1,1],
    'R': [1,1,0, 1,0,1, 1,1,0, 1,0,1, 1,0,1],
    'S': [0,1,1, 1,0,0, 0,1,0, 0,0,1, 1,1,0],
    'T': [1,1,1, 0,1,0, 0,1,0, 0,1,0, 0,1,0],
    'U': [1,0,1, 1,0,1, 1,0,1, 1,0,1, 0,1,0],
    'V': [1,0,1, 1,0,1, 1,0,1, 0,1,0, 0,1,0],
    'W': [1,0,1, 1,0,1, 1,0,1, 1,1,1, 1,0,1],
    'Y': [1,0,1, 1,0,1, 0,1,0, 0,1,0, 0,1,0],
  };

  function drawPixelText(ctx, text, x, y, color) {
    ctx.fillStyle = color;
    var cx = x;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i].toUpperCase();
      var glyph = PIXEL_FONT[ch];
      if (glyph) {
        for (var p = 0; p < 15; p++) {
          if (glyph[p]) {
            ctx.fillRect(cx + (p % 3), y + Math.floor(p / 3), 1, 1);
          }
        }
        cx += 4;
      } else {
        cx += 2; // space
      }
    }
  }

  // ── Rendering: Season Indicator ──────────────────────────
  function drawSeasonIndicator(ctx) {
    var season = getCurrentSeason();
    var progress = getSeasonProgress();

    var seasonColors = {
      spring: '#88dd55',
      summer: '#ffcc33',
      autumn: '#dd8833',
      winter: '#88bbff',
    };

    var label = capitalize(season);
    var textW = label.length * 4 - 1;
    var w = Math.max(textW + 4, 28);
    var h = 11;
    var x = 1, y = 1;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, w, h);

    // Season name (pixel font)
    drawPixelText(ctx, label, x + 2, y + 1, seasonColors[season]);

    // Progress bar
    var barX = x + 1;
    var barY = y + 8;
    var barW = w - 2;
    var barH = 2;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = seasonColors[season];
    ctx.fillRect(barX, barY, Math.round(barW * progress), barH);
  }

  // ── Rendering: Progress Bar ──────────────────────────────
  function drawPlotProgressIndicator(plotIndex, cam, ctx) {
    var cp = computedPlots[plotIndex];
    if (!cp || cp.stage === -1) return;

    var plot = GARDEN_PLOTS[plotIndex];
    var sx = plot.tileX * 16 - cam.x;
    var sy = plot.tileY * 16 - cam.y;

    var barX = sx + 1;
    var barY = sy + 15;
    var barW = 14;
    var barH = 2;

    // Background
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);

    // Fill
    var color = cp.wilted ? '#886644' : (cp.stage === 4 ? '#ffdd00' : '#44cc44');
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, barW * cp.progress, barH);
  }

  // ── Rendering: Harvest Particles ─────────────────────────
  function drawHarvestParticles(cam, ctx) {
    updateParticles();
    for (var i = 0; i < harvestParticles.length; i++) {
      var p = harvestParticles[i];
      var alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - cam.x, p.y - cam.y, p.size, p.size);
    }
    ctx.globalAlpha = 1.0;
  }

  // ── Helpers ──────────────────────────────────────────────
  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── Wire up UI buttons ───────────────────────────────────
  function wireUI() {
    // Seed picker close
    var seedClose = document.getElementById('garden-seed-close');
    if (seedClose) seedClose.addEventListener('click', closeUI);

    // Action menu buttons
    var waterBtn = document.getElementById('garden-water-btn');
    if (waterBtn) waterBtn.addEventListener('click', function () {
      if (activePlotIndex >= 0) waterPlant(activePlotIndex);
    });

    var fertBtn = document.getElementById('garden-fert-btn');
    if (fertBtn) fertBtn.addEventListener('click', function () {
      if (activePlotIndex >= 0) fertilizePlant(activePlotIndex);
    });

    var actionClose = document.getElementById('garden-action-close');
    if (actionClose) actionClose.addEventListener('click', closeUI);

    // Journal
    var journalClose = document.getElementById('garden-journal-close');
    if (journalClose) journalClose.addEventListener('click', closeUI);

    var journalBtn = document.getElementById('garden-journal-btn');
    if (journalBtn) journalBtn.addEventListener('click', showJournal);

    // Journal tab clicks
    var tabBtns = document.querySelectorAll('.journal-tab');
    for (var i = 0; i < tabBtns.length; i++) {
      (function (idx) {
        tabBtns[idx].addEventListener('click', function () {
          switchJournalTab(idx);
        });
      })(i);
    }

    // Reset progress button
    var resetBtn = document.getElementById('reset-progress-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (resetBtn.dataset.confirm === '1') {
          resetProgress();
        } else {
          resetBtn.dataset.confirm = '1';
          resetBtn.textContent = 'Are you sure?';
          resetBtn.style.borderColor = '#cc4444';
          resetBtn.style.color = '#cc4444';
          setTimeout(function () {
            resetBtn.dataset.confirm = '';
            resetBtn.textContent = 'Reset Progress';
            resetBtn.style.borderColor = '#884444';
            resetBtn.style.color = '#aa6666';
          }, 3000);
        }
      });
    }
  }

  // Wire on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUI);
  } else {
    wireUI();
  }

  // ── Keyboard Navigation ─────────────────────────────────
  function handleKey(key, code) {
    if (uiOpen === 'seeds') {
      if (key === 'w' || key === 'arrowup') {
        seedPickerIndex = Math.max(0, seedPickerIndex - 1);
        updateSeedPickerSelection();
        return true;
      }
      if (key === 's' || key === 'arrowdown') {
        seedPickerIndex = Math.min(seedPickerSeeds.length - 1, seedPickerIndex + 1);
        updateSeedPickerSelection();
        return true;
      }
      if (key === 'e' || code === 'Space') {
        var seed = seedPickerSeeds[seedPickerIndex];
        if (seed && seed.unlocked) {
          plantSeed(activePlotIndex, seed.id);
        }
        return true;
      }
      return false;
    }

    if (uiOpen === 'actions') {
      if (key === 'a' || key === 'arrowleft') {
        actionMenuIndex = Math.max(0, actionMenuIndex - 1);
        updateActionMenuSelection();
        return true;
      }
      if (key === 'd' || key === 'arrowright') {
        actionMenuIndex = Math.min(3, actionMenuIndex + 1);
        updateActionMenuSelection();
        return true;
      }
      if (key === 'e' || code === 'Space') {
        if (actionMenuIndex === 0) {
          if (activePlotIndex >= 0) waterPlant(activePlotIndex);
        } else if (actionMenuIndex === 1) {
          if (activePlotIndex >= 0) fertilizePlant(activePlotIndex);
        } else if (actionMenuIndex === 2) {
          if (activePlotIndex >= 0) openUseItemMenu(activePlotIndex);
        } else if (actionMenuIndex === 3) {
          showJournal();
        }
        return true;
      }
      if (key === 'j') {
        showJournal();
        return true;
      }
      return false;
    }

    if (uiOpen === 'useitem') {
      if (key === 'w' || key === 'arrowup') {
        useItemIndex = Math.max(0, useItemIndex - 1);
        updateUseItemSelection();
        return true;
      }
      if (key === 's' || key === 'arrowdown') {
        useItemIndex = Math.min(Math.max(0, useItemList.length - 1), useItemIndex + 1);
        updateUseItemSelection();
        return true;
      }
      if (key === 'e' || code === 'Space') {
        if (useItemList[useItemIndex]) {
          applyItemToPlot(useItemList[useItemIndex].id, activePlotIndex);
        }
        return true;
      }
      if (key === 'escape') {
        closeUseItemMenu();
        return true;
      }
      return false;
    }

    if (uiOpen === 'journal') {
      if (key === 'a' || key === 'arrowleft') {
        journalTabIndex = Math.max(0, journalTabIndex - 1);
        switchJournalTab(journalTabIndex);
        return true;
      }
      if (key === 'd' || key === 'arrowright') {
        journalTabIndex = Math.min(journalTabs.length - 1, journalTabIndex + 1);
        switchJournalTab(journalTabIndex);
        return true;
      }
      // Toggle keys: switch to tab or close if already on it
      var toggleMap = { 'i': 0, 'j': 2, 'm': 3 };
      if (toggleMap[key] !== undefined) {
        if (journalTabIndex === toggleMap[key]) {
          closeUI();
        } else {
          journalTabIndex = toggleMap[key];
          switchJournalTab(journalTabIndex);
        }
        return true;
      }
      return false;
    }

    return false;
  }

  // ── Reset Progress ───────────────────────────────────────
  function resetProgress() {
    if (!inventoryRef) return;
    // Clear personal inventory only (gold, plants, quests, recipes, etc.)
    inventoryRef.remove();

    if (window.showToast) window.showToast('Progress reset');
    closeUI();
  }

  // ── Use Item Menu ────────────────────────────────────────
  var useItemIndex = 0;
  var useItemList = [];

  function openUseItemMenu(plotIndex) {
    if (!window.Crafting) return;
    var plotD = plots[plotIndex];
    var cp = computedPlots[plotIndex];
    useItemList = Crafting.getApplicableItems(plotD, cp);
    useItemIndex = 0;

    var listEl = document.getElementById('garden-useitem-list');
    listEl.innerHTML = '';

    if (useItemList.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'useitem-empty';
      empty.textContent = 'No applicable items.';
      listEl.appendChild(empty);
    } else {
      for (var i = 0; i < useItemList.length; i++) {
        var item = useItemList[i];
        var row = document.createElement('div');
        row.className = 'useitem-row';
        if (i === 0) row.classList.add('selected');

        var name = document.createElement('span');
        name.className = 'useitem-name';
        name.textContent = item.name;
        row.appendChild(name);

        var count = document.createElement('span');
        count.className = 'useitem-count';
        count.textContent = 'x' + item.count;
        row.appendChild(count);

        (function (itemId) {
          row.addEventListener('click', function () {
            applyItemToPlot(itemId, activePlotIndex);
          });
        })(item.id);

        listEl.appendChild(row);
      }
    }

    document.getElementById('garden-action-menu').style.display = 'none';
    document.getElementById('garden-useitem-menu').style.display = 'block';
    uiOpen = 'useitem';
  }

  function updateUseItemSelection() {
    var rows = document.getElementById('garden-useitem-list').children;
    for (var i = 0; i < rows.length; i++) {
      if (i === useItemIndex) {
        rows[i].classList.add('selected');
      } else {
        rows[i].classList.remove('selected');
      }
    }
  }

  function closeUseItemMenu() {
    document.getElementById('garden-useitem-menu').style.display = 'none';
    // Return to action menu
    showActionMenu(activePlotIndex);
  }

  function applyItemToPlot(itemId, plotIndex) {
    if (!plotsRef || !inventoryRef) return;
    var plotData = plots[plotIndex];
    if (!plotData) return;
    var cp = computedPlots[plotIndex];
    if (!cp) return;

    var currentCount = inventory[itemId] || 0;
    if (currentCount < 1) return;

    var plotUpdate = {};
    var invUpdate = {};
    invUpdate[itemId] = currentCount - 1;

    switch (itemId) {
      case 'growth_tonic':
        plotUpdate.growthTonic = true;
        break;
      case 'wilt_remedy':
        // Revive wilted plant: add a fresh watering
        var now = Date.now();
        var sessionId = Multiplayer.getSessionId();
        var waterings = plotData.waterings || [];
        waterings.push({ at: now, by: sessionId });
        plotUpdate.waterings = waterings;
        break;
      case 'super_fertilizer':
        var sFert = plotData.superFertCount || 0;
        if (sFert >= 3) return; // maxed
        plotUpdate.superFertCount = sFert + 1;
        break;
      case 'lucky_charm':
        plotUpdate.luckyCharm = true;
        break;
      case 'essence_of_seasons':
        plotUpdate.seasonLocked = true;
        break;
      default:
        return;
    }

    plotsRef.child('plot_' + plotIndex).update(plotUpdate);
    inventoryRef.update(invUpdate);

    var RECIPES = Crafting.getRecipes();
    var recipeName = RECIPES[itemId] ? RECIPES[itemId].name : itemId;
    if (window.showToast) window.showToast(recipeName + ' applied');

    // Close use item menu
    document.getElementById('garden-useitem-menu').style.display = 'none';
    closeUI();
  }

  // Also show crafted items in inventory tab
  function populateCraftedItemsInInventory(gridEl) {
    if (!window.Crafting) return;
    var RECIPES = Crafting.getRecipes();
    for (var id in RECIPES) {
      var count = inventory[id] || 0;
      if (count < 1) continue;
      var recipe = RECIPES[id];

      var cell = document.createElement('div');
      cell.className = 'inventory-cell';

      var dot = document.createElement('div');
      dot.className = 'journal-dot';
      dot.style.background = recipe.icon;
      cell.appendChild(dot);

      var name = document.createElement('div');
      name.className = 'journal-name';
      name.textContent = recipe.name;
      cell.appendChild(name);

      var countEl = document.createElement('div');
      countEl.className = 'inventory-count';
      countEl.textContent = 'x' + count;
      cell.appendChild(countEl);

      gridEl.appendChild(cell);
    }
  }

  // ── Public API ───────────────────────────────────────────
  return {
    init: init,
    collectWater: collectWater,
    getPlotNearPlayer: getPlotNearPlayer,
    handlePlotInteract: handlePlotInteract,
    closeUI: closeUI,
    isUIOpen: isUIOpen,
    showJournal: showJournal,
    getPlots: function () { return GARDEN_PLOTS; },
    getComputedPlots: function () { return computedPlots; },
    getCurrentSeason: getCurrentSeason,
    drawPlot: drawPlot,
    drawSeasonIndicator: drawSeasonIndicator,
    drawPlotProgressIndicator: drawPlotProgressIndicator,
    drawHarvestParticles: drawHarvestParticles,
    recomputeAllPlots: recomputeAllPlots,
    handleKey: handleKey,
    drawPixelText: drawPixelText,
    getPlantTypes: function () { return PLANT_TYPES; },
    getInventory: function () { return inventory; },
  };
})();
