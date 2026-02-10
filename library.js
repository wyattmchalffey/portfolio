// library.js — Library room: interactable bookshelves with purchasable plant knowledge
var Library = (function () {
  'use strict';

  // ── Book Definitions ──────────────────────────────────────
  // Each book is a topic that can be unlocked for gold.
  // Add new books here to expand the library content.
  var BOOKS = {
    spring_almanac: {
      name: 'Spring Almanac',
      cost: 1,
      lines: [
        'RAINDROP FERN',
        '  Rarity: Uncommon',
        '  Season: Spring  Grow: 1h  Value: 15g',
        '  Grows 50% faster when watered.',
        '',
        'AURORA BLOSSOM',
        '  Rarity: Legendary',
        '  Season: Spring  Grow: 4h  Value: 100g',
        '  Petals shift through every color.',
        '  Requires 25 harvests to unlock.',
      ],
    },
    summer_almanac: {
      name: 'Summer Almanac',
      cost: 1,
      lines: [
        'SUNPETAL',
        '  Rarity: Common',
        '  Season: Summer  Grow: 30m  Value: 5g',
        '  A cheerful golden starter plant.',
        '',
        'FIRETHORN',
        '  Rarity: Common',
        '  Season: Summer  Grow: 40m  Value: 6g',
        '  Hardy and reliable grower.',
        '',
        'EMBERLILY',
        '  Rarity: Rare',
        '  Season: Summer  Grow: 2h  Value: 40g',
        '  Shimmers with inner flame.',
        '  Requires 10 harvests to unlock.',
      ],
    },
    autumn_almanac: {
      name: 'Autumn Almanac',
      cost: 1,
      lines: [
        'STARVINE',
        '  Rarity: Uncommon',
        '  Season: Autumn  Grow: 1h  Value: 20g',
        '  Yields double gold when harvested.',
        '',
        'PHANTOM ORCHID',
        '  Rarity: Rare',
        '  Season: Autumn  Grow: 2.5h  Value: 50g',
        '  Appears translucent and ghostly.',
        '  Requires 10 harvests to unlock.',
      ],
    },
    winter_almanac: {
      name: 'Winter Almanac',
      cost: 1,
      lines: [
        'MOONBLOOM',
        '  Rarity: Common',
        '  Season: Winter  Grow: 45m  Value: 8g',
        '  Emits a soft glow in winter.',
        '',
        'CRYSTALBELL',
        '  Rarity: Uncommon',
        '  Season: Winter  Grow: 1.5h  Value: 18g',
        '  Never wilts during winter.',
      ],
    },
    gardener_handbook: {
      name: "Gardener's Handbook",
      cost: 1,
      lines: [
        'SEASONS',
        '  Plants grow 25% faster in season.',
        '  50% slower in opposite season.',
        '',
        'WATERING',
        '  Collect water from fountain or well.',
        '  Each watering boosts growth 15%.',
        '  Boost lasts 30 minutes.',
        '',
        'WILTING',
        '  4 hours without water causes wilt.',
        '  Water a wilted plant to revive it.',
        '',
        'FERTILIZING',
        '  Purchase fertilizer at the Store.',
        '  Up to 3 uses per plant.',
        '  Each use boosts growth 10%.',
      ],
    },
    rare_species: {
      name: 'Rare Species Catalog',
      cost: 1,
      lines: [
        'RARE PLANTS',
        '  Require 10 total harvests.',
        '  Only plantable in their season.',
        '',
        'LEGENDARY PLANTS',
        '  Require 25 total harvests.',
        '  Only plantable in their season.',
        '',
        'WORLDTREE SPROUT',
        '  Grows in any season.',
        '  Must collect every other plant first.',
        '  The ultimate gardening achievement.',
      ],
    },
  };

  // ── Interactable Shelf Positions ──────────────────────────
  // Each shelf maps a tile position to a book ID.
  // Add more shelves here as new books are added.
  var SHELVES = [
    { tileX: 24, tileY: 2, bookId: 'spring_almanac' },
    { tileX: 27, tileY: 2, bookId: 'summer_almanac' },
    { tileX: 33, tileY: 2, bookId: 'autumn_almanac' },
    { tileX: 36, tileY: 2, bookId: 'winter_almanac' },
    { tileX: 24, tileY: 4, bookId: 'gardener_handbook' },
    { tileX: 36, tileY: 6, bookId: 'rare_species' },
  ];

  // ── State ─────────────────────────────────────────────────
  var inventoryRef = null;
  var inventory = {};
  var uiOpen = false;
  var activeBookId = null;
  var activeShelfIndex = -1;

  // ── Init ──────────────────────────────────────────────────
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
      console.warn('Library init failed:', e);
    }
  }

  // ── Shelf Detection ───────────────────────────────────────
  function getShelfNearPlayer(tileX, tileY) {
    for (var i = 0; i < SHELVES.length; i++) {
      var s = SHELVES[i];
      var dist = Math.hypot(s.tileX - tileX, s.tileY - tileY);
      if (dist < 2) {
        return { type: 'library_shelf', shelfIndex: i, tileX: s.tileX, tileY: s.tileY };
      }
    }
    return null;
  }

  // ── Shelf Interaction ─────────────────────────────────────
  function handleShelfInteract(shelfIndex) {
    var shelf = SHELVES[shelfIndex];
    if (!shelf) return;
    var book = BOOKS[shelf.bookId];
    if (!book) return;

    activeBookId = shelf.bookId;
    activeShelfIndex = shelfIndex;
    var unlocked = !!inventory['book_' + shelf.bookId];

    var titleEl = document.getElementById('library-title');
    var bodyEl = document.getElementById('library-body');
    var costEl = document.getElementById('library-cost');
    var buyBtn = document.getElementById('library-buy-btn');
    var actionsEl = document.getElementById('library-actions');

    titleEl.textContent = book.name;

    if (unlocked) {
      // Show book content
      bodyEl.innerHTML = '';
      for (var i = 0; i < book.lines.length; i++) {
        var line = document.createElement('div');
        var text = book.lines[i];
        if (text === '') {
          line.className = 'library-line-blank';
        } else if (text.charAt(0) === ' ') {
          line.className = 'library-line-detail';
        } else {
          line.className = 'library-line-heading';
        }
        line.textContent = text;
        bodyEl.appendChild(line);
      }
      costEl.textContent = '';
      actionsEl.style.display = 'none';
    } else {
      // Show purchase prompt
      bodyEl.innerHTML = '';
      var preview = document.createElement('div');
      preview.className = 'library-locked-text';
      preview.textContent = 'This tome contains knowledge about the plants of this world.';
      bodyEl.appendChild(preview);

      var gold = inventory.gold || 0;
      costEl.textContent = 'Your gold: ' + gold + 'g';
      actionsEl.style.display = 'block';
      buyBtn.textContent = 'Unlock (' + book.cost + 'g)';
      buyBtn.disabled = gold < book.cost;
    }

    document.getElementById('library-book').style.display = 'flex';
    uiOpen = true;
  }

  // ── Purchase Book ─────────────────────────────────────────
  function buyBook() {
    if (!activeBookId || !inventoryRef) return;
    var book = BOOKS[activeBookId];
    if (!book) return;

    var gold = inventory.gold || 0;
    if (gold < book.cost) return;

    var update = {};
    update.gold = gold - book.cost;
    update['book_' + activeBookId] = true;
    inventoryRef.update(update);

    if (window.Quests) Quests.onAction('read_book', activeBookId);

    // Show toast
    if (window.showToast) window.showToast(book.name + ' unlocked');

    // Re-render as unlocked (after brief delay for Firebase)
    setTimeout(function () {
      if (uiOpen && activeShelfIndex >= 0) {
        handleShelfInteract(activeShelfIndex);
      }
    }, 300);
  }

  // ── UI ────────────────────────────────────────────────────
  function closeUI() {
    document.getElementById('library-book').style.display = 'none';
    uiOpen = false;
    activeBookId = null;
    activeShelfIndex = -1;
  }

  function isUIOpen() {
    return uiOpen;
  }

  function handleKey(key, code) {
    if (key === 'e' || code === 'Space') {
      if (activeBookId && !inventory['book_' + activeBookId]) {
        buyBook();
        return true;
      }
    }
    return false;
  }

  // ── Wire up UI buttons ────────────────────────────────────
  function wireUI() {
    var closeBtn = document.getElementById('library-close');
    if (closeBtn) closeBtn.addEventListener('click', closeUI);

    var buyBtn = document.getElementById('library-buy-btn');
    if (buyBtn) buyBtn.addEventListener('click', buyBook);

    var overlay = document.getElementById('library-book');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target.id === 'library-book') closeUI();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUI);
  } else {
    wireUI();
  }

  // ── Public API ────────────────────────────────────────────
  return {
    init: init,
    getShelfNearPlayer: getShelfNearPlayer,
    handleShelfInteract: handleShelfInteract,
    closeUI: closeUI,
    isUIOpen: isUIOpen,
    handleKey: handleKey,
    getBooks: function () { return BOOKS; },
    getShelves: function () { return SHELVES; },
  };
})();
