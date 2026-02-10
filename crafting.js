// crafting.js — Crafting system: combine plants into useful items at the Workshop machine
var Crafting = (function () {
  'use strict';

  // ── Recipe Definitions ─────────────────────────────────────
  var RECIPES = {
    growth_tonic: {
      name: 'Growth Tonic',
      desc: 'Apply to a growing plot: instantly adds 25% growth.',
      ingredients: { sunpetal: 1, firethorn: 1 },
      icon: '#44cc88',
      sellValue: 12,
    },
    wilt_remedy: {
      name: 'Wilt Remedy',
      desc: 'Apply to a wilted plot: revives and waters the plant.',
      ingredients: { moonbloom: 1, raindrop_fern: 1 },
      icon: '#88bbff',
      sellValue: 20,
    },
    super_fertilizer: {
      name: 'Super Fertilizer',
      desc: 'Like fertilizer but gives a 20% growth boost per use.',
      ingredients: { crystalbell: 1, firethorn: 1 },
      icon: '#ffcc44',
      sellValue: 18,
    },
    lucky_charm: {
      name: 'Lucky Charm',
      desc: 'Apply to a blooming plot: next harvest yields x2 plants.',
      ingredients: { starvine: 1, moonbloom: 1 },
      icon: '#ff88cc',
      sellValue: 25,
    },
    essence_of_seasons: {
      name: 'Essence of Seasons',
      desc: 'Apply to a growing plot: plant always grows at in-season speed.',
      ingredients: { emberlily: 1, phantom_orchid: 1 },
      icon: '#cc88ff',
      sellValue: 50,
    },
  };

  // ── Crafting Station Position ──────────────────────────────
  var STATION_X = 10;
  var STATION_Y = 3;

  // ── State ──────────────────────────────────────────────────
  var inventoryRef = null;
  var inventory = {};
  var uiOpen = false;
  var listIndex = 0;
  var recipeList = []; // filtered list of unlocked recipes for UI

  // ── Init ───────────────────────────────────────────────────
  function init() {
    if (typeof firebase === 'undefined' || !firebase.database) return;
    try {
      var db = firebase.database();
      var sessionId = Multiplayer.getSessionId();
      inventoryRef = db.ref('inventory/' + sessionId);
      inventoryRef.on('value', function (snap) {
        inventory = snap.val() || {};
      });
    } catch (e) {
      console.warn('Crafting init failed:', e);
    }
    wireUI();
  }

  // ── Station Detection ──────────────────────────────────────
  function getStationNearPlayer(tileX, tileY) {
    var dist = Math.hypot(STATION_X - tileX, STATION_Y - tileY);
    if (dist < 1.5) {
      return { type: 'crafting_station', tileX: STATION_X, tileY: STATION_Y };
    }
    return null;
  }

  function isStationUnlocked() {
    return window.Quests && Quests.isQuestCompleted('worker_1');
  }

  // ── Crafting Station Interaction ───────────────────────────
  function handleStationInteract() {
    if (!isStationUnlocked()) {
      if (window.showToast) window.showToast('The machine is locked');
      return;
    }
    openUI();
  }

  // ── Crafting Logic ─────────────────────────────────────────
  function canCraft(recipeId) {
    var recipe = RECIPES[recipeId];
    if (!recipe) return false;
    if (!inventory['recipe_' + recipeId]) return false;
    for (var item in recipe.ingredients) {
      if ((inventory[item] || 0) < recipe.ingredients[item]) return false;
    }
    return true;
  }

  function craftItem(recipeId) {
    if (!inventoryRef || !canCraft(recipeId)) return;
    var recipe = RECIPES[recipeId];

    var update = {};
    // Consume ingredients
    for (var item in recipe.ingredients) {
      update[item] = (inventory[item] || 0) - recipe.ingredients[item];
    }
    // Add crafted item
    update[recipeId] = (inventory[recipeId] || 0) + 1;
    inventoryRef.update(update);

    if (window.showToast) window.showToast(recipe.name + ' crafted');
    if (window.Quests) Quests.onAction('craft');

    // Re-render after Firebase updates
    setTimeout(function () {
      if (uiOpen) renderUI();
    }, 200);
  }

  // ── UI ─────────────────────────────────────────────────────
  function openUI() {
    listIndex = 0;
    renderUI();
    document.getElementById('crafting-ui').style.display = 'flex';
    uiOpen = true;
  }

  function renderUI() {
    var listEl = document.getElementById('crafting-list');
    listEl.innerHTML = '';
    recipeList = [];

    // Gold display
    document.getElementById('crafting-gold').textContent = 'Gold: ' + (inventory.gold || 0) + 'g';

    var PLANT_TYPES = Garden.getPlantTypes();

    for (var id in RECIPES) {
      if (!inventory['recipe_' + id]) continue; // not unlocked
      var recipe = RECIPES[id];
      recipeList.push(id);

      var row = document.createElement('div');
      row.className = 'crafting-row';
      if (recipeList.length - 1 === listIndex) row.classList.add('selected');

      // Icon
      var dot = document.createElement('span');
      dot.className = 'crafting-dot';
      dot.style.background = recipe.icon;
      row.appendChild(dot);

      // Info
      var info = document.createElement('div');
      info.className = 'crafting-info';

      var nameEl = document.createElement('span');
      nameEl.className = 'crafting-item-name';
      nameEl.textContent = recipe.name;
      info.appendChild(nameEl);

      var descEl = document.createElement('div');
      descEl.className = 'crafting-item-desc';
      descEl.textContent = recipe.desc;
      info.appendChild(descEl);

      // Ingredients
      var ingEl = document.createElement('div');
      ingEl.className = 'crafting-ingredients';
      var ingParts = [];
      for (var item in recipe.ingredients) {
        var need = recipe.ingredients[item];
        var have = inventory[item] || 0;
        var pt = PLANT_TYPES[item];
        var name = pt ? pt.name : item;
        var enough = have >= need;
        ingParts.push('<span class="' + (enough ? 'crafting-ing-ok' : 'crafting-ing-need') + '">' + name + ' ' + have + '/' + need + '</span>');
      }
      ingEl.innerHTML = ingParts.join(' + ');
      info.appendChild(ingEl);

      // Owned count
      var ownedCount = inventory[id] || 0;
      if (ownedCount > 0) {
        var ownedEl = document.createElement('div');
        ownedEl.className = 'crafting-owned';
        ownedEl.textContent = 'Owned: ' + ownedCount;
        info.appendChild(ownedEl);
      }

      row.appendChild(info);

      // Craft button
      var btn = document.createElement('button');
      btn.className = 'crafting-btn';
      btn.textContent = 'Craft';
      btn.disabled = !canCraft(id);
      (function (recipeId) {
        btn.addEventListener('click', function () { craftItem(recipeId); });
      })(id);
      row.appendChild(btn);

      listEl.appendChild(row);
    }

    if (recipeList.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'crafting-empty';
      empty.textContent = 'No recipes unlocked yet. Complete quests to learn recipes!';
      listEl.appendChild(empty);
    }
  }

  function closeUI() {
    document.getElementById('crafting-ui').style.display = 'none';
    uiOpen = false;
    listIndex = 0;
  }

  function isUIOpen() {
    return uiOpen;
  }

  // ── Keyboard Navigation ────────────────────────────────────
  function handleKey(key, code) {
    if (key === 'w' || key === 'arrowup') {
      listIndex = Math.max(0, listIndex - 1);
      renderUI();
      return true;
    }
    if (key === 's' || key === 'arrowdown') {
      listIndex = Math.min(Math.max(0, recipeList.length - 1), listIndex + 1);
      renderUI();
      return true;
    }
    if (key === 'e' || code === 'Space') {
      if (recipeList[listIndex]) {
        craftItem(recipeList[listIndex]);
      }
      return true;
    }
    return false;
  }

  // ── Applicable Items for Garden Plots ──────────────────────
  function getApplicableItems(plotData, computedPlot) {
    var items = [];
    if (!computedPlot || computedPlot.stage === -1) return items;

    var stage = computedPlot.stage;

    // Growth Tonic: any growing plot (stage 0-3)
    if ((inventory.growth_tonic || 0) > 0 && stage >= 0 && stage <= 3) {
      items.push({ id: 'growth_tonic', name: 'Growth Tonic', count: inventory.growth_tonic });
    }

    // Wilt Remedy: wilted only (stage 5)
    if ((inventory.wilt_remedy || 0) > 0 && stage === 5) {
      items.push({ id: 'wilt_remedy', name: 'Wilt Remedy', count: inventory.wilt_remedy });
    }

    // Super Fertilizer: if fertCount < 3
    if ((inventory.super_fertilizer || 0) > 0 && stage >= 0 && stage <= 3 && computedPlot.fertCount < 3) {
      items.push({ id: 'super_fertilizer', name: 'Super Fertilizer', count: inventory.super_fertilizer });
    }

    // Lucky Charm: blooming plot (stage 4)
    if ((inventory.lucky_charm || 0) > 0 && stage === 4) {
      items.push({ id: 'lucky_charm', name: 'Lucky Charm', count: inventory.lucky_charm });
    }

    // Essence of Seasons: any growing plot (stage 0-3), not already applied
    if ((inventory.essence_of_seasons || 0) > 0 && stage >= 0 && stage <= 3) {
      if (!plotData || !plotData.seasonLocked) {
        items.push({ id: 'essence_of_seasons', name: 'Essence of Seasons', count: inventory.essence_of_seasons });
      }
    }

    return items;
  }

  function getRecipes() {
    return RECIPES;
  }

  // ── Wire UI ────────────────────────────────────────────────
  function wireUI() {
    var closeBtn = document.getElementById('crafting-close');
    if (closeBtn) closeBtn.addEventListener('click', closeUI);

    var overlay = document.getElementById('crafting-ui');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target.id === 'crafting-ui') closeUI();
    });
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    init: init,
    getStationNearPlayer: getStationNearPlayer,
    handleStationInteract: handleStationInteract,
    closeUI: closeUI,
    isUIOpen: isUIOpen,
    handleKey: handleKey,
    getApplicableItems: getApplicableItems,
    getRecipes: getRecipes,
    isStationUnlocked: isStationUnlocked,
  };
})();
