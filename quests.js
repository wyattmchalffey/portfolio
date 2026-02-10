// quests.js — Quest chain system with NPC dialog interception, progress tracking, Firebase persistence
var Quests = (function () {
  'use strict';

  // ── Quest Definitions (18 quests, 5 chains) ────────────────
  var QUEST_DEFS = {
    // ── Gardener — "The Green Path" (5 quests) ──
    gardener_1: {
      id: 'gardener_1', npcId: 'npc5', chain: 'gardener', name: 'First Sprout',
      desc: 'Plant any seed in the garden.',
      require: { type: 'count', action: 'plant', count: 1 },
      reward: { gold: 5 },
      dialog: {
        offer: ['Every garden starts with a single seed.', 'Go on — plant one!'],
        progress: ['Have you planted a seed yet?', 'Find an empty plot in the South Garden.'],
        turnin: ['Wonderful! Your first seed is in the ground.', 'Here\'s a little gold for your effort.'],
      },
      prereq: null,
    },
    gardener_2: {
      id: 'gardener_2', npcId: 'npc5', chain: 'gardener', name: 'Tender Care',
      desc: 'Water a plant 2 times.',
      require: { type: 'count', action: 'water', count: 2 },
      reward: { gold: 5 },
      dialog: {
        offer: ['Plants need love!', 'Water something twice for me.'],
        progress: ['Keep watering! Collect water from the fountain or well.'],
        turnin: ['See how it perks up? Water is life.', 'Take this gold.'],
      },
      prereq: 'gardener_1',
    },
    gardener_3: {
      id: 'gardener_3', npcId: 'npc5', chain: 'gardener', name: 'First Harvest',
      desc: 'Harvest 1 plant.',
      require: { type: 'count', action: 'harvest', count: 1 },
      reward: { gold: 10 },
      dialog: {
        offer: ['Patience pays off.', 'Harvest your first bloom!'],
        progress: ['Wait for a plant to fully bloom, then interact with it.'],
        turnin: ['Your first harvest! The garden is proud.', 'Here\'s 10 gold.'],
      },
      prereq: 'gardener_2',
    },
    gardener_4: {
      id: 'gardener_4', npcId: 'npc5', chain: 'gardener', name: 'Common Collection',
      desc: 'Have 1 each of Sunpetal, Moonbloom, and Firethorn.',
      require: { type: 'have', items: { sunpetal: 1, moonbloom: 1, firethorn: 1 } },
      reward: { gold: 15, recipe: 'growth_tonic' },
      dialog: {
        offer: ['A true gardener knows all the basics.', 'Grow one of each common plant for me.'],
        progress: ['I need a Sunpetal, Moonbloom, and Firethorn.', 'Check your inventory!'],
        turnin: ['The common trio! Beautiful work.', 'I\'ll teach you the Growth Tonic recipe.'],
      },
      prereq: 'gardener_3',
    },
    gardener_5: {
      id: 'gardener_5', npcId: 'npc5', chain: 'gardener', name: 'Beyond Common',
      desc: 'Harvest any uncommon or rarer plant.',
      require: { type: 'count', action: 'harvest_uncommon', count: 1 },
      reward: { gold: 20 },
      dialog: {
        offer: ['Ready for a challenge?', 'Grow something rare.'],
        progress: ['Uncommon plants need more harvests to unlock.', 'Keep gardening!'],
        turnin: ['Impressive! You\'re a natural.', 'The garden master would be proud.'],
      },
      prereq: 'gardener_4',
    },

    // ── Shopkeeper — "The Art of Trade" (4 quests) ──
    shopkeeper_1: {
      id: 'shopkeeper_1', npcId: 'shopkeeper', chain: 'shopkeeper', name: 'First Sale',
      desc: 'Sell 1 plant at the store.',
      require: { type: 'count', action: 'sell', count: 1 },
      reward: { gold: 5 },
      dialog: {
        offer: ['Got something to sell?', 'Let\'s make a deal!'],
        progress: ['Bring a harvested plant to the store counter.'],
        turnin: ['Pleasure doing business!', 'Here\'s a little bonus.'],
      },
      prereq: null,
    },
    shopkeeper_2: {
      id: 'shopkeeper_2', npcId: 'shopkeeper', chain: 'shopkeeper', name: 'Bulk Order',
      desc: 'Sell 5 plants total.',
      require: { type: 'count', action: 'sell', count: 5 },
      reward: { gold: 10, recipe: 'super_fertilizer' },
      dialog: {
        offer: ['Business is booming!', 'Keep the stock coming.'],
        progress: ['I need 5 total sales. Keep selling!'],
        turnin: ['Now that\'s volume! Here\'s a special recipe.', 'Super Fertilizer — stronger than the regular stuff.'],
      },
      prereq: 'shopkeeper_1',
    },
    shopkeeper_3: {
      id: 'shopkeeper_3', npcId: 'shopkeeper', chain: 'shopkeeper', name: 'Diverse Goods',
      desc: 'Sell 3 different plant types.',
      require: { type: 'count', action: 'sell_unique', count: 3 },
      reward: { gold: 15 },
      dialog: {
        offer: ['I need variety.', 'Bring me three different plants.'],
        progress: ['Sell different types of plants — not just the same one!'],
        turnin: ['Variety is the spice of trade!', 'Here\'s your reward.'],
      },
      prereq: 'shopkeeper_2',
    },
    shopkeeper_4: {
      id: 'shopkeeper_4', npcId: 'shopkeeper', chain: 'shopkeeper', name: 'Gold Magnate',
      desc: 'Accumulate 50 gold at once.',
      require: { type: 'check', fn: 'hasGold50' },
      reward: { gold: 25, recipe: 'lucky_charm' },
      dialog: {
        offer: ['A real merchant builds a fortune.', 'Show me 50 gold!'],
        progress: ['You need 50 gold in your pocket. Keep earning!'],
        turnin: ['A true tycoon! Take this Lucky Charm recipe.', 'It doubles your next harvest yield.'],
      },
      prereq: 'shopkeeper_3',
    },

    // ── Librarian — "The Scholar's Path" (4 quests) ──
    librarian_1: {
      id: 'librarian_1', npcId: 'librarian', chain: 'librarian', name: 'Curious Mind',
      desc: 'Read any 1 book.',
      require: { type: 'count', action: 'read_book', count: 1 },
      reward: { gold: 5 },
      dialog: {
        offer: ['Knowledge is priceless... well, almost.', 'Read a book!'],
        progress: ['Interact with a bookshelf and unlock a tome.'],
        turnin: ['A reader! How refreshing.', 'Here\'s some gold for your curiosity.'],
      },
      prereq: null,
    },
    librarian_2: {
      id: 'librarian_2', npcId: 'librarian', chain: 'librarian', name: 'Seasonal Scholar',
      desc: 'Read all 4 seasonal almanacs.',
      require: { type: 'check', fn: 'hasAllAlmanacs' },
      reward: { gold: 10, recipe: 'wilt_remedy' },
      dialog: {
        offer: ['A scholar studies every season.', 'Read all four almanacs.'],
        progress: ['Have you read all seasonal almanacs?', 'Spring, Summer, Autumn, Winter.'],
        turnin: ['Every season mastered!', 'Here\'s the Wilt Remedy recipe — revive wilted plants.'],
      },
      prereq: 'librarian_1',
    },
    librarian_3: {
      id: 'librarian_3', npcId: 'librarian', chain: 'librarian', name: 'Full Library',
      desc: 'Read all 6 books.',
      require: { type: 'check', fn: 'hasAllBooks' },
      reward: { gold: 15 },
      dialog: {
        offer: ['Complete the collection.', 'Every book holds secrets.'],
        progress: ['There are 6 books total. Keep reading!'],
        turnin: ['A true scholar! Every tome absorbed.', 'The Library salutes you.'],
      },
      prereq: 'librarian_2',
    },
    librarian_4: {
      id: 'librarian_4', npcId: 'librarian', chain: 'librarian', name: 'Living Encyclopedia',
      desc: 'Discover 7 plant types in your collection.',
      require: { type: 'check', fn: 'hasPlantTypes7' },
      reward: { gold: 25, recipe: 'essence_of_seasons' },
      dialog: {
        offer: ['Theory meets practice.', 'Discover seven different species.'],
        progress: ['Harvest 7 different plant types to discover them.'],
        turnin: ['Seven species catalogued! Amazing.', 'Here\'s the Essence of Seasons recipe.'],
      },
      prereq: 'librarian_3',
    },

    // ── Worker — "Workshop Apprentice" (3 quests) ──
    worker_1: {
      id: 'worker_1', npcId: 'npc1', chain: 'worker', name: 'The Machine',
      desc: 'Bring 2 Sunpetals and 1 Moonbloom.',
      require: { type: 'have', items: { sunpetal: 2, moonbloom: 1 } },
      reward: { unlock: 'crafting_station' },
      dialog: {
        offer: ['That machine? It\'s been idle for ages.', 'Bring me 2 Sunpetals and 1 Moonbloom.', 'I\'ll show you what it does.'],
        progress: ['I need 2 Sunpetals and 1 Moonbloom.', 'Grow them in the garden!'],
        turnin: ['Perfect! The machine is all yours now.', 'You can craft items at the Workshop machine.'],
      },
      prereq: null,
    },
    worker_2: {
      id: 'worker_2', npcId: 'npc1', chain: 'worker', name: 'First Creation',
      desc: 'Craft any item 1 time.',
      require: { type: 'count', action: 'craft', count: 1 },
      reward: { gold: 10 },
      dialog: {
        offer: ['Now use the machine yourself.', 'Craft something!'],
        progress: ['Go to the machine in the Workshop and craft an item.'],
        turnin: ['Your first creation! Excellent work.'],
      },
      prereq: 'worker_1',
    },
    worker_3: {
      id: 'worker_3', npcId: 'npc1', chain: 'worker', name: 'Master Artisan',
      desc: 'Craft 5 items total.',
      require: { type: 'count', action: 'craft', count: 5 },
      reward: { gold: 25 },
      dialog: {
        offer: ['A true artisan never stops creating.', 'Craft 5 items total.'],
        progress: ['Keep crafting! You need 5 total.'],
        turnin: ['Master Artisan! The Workshop is proud.'],
      },
      prereq: 'worker_2',
    },

    // ── Guide — "The Explorer" (2 quests) ──
    guide_1: {
      id: 'guide_1', npcId: 'guide', chain: 'guide', name: 'Wanderer',
      desc: 'Visit all 6 areas.',
      require: { type: 'count', action: 'visit_area_unique', count: 6 },
      reward: { gold: 10 },
      dialog: {
        offer: ['This world has much to see.', 'Visit every area!'],
        progress: ['Have you explored everywhere?', 'Check your quest log for progress.'],
        turnin: ['A true explorer! You\'ve seen it all.'],
      },
      prereq: null,
    },
    guide_2: {
      id: 'guide_2', npcId: 'guide', chain: 'guide', name: 'Connected',
      desc: 'Talk to all 5 other NPCs.',
      require: { type: 'count', action: 'talk_npc_unique', count: 5 },
      reward: { gold: 15 },
      dialog: {
        offer: ['Get to know everyone!', 'Talk to each person here.'],
        progress: ['Have you met everyone?', 'There are 5 other people to talk to.'],
        turnin: ['You know everyone now!', 'This world is better connected.'],
      },
      prereq: 'guide_1',
    },
  };

  // Chain ordering for sequential quest access
  var CHAINS = {
    gardener:   ['gardener_1','gardener_2','gardener_3','gardener_4','gardener_5'],
    shopkeeper: ['shopkeeper_1','shopkeeper_2','shopkeeper_3','shopkeeper_4'],
    librarian:  ['librarian_1','librarian_2','librarian_3','librarian_4'],
    worker:     ['worker_1','worker_2','worker_3'],
    guide:      ['guide_1','guide_2'],
  };

  // NPC display names for quest log
  var NPC_NAMES = {
    npc5: 'Gardener',
    shopkeeper: 'Shopkeeper',
    librarian: 'Librarian',
    npc1: 'Worker',
    guide: 'Guide',
  };

  // All area names for visit tracking
  var ALL_AREAS = ['Workshop', 'Library', 'Town Square', 'Store', 'Arcade', 'South Garden'];
  // All NPC ids (excluding guide for "talk to all others")
  var ALL_NPCS_FOR_TALK = ['npc1', 'librarian', 'shopkeeper', 'npc4', 'npc5'];

  // ── State ──────────────────────────────────────────────────
  var inventoryRef = null;
  var inventory = {};
  var questState = {};  // { questId: 'active'|'completed' }
  var counters = {};    // { questId: number } for count-type quests
  var trackedSets = {}; // { questId: 'val1,val2,...' } for set tracking
  var initialized = false;

  // ── Firebase Init ──────────────────────────────────────────
  function init() {
    if (typeof firebase === 'undefined' || !firebase.database) return;
    try {
      var db = firebase.database();
      var sessionId = Multiplayer.getSessionId();
      inventoryRef = db.ref('inventory/' + sessionId);
      inventoryRef.on('value', function (snap) {
        inventory = snap.val() || {};
        // Parse quest state from flat inventory keys
        parseQuestState();
        initialized = true;
      });
    } catch (e) {
      console.warn('Quests init failed:', e);
    }
  }

  function parseQuestState() {
    questState = {};
    counters = {};
    trackedSets = {};
    for (var key in inventory) {
      if (key.indexOf('q_') === 0) {
        if (key.indexOf('_n') === key.length - 2 && key.length > 4) {
          // Counter: q_questid_n
          var qid = key.substring(2, key.length - 2);
          counters[qid] = inventory[key] || 0;
        } else if (key.indexOf('_s') === key.length - 2 && key.length > 4) {
          // Tracked set: q_questid_s
          var qid2 = key.substring(2, key.length - 2);
          trackedSets[qid2] = inventory[key] || '';
        } else {
          // Status: q_questid
          var qid3 = key.substring(2);
          questState[qid3] = inventory[key];
        }
      }
    }
  }

  // ── Quest Status Helpers ───────────────────────────────────
  function getQuestStatus(questId) {
    return questState[questId] || null;
  }

  function isQuestCompleted(questId) {
    return questState[questId] === 'completed';
  }

  function isQuestActive(questId) {
    return questState[questId] === 'active';
  }

  function isQuestAvailable(questId) {
    var def = QUEST_DEFS[questId];
    if (!def) return false;
    if (getQuestStatus(questId)) return false; // already active or completed
    if (def.prereq && !isQuestCompleted(def.prereq)) return false;
    return true;
  }

  // Get the current quest for an NPC (first available or active)
  function getCurrentQuestForNPC(npcId) {
    // Check for active quest first
    for (var qid in QUEST_DEFS) {
      var def = QUEST_DEFS[qid];
      if (def.npcId === npcId && isQuestActive(qid)) {
        return def;
      }
    }
    // Check for available quest
    for (var qid2 in QUEST_DEFS) {
      var def2 = QUEST_DEFS[qid2];
      if (def2.npcId === npcId && isQuestAvailable(qid2)) {
        return def2;
      }
    }
    return null;
  }

  // ── Requirement Checking ───────────────────────────────────
  function checkRequirement(questId) {
    var def = QUEST_DEFS[questId];
    if (!def) return false;
    var req = def.require;

    switch (req.type) {
      case 'have':
        for (var item in req.items) {
          if ((inventory[item] || 0) < req.items[item]) return false;
        }
        return true;

      case 'count':
        var counter = counters[questId] || 0;
        return counter >= req.count;

      case 'check':
        return runCheck(req.fn);

      default:
        return false;
    }
  }

  function runCheck(fnName) {
    switch (fnName) {
      case 'hasGold50':
        return (inventory.gold || 0) >= 50;
      case 'hasAllAlmanacs':
        return !!inventory.book_spring_almanac && !!inventory.book_summer_almanac &&
               !!inventory.book_autumn_almanac && !!inventory.book_winter_almanac;
      case 'hasAllBooks':
        return !!inventory.book_spring_almanac && !!inventory.book_summer_almanac &&
               !!inventory.book_autumn_almanac && !!inventory.book_winter_almanac &&
               !!inventory.book_gardener_handbook && !!inventory.book_rare_species;
      case 'hasPlantTypes7': {
        var count = 0;
        var PLANT_TYPES = Garden.getPlantTypes();
        for (var k in PLANT_TYPES) {
          if (inventory[k]) count++;
        }
        return count >= 7;
      }
      default:
        return false;
    }
  }

  function getProgressText(questId) {
    var def = QUEST_DEFS[questId];
    if (!def) return '';
    var req = def.require;

    switch (req.type) {
      case 'have': {
        var parts = [];
        for (var item in req.items) {
          var have = Math.min(inventory[item] || 0, req.items[item]);
          var PLANT_TYPES = Garden.getPlantTypes();
          var name = PLANT_TYPES[item] ? PLANT_TYPES[item].name : item;
          parts.push(name + ' ' + have + '/' + req.items[item]);
        }
        return parts.join(', ');
      }
      case 'count': {
        var counter = Math.min(counters[questId] || 0, req.count);
        return counter + '/' + req.count;
      }
      case 'check':
        return checkRequirement(questId) ? 'Complete' : 'In progress';
      default:
        return '';
    }
  }

  // ── NPC Dialog Interception ────────────────────────────────
  function getDialogForNPC(npcId) {
    if (!initialized) return null;

    var quest = getCurrentQuestForNPC(npcId);
    if (!quest) return null;

    if (isQuestActive(quest.id)) {
      // Check if requirement is met → turn-in
      if (checkRequirement(quest.id)) {
        return { lines: quest.dialog.turnin, questId: quest.id, action: 'turnin' };
      } else {
        return { lines: quest.dialog.progress, questId: quest.id, action: 'progress' };
      }
    } else if (isQuestAvailable(quest.id)) {
      return { lines: quest.dialog.offer, questId: quest.id, action: 'offer' };
    }

    return null;
  }

  // ── Quest Accept / Complete ────────────────────────────────
  function acceptQuest(questId) {
    if (!inventoryRef) return;
    var def = QUEST_DEFS[questId];
    if (!def) return;

    var update = {};
    update['q_' + questId] = 'active';

    // Initialize counter only if one doesn't already exist (progress may have been tracked pre-accept)
    if (def.require.type === 'count' && counters[questId] === undefined) {
      update['q_' + questId + '_n'] = 0;
    }

    inventoryRef.update(update);

    if (window.showToast) window.showToast('Quest: ' + def.name);
  }

  function completeQuest(questId) {
    if (!inventoryRef) return;
    var def = QUEST_DEFS[questId];
    if (!def) return;

    var update = {};
    update['q_' + questId] = 'completed';

    // Grant rewards
    if (def.reward.gold) {
      update.gold = (inventory.gold || 0) + def.reward.gold;
    }
    if (def.reward.recipe) {
      update['recipe_' + def.reward.recipe] = true;
      setTimeout(function () {
        if (window.showToast) window.showToast('Recipe unlocked: ' + formatRecipeName(def.reward.recipe));
      }, 500);
    }

    // Consume 'have' items
    if (def.require.type === 'have') {
      for (var item in def.require.items) {
        var need = def.require.items[item];
        var current = inventory[item] || 0;
        update[item] = Math.max(0, current - need);
      }
    }

    inventoryRef.update(update);

    var rewardText = def.reward.gold ? '+' + def.reward.gold + 'g' : 'Done';
    if (window.showToast) window.showToast(def.name + ' complete! ' + rewardText);
  }

  function formatRecipeName(id) {
    return id.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // ── Quest Indicator for NPCs ───────────────────────────────
  function getIndicatorForNPC(npcId) {
    if (!initialized) return null;

    // Check for available quest or turn-in ready → '!'
    for (var qid in QUEST_DEFS) {
      var def = QUEST_DEFS[qid];
      if (def.npcId !== npcId) continue;

      if (isQuestAvailable(qid)) return '!';
      if (isQuestActive(qid) && checkRequirement(qid)) return '!';
    }

    // Check for active in-progress quest → '?'
    for (var qid2 in QUEST_DEFS) {
      var def2 = QUEST_DEFS[qid2];
      if (def2.npcId !== npcId) continue;
      if (isQuestActive(qid2) && !checkRequirement(qid2)) return '?';
    }

    return null;
  }

  // ── Event Hooks ────────────────────────────────────────────
  function onAction(action, param) {
    if (!initialized || !inventoryRef) return;

    // Process all non-completed quests (track progress even before acceptance)
    for (var qid in QUEST_DEFS) {
      var def = QUEST_DEFS[qid];
      if (isQuestCompleted(qid)) continue;
      var req = def.require;

      if (req.type === 'count') {
        var matched = false;

        if (req.action === action) {
          matched = true;
        }

        // Special: harvest_uncommon matches harvest with uncommon+ rarity
        if (req.action === 'harvest_uncommon' && action === 'harvest') {
          var PLANT_TYPES = Garden.getPlantTypes();
          var pt = PLANT_TYPES[param];
          if (pt && (pt.rarity === 'uncommon' || pt.rarity === 'rare' || pt.rarity === 'legendary')) {
            matched = true;
          }
        }

        // Special: sell_unique tracks set of unique plant types sold
        if (req.action === 'sell_unique' && action === 'sell') {
          var setKey = 'q_' + qid + '_s';
          var currentSet = trackedSets[qid] || '';
          var items = currentSet ? currentSet.split(',') : [];
          if (items.indexOf(param) === -1) {
            items.push(param);
            var update = {};
            update[setKey] = items.join(',');
            // Store count as the unique count
            update['q_' + qid + '_n'] = items.length;
            inventoryRef.update(update);
          }
          continue; // Don't do the generic count increment
        }

        // Special: visit_area_unique tracks unique areas visited
        if (req.action === 'visit_area_unique' && action === 'visit_area') {
          var setKey2 = 'q_' + qid + '_s';
          var currentSet2 = trackedSets[qid] || '';
          var items2 = currentSet2 ? currentSet2.split(',') : [];
          if (param && items2.indexOf(param) === -1) {
            items2.push(param);
            var update2 = {};
            update2[setKey2] = items2.join(',');
            update2['q_' + qid + '_n'] = items2.length;
            inventoryRef.update(update2);
          }
          continue;
        }

        // Special: talk_npc_unique tracks unique NPCs talked to
        if (req.action === 'talk_npc_unique' && action === 'talk_npc') {
          // Only count the 5 non-guide NPCs
          if (ALL_NPCS_FOR_TALK.indexOf(param) === -1) continue;
          var setKey3 = 'q_' + qid + '_s';
          var currentSet3 = trackedSets[qid] || '';
          var items3 = currentSet3 ? currentSet3.split(',') : [];
          if (items3.indexOf(param) === -1) {
            items3.push(param);
            var update3 = {};
            update3[setKey3] = items3.join(',');
            update3['q_' + qid + '_n'] = items3.length;
            inventoryRef.update(update3);
          }
          continue;
        }

        if (matched) {
          var counterKey = 'q_' + qid + '_n';
          var currentCount = counters[qid] || 0;
          var upd = {};
          upd[counterKey] = currentCount + 1;
          inventoryRef.update(upd);
        }
      }
      // 'have' and 'check' types are evaluated at turn-in time, no event tracking needed
    }
  }

  // ── Quest Log Population ───────────────────────────────────
  function populateQuestLog(container) {
    if (!container) return;
    container.innerHTML = '';

    // Group quests by NPC
    var npcOrder = ['guide', 'npc5', 'shopkeeper', 'librarian', 'npc1'];
    var hasContent = false;

    for (var n = 0; n < npcOrder.length; n++) {
      var npcId = npcOrder[n];
      var npcQuests = [];

      for (var qid in QUEST_DEFS) {
        var def = QUEST_DEFS[qid];
        if (def.npcId !== npcId) continue;
        var status = getQuestStatus(qid);
        if (status === 'active' || status === 'completed') {
          npcQuests.push({ def: def, status: status });
        } else if (isQuestAvailable(qid)) {
          npcQuests.push({ def: def, status: 'available' });
        }
      }

      if (npcQuests.length === 0) continue;
      hasContent = true;

      // NPC header
      var header = document.createElement('div');
      header.className = 'quest-npc-header';
      header.textContent = NPC_NAMES[npcId] || npcId;
      container.appendChild(header);

      // Quest cards
      for (var i = 0; i < npcQuests.length; i++) {
        var q = npcQuests[i];
        var card = document.createElement('div');
        card.className = 'quest-card' + (q.status === 'completed' ? ' quest-completed' : '');

        var titleRow = document.createElement('div');
        titleRow.className = 'quest-title-row';

        var title = document.createElement('span');
        title.className = 'quest-title';
        title.textContent = q.def.name;
        titleRow.appendChild(title);

        var badge = document.createElement('span');
        badge.className = 'quest-badge quest-badge-' + q.status;
        badge.textContent = q.status === 'completed' ? 'Done' : q.status === 'active' ? 'Active' : 'New';
        titleRow.appendChild(badge);

        card.appendChild(titleRow);

        var desc = document.createElement('div');
        desc.className = 'quest-desc';
        desc.textContent = q.def.desc;
        card.appendChild(desc);

        // Progress bar for active quests
        if (q.status === 'active') {
          var progText = getProgressText(q.def.id);
          if (progText) {
            var progDiv = document.createElement('div');
            progDiv.className = 'quest-progress';

            var progBar = document.createElement('div');
            progBar.className = 'quest-progress-bar';
            var progFill = document.createElement('div');
            progFill.className = 'quest-progress-fill';

            // Calculate fill percentage
            var pct = 0;
            var req = q.def.require;
            if (req.type === 'count') {
              pct = Math.min(100, ((counters[q.def.id] || 0) / req.count) * 100);
            } else if (req.type === 'have') {
              var total = 0, have = 0;
              for (var item in req.items) {
                total += req.items[item];
                have += Math.min(inventory[item] || 0, req.items[item]);
              }
              pct = total > 0 ? (have / total) * 100 : 0;
            } else if (req.type === 'check') {
              pct = checkRequirement(q.def.id) ? 100 : 0;
            }

            progFill.style.width = Math.round(pct) + '%';
            progBar.appendChild(progFill);
            progDiv.appendChild(progBar);

            var progLabel = document.createElement('span');
            progLabel.className = 'quest-progress-text';
            progLabel.textContent = progText;
            progDiv.appendChild(progLabel);

            card.appendChild(progDiv);
          }
        }

        // Reward line
        var rewardParts = [];
        if (q.def.reward.gold) rewardParts.push(q.def.reward.gold + 'g');
        if (q.def.reward.recipe) rewardParts.push('Recipe: ' + formatRecipeName(q.def.reward.recipe));
        if (q.def.reward.unlock) rewardParts.push('Unlocks crafting station');
        if (rewardParts.length > 0) {
          var rewardDiv = document.createElement('div');
          rewardDiv.className = 'quest-reward';
          rewardDiv.textContent = 'Reward: ' + rewardParts.join(', ');
          card.appendChild(rewardDiv);
        }

        container.appendChild(card);
      }
    }

    if (!hasContent) {
      var empty = document.createElement('div');
      empty.className = 'quest-empty';
      empty.textContent = 'Talk to NPCs to discover quests!';
      container.appendChild(empty);
    }
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    init: init,
    getDialogForNPC: getDialogForNPC,
    acceptQuest: acceptQuest,
    completeQuest: completeQuest,
    onAction: onAction,
    getIndicatorForNPC: getIndicatorForNPC,
    populateQuestLog: populateQuestLog,
    isQuestCompleted: isQuestCompleted,
    getQuestDefs: function () { return QUEST_DEFS; },
    getInventory: function () { return inventory; },
  };
})();
