// multiplayer.js — Firebase presence, position sync, remote player tracking

var Multiplayer = (function () {
  'use strict';

  // ── Firebase config (replace with your own) ───────────────
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyDYZRi89-VDVM58DAYNWdti9FVJDfhT3KM",
    authDomain: "wyatt-portfolio.firebaseapp.com",
    databaseURL: "https://wyatt-portfolio-default-rtdb.firebaseio.com",
    projectId: "wyatt-portfolio",
    storageBucket: "wyatt-portfolio.firebasestorage.app",
    messagingSenderId: "568962684900",
    appId: "1:568962684900:web:54755abfe50e38bb4419f1",
  };

  // ── State ─────────────────────────────────────────────────
  var sessionId = (function () {
    var stored = null;
    try { stored = localStorage.getItem('portfolio_player_id'); } catch (e) {}
    if (stored) return stored;
    var id = 'p_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    try { localStorage.setItem('portfolio_player_id', id); } catch (e) {}
    return id;
  })();
  var remotePlayers = {};   // { sessionId: { x, y, dir, moving, animFrame, palette, timestamp } }
  var playerCount = 0;
  var localPalette = generatePalette();
  var db = null;
  var playersRef = null;
  var localRef = null;
  var lastBroadcast = 0;
  var BROADCAST_INTERVAL = 100; // ms
  var STALE_TIMEOUT = 10000;    // ms — remove players older than this
  var connected = false;

  // ── Random palette generation ─────────────────────────────
  function randomHue() {
    return Math.floor(Math.random() * 360);
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var r, g, b;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    var toHex = function (v) {
      var hex = Math.round((v + m) * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function generatePalette() {
    var shirtHue = randomHue();
    var pantsHue = randomHue();
    var hairHue = randomHue();
    return {
      shirt: hslToHex(shirtHue, 60, 45),
      pants: hslToHex(pantsHue, 55, 40),
      hair:  hslToHex(hairHue, 40, 40),
      hairLight: hslToHex(hairHue, 40, 50),
    };
  }

  // ── Initialize Firebase ───────────────────────────────────
  function init() {
    if (typeof firebase === 'undefined') {
      console.warn('Multiplayer: Firebase SDK not loaded');
      return;
    }

    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.database();
      playersRef = db.ref('players');
      localRef = playersRef.child(sessionId);

      // Set up presence — remove data on disconnect
      localRef.onDisconnect().remove();

      // Listen for remote players
      playersRef.on('value', function (snapshot) {
        var data = snapshot.val() || {};
        var now = Date.now();
        var count = 0;
        var newRemote = {};

        for (var id in data) {
          if (id === sessionId) {
            count++;
            continue;
          }
          var p = data[id];
          // Skip stale players
          if (now - p.timestamp > STALE_TIMEOUT) {
            // Clean up stale entry
            playersRef.child(id).remove();
            continue;
          }
          count++;
          // Preserve interpolation state from previous frame
          var prev = remotePlayers[id];
          newRemote[id] = {
            x: p.x,
            y: p.y,
            dir: p.dir || 'down',
            moving: p.moving || false,
            animFrame: p.animFrame || 0,
            palette: p.palette || {},
            timestamp: p.timestamp,
            // Interpolation: store display position (lerped)
            displayX: prev ? prev.displayX : p.x,
            displayY: prev ? prev.displayY : p.y,
          };
        }

        remotePlayers = newRemote;
        playerCount = count;
        updatePlayerCountUI();
      });

      connected = true;
      console.log('Multiplayer connected. Session:', sessionId);
    } catch (e) {
      console.warn('Multiplayer init failed:', e);
    }
  }

  // ── Broadcast local position (throttled) ──────────────────
  function broadcastPosition(player) {
    if (!connected || !localRef) return;

    var now = Date.now();
    if (now - lastBroadcast < BROADCAST_INTERVAL) return;
    lastBroadcast = now;

    localRef.set({
      x: Math.round(player.x),
      y: Math.round(player.y),
      dir: player.dir,
      moving: player.moving,
      animFrame: player.animFrame,
      palette: localPalette,
      timestamp: now,
    });
  }

  // ── Interpolate remote player positions ───────────────────
  function lerpRemotePlayers() {
    var lerpSpeed = 0.25;
    for (var id in remotePlayers) {
      var rp = remotePlayers[id];
      rp.displayX += (rp.x - rp.displayX) * lerpSpeed;
      rp.displayY += (rp.y - rp.displayY) * lerpSpeed;
    }
  }

  // ── Update player count UI ────────────────────────────────
  function updatePlayerCountUI() {
    var el = document.getElementById('player-count');
    if (el) {
      el.textContent = playerCount + ' online';
      el.style.display = playerCount > 0 ? 'block' : 'none';
    }
  }

  // ── Cleanup on page unload ────────────────────────────────
  window.addEventListener('beforeunload', function () {
    if (localRef) {
      localRef.remove();
    }
  });

  // ── Public API ────────────────────────────────────────────
  return {
    init: init,
    broadcastPosition: broadcastPosition,
    lerpRemotePlayers: lerpRemotePlayers,
    getRemotePlayers: function () { return remotePlayers; },
    getPlayerCount: function () { return playerCount; },
    getLocalPalette: function () { return localPalette; },
    getSessionId: function () { return sessionId; },
  };
})();
