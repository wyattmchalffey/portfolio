// store.js — Store room: buy supplies and sell harvested plants
var Store = (function () {
  'use strict';

  // ── Shop Items ──────────────────────────────────────────
  var SHOP_ITEMS = {
    fertilizer: { name: 'Fertilizer', cost: 3, desc: 'Speeds up plant growth by 10% per use (max 3).', icon: '#44cc44' },
  };

  // ── Counter Tiles (row 23, cols 7-11) ──────────────────
  var COUNTER_TILES = [];
  for (var c = 7; c <= 11; c++) {
    COUNTER_TILES.push({ x: c, y: 23 });
  }

  // ── State ──────────────────────────────────────────────
  var inventoryRef = null;
  var inventory = {};
  var uiOpen = false;
  var activeTab = 'buy'; // 'buy' or 'sell'
  var listIndex = 0;
  var buyItems = [];
  var sellItems = [];

  // ── Init ───────────────────────────────────────────────
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
      console.warn('Store init failed:', e);
    }
    wireUI();
  }

  // ── Counter Detection ──────────────────────────────────
  function getCounterNearPlayer(tileX, tileY) {
    for (var i = 0; i < COUNTER_TILES.length; i++) {
      var ct = COUNTER_TILES[i];
      var dist = Math.hypot(ct.x - tileX, ct.y - tileY);
      if (dist < 1.5) {
        return { type: 'store_counter', tileX: ct.x, tileY: ct.y };
      }
    }
    return null;
  }

  // ── Open Store UI ──────────────────────────────────────
  function handleCounterInteract() {
    activeTab = 'buy';
    listIndex = 0;
    renderUI();
    document.getElementById('store-ui').style.display = 'flex';
    uiOpen = true;
  }

  // ── Render UI ──────────────────────────────────────────
  function renderUI() {
    // Update gold display
    document.getElementById('store-gold').textContent = 'Gold: ' + (inventory.gold || 0) + 'g';

    // Tab buttons
    var buyTab = document.getElementById('store-tab-buy');
    var sellTab = document.getElementById('store-tab-sell');
    if (activeTab === 'buy') {
      buyTab.classList.add('active');
      sellTab.classList.remove('active');
    } else {
      buyTab.classList.remove('active');
      sellTab.classList.add('active');
    }

    if (activeTab === 'buy') {
      renderBuyList();
    } else {
      renderSellList();
    }
  }

  // ── Buy List ───────────────────────────────────────────
  function renderBuyList() {
    var listEl = document.getElementById('store-list');
    listEl.innerHTML = '';
    buyItems = [];

    for (var id in SHOP_ITEMS) {
      var item = SHOP_ITEMS[id];
      buyItems.push({ id: id, item: item });

      var row = document.createElement('div');
      row.className = 'store-row';
      if (buyItems.length - 1 === listIndex) row.classList.add('selected');

      var dot = document.createElement('span');
      dot.className = 'store-dot';
      dot.style.background = item.icon;
      row.appendChild(dot);

      var info = document.createElement('div');
      info.className = 'store-info';

      var nameEl = document.createElement('span');
      nameEl.className = 'store-item-name';
      nameEl.textContent = item.name;
      info.appendChild(nameEl);

      var descEl = document.createElement('div');
      descEl.className = 'store-item-desc';
      descEl.textContent = item.desc;
      info.appendChild(descEl);

      var owned = inventory[id] || 0;
      var ownedEl = document.createElement('div');
      ownedEl.className = 'store-item-owned';
      ownedEl.textContent = 'Owned: ' + owned;
      info.appendChild(ownedEl);

      row.appendChild(info);

      var cost = document.createElement('span');
      cost.className = 'store-cost';
      cost.textContent = item.cost + 'g';
      row.appendChild(cost);

      var btn = document.createElement('button');
      btn.className = 'store-btn';
      btn.textContent = 'Buy';
      var gold = inventory.gold || 0;
      btn.disabled = gold < item.cost;
      (function (itemId) {
        btn.addEventListener('click', function () { buyItem(itemId); });
      })(id);
      row.appendChild(btn);

      listEl.appendChild(row);
    }

    if (buyItems.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'store-empty';
      empty.textContent = 'No items for sale.';
      listEl.appendChild(empty);
    }
  }

  // ── Sell List ──────────────────────────────────────────
  function renderSellList() {
    var listEl = document.getElementById('store-list');
    listEl.innerHTML = '';
    sellItems = [];

    var PLANT_TYPES = Garden.getPlantTypes();

    for (var key in PLANT_TYPES) {
      var count = inventory[key] || 0;
      if (count < 1) continue;
      var t = PLANT_TYPES[key];
      var sellPrice = t.value;
      if (key === 'starvine') sellPrice *= 2;
      sellItems.push({ id: key, type: t, count: count, sellPrice: sellPrice });
    }

    for (var i = 0; i < sellItems.length; i++) {
      var si = sellItems[i];
      var row = document.createElement('div');
      row.className = 'store-row';
      if (i === listIndex) row.classList.add('selected');

      var dot = document.createElement('span');
      dot.className = 'store-dot';
      dot.style.background = si.type.color;
      row.appendChild(dot);

      var info = document.createElement('div');
      info.className = 'store-info';

      var nameEl = document.createElement('span');
      nameEl.className = 'store-item-name';
      nameEl.textContent = si.type.name;
      info.appendChild(nameEl);

      var countEl = document.createElement('div');
      countEl.className = 'store-item-owned';
      countEl.textContent = 'x' + si.count;
      info.appendChild(countEl);

      row.appendChild(info);

      var price = document.createElement('span');
      price.className = 'store-price';
      price.textContent = '+' + si.sellPrice + 'g';
      row.appendChild(price);

      var btn = document.createElement('button');
      btn.className = 'store-btn';
      btn.textContent = 'Sell';
      (function (plantId) {
        btn.addEventListener('click', function () { sellPlant(plantId); });
      })(si.id);
      row.appendChild(btn);

      listEl.appendChild(row);
    }

    // Crafted items
    if (window.Crafting) {
      var RECIPES = Crafting.getRecipes();
      for (var rid in RECIPES) {
        var rc = inventory[rid] || 0;
        if (rc < 1) continue;
        var recipe = RECIPES[rid];
        sellItems.push({ id: rid, type: { name: recipe.name, color: recipe.icon, value: recipe.sellValue }, count: rc, sellPrice: recipe.sellValue, isCrafted: true });
      }
      // Re-render the crafted sell rows
      for (var ci = 0; ci < sellItems.length; ci++) {
        if (!sellItems[ci].isCrafted) continue;
        var csi = sellItems[ci];
        var crow = document.createElement('div');
        crow.className = 'store-row';
        if (ci === listIndex) crow.classList.add('selected');

        var cdot = document.createElement('span');
        cdot.className = 'store-dot';
        cdot.style.background = csi.type.color;
        crow.appendChild(cdot);

        var cinfo = document.createElement('div');
        cinfo.className = 'store-info';

        var cnameEl = document.createElement('span');
        cnameEl.className = 'store-item-name';
        cnameEl.textContent = csi.type.name;
        cinfo.appendChild(cnameEl);

        var ccountEl = document.createElement('div');
        ccountEl.className = 'store-item-owned';
        ccountEl.textContent = 'x' + csi.count;
        cinfo.appendChild(ccountEl);

        crow.appendChild(cinfo);

        var cprice = document.createElement('span');
        cprice.className = 'store-price';
        cprice.textContent = '+' + csi.sellPrice + 'g';
        crow.appendChild(cprice);

        var cbtn = document.createElement('button');
        cbtn.className = 'store-btn';
        cbtn.textContent = 'Sell';
        (function (itemId) {
          cbtn.addEventListener('click', function () { sellCraftedItem(itemId); });
        })(csi.id);
        crow.appendChild(cbtn);

        listEl.appendChild(crow);
      }
    }

    if (sellItems.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'store-empty';
      empty.textContent = 'No plants to sell. Harvest some first!';
      listEl.appendChild(empty);
    }
  }

  // ── Buy Item ───────────────────────────────────────────
  function buyItem(itemId) {
    if (!inventoryRef) return;
    var item = SHOP_ITEMS[itemId];
    if (!item) return;

    var gold = inventory.gold || 0;
    if (gold < item.cost) return;

    var update = {};
    update.gold = gold - item.cost;
    update[itemId] = (inventory[itemId] || 0) + 1;
    inventoryRef.update(update);

    if (window.showToast) window.showToast(item.name + ' purchased');

    setTimeout(function () {
      if (uiOpen) renderUI();
    }, 200);
  }

  // ── Sell Plant ─────────────────────────────────────────
  function sellPlant(plantType) {
    if (!inventoryRef) return;
    var count = inventory[plantType] || 0;
    if (count < 1) return;

    var PLANT_TYPES = Garden.getPlantTypes();
    var t = PLANT_TYPES[plantType];
    if (!t) return;

    var sellPrice = t.value;
    if (plantType === 'starvine') sellPrice *= 2;

    var update = {};
    update[plantType] = count - 1;
    update.gold = (inventory.gold || 0) + sellPrice;
    inventoryRef.update(update);

    if (window.Quests) Quests.onAction('sell', plantType);
    if (window.showToast) window.showToast(t.name + ' sold +' + sellPrice + 'g');

    setTimeout(function () {
      if (uiOpen) {
        // Adjust list index if we sold the last of a plant
        var newSellCount = 0;
        for (var k in PLANT_TYPES) {
          var c = inventory[k] || 0;
          if (k === plantType) c = count - 1;
          if (c > 0) newSellCount++;
        }
        if (listIndex >= newSellCount) listIndex = Math.max(0, newSellCount - 1);
        renderUI();
      }
    }, 200);
  }

  // ── Sell Crafted Item ─────────────────────────────────
  function sellCraftedItem(itemId) {
    if (!inventoryRef || !window.Crafting) return;
    var count = inventory[itemId] || 0;
    if (count < 1) return;

    var RECIPES = Crafting.getRecipes();
    var recipe = RECIPES[itemId];
    if (!recipe) return;

    var update = {};
    update[itemId] = count - 1;
    update.gold = (inventory.gold || 0) + recipe.sellValue;
    inventoryRef.update(update);

    if (window.showToast) window.showToast(recipe.name + ' sold +' + recipe.sellValue + 'g');

    setTimeout(function () {
      if (uiOpen) renderUI();
    }, 200);
  }

  // ── Keyboard Navigation ────────────────────────────────
  function handleKey(key, code) {
    if (key === 'a' || key === 'arrowleft') {
      if (activeTab !== 'buy') {
        activeTab = 'buy';
        listIndex = 0;
        renderUI();
      }
      return true;
    }
    if (key === 'd' || key === 'arrowright') {
      if (activeTab !== 'sell') {
        activeTab = 'sell';
        listIndex = 0;
        renderUI();
      }
      return true;
    }
    if (key === 'w' || key === 'arrowup') {
      listIndex = Math.max(0, listIndex - 1);
      renderUI();
      return true;
    }
    if (key === 's' || key === 'arrowdown') {
      var maxIdx = activeTab === 'buy' ? buyItems.length - 1 : sellItems.length - 1;
      listIndex = Math.min(Math.max(0, maxIdx), listIndex + 1);
      renderUI();
      return true;
    }
    if (key === 'e' || code === 'Space') {
      if (activeTab === 'buy' && buyItems[listIndex]) {
        buyItem(buyItems[listIndex].id);
      } else if (activeTab === 'sell' && sellItems[listIndex]) {
        if (sellItems[listIndex].isCrafted) {
          sellCraftedItem(sellItems[listIndex].id);
        } else {
          sellPlant(sellItems[listIndex].id);
        }
      }
      return true;
    }
    return false;
  }

  // ── UI Close ───────────────────────────────────────────
  function closeUI() {
    document.getElementById('store-ui').style.display = 'none';
    uiOpen = false;
    listIndex = 0;
  }

  function isUIOpen() {
    return uiOpen;
  }

  // ── Wire UI ────────────────────────────────────────────
  function wireUI() {
    var closeBtn = document.getElementById('store-close');
    if (closeBtn) closeBtn.addEventListener('click', closeUI);

    var overlay = document.getElementById('store-ui');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target.id === 'store-ui') closeUI();
    });

    var buyTab = document.getElementById('store-tab-buy');
    if (buyTab) buyTab.addEventListener('click', function () {
      activeTab = 'buy';
      listIndex = 0;
      renderUI();
    });

    var sellTab = document.getElementById('store-tab-sell');
    if (sellTab) sellTab.addEventListener('click', function () {
      activeTab = 'sell';
      listIndex = 0;
      renderUI();
    });
  }

  // ── Public API ─────────────────────────────────────────
  return {
    init: init,
    getCounterNearPlayer: getCounterNearPlayer,
    handleCounterInteract: handleCounterInteract,
    closeUI: closeUI,
    isUIOpen: isUIOpen,
    handleKey: handleKey,
  };
})();
