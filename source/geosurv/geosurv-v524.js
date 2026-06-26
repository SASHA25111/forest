(function(){
  if (window.fgsBound) return;
  window.fgsBound = true;

  // ════════════════════════════════════════════════════
  // КОНСТАНТЫ
  // ════════════════════════════════════════════════════
  var W = 800, H = 600;                 // логические размеры мира (под камеру)
  var PLAYER_BASE_SPEED = 180;          // px/sec
  var PLAYER_BASE_HP    = 100;
  var PLAYER_RADIUS     = 10;
  var PLAYER_FIRE_RATE  = 1.0;          // выстрелов в секунду базовая
  var PLAYER_AIM_RANGE  = 380;          // px, дальность автонаведения
  var PROJ_SPEED        = 480;
  var PROJ_RADIUS       = 4;
  var GEM_PICKUP_BASE   = 64;           // px, базовый радиус подбора (v4.6: 32 → 64)
  var WAVE_INTERVAL_MS  = 30000;        // каждые 30с — новая волна
  var WORLD_MARGIN      = 80;           // расстояние спавна за экраном
  var MAX_ENTITIES_HARD_CAP = 1200;

  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwsx3Wqgoix1xjKuCEs3uxgnPb6Jac4u-OXIDbaECnImoIsaUdd3doZqonvfqF0XVoS/exec';
  var GAME_KEY = 'geosurv';
  var STORAGE_KEY = 'forest-geosurv-name';

  // Цвета
  var COLOR_PLAYER = '#ffc200';
  var COLOR_PROJ   = '#fff076';
  var COLOR_GEM    = '#ffc200';
  var COLOR_BG_GRID = 'rgba(255,255,255,0.04)';

  // ── Загрузка спрайта котика (голова игрока) ──
  var catImg = new Image();
  catImg.crossOrigin = 'anonymous';
  var catImgLoaded = false;
  catImg.onload  = function(){ catImgLoaded = true; };
  catImg.onerror = function(){ catImgLoaded = false; };
  catImg.src = 'https://cdn.jsdelivr.net/gh/SASHA25111/forest@main/source/geosurv/cat-face.svg';

  // ── Определения врагов ──
  var ENEMY_TYPES = {
    tri:   { hp: 0.5, dmg: 8,  speed: 70,  radius: 11, color: '#ffffff', score: 1, sides: 3 },
    diam:  { hp: 2, dmg: 10, speed: 95,  radius: 10, color: '#ff5e5e', score: 2, sides: 4, rot: Math.PI/4 },
    sq:    { hp: 5, dmg: 14, speed: 50,  radius: 16, color: '#5eff5e', score: 4, sides: 4 },
    hex:   { hp: 60, dmg: 20, speed: 66, radius: 22, color: '#5ad7ff', score: 100, sides: 6 },
    mega:  { hp: 600, dmg: 40, speed: 40, radius: 50, color: '#7b3fbf', score: 500, sides: 8 },
    storm: { hp: 600, dmg: 35, speed: 40, radius: 50, color: '#ffc200', score: 500, sides: 8 }
  };

  // ── Определения апгрейдов ──
  // Каждый имеет: id, name, desc(level), maxLvl, apply(state,level)
  // Тип: 'passive' / 'weapon'
  var UPGRADES = [
    {
      id: 'speed', type: 'passive', name: 'Скорость',
      desc: function(l){ return '+3.75% к скорости движения (ур. '+l+')'; },
      maxLvl: 20,
      apply: function(s,l){ s.player.speedMul = 1 + 0.0375*l; }
    },
    {
      id: 'firerate', type: 'passive', name: 'Скорострельность',
      desc: function(l){ return '+6.5% к частоте выстрелов (ур. '+l+')'; },
      maxLvl: 20,
      apply: function(s,l){ s.player.fireRateMul = 1 + 0.065*l; }
    },
    {
      id: 'damage', type: 'passive', name: 'Урон',
      desc: function(l){ return '+5% ко всему урону (ур. '+l+')'; },
      maxLvl: 20,
      apply: function(s,l){ s.player.dmgMul = 1 + 0.05*l; }
    },
    {
      id: 'magnet', type: 'passive', name: 'Магнит',
      desc: function(l){ return '+10% к радиусу подбора (ур. '+l+')'; },
      maxLvl: 20,
      apply: function(s,l){ s.player.magnetMul = 1 + 0.10*l; }
    },
    {
      id: 'maxhp', type: 'passive', name: 'Живучесть',
      desc: function(l){ return '+15 к макс. HP и хил (ур. '+l+')'; },
      maxLvl: 20,
      apply: function(s,l){
        var prev = s.player.hpMax;
        s.player.hpMax = PLAYER_BASE_HP + 15*l;
        s.player.hp += (s.player.hpMax - prev);
      }
    },
    {
      id: 'crit', type: 'passive', name: 'Криты',
      desc: function(l){
        return '+1% шанса крита (ур. '+l+', шанс '+(1*l)+'%). На крите урон ×2.';
      },
      maxLvl: 20,
      apply: function(s,l){ s.player.critChance = 0.01 * l; }
    },
    {
      id: 'dodge', type: 'passive', name: 'Уворот',
      desc: function(l){
        return '+0.5% шанса проигнорировать урон (ур. '+l+', шанс '+((0.5*l).toFixed(1))+'%).';
      },
      maxLvl: 20,
      apply: function(s,l){ s.player.dodgeChance = 0.005 * l; }
    },
    {
      id: 'vamp', type: 'passive', name: 'Вампиризм',
      desc: function(l){
        return '+0.15% от наносимого урона как HP (ур. '+l+', хил '+((0.15*l).toFixed(2))+'%).';
      },
      maxLvl: 20,
      apply: function(s,l){ s.player.vampMul = 0.0015 * l; }
    },
    {
      id: 'pierce', type: 'passive', name: 'Пробитие',
      desc: function(l){
        return '+0.5% шанса пробить врага и лететь дальше (ур. '+l+', шанс '+((0.5*l).toFixed(1))+'%).';
      },
      maxLvl: 20,
      apply: function(s,l){ s.player.pierceChance = 0.005 * l; }
    },
    {
      id: 'orbit', type: 'weapon', name: 'Орбитальные щиты',
      desc: function(l){
        if (l===1) return 'Новое: щит вращается вокруг тебя';
        return 'Щитов теперь '+(l)+' (макс. '+l+'/2)';
      },
      maxLvl: 2,    // v2.7: финальный потолок — 2 щита
      apply: function(s,l){ s.weapons.orbit.level = l; }
    },
    {
      id: 'chain', type: 'weapon', name: 'Цепная молния',
      desc: function(l){
        if (l===1) return 'Новое: молния прыгает на врага каждые 2.5с';
        return '+1 цепь, -10% к перезарядке (ур. '+l+')';
      },
      maxLvl: 5,
      apply: function(s,l){ s.weapons.chain.level = l; }
    },
    {
      id: 'whip', type: 'weapon', name: 'Хлыст AOE',
      desc: function(l){
        if (l===1) return 'Новое: круговой удар вокруг каждые 2с';
        return '+25% к радиусу удара (ур. '+l+')';
      },
      maxLvl: 5,
      apply: function(s,l){ s.weapons.whip.level = l; }
    },
    {
      id: 'pistol', type: 'weapon', name: 'Пушка',
      desc: function(l){
        return 'Доп. снаряд в очередь (ур. '+l+', снарядов: '+(l+1)+')';
      },
      maxLvl: 4,
      apply: function(s,l){ s.weapons.pistol.extra = l; }
    }
  ];


  // ════════════════════════════════════════════════════
  // АУДИО-ДВИЖОК (v5.20) — Web Audio API, 8-bit синтез
  // ════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════
  // ПОДКЛЮЧЕНИЕ ВНЕШНИХ АУДИО-ФАЙЛОВ ИЗ GitHub (v5.22)
  // Файл загружен → играется он. Не загружен → синтезированный fallback.
  // Чтобы заменить другой звук — добавь сюда строку:
  //   shoot: 'https://cdn.jsdelivr.net/gh/SASHA25111/forest@main/source/geosurv/shoot.mp3'
  // ════════════════════════════════════════════════════
  var CDN_GEOSURV = 'https://cdn.jsdelivr.net/gh/SASHA25111/forest@main/source/geosurv/';
  var CUSTOM_SOUNDS = {
    gem:       CDN_GEOSURV + 'music_6_get_xp.mp3',      // подбор XP-кристалла
    heart:     CDN_GEOSURV + 'music_3_bonus.mp3',       // подбор сердечка
    buff:      CDN_GEOSURV + 'music_3_bonus.mp3',       // подбор баффа
    playerhit: CDN_GEOSURV + 'music_4_damage.mp3',      // игрок получил урон
    gameover:  CDN_GEOSURV + 'music_5_gameover.mp3'     // конец игры
  };
  var CUSTOM_MUSIC = {
    ambient: CDN_GEOSURV + 'music_1_theme.mp3',         // фон-музыка
    boss:    CDN_GEOSURV + 'music_2_theme_boss.mp3'     // музыка во время мега-босса
  };

  var Audio8 = (function(){
    var ctx = null, master = null, musicGain = null;
    var buffers = {};        // name -> AudioBuffer
    var loadingPromises = {}; // name -> Promise (анти-дубль загрузки)
    var musicSource = null;  // активный BufferSource для текущего трека
    var enabled = false;
    var STORE_KEY = 'fgs_audio_enabled';
    var throttle = {};

    function loadPref(){
      try { return localStorage.getItem(STORE_KEY) === '1'; } catch(e){ return false; }
    }
    function savePref(v){
      try { localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch(e){}
    }
    enabled = loadPref();

    function init(){
      if (ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.30;
        master.connect(ctx.destination);
        musicGain = ctx.createGain();
        // v5.23: ПК — тише музыка (см. preload(), такая же логика)
        musicGain.gain.value = (typeof IS_MOBILE !== 'undefined' && IS_MOBILE) ? 0.55 : 0.35;
        musicGain.connect(master);
      } catch(e){ ctx = null; }
    }
    function ensureRunning(){
      if (ctx && ctx.state === 'suspended'){
        try { ctx.resume(); } catch(e){}
      }
    }

    // v5.22: подгрузка одного семпла как AudioBuffer
    function loadSound(name, url){
      if (!ctx) return Promise.resolve(null);
      if (buffers[name]) return Promise.resolve(buffers[name]);
      if (loadingPromises[name]) return loadingPromises[name];
      var p = fetch(url)
        .then(function(r){ if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
        .then(function(ab){
          return new Promise(function(res, rej){
            try { ctx.decodeAudioData(ab, res, rej); } catch(e){ rej(e); }
          });
        })
        .then(function(buf){ buffers[name] = buf; delete loadingPromises[name]; return buf; })
        .catch(function(e){
          delete loadingPromises[name];
          if (typeof console !== 'undefined') console.warn('[Audio8] load fail', name, e && e.message);
          return null;
        });
      loadingPromises[name] = p;
      return p;
    }

    // Прелоад всех заявленных кастомных файлов
    function preloadCustom(){
      if (!ctx) return;
      Object.keys(CUSTOM_SOUNDS).forEach(function(k){ loadSound(k, CUSTOM_SOUNDS[k]); });
      Object.keys(CUSTOM_MUSIC).forEach(function(k){ loadSound('music_' + k, CUSTOM_MUSIC[k]); });
    }

    function playBuffer(buf, vol){
      if (!ctx || !buf) return;
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var g = ctx.createGain();
      g.gain.value = vol == null ? 0.8 : vol;
      src.connect(g); g.connect(master);
      src.start(0);
    }
    function setEnabled(v){
      enabled = !!v;
      savePref(enabled);
      if (enabled){ init(); ensureRunning(); preloadCustom(); }
      else { stopMusic(); }
    }
    function isEnabled(){ return enabled; }

    function whiteNoise(dur){
      var sr = ctx.sampleRate;
      var buf = ctx.createBuffer(1, Math.max(1, Math.floor(sr * dur)), sr);
      var d = buf.getChannelData(0);
      for (var i=0; i<d.length; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    var SFX_GAP = {
      shoot: 0.045, hit: 0.030, pop: 0.050, gem: 0.030,
      heart: 0.20, buff: 0.25, levelup: 0.40,
      bossspawn: 0.50, bossdie: 0.50,
      playerhit: 0.20, gameover: 1.0
    };

    var SFX = {
      shoot: function(t){
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(900, t);
        o.frequency.exponentialRampToValueAtTime(200, t + 0.07);
        g.gain.setValueAtTime(0.10, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.10);
      },
      hit: function(t){
        var src = ctx.createBufferSource(); src.buffer = whiteNoise(0.04);
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        src.connect(g); g.connect(master);
        src.start(t);
      },
      pop: function(t){
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(420, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.11);
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.13);
      },
      gem: function(t){
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(700, t);
        o.frequency.linearRampToValueAtTime(1300, t + 0.06);
        g.gain.setValueAtTime(0.09, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.09);
      },
      heart: function(t){
        var freqs = [523.25, 659.25, 783.99];
        for (var i=0; i<freqs.length; i++){
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = freqs[i];
          var st = t + i * 0.03;
          g.gain.setValueAtTime(0.10, st);
          g.gain.exponentialRampToValueAtTime(0.001, st + 0.35);
          o.connect(g); g.connect(master);
          o.start(st); o.stop(st + 0.36);
        }
      },
      buff: function(t){
        var notes = [523.25, 659.25, 783.99, 1046.5];
        for (var i=0; i<notes.length; i++){
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'square'; o.frequency.value = notes[i];
          var st = t + i * 0.05;
          g.gain.setValueAtTime(0.13, st);
          g.gain.exponentialRampToValueAtTime(0.001, st + 0.13);
          o.connect(g); g.connect(master);
          o.start(st); o.stop(st + 0.14);
        }
      },
      levelup: function(t){
        var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        for (var i=0; i<notes.length; i++){
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'square'; o.frequency.value = notes[i];
          var st = t + i * 0.07;
          g.gain.setValueAtTime(0.18, st);
          g.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
          o.connect(g); g.connect(master);
          o.start(st); o.stop(st + 0.20);
        }
      },
      bossspawn: function(t){
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.8);
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.95);
        var src = ctx.createBufferSource(); src.buffer = whiteNoise(0.4);
        var ng = ctx.createGain();
        ng.gain.setValueAtTime(0.20, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        src.connect(ng); ng.connect(master); src.start(t);
      },
      bossdie: function(t){
        var src = ctx.createBufferSource(); src.buffer = whiteNoise(0.8);
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
        bp.frequency.setValueAtTime(800, t);
        bp.frequency.exponentialRampToValueAtTime(80, t + 0.8);
        var ng = ctx.createGain();
        ng.gain.setValueAtTime(0.35, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        src.connect(bp); bp.connect(ng); ng.connect(master); src.start(t);
      },
      playerhit: function(t){
        var src = ctx.createBufferSource(); src.buffer = whiteNoise(0.15);
        var bp = ctx.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 1200;
        var ng = ctx.createGain();
        ng.gain.setValueAtTime(0.25, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        src.connect(bp); bp.connect(ng); ng.connect(master); src.start(t);
      },
      gameover: function(t){
        var notes = [659.25, 523.25, 415.30, 311.13];
        for (var i=0; i<notes.length; i++){
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'square'; o.frequency.value = notes[i];
          var st = t + i * 0.18;
          g.gain.setValueAtTime(0.20, st);
          g.gain.exponentialRampToValueAtTime(0.001, st + 0.30);
          o.connect(g); g.connect(master);
          o.start(st); o.stop(st + 0.32);
        }
      }
    };

    function sfx(name){
      if (!enabled || !ctx) return;
      var now = ctx.currentTime;
      var last = throttle[name] || 0;
      var gap = SFX_GAP[name] || 0.04;
      if (now - last < gap) return;
      throttle[name] = now;
      // v5.22: если для этого звука определён кастомный файл и он загружен — играем его
      if (CUSTOM_SOUNDS[name] && buffers[name]){
        playBuffer(buffers[name], 0.8);
        return;
      }
      // Иначе — fallback на синтезированный звук
      var fn = SFX[name];
      if (fn) fn(now);
    }

    // ====== МУЗЫКА (chiptune-секвенсер) ======
    function midiToFreq(m){ return 440 * Math.pow(2, (m - 69) / 12); }
    function playTone(t, freq, dur, type, vol){
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol || 0.08, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + dur + 0.01);
    }
    function playDrum(t, kind){
      if (kind === 'k'){
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.10);
        g.gain.setValueAtTime(0.22, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.13);
      } else if (kind === 'h'){
        var src = ctx.createBufferSource(); src.buffer = whiteNoise(0.05);
        var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
        var hg = ctx.createGain();
        hg.gain.setValueAtTime(0.06, t);
        hg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        src.connect(hp); hp.connect(hg); hg.connect(musicGain); src.start(t);
      } else if (kind === 's'){
        var src2 = ctx.createBufferSource(); src2.buffer = whiteNoise(0.10);
        var sg = ctx.createGain();
        sg.gain.setValueAtTime(0.13, t);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
        src2.connect(sg); sg.connect(musicGain); src2.start(t);
      }
    }

    // 32 шага по 16-м, 2 такта; повтор циклом
    var AMBIENT = {
      bpm: 110,
      melody: [
        72,null,null,76, null,72,null,76, 79,null,77,null, 76,null,72,null,
        69,null,72,null, 76,null,72,null, 67,null,null,null, null,null,null,null
      ],
      bass: [
        48,null,null,null, 48,null,null,null, 48,null,null,null, 48,null,null,null,
        45,null,null,null, 45,null,null,null, 43,null,null,null, 48,null,null,null
      ],
      drums: [
        'k',null,null,null, 'h',null,null,null, 'k',null,null,null, 'h',null,'h',null,
        'k',null,null,null, 'h',null,null,null, 'k',null,null,null, 'h',null,'h',null
      ]
    };
    var BOSS = {
      bpm: 140,
      melody: [
        60,null,63,null, 67,null,63,null, 65,null,67,null, 70,null,67,null,
        67,null,70,null, 72,null,70,null, 67,null,63,null, 60,null,null,null
      ],
      bass: [
        36,36,null,36, null,36,null,36, 36,36,null,36, null,36,null,36,
        32,32,null,32, null,32,null,32, 36,36,null,36, null,36,null,36
      ],
      drums: [
        'k',null,'h',null, 's',null,'h',null, 'k',null,'h',null, 's',null,'h',null,
        'k',null,'h',null, 's',null,'h',null, 'k','k','h',null, 's',null,'h','h'
      ]
    };

    var musicMode = null;
    var musicTimer = null;
    var nextNoteTime = 0;
    var step = 0;

    function startMusic(mode){
      if (!ctx) return;
      if (musicMode === mode) return;
      stopMusic();
      musicMode = mode;

      // v5.22: если есть кастомный трек — играем его как looped BufferSource
      if (CUSTOM_MUSIC[mode]){
        var key = 'music_' + mode;
        loadSound(key, CUSTOM_MUSIC[mode]).then(function(buf){
          if (musicMode !== mode || !buf || !ctx) return;
          try {
            musicSource = ctx.createBufferSource();
            musicSource.buffer = buf;
            musicSource.loop = true;
            musicSource.connect(musicGain);
            musicSource.start(0);
          } catch(e){}
        });
        return;
      }

      // Fallback на синтезированный chiptune-секвенсер
      step = 0;
      nextNoteTime = ctx.currentTime + 0.05;
      if (!musicTimer) musicTimer = setInterval(scheduler, 25);
    }
    function stopMusic(){
      musicMode = null;
      if (musicTimer){ clearInterval(musicTimer); musicTimer = null; }
      if (musicSource){
        try { musicSource.stop(0); } catch(e){}
        try { musicSource.disconnect(); } catch(e){}
        musicSource = null;
      }
    }
    function scheduler(){
      if (!ctx || !musicMode) return;
      var pat = musicMode === 'boss' ? BOSS : AMBIENT;
      var stepDur = 60 / pat.bpm / 4;
      var lookAhead = 0.10;
      while (nextNoteTime < ctx.currentTime + lookAhead){
        var s = step % pat.melody.length;
        if (pat.melody[s] != null) playTone(nextNoteTime, midiToFreq(pat.melody[s]), stepDur * 2.0, 'square',   0.055);
        if (pat.bass[s]   != null) playTone(nextNoteTime, midiToFreq(pat.bass[s]),   stepDur * 1.8, 'triangle', 0.10);
        if (pat.drums[s]  != null) playDrum(nextNoteTime, pat.drums[s]);
        nextNoteTime += stepDur;
        step++;
      }
    }

    function music(mode){
      if (!enabled){ return; }
      if (!ctx) init();
      ensureRunning();
      if (mode === null || mode === undefined) stopMusic();
      else startMusic(mode);
    }

    // v5.23: предзагрузка без user-gesture.
    // Создаём AudioContext в suspended-состоянии (браузеры это разрешают),
    // запускаем fetch+decode всех кастомных файлов сразу.
    // Когда юзер нажмёт «Звук» — буферы уже готовы, играем без пауз.
    function preload(){
      if (!ctx){
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try {
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.30;
          master.connect(ctx.destination);
          musicGain = ctx.createGain();
          // v5.23: на ПК музыка тише — на телефоне баланс был хороший,
          // на ПК колонки громче, музыка перебивала SFX.
          musicGain.gain.value = (typeof IS_MOBILE !== 'undefined' && IS_MOBILE) ? 0.55 : 0.35;
          musicGain.connect(master);
        } catch(e){ ctx = null; return; }
      }
      preloadCustom();
    }

    return {
      init: init,
      ensureRunning: ensureRunning,
      setEnabled: setEnabled,
      isEnabled: isEnabled,
      sfx: sfx,
      music: music,
      preload: preload
    };
  })();

  // Стартуем предзагрузку как только парсится скрипт
  try { Audio8.preload(); } catch(e){}

  // ════════════════════════════════════════════════════
  // КАНВАС / СОСТОЯНИЕ
  // ════════════════════════════════════════════════════
  var canvas = document.getElementById('fgsCanvas');
  var ctx    = canvas.getContext('2d');
  // Детект мобильного устройства (touch + нет hover-устройства мыши).
  // Считаем один раз при инициализации, дальше используем как константу.
  var IS_MOBILE = window.matchMedia &&
                  window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  // v5.24: ПК приравнен к мобиле — баланс одинаковый на всех устройствах
  var ENEMY_CAP = 150;
  // v5.6: на ПК обычные враги двигаются на 20% быстрее. На мобиле
  // канвас меньше, враги визуально кажутся быстрее — компенсируем.
  var ENEMY_SPEED_MUL = 1.0;

  // DPR ограничен на мобиле до 1.5 (экономия батареи ~30-40%).
  // На ПК до 2 — нормальный retina.
  var dpr = IS_MOBILE
    ? Math.max(1, Math.min(1.5, window.devicePixelRatio || 1))
    : Math.max(1, Math.min(2,   window.devicePixelRatio || 1));

  function resizeCanvas(){
    var rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width  = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);

  var state = null;

  function freshState(){
    return {
      running: false,
      paused: false,
      timeAcc: 0,                  // секунд с начала рана
      wave: 1,
      score: 0,
      kills: 0,
      camX: 0, camY: 0,
      spawnAcc: 0,
      hexTimer: 0,
      hexCount: 0,
      hexFirstDone: false,        // legacy, не используется в v4.3+
      megaTimer: 0,
      megaCount: 0,
      megaFirstDone: false,       // legacy
      megaAnnounceTimer: 0,
      lastBossDeathTime: -60,     // -60 чтобы 1-й босс мог появиться сразу
      lastHudUpdate: 0,           // throttle HUD на мобиле
      pendingLevelUps: 0,         // очередь оставшихся level-ups
      megaAnnounceName: 'МЕГА-БОСС',
      player: {
        x: 0, y: 0, vx: 0, vy: 0,
        hp: PLAYER_BASE_HP, hpMax: PLAYER_BASE_HP,
        level: 1, xp: 0, xpNext: 4,
        speedMul: 1, fireRateMul: 1, dmgMul: 1, magnetMul: 1, pierceChance: 0,
        critChance: 0, dodgeChance: 0, vampMul: 0,
        fireCD: 0, hurtFlash: 0, iframes: 0,
        upgrades: {}             // id → level
      },
      weapons: {
        pistol: { level: 1, extra: 0 },
        orbit:  { level: 0, angle: 0 },
        chain:  { level: 0, cd: 2.5 },
        whip:   { level: 0, cd: 2.0, anim: 0 }
      },
      enemies: [],
      projectiles: [],
      bossProjectiles: [],
      gems: [],
      hearts: [],
      buffOrbs: [],
      activeBuffs: { rapidfire: 0, slowtime: 0, invuln: 0, berserk: 0 },
      aoeMarkers: [],
      particles: [],
      shake: 0,
      damageNums: [],
      aim: { manual: false, x: 0, y: 0 }   // мировые координаты прицела
    };
  }

  // ════════════════════════════════════════════════════
  // ВВОД
  // ════════════════════════════════════════════════════
  var keys = {};
  window.addEventListener('keydown', function(e){
    keys[e.key.toLowerCase()] = true;
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(e.key.toLowerCase())>=0) e.preventDefault();
  }, { passive: false });
  window.addEventListener('keyup', function(e){ keys[e.key.toLowerCase()] = false; });

  // Виртуальный джойстик
  var joy = document.getElementById('fgsJoy');
  var joyStick = document.getElementById('fgsJoyStick');
  var joyData = { active: false, cx: 0, cy: 0, dx: 0, dy: 0, max: 36 };

  function joyStart(e){
    var rect = joy.getBoundingClientRect();
    joyData.active = true;
    joyData.cx = rect.left + rect.width/2;
    joyData.cy = rect.top + rect.height/2;
    joyMove(e);
    e.preventDefault();
  }
  function joyMove(e){
    if (!joyData.active) return;
    var t = e.touches ? e.touches[0] : e;
    var dx = t.clientX - joyData.cx;
    var dy = t.clientY - joyData.cy;
    var d = Math.hypot(dx,dy);
    if (d > joyData.max){ dx = dx/d*joyData.max; dy = dy/d*joyData.max; }
    joyData.dx = dx; joyData.dy = dy;
    joyStick.style.transform = 'translate('+dx+'px,'+dy+'px)';
    e.preventDefault();
  }
  function joyEnd(e){
    joyData.active = false;
    joyData.dx = 0; joyData.dy = 0;
    joyStick.style.transform = '';
  }
  joy.addEventListener('touchstart', joyStart, { passive: false });
  joy.addEventListener('touchmove',  joyMove,  { passive: false });
  joy.addEventListener('touchend',   joyEnd);
  joy.addEventListener('touchcancel',joyEnd);

  // ── Ручной прицел: мышь (ПК) + второй тап (мобила) ──
  var mouseAim = { active: false, x: 0, y: 0 };
  var aimTouch = { active: false, id: null, x: 0, y: 0 };

  function isInsideJoy(clientX, clientY){
    var r = joy.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right &&
           clientY >= r.top  && clientY <= r.bottom;
  }

  // Mouse (ПК)
  canvas.addEventListener('mousemove', function(e){
    var cr = canvas.getBoundingClientRect();
    mouseAim.x = e.clientX - cr.left;
    mouseAim.y = e.clientY - cr.top;
    mouseAim.active = true;
  });
  canvas.addEventListener('mouseenter', function(e){
    var cr = canvas.getBoundingClientRect();
    mouseAim.x = e.clientX - cr.left;
    mouseAim.y = e.clientY - cr.top;
    mouseAim.active = true;
  });
  canvas.addEventListener('mouseleave', function(){
    mouseAim.active = false;
  });

  // Touch на канвасе для прицела (мобила, twin-stick)
  canvas.addEventListener('touchstart', function(e){
    for (var i=0; i<e.changedTouches.length; i++){
      var t = e.changedTouches[i];
      if (isInsideJoy(t.clientX, t.clientY)) continue;
      var cr = canvas.getBoundingClientRect();
      aimTouch.active = true;
      aimTouch.id = t.identifier;
      aimTouch.x = t.clientX - cr.left;
      aimTouch.y = t.clientY - cr.top;
      e.preventDefault();
      break;
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e){
    for (var i=0; i<e.changedTouches.length; i++){
      var t = e.changedTouches[i];
      if (t.identifier === aimTouch.id){
        var cr = canvas.getBoundingClientRect();
        aimTouch.x = t.clientX - cr.left;
        aimTouch.y = t.clientY - cr.top;
        e.preventDefault();
      }
    }
  }, { passive: false });
  function endAimTouch(e){
    for (var i=0; i<e.changedTouches.length; i++){
      if (e.changedTouches[i].identifier === aimTouch.id){
        aimTouch.active = false;
        aimTouch.id = null;
      }
    }
  }
  canvas.addEventListener('touchend',    endAimTouch);
  canvas.addEventListener('touchcancel', endAimTouch);

  function getInputDir(){
    var dx = 0, dy = 0;
    // v5.23: поддержка русской раскладки (ЦФЫВ) — нажатия Q/W/E/A/S/D
    // на ru-раскладке дают кириллические символы. Добавляем оба варианта.
    if (keys['a'] || keys['ф'] || keys['arrowleft'])  dx -= 1;
    if (keys['d'] || keys['в'] || keys['arrowright']) dx += 1;
    if (keys['w'] || keys['ц'] || keys['arrowup'])    dy -= 1;
    if (keys['s'] || keys['ы'] || keys['arrowdown'])  dy += 1;
    if (joyData.active && (joyData.dx || joyData.dy)){
      dx = joyData.dx / joyData.max;
      dy = joyData.dy / joyData.max;
    }
    var len = Math.hypot(dx,dy);
    if (len > 1){ dx /= len; dy /= len; }
    return { x: dx, y: dy };
  }

  // ════════════════════════════════════════════════════
  // СПАВН ВРАГОВ
  // ════════════════════════════════════════════════════
  // HP-кривая со временем (для мобилы — слегка круче,
  // компенсация уменьшенного потолка врагов 200 vs 400):
  //   ПК:     0–120с +1.0%/с, 120с+ +0.1%/с,  потолок ×3.5
  //   Мобила: 0–120с +1.2%/с, 120с+ +0.12%/с, потолок ×3.8
  var HP_RATE1  = 0.013;                          // v5.24: единый темп разгона
  var HP_RATE2  = 0.0013;                         // v5.24: единый темп плато
  var HP_PIVOT  = 1 + 120 * 0.013;                // v5.24: единый пивот HP на 120с (2.56)
  var HP_CAP    = 4.0;                            // v5.24: единый потолок HP-множителя
  function getHpScale(){
    var t = state.timeAcc;
    var sc = (t <= 120) ? (1 + t * HP_RATE1) : (HP_PIVOT + (t - 120) * HP_RATE2);
    return Math.min(HP_CAP, sc);
  }

  // ── Глобальный кулдаун боссов: 2 минуты после смерти ──
  function isBossAlive(){
    for (var i=0; i<state.enemies.length; i++){
      var t = state.enemies[i].type;
      if (t === 'hex' || t === 'mega' || t === 'storm') return true;
    }
    return false;
  }
  function canSpawnBoss(){
    if (isBossAlive()) return false;
    if (state.timeAcc - state.lastBossDeathTime < 60) return false;
    return true;
  }

  function spawnEnemyAt(type, x, y){
    var def = ENEMY_TYPES[type];
    var hpScale = getHpScale();
    // потолок скорости снижен до +50%
    var spdScale = 1 + Math.min(0.35, state.timeAcc * 0.004);
    var scaledHp = Math.max(1, Math.ceil(def.hp * hpScale));
    state.enemies.push({
      type: type,
      x: x, y: y,
      vx: 0, vy: 0,
      hp: scaledHp,
      hpMax: scaledHp,
      dmg: def.dmg, speed: def.speed * spdScale * ENEMY_SPEED_MUL,
      r: def.radius, color: def.color, score: def.score,
      sides: def.sides, rot: def.rot || 0,
      hitFlash: 0,
      jitterPhase: Math.random() * Math.PI * 2,
      attackCD: type === "hex" ? 3 : 0
    });
  }

  function spawnMega(){
    var def = ENEMY_TYPES.mega;
    var hpScale = getHpScale();
    var scaledHp = Math.ceil(def.hp * hpScale);
    // v5.10: 1-й мегабосс — HP в 1.5 раза меньше (только первый, megaCount===1)
    if (state.megaCount === 1) scaledHp = Math.ceil(scaledHp / 1.5);
    // v5.11: мегабоссы после 3-го — урон растёт мягче.
    //   4-й босс = x2, 5-й и далее = x2 * 1.3^(count-4)
    //   (4-й: x2, 5-й: x2.6, 6-й: x3.38, 7-й: x4.39, 8-й: x5.71...)
    // v5.17: дамаг растёт уже с 3-го босса (3-й = x2, 4-й = x2.6, 5-й = x3.38 ...)
    var damageMul = state.megaCount >= 3
      ? 2 * Math.pow(1.3, state.megaCount - 3)
      : 1;
    var p = state.player;
    var ang = Math.random() * Math.PI*2;
    var dist = 700;
    var x = p.x + Math.cos(ang)*dist;
    var y = p.y + Math.sin(ang)*dist;
    state.enemies.push({
      type: 'mega',
      x: x, y: y, vx: 0, vy: 0,
      hp: scaledHp, hpMax: scaledHp,
      dmg: def.dmg * damageMul,
      damageMul: damageMul,
      speed: def.speed,
      r: def.radius, color: def.color, score: def.score,
      sides: 8, rot: 0,
      hitFlash: 0,
      jitterPhase: 0,
      attackCD: 0,
      // attack timers
      fanCD: 4,
      minionCD: 6,
      laserCD: 6,
      laserState: 'none', laserTimer: 0,
      laserTargetX: 0, laserTargetY: 0,
      laserDirX: 0, laserDirY: 0,
      proxSlowUntil: 0,
      proxCooldownUntil: 0,
      dashCD: 7,
      dashState: 'none', dashTimer: 0,
      dashTargetX: 0, dashTargetY: 0,
      dashOriginX: 0, dashOriginY: 0,
      suppressMove: false
    });
    state.shake = 30;
    state.megaAnnounceTimer = 2.5;
    state.megaAnnounceName = 'ОКТОГОН-ЛОРД'; // v5.19: фикс — раньше имя не обновлялось
    Audio8.sfx('bossspawn');
    Audio8.music('boss');
  }

  function spawnStorm(){
    var def = ENEMY_TYPES.storm;
    var hpScale = getHpScale();
    var scaledHp = Math.ceil(def.hp * hpScale);
    // v5.11: мегабоссы после 3-го — урон растёт мягче.
    //   4-й = x2, 5-й+ = x2 * 1.3^(count-4)
    // v5.17: дамаг растёт уже с 3-го босса (3-й = x2, 4-й = x2.6, 5-й = x3.38 ...)
    var damageMul = state.megaCount >= 3
      ? 2 * Math.pow(1.3, state.megaCount - 3)
      : 1;
    var p = state.player;
    var ang = Math.random() * Math.PI*2;
    var dist = 700;
    var x = p.x + Math.cos(ang)*dist;
    var y = p.y + Math.sin(ang)*dist;
    state.enemies.push({
      type: 'storm',
      x: x, y: y, vx: 0, vy: 0,
      hp: scaledHp, hpMax: scaledHp,
      dmg: def.dmg * damageMul,
      damageMul: damageMul,
      speed: def.speed,
      r: def.radius, color: def.color, score: def.score,
      sides: 8, rot: 0,
      hitFlash: 0,
      jitterPhase: 0,
      attackCD: 0,
      // attack timers (с начальной задержкой чтобы дать игроку время)
      lonelyCD: 2.5,
      minionCD: 4,
      lineCD: 4,
      crossCD: 6,
      chainCD: 8,
      suppressMove: false
    });
    state.shake = 30;
    state.megaAnnounceTimer = 2.5;
    state.megaAnnounceName = 'ГРОЗОВИК';
    Audio8.sfx('bossspawn');
    Audio8.music('boss');
  }

  function spawnEnemyOffscreen(type){
    var p = state.player;
    var side = Math.floor(Math.random()*4);
    var x, y;
    if (side===0){ x = p.x - W/2 - WORLD_MARGIN + Math.random()*-100; y = p.y - H/2 + Math.random()*H; }
    if (side===1){ x = p.x + W/2 + WORLD_MARGIN + Math.random()*100;  y = p.y - H/2 + Math.random()*H; }
    if (side===2){ x = p.x - W/2 + Math.random()*W; y = p.y - H/2 - WORLD_MARGIN + Math.random()*-100; }
    if (side===3){ x = p.x - W/2 + Math.random()*W; y = p.y + H/2 + WORLD_MARGIN + Math.random()*100; }
    spawnEnemyAt(type, x, y);
  }

  function getSpawnRate(){
    // 6-точечная piecewise кривая:
    //   0:00 → 0.8/сек, 1:00 → 2.7, 1:30 → 2.9, 2:00 → 3.2,
    //   3:00 → 4.0, 4:00 → 5.0, 5:00 → 9.0 (потолок).
    var t = state.timeAcc;
    var base;
    if      (t < 60)  base = 0.8 + (t / 60) * 1.9;
    else if (t < 90)  base = 2.7 + ((t - 60) / 30) * 0.2;
    else if (t < 120) base = 2.9 + ((t - 90) / 30) * 0.3;
    else if (t < 180) base = 3.2 + ((t - 120) / 60) * 0.8;
    else if (t < 240) base = 4.0 + ((t - 180) / 60) * 1.0;
    else if (t < 300) base = 5.0 + ((t - 240) / 60) * 4.0;
    else              base = 9.0;
    // v5.19: после 9:00 — спавн фиксированно 7.00/сек
    if (t > 540) base = 7.0;
    return base;
  }

  function pickEnemyType(){
    var t = state.timeAcc;
    // Веса меняются со временем
    var weights = {
      tri:  Math.max(2, 8 - t/30),
      diam: t < 30 ? 0 : Math.min(6, (t-30)/30 + 1),
      sq:   t < 75 ? 0 : Math.min(4, (t-75)/40 + 1),
      hex:  0       // хексы спавним отдельным таймером
    };
    var keys = Object.keys(weights);
    var sum = 0;
    for (var i=0;i<keys.length;i++) sum += weights[keys[i]];
    var r = Math.random() * sum;
    for (var j=0;j<keys.length;j++){
      r -= weights[keys[j]];
      if (r <= 0) return keys[j];
    }
    return 'tri';
  }

  // ════════════════════════════════════════════════════
  // ОБНОВЛЕНИЕ
  // ════════════════════════════════════════════════════
  var lastT = 0;
  var rafId = null;
  var isVisible = false;        // в зоне вьюпорта (IO)
  var leaderboardFetched = false;

  function startLoop(){
    if (rafId !== null) return;
    if (!isVisible) return;
    lastT = 0;
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop(){
    if (rafId !== null){
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // FPS throttle на мобиле: целимся в 45 FPS вместо 60.
  // Экономит ~25% батареи при том же gameplay (dt считается
  // правильно, движение не замедляется).
  var FRAME_INTERVAL_MS = IS_MOBILE ? (1000 / 45) : 0;
  var lastRenderT = 0;

  function loop(t){
    // если блок ушёл с экрана — паузим петлю
    if (!isVisible){ rafId = null; return; }
    // если игра не идёт и не на паузе level-up — петлю не крутим
    if (!state || (!state.running && !state.paused)){ rafId = null; return; }
    // Throttle на мобиле: пропускаем кадр если не прошло хотя бы FRAME_INTERVAL_MS
    if (FRAME_INTERVAL_MS > 0 && lastRenderT && (t - lastRenderT) < FRAME_INTERVAL_MS){
      rafId = requestAnimationFrame(loop);
      return;
    }
    lastRenderT = t;
    if (!lastT) lastT = t;
    var dt = Math.min(0.05, (t - lastT)/1000);
    lastT = t;
    if (state.running && !state.paused){
      update(dt);
    }
    render();
    rafId = requestAnimationFrame(loop);
  }
  // НЕ запускаем петлю при инициализации — она стартует из startRound()

  function computeAim(){
    // v5.6: ручное прицеливание отключено на всех платформах.
    // Стрельба всегда автоматическая в ближайшего врага.
    state.aim.manual = false;
  }

  function megaLaserUpdate(e, p, edt){
    if (e.laserState === 'none'){
      e.laserCD -= edt;
      if (e.laserCD <= 0){
        e.laserState = 'aim';
        e.laserTimer = 2.0;
        e.laserTargetX = p.x;
        e.laserTargetY = p.y;
      }
    } else if (e.laserState === 'aim'){
      // Прицел догоняет игрока с задержкой (lerp), не «прилипает»
      var aimLerp = 1.6 * edt;
      if (aimLerp > 1) aimLerp = 1;
      e.laserTargetX += (p.x - e.laserTargetX) * aimLerp;
      e.laserTargetY += (p.y - e.laserTargetY) * aimLerp;
      e.laserTimer -= edt;
      if (e.laserTimer <= 0){
        e.laserState = 'fire';
        e.laserTimer = 2.0;
        // Фиксируем ДИРЕКЦИЮ — луч не меняет курс пока стреляет
        var dxLock = e.laserTargetX - e.x;
        var dyLock = e.laserTargetY - e.y;
        var lenLock = Math.hypot(dxLock, dyLock) || 1;
        e.laserDirX = dxLock / lenLock;
        e.laserDirY = dyLock / lenLock;
      }
    } else if (e.laserState === 'fire'){
      e.laserTimer -= edt;
      // Луч в зафиксированном направлении из текущей позиции меги
      var endX = e.x + e.laserDirX * 2000;
      var endY = e.y + e.laserDirY * 2000;
      // Расстояние от игрока до отрезка (хитбокс ×3: 14 → 42)
      var BX = endX - e.x, BY = endY - e.y;
      var len2 = BX*BX + BY*BY;
      var tt = ((p.x - e.x)*BX + (p.y - e.y)*BY) / len2;
      tt = Math.max(0, Math.min(1, tt));
      var cx = e.x + tt*BX, cy = e.y + tt*BY;
      var ddx = p.x - cx, ddy = p.y - cy;
      var hit2 = ddx*ddx + ddy*ddy;
      var thickness = 42;
      if (hit2 < thickness*thickness && p.iframes <= 0 && state.activeBuffs.invuln <= 0){
        if (tryDodge()){
          p.iframes = 0.3;
        } else {
          p.hp -= 12 * (e.damageMul || 1);
          p.iframes = 0.6;
          p.hurtFlash = 0.25;
          state.shake = 8;
          if (p.hp <= 0){
            p.hp = 0;
            endRound();
            return;
          }
        }
      }
      if (e.laserTimer <= 0){
        e.laserState = 'none';
        e.laserCD = 6;
      }
    }
  }

  function megaDashUpdate(e, p, edt){
    if (e.dashState === 'none'){
      e.dashCD -= edt;
      if (e.dashCD <= 0){
        e.dashState = 'shake';
        e.dashTimer = 1.5;
        e.dashOriginX = e.x;
        e.dashOriginY = e.y;
        e.suppressMove = true;
      }
    } else if (e.dashState === 'shake'){
      // визуальная тряска
      e.x = e.dashOriginX + (Math.random()-0.5)*5;
      e.y = e.dashOriginY + (Math.random()-0.5)*5;
      e.dashTimer -= edt;
      if (e.dashTimer <= 0){
        e.dashState = 'dash';
        e.dashTimer = 1.2;
        e.dashTargetX = p.x;
        e.dashTargetY = p.y;
        // вернём на родную позицию (без тряски) перед дашем
        e.x = e.dashOriginX;
        e.y = e.dashOriginY;
      }
    } else if (e.dashState === 'dash'){
      var ddxD = e.dashTargetX - e.x;
      var ddyD = e.dashTargetY - e.y;
      var ddD = Math.hypot(ddxD, ddyD);
      if (ddD > 1){
        var dashSpeed = 700;
        var nxD = ddxD/ddD, nyD = ddyD/ddD;
        e.x += nxD * dashSpeed * edt;
        e.y += nyD * dashSpeed * edt;
      }
      // контакт с игроком — большой урон
      var pdxD = p.x - e.x, pdyD = p.y - e.y;
      var rsumD = e.r + PLAYER_RADIUS;
      if (pdxD*pdxD + pdyD*pdyD < rsumD*rsumD &&
          p.iframes <= 0 && state.activeBuffs.invuln <= 0){
        if (tryDodge()){
          p.iframes = 0.5;
        } else {
          p.hp -= 70 * (e.damageMul || 1);
          p.iframes = 0.8;
          p.hurtFlash = 0.4;
          state.shake = 22;
          if (p.hp <= 0){
            p.hp = 0;
            endRound();
            return;
          }
        }
      }
      e.dashTimer -= edt;
      if (e.dashTimer <= 0){
        e.dashState = 'none';
        e.dashCD = 5;
        e.suppressMove = false;
      }
    }
  }

  function update(dt){
    state.timeAcc += dt;
    computeAim();

    // Декремент таймеров активных баффов
    if (state.activeBuffs.rapidfire > 0) state.activeBuffs.rapidfire = Math.max(0, state.activeBuffs.rapidfire - dt);
    if (state.activeBuffs.slowtime  > 0) state.activeBuffs.slowtime  = Math.max(0, state.activeBuffs.slowtime  - dt);
    if (state.activeBuffs.invuln    > 0) state.activeBuffs.invuln    = Math.max(0, state.activeBuffs.invuln    - dt);
    if (state.activeBuffs.berserk   > 0) state.activeBuffs.berserk   = Math.max(0, state.activeBuffs.berserk   - dt);

    // Волна
    var newWave = 1 + Math.floor((state.timeAcc * 1000) / WAVE_INTERVAL_MS);
    if (newWave > state.wave){
      state.wave = newWave;
      // эффект на смену волны — лёгкий shake
      state.shake = 8;
    }

    // Движение игрока
    var p = state.player;
    var dir = getInputDir();
    var spd = PLAYER_BASE_SPEED * p.speedMul;
    p.vx = dir.x * spd;
    p.vy = dir.y * spd;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Камера следует за игроком (с лёгким лагом)
    state.camX += (p.x - state.camX) * Math.min(1, dt*6);
    state.camY += (p.y - state.camY) * Math.min(1, dt*6);

    if (p.iframes > 0) p.iframes -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt*30);

    // Спавн обычных врагов
    state.spawnAcc += dt;
    var rate = getSpawnRate();
    var period = 1.0 / rate;
    while (state.spawnAcc >= period && state.enemies.length < ENEMY_CAP){
      state.spawnAcc -= period;
      spawnEnemyOffscreen(pickEnemyType());
    }

    // v5.17: ЖЁСТКОЕ расписание боссов по времени, никаких буферов и проверок.
    // Хекса: 1:30, 3:00, 6:00, далее +4 мин ⇒ 10:00, 14:00, 18:00 ...
    // Мега-босс: 4:00, 7:00, далее +4 мин ⇒ 11:00, 15:00, 19:00 ...
    function hexScheduleTime(n){
      if (n === 0) return 90;    // 1:30
      if (n === 1) return 180;   // 3:00
      if (n === 2) return 360;   // 6:00
      return 360 + 240 * (n - 2); // 10:00, 14:00, 18:00 ...
    }
    function megaScheduleTime(n){
      if (n === 0) return 240;   // 4:00
      if (n === 1) return 420;   // 7:00
      return 420 + 240 * (n - 1); // 11:00, 15:00, 19:00 ...
    }
    while (state.timeAcc >= hexScheduleTime(state.hexCount)){
      state.hexCount++;
      state.hexFirstDone = true;
      spawnEnemyOffscreen('hex');
    }
    while (state.timeAcc >= megaScheduleTime(state.megaCount)){
      state.megaCount++;
      state.megaFirstDone = true;
      if (state.megaCount % 2 === 1) spawnMega();
      else                            spawnStorm();
    }
    if (state.megaAnnounceTimer > 0) state.megaAnnounceTimer = Math.max(0, state.megaAnnounceTimer - dt);

    // Стрельба основной пушки
    p.fireCD -= dt;
    var rfMul = state.activeBuffs.rapidfire > 0 ? 4 : 1;
    var fireInterval = 1 / (PLAYER_FIRE_RATE * p.fireRateMul * rfMul);
    if (p.fireCD <= 0){
      var baseAng = null;
      if (state.aim.manual){
        baseAng = Math.atan2(state.aim.y - p.y, state.aim.x - p.x);
      } else {
        var target = nearestEnemy(p.x, p.y, PLAYER_AIM_RANGE);
        if (target) baseAng = Math.atan2(target.y - p.y, target.x - p.x);
      }
      if (baseAng !== null){
        var shots = 1 + state.weapons.pistol.extra;
        var spread = shots > 1 ? 0.18 : 0;
        for (var si=0; si<shots; si++){
          var ang = baseAng + (si - (shots-1)/2) * spread;
          Audio8.sfx('shoot');
          state.projectiles.push({
            x: p.x, y: p.y,
            vx: Math.cos(ang)*PROJ_SPEED, vy: Math.sin(ang)*PROJ_SPEED,
            r: PROJ_RADIUS, life: 1.6, dmg: 1 * p.dmgMul * getBerserkMul(), kind: 'pistol'
          });
        }
        p.fireCD = fireInterval;
      }
    }

    // Орбитальные щиты
    if (state.weapons.orbit.level > 0){
      state.weapons.orbit.angle += dt * 2.2;
      var n = state.weapons.orbit.level;
      var radius = 50;
      for (var oi=0; oi<n; oi++){
        var oa = state.weapons.orbit.angle + oi*(Math.PI*2/n);
        var ox = p.x + Math.cos(oa)*radius;
        var oy = p.y + Math.sin(oa)*radius;
        // проверка столкновения с врагами
        for (var ei=0; ei<state.enemies.length; ei++){
          var en = state.enemies[ei];
          var dxo = en.x - ox, dyo = en.y - oy;
          if (dxo*dxo + dyo*dyo < (en.r + 12)*(en.r+12)){
            if (!en._lastOrbitHit) en._lastOrbitHit = 0;
            if (state.timeAcc - en._lastOrbitHit > 0.4){
              damageEnemy(en, 1 * p.dmgMul * getBerserkMul());
              en._lastOrbitHit = state.timeAcc;
              spawnHitParticles(en.x, en.y, '#ffc200', 3);
            }
          }
        }
      }
    }

    // Цепная молния
    if (state.weapons.chain.level > 0){
      var cd = 2.5 * Math.pow(0.9, state.weapons.chain.level - 1);
      state.weapons.chain.cd -= dt;
      if (state.weapons.chain.cd <= 0){
        state.weapons.chain.cd = cd;
        chainLightning(p.x, p.y, state.weapons.chain.level, 4 * p.dmgMul * getBerserkMul());
      }
    }

    // Хлыст
    if (state.weapons.whip.level > 0){
      var wcd = 2.0;
      state.weapons.whip.cd -= dt;
      if (state.weapons.whip.cd <= 0){
        state.weapons.whip.cd = wcd;
        whipBurst(state.weapons.whip.level, 3 * p.dmgMul * getBerserkMul());
      }
      if (state.weapons.whip.anim > 0) state.weapons.whip.anim -= dt;
    }

    // Движение врагов (с учётом slowtime баффа — замедление до 25%)
    var enemyDt = state.activeBuffs.slowtime > 0 ? dt * 0.25 : dt;
    for (var k=0; k<state.enemies.length; k++){
      var e = state.enemies[k];
      var dx = p.x - e.x, dy = p.y - e.y;
      var d = Math.hypot(dx,dy) || 1;
      var nx = dx/d, ny = dy/d;
      if (e.type === 'diam'){
        // лёгкая боковая колебательная составляющая
        e.jitterPhase += dt * 4;
        var px = -ny, py = nx;
        nx += px*Math.sin(e.jitterPhase)*0.4;
        ny += py*Math.sin(e.jitterPhase)*0.4;
        var nl = Math.hypot(nx,ny) || 1; nx/=nl; ny/=nl;
      }
      // ── ХЕКС: динамическая скорость по дистанции ──
      // Вблизи (<200px) — 70% от скорости игрока (v5.14: 82% → 70%,
      // меньше прилипает к игроку, легче кайтить),
      // далеко (>1000px) — 200%, между — линейно.
      var actualSpeed = e.speed;
      // v5.17: кусочно-линейная скорость для хексы И шторма.
      //  <200px: 80%, 200→600px: 80→100%, 600→1000px: 100→200%, >1000px: 200%.
      function piecewiseSpeed(d, base){
        if (d < 200) return base * 0.80;
        if (d < 600) return base * (0.80 + 0.20 * ((d - 200) / 400));
        if (d < 1000) return base * (1.00 + 1.00 * ((d - 600) / 400));
        return base * 2.0;
      }
      if (e.type === 'hex'){
        actualSpeed = piecewiseSpeed(d, PLAYER_BASE_SPEED * p.speedMul);
      }
      if (e.type === 'storm'){
        actualSpeed = piecewiseSpeed(d, PLAYER_BASE_SPEED * p.speedMul);
      }
      // ── МЕГА: динамическая скорость + «ступор» вблизи ──
      if (e.type === 'mega'){
        var playerSpeedM = PLAYER_BASE_SPEED * p.speedMul;
        var NEARm = 200, FARm = 1000;
        // Триггер «ступора»: при попадании в радиус 200px,
        // если прошёл cooldown, активируется на 2с замедление
        // до 50% от скорости игрока. После — 8с кулдаун.
        if (d < NEARm && state.timeAcc > (e.proxCooldownUntil || 0)){
          e.proxSlowUntil = state.timeAcc + 2.0;
          e.proxCooldownUntil = state.timeAcc + 8.0;
        }
        if (state.timeAcc < (e.proxSlowUntil || 0)){
          // Ступор активен — 50% от скорости игрока
          actualSpeed = playerSpeedM * 0.5;
        } else {
          // Стандартная динамическая скорость (80% вблизи, 200% далеко)
          var ttm = Math.max(0, Math.min(1, (d - NEARm) / (FARm - NEARm)));
          actualSpeed = playerSpeedM * (0.80 + (2.0 - 0.80) * ttm);
        }
        e.rot += enemyDt * 0.5;       // медленное вращение
      }
      if (!e.suppressMove){
        e.vx = nx * actualSpeed;
        e.vy = ny * actualSpeed;
        e.x += e.vx * enemyDt;
        e.y += e.vy * enemyDt;
      }
      if (e.hitFlash > 0) e.hitFlash -= dt;

      // ── МЕГА-БОСС AI ──
      if (e.type === 'mega'){
        var megaPhase = (e.hp / e.hpMax) > 0.75 ? 1 :
                        (e.hp / e.hpMax) > 0.50 ? 2 :
                        (e.hp / e.hpMax) > 0.25 ? 3 : 4;

        // ── Веер из снарядов (все фазы) ──
        e.fanCD -= enemyDt;
        if (e.fanCD <= 0){
          e.fanCD = 3;
          var fanShots = 5;
          var fanSpread = 0.8;
          var fanBase = Math.atan2(p.y - e.y, p.x - e.x);
          for (var fs=0; fs<fanShots; fs++){
            var fAng = fanBase + (fs - (fanShots-1)/2) * (fanSpread / (fanShots-1));
            state.bossProjectiles.push({
              x: e.x, y: e.y,
              vx: Math.cos(fAng) * 380, vy: Math.sin(fAng) * 380,
              r: 7, life: 4.0, dmg: 9 * (e.damageMul || 1)
            });
          }
        }

        // ── Спавн миньонов (все фазы) ──
        e.minionCD -= enemyDt;
        if (e.minionCD <= 0){
          e.minionCD = 6;
          for (var ms=0; ms<3; ms++){
            var mAng = Math.random() * Math.PI*2;
            spawnEnemyAt('tri', e.x + Math.cos(mAng)*70, e.y + Math.sin(mAng)*70);
            var minionTri = state.enemies[state.enemies.length - 1];
            if (minionTri) minionTri.isMegaMinion = true;
          }
        }

        // ── Лазер (активен в фазах 2 и 4) ──
        if (megaPhase === 2 || megaPhase === 4){
          megaLaserUpdate(e, p, enemyDt);
        } else if (e.laserState !== 'none'){
          // ФИКС: при переходе в неактивную фазу (например, 3)
          // сбрасываем стейт. Иначе lazer-state остаётся в aim/fire
          // и рендер продолжает рисовать пунктир (или луч). Это был
          // баг «зависшего пунктира» в в3.7-4.7.
          e.laserState = 'none';
          e.laserCD = 6;
        }

        // ── Чардж (фазы 3+) ──
        if (megaPhase >= 3){
          megaDashUpdate(e, p, enemyDt);
        }
      }

      // ── ШТОРМ-БОСС AI (v5.17: -30..35% к КД атак) ──
      if (e.type === 'storm'){
        var stormPhase = (e.hp / e.hpMax) > 0.75 ? 1 :
                         (e.hp / e.hpMax) > 0.50 ? 2 :
                         (e.hp / e.hpMax) > 0.25 ? 3 : 4;

        // Одинокая молния (все фазы) — круг на игроке
        e.lonelyCD -= enemyDt;
        if (e.lonelyCD <= 0){
          e.lonelyCD = 2.5;
          state.aoeMarkers.push({
            type: 'circle',
            teleTimer: 1.5,
            fireTimer: 0.3,
            x: p.x, y: p.y,
            radius: 100,
            damage: 30 * (e.damageMul || 1),
            _phase: 'tele'
          });
        }

        // Спавн миньонов (ромбы каждые 7с)
        e.minionCD -= enemyDt;
        if (e.minionCD <= 0){
          e.minionCD = 5;
          for (var ms2=0; ms2<2; ms2++){
            var sAng = Math.random() * Math.PI*2;
            spawnEnemyAt('diam', e.x + Math.cos(sAng)*70, e.y + Math.sin(sAng)*70);
            var sMinion = state.enemies[state.enemies.length - 1];
            if (sMinion) sMinion.isStormMinion = true;
          }
        }

        // Линейный удар (фазы 2+) — полоса от босса
        if (stormPhase >= 2){
          e.lineCD -= enemyDt;
          if (e.lineCD <= 0){
            e.lineCD = 4;
            var dxL2 = p.x - e.x, dyL2 = p.y - e.y;
            var lenL2 = Math.hypot(dxL2, dyL2) || 1;
            state.aoeMarkers.push({
              type: 'line',
              teleTimer: 1.2,
              fireTimer: 0.3,
              originX: e.x, originY: e.y,
              dirX: dxL2/lenL2, dirY: dyL2/lenL2,
              length: 1500,
              halfWidth: 32,
              damage: 35 * (e.damageMul || 1),
              _phase: 'tele'
            });
          }
        }

        // Перекрёсток (фазы 3+) — крест полос на игроке
        if (stormPhase >= 3){
          e.crossCD -= enemyDt;
          if (e.crossCD <= 0){
            e.crossCD = 5.5;
            state.aoeMarkers.push({
              type: 'cross',
              teleTimer: 1.5,
              fireTimer: 0.4,
              x: p.x, y: p.y,
              length: 700,
              halfWidth: 32,
              damage: 30 * (e.damageMul || 1),
              _phase: 'tele'
            });
          }
        }

        // Цепная буря (фаза 4) — 8 быстрых ударов подряд
        if (stormPhase >= 4){
          e.chainCD -= enemyDt;
          if (e.chainCD <= 0){
            e.chainCD = 7;
            var prevX = p.x, prevY = p.y;
            for (var ci=0; ci<8; ci++){
              var ca = Math.random() * Math.PI*2;
              var ccd = 60 + Math.random() * 220;
              var cx = prevX + Math.cos(ca) * ccd;
              var cy = prevY + Math.sin(ca) * ccd;
              state.aoeMarkers.push({
                type: 'circle',
                teleTimer: 0.5 + ci * 0.35,
                fireTimer: 0.25,
                x: cx, y: cy,
                radius: 70,
                damage: 28 * (e.damageMul || 1),
                _phase: 'tele'
              });
              prevX = cx; prevY = cy;
            }
          }
        }

        // Медленное вращение и трекинг — для визуала
        e.rot += enemyDt * 0.3;
      }

      // ── ХЕКС: стрельба раз в 3 сек (тоже замедляется баффом) ──
      if (e.type === 'hex'){
        e.attackCD -= enemyDt;
        if (e.attackCD <= 0){
          e.attackCD = 3.0;
          var bAng = Math.atan2(p.y - e.y, p.x - e.x);
          state.bossProjectiles.push({
            x: e.x, y: e.y,
            vx: Math.cos(bAng) * 440, vy: Math.sin(bAng) * 440,
            r: 6, life: 4.0, dmg: 6
          });
        }
      }

      // Контактный урон по игроку
      var pdx = p.x - e.x, pdy = p.y - e.y;
      var pd2 = pdx*pdx + pdy*pdy;
      var rsum = e.r + PLAYER_RADIUS;
      if (pd2 < rsum*rsum && p.iframes <= 0 && state.activeBuffs.invuln <= 0){
        if (tryDodge()){
          p.iframes = 0.4;
        } else {
        // v5.18: после 9:00 рядовые мобы (tri/sq/diam) бьют на 75% сильнее
        var contactDmg = e.dmg;
        var isRegular = (e.type === 'tri' || e.type === 'sq' || e.type === 'diam');
        if (isRegular && state.timeAcc > 540) contactDmg *= 1.75;
        Audio8.sfx('playerhit');
        p.hp -= contactDmg;
        p.hurtFlash = 0.25;
        p.iframes = 0.6;
        state.shake = 12;
        if (p.hp <= 0){
          p.hp = 0;
          endRound();
          return;
        }
        }
      }
    }

    // Снаряды
    for (var pi=0; pi<state.projectiles.length; pi++){
      var pr = state.projectiles[pi];
      pr.x += pr.vx*dt;
      pr.y += pr.vy*dt;
      pr.life -= dt;
      if (pr.life <= 0){ pr._dead = true; continue; }
      // столкновения (v5.17: поддержка пробития)
      for (var ej=0; ej<state.enemies.length; ej++){
        var em = state.enemies[ej];
        if (pr._hitIds && em._id && pr._hitIds[em._id]) continue;
        var ddx = em.x - pr.x, ddy = em.y - pr.y;
        var rs = em.r + pr.r;
        if (ddx*ddx + ddy*ddy < rs*rs){
          damageEnemy(em, pr.dmg);
          spawnHitParticles(pr.x, pr.y, COLOR_PROJ, 4);
          if (!em._id){ state._enemyIdSeq = (state._enemyIdSeq||0) + 1; em._id = state._enemyIdSeq; }
          if (!pr._hitIds) pr._hitIds = {};
          pr._hitIds[em._id] = true;
          if (Math.random() < (state.player.pierceChance || 0)){
            break; // пробитие: пуля летит дальше
          }
          pr._dead = true;
          break;
        }
      }
    }

    // Снаряды босса — летят прямо в игрока (slowtime замедляет их тоже)
    for (var bpi=0; bpi<state.bossProjectiles.length; bpi++){
      var bp = state.bossProjectiles[bpi];
      bp.x += bp.vx * enemyDt;
      bp.y += bp.vy * enemyDt;
      bp.life -= enemyDt;
      if (bp.life <= 0){ bp._dead = true; continue; }
      var bpdx = p.x - bp.x, bpdy = p.y - bp.y;
      var bpRsum = PLAYER_RADIUS + bp.r;
      if (bpdx*bpdx + bpdy*bpdy < bpRsum*bpRsum && p.iframes <= 0 && state.activeBuffs.invuln <= 0){
        if (tryDodge()){
          p.iframes = 0.3;
          bp._dead = true;
        } else {
          Audio8.sfx('playerhit');
          p.hp -= bp.dmg;
          p.hurtFlash = 0.25;
          p.iframes = 0.6;
          state.shake = 8;
          bp._dead = true;
          if (p.hp <= 0){
            p.hp = 0;
            endRound();
            return;
          }
        }
      }
    }

    // ── AOE-маркеры (Грозовик): телеграф → удар → конец ──
    for (var ami=0; ami<state.aoeMarkers.length; ami++){
      var am = state.aoeMarkers[ami];
      if (am._phase === 'tele'){
        am.teleTimer -= dt;
        if (am.teleTimer <= 0){
          am._phase = 'fire';
        }
      } else if (am._phase === 'fire'){
        am.fireTimer -= dt;
        // Проверяем попадание в игрока
        if (p.iframes <= 0 && state.activeBuffs.invuln <= 0 && isInAoeShape(am, p.x, p.y)){
          if (tryDodge()){
            p.iframes = 0.4;
          } else {
            p.hp -= am.damage;
            p.iframes = 0.6;
            p.hurtFlash = 0.3;
            state.shake = 10;
            if (p.hp <= 0){
              p.hp = 0;
              endRound();
              return;
            }
          }
        }
        if (am.fireTimer <= 0){
          am._phase = 'done';
        }
      }
    }
    state.aoeMarkers = state.aoeMarkers.filter(function(m){ return m._phase !== 'done'; });

    // Гемы — притягиваются и собираются
    var pickup = GEM_PICKUP_BASE * p.magnetMul;
    var pickup2 = pickup * pickup;
    var collect2 = (PLAYER_RADIUS + 8) * (PLAYER_RADIUS + 8);
    for (var gi=0; gi<state.gems.length; gi++){
      var g = state.gems[gi];
      var gdx = p.x - g.x, gdy = p.y - g.y;
      var gd2 = gdx*gdx + gdy*gdy;
      if (gd2 < pickup2){
        var gd = Math.sqrt(gd2) || 1;
        var attractSpeed = 240 + (1 - gd/pickup)*220;
        g.x += (gdx/gd) * attractSpeed * dt;
        g.y += (gdy/gd) * attractSpeed * dt;
      }
      if (gd2 < collect2){
        g._dead = true;
        Audio8.sfx('gem');
        addXP(g.xp);
      }
    }

    // Сердечки — притягиваются и хилят при подборе
    for (var hi=0; hi<state.hearts.length; hi++){
      var h = state.hearts[hi];
      var hdx = p.x - h.x, hdy = p.y - h.y;
      var hd2 = hdx*hdx + hdy*hdy;
      if (hd2 < pickup2){
        var hd = Math.sqrt(hd2) || 1;
        var attractSpeed2 = 220 + (1 - hd/pickup)*200;
        h.x += (hdx/hd) * attractSpeed2 * dt;
        h.y += (hdy/hd) * attractSpeed2 * dt;
      }
      if (hd2 < collect2){
        h._dead = true;
        Audio8.sfx('heart');
        p.hp = Math.min(p.hpMax, p.hp + h.heal);
        // визуальный фидбэк — короткие зелёные/розовые частицы
        spawnHitParticles(p.x, p.y, '#ff8aa0', 6);
        state.damageNums.push({ x: p.x, y: p.y - 8, val: '+'+h.heal, life: 0.8 });
      }
    }

    // Капсулы баффов — притягиваются и активируют бафф при подборе
    for (var bi=0; bi<state.buffOrbs.length; bi++){
      var bo = state.buffOrbs[bi];
      var bodx = p.x - bo.x, body = p.y - bo.y;
      var bod2 = bodx*bodx + body*body;
      if (bod2 < pickup2){
        var bod = Math.sqrt(bod2) || 1;
        var attractSpeed3 = 240 + (1 - bod/pickup)*220;
        bo.x += (bodx/bod) * attractSpeed3 * dt;
        bo.y += (body/bod) * attractSpeed3 * dt;
      }
      if (bod2 < collect2){
        bo._dead = true;
        Audio8.sfx('buff');
        state.activeBuffs[bo.type] = 10.0;      // 10 секунд активности
        // визуал — частицы цвета баффа
        var BC = { rapidfire: '#ff8c1a', slowtime: '#5ad7ff', invuln: '#ffe45c', berserk: '#ff3852' };
        spawnHitParticles(p.x, p.y, BC[bo.type] || '#fff', 14);
        state.shake = 6;
      }
    }

    // Despawn гемов и сердечек, если игрок улетел далеко (>1500px) —
    // экономит память и снижает нагрузку на сборщик при длинных ранах.
    var DESPAWN_DIST2 = 1500 * 1500;
    for (var dgi=0; dgi<state.gems.length; dgi++){
      var dg = state.gems[dgi];
      var dgx = dg.x - p.x, dgy = dg.y - p.y;
      if (dgx*dgx + dgy*dgy > DESPAWN_DIST2) dg._dead = true;
    }
    for (var dhi=0; dhi<state.hearts.length; dhi++){
      var dh = state.hearts[dhi];
      var dhx = dh.x - p.x, dhy = dh.y - p.y;
      if (dhx*dhx + dhy*dhy > DESPAWN_DIST2) dh._dead = true;
    }
    for (var dbi=0; dbi<state.buffOrbs.length; dbi++){
      var db = state.buffOrbs[dbi];
      var dbx = db.x - p.x, dby = db.y - p.y;
      if (dbx*dbx + dby*dby > DESPAWN_DIST2) db._dead = true;
    }

    // Чистка
    cleanArrays();

    // Частицы
    for (var pa=0; pa<state.particles.length; pa++){
      var pt = state.particles[pa];
      pt.x += pt.vx*dt;
      pt.y += pt.vy*dt;
      pt.life -= dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
    }
    state.particles = state.particles.filter(function(x){ return x.life > 0; });

    // Damage numbers
    for (var dn=0; dn<state.damageNums.length; dn++){
      var d2 = state.damageNums[dn];
      d2.y -= 28*dt;
      d2.life -= dt;
    }
    state.damageNums = state.damageNums.filter(function(x){ return x.life > 0; });

    // HUD (throttle на мобиле)
    maybeUpdateHUD();
  }

  function getBerserkMul(){
    return state.activeBuffs.berserk > 0 ? 3 : 1;
  }

  // Проверка попадания точки в форму AOE-маркера
  function isInAoeShape(m, px, py){
    if (m.type === 'circle'){
      var dx = px - m.x, dy = py - m.y;
      return dx*dx + dy*dy < m.radius * m.radius;
    } else if (m.type === 'line'){
      var dxl = px - m.originX, dyl = py - m.originY;
      var tl = dxl * m.dirX + dyl * m.dirY;
      if (tl < 0 || tl > m.length) return false;
      var perpX = px - (m.originX + m.dirX * tl);
      var perpY = py - (m.originY + m.dirY * tl);
      return perpX*perpX + perpY*perpY < m.halfWidth * m.halfWidth;
    } else if (m.type === 'cross'){
      var halfW = m.halfWidth;
      var ll = m.length;
      var inNS = Math.abs(px - m.x) < halfW && Math.abs(py - m.y) < ll;
      var inEW = Math.abs(py - m.y) < halfW && Math.abs(px - m.x) < ll;
      return inNS || inEW;
    }
    return false;
  }

  // Возвращает true если урон сдоджен (игрок не получает урона).
  // Спавнит визуальный эффект.
  function tryDodge(){
    if (state.player.dodgeChance > 0 && Math.random() < state.player.dodgeChance){
      spawnHitParticles(state.player.x, state.player.y, '#ffc200', 10);
      state.damageNums.push({
        x: state.player.x, y: state.player.y - 14,
        val: 'УВОРОТ', life: 0.75, dodge: true
      });
      return true;
    }
    return false;
  }

  function damageEnemy(e, dmg){
    // Крит
    var isCrit = state.player.critChance > 0 && Math.random() < state.player.critChance;
    if (isCrit) dmg *= 2;
    e.hp -= dmg;
    e.hitFlash = 0.08;
    Audio8.sfx('hit');
    state.damageNums.push({ x: e.x, y: e.y - 4, val: Math.round(dmg), life: 0.6, crit: isCrit });
    // Вампиризм: хил % от наносимого урона
    if (state.player.vampMul > 0){
      var healAmt = dmg * state.player.vampMul;
      state.player.hp = Math.min(state.player.hpMax, state.player.hp + healAmt);
    }
    if (e.hp <= 0){
      state.kills++;
      state.score += e.score * (1 + (state.wave-1)*0.2);

      // Обновляем кулдаун боссов при смерти хексы, меги или шторма
      if (e.type === 'hex' || e.type === 'mega' || e.type === 'storm'){
        state.lastBossDeathTime = state.timeAcc;
      }
      if (e.type === 'mega' || e.type === 'storm'){
        Audio8.sfx('bossdie');
        // Переключение музыки обратно на спокойную — проверим в следующем кадре,
        // нет ли других живых боссов; флаг ниже выставит updateMusicMode
        state.bossDiedFlag = true;
        // ── НАГРАДА ЗА МЕГА-БОССА (Octalord/Грозовик) ──
        // v5.11: награда пропорциональна damageMul босса —
        //   сильнее урон, больше очков (4-й = x2, 5-й+ = +30%/босс)
        var rewardMul = e.damageMul || 1;
        state.score += Math.round(500 * rewardMul);
        addXP(Math.round(300 * rewardMul));
        // v5.16: большой голубой кристалл на тушке босса (для красоты + бонус XP)
        state.gems.push({ x: e.x, y: e.y, xp: Math.round(100 * rewardMul), big: true });
        // 2 гарантированные капсулы баффов
        var BUFF_TYPES_M = ['rapidfire', 'slowtime', 'invuln', 'berserk'];
        for (var bb=0; bb<2; bb++){
          var bAngM = Math.random() * Math.PI*2;
          state.buffOrbs.push({
            x: e.x + Math.cos(bAngM)*45,
            y: e.y + Math.sin(bAngM)*45,
            type: BUFF_TYPES_M[Math.floor(Math.random() * BUFF_TYPES_M.length)]
          });
        }
        // Жёлтые конфетти-частицы по всему экрану
        for (var fp=0; fp<60; fp++){
          var pa = Math.random() * Math.PI*2;
          var ps = 120 + Math.random() * 380;
          state.particles.push({
            x: e.x, y: e.y,
            vx: Math.cos(pa) * ps, vy: Math.sin(pa) * ps,
            life: 1.2 + Math.random() * 1.4,
            color: '#ffc200', size: 3 + Math.random() * 5
          });
        }
        state.shake = 30;
      } else {
        spawnHitParticles(e.x, e.y, e.color, 8);
        Audio8.sfx('pop');
        // v5.17 drop-логика:
        //  • Октогон-миньон: 5% бафф + 5% сердечко (10% что-то всегда)
        //  • Шторм-миньон: 7% бафф / 2% сердечко (после 6:00 — /2)
        //  • Обычный моб: 3% бафф / 2% сердечко (после 6:00 — /2)
        var dropR = Math.random();
        var buffP, heartP;
        var lateCut = state.timeAcc > 360 ? 0.5 : 1.0;
        if (e.isMegaMinion){
          buffP = 0.05;  heartP = 0.05;   // фикс 10% всегда
        } else if (e.isStormMinion){
          buffP = 0.07 * lateCut;
          heartP = 0.02 * lateCut;
        } else {
          buffP = 0.03 * lateCut;
          heartP = 0.02 * lateCut;
        }
        if (dropR < buffP){
          var BUFF_TYPES = ['rapidfire', 'slowtime', 'invuln', 'berserk'];
          var bType = BUFF_TYPES[Math.floor(Math.random() * BUFF_TYPES.length)];
          state.buffOrbs.push({ x: e.x, y: e.y, type: bType });
        } else if (dropR < buffP + heartP){
          state.hearts.push({ x: e.x, y: e.y, heal: 15 });
        } else {
          var xpVal = e.score;
          // v5.16: с хексы (мини-босс) падает «большой» голубой кристалл
          var isBoss = (e.type === 'hex');
          state.gems.push({ x: e.x, y: e.y, xp: xpVal, big: isBoss });
        }
      }
      e._dead = true;
    }
  }

  function nearestEnemy(x, y, range){
    var best = null, bestD2 = range*range;
    for (var i=0; i<state.enemies.length; i++){
      var e = state.enemies[i];
      var dx = e.x - x, dy = e.y - y;
      var d2 = dx*dx + dy*dy;
      if (d2 < bestD2){ bestD2 = d2; best = e; }
    }
    return best;
  }

  function chainLightning(x, y, lvl, dmg){
    var jumps = 2 + lvl;
    var hit = {};
    var cx = x, cy = y;
    var prevX = x, prevY = y;
    var chainPoints = [{x:x, y:y}];
    for (var j=0; j<jumps; j++){
      var nearest = null, bd = 240*240;
      for (var i=0; i<state.enemies.length; i++){
        var e = state.enemies[i];
        if (hit[i] || e._dead) continue;
        var dx = e.x - cx, dy = e.y - cy;
        var d2 = dx*dx + dy*dy;
        if (d2 < bd){ bd = d2; nearest = i; }
      }
      if (nearest == null) break;
      hit[nearest] = true;
      var en = state.enemies[nearest];
      chainPoints.push({ x: en.x, y: en.y });
      damageEnemy(en, dmg);
      cx = en.x; cy = en.y;
    }
    // визуализация — частицы по пути
    for (var c=0; c<chainPoints.length-1; c++){
      var a = chainPoints[c], b = chainPoints[c+1];
      var steps = 6;
      for (var s=0; s<steps; s++){
        var fx = a.x + (b.x - a.x)*(s/steps) + (Math.random()-0.5)*8;
        var fy = a.y + (b.y - a.y)*(s/steps) + (Math.random()-0.5)*8;
        state.particles.push({
          x: fx, y: fy,
          vx: (Math.random()-0.5)*40, vy: (Math.random()-0.5)*40,
          life: 0.35, color: '#9ee0ff', size: 3
        });
      }
    }
  }

  function whipBurst(lvl, dmg){
    var radius = 70 + lvl*22;
    state.weapons.whip.anim = 0.25;
    state.weapons.whip.radius = radius;
    var p = state.player;
    for (var i=0; i<state.enemies.length; i++){
      var e = state.enemies[i];
      var dx = e.x - p.x, dy = e.y - p.y;
      if (dx*dx + dy*dy < radius*radius){
        damageEnemy(e, dmg);
        spawnHitParticles(e.x, e.y, '#ffc200', 4);
      }
    }
  }

  function spawnHitParticles(x, y, color, count){
    for (var i=0; i<count; i++){
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random()*120;
      state.particles.push({
        x: x, y: y,
        vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
        life: 0.35 + Math.random()*0.3,
        color: color, size: 2 + Math.random()*2
      });
    }
  }

  // Проверка: все апгрейды максимально прокачаны?
  function isFullyMaxed(){
    var p = state.player;
    for (var i = 0; i < UPGRADES.length; i++){
      var u = UPGRADES[i];
      var cur = p.upgrades[u.id] || 0;
      if (cur < u.maxLvl) return false;
    }
    return true;
  }

  function addXP(v){
    var p = state.player;
    // Если всё на максимуме — XP не копится, превращается в очки
    if (isFullyMaxed()){
      state.score += v;
      return;
    }
    p.xp += v;
    while (p.xp >= p.xpNext){
      p.xp -= p.xpNext;
      p.level++;
      var lateMul = (p.level >= 4) ? 0.75 : 1.0;
      p.xpNext = Math.round((5 + Math.pow(p.level, 1.4) * 2) * 0.85 * lateMul);
      state.pendingLevelUps = (state.pendingLevelUps || 0) + 1;
      Audio8.sfx('levelup');
    }
    // Показываем модалку только если она ещё не открыта.
    if (state.pendingLevelUps > 0 && !lvlUpEl.classList.contains('is-visible')){
      openLevelUp();
    }
  }

  function cleanArrays(){
    state.enemies     = state.enemies.filter(function(e){ return !e._dead; });
    state.projectiles    = state.projectiles.filter(function(p){ return !p._dead; });
    state.bossProjectiles= state.bossProjectiles.filter(function(b){ return !b._dead; });
    state.gems           = state.gems.filter(function(g){ return !g._dead; });
    state.hearts         = state.hearts.filter(function(h){ return !h._dead; });
    state.buffOrbs       = state.buffOrbs.filter(function(b){ return !b._dead; });
  }

  // ════════════════════════════════════════════════════
  // РЕНДЕР
  // ════════════════════════════════════════════════════
  function render(){
    ctx.clearRect(0,0,W,H);
    if (!state){
      return;
    }
    ctx.save();
    var sx = 0, sy = 0;
    if (state.shake > 0){
      sx = (Math.random()-0.5)*state.shake;
      sy = (Math.random()-0.5)*state.shake;
    }
    // Камера: мир смещаем так, чтобы игрок был в центре
    var tx = W/2 - state.camX + sx;
    var ty = H/2 - state.camY + sy;
    ctx.translate(tx, ty);

    drawGrid();
    drawAoeMarkers();
    drawGems();
    drawHearts();
    drawBuffOrbs();
    drawWhipRing();
    drawOrbitals();
    drawEnemies();
    drawProjectiles();
    drawBossProjectiles();
    drawReticle();
    drawPlayer();
    drawParticles();
    drawDamageNums();

    ctx.restore();

    // Vignette единого брендового цвета при любом активном баффе.
    // Конкретный бафф читается по подписи под XP-полоской.
    var anyBuff = state.activeBuffs.rapidfire > 0 ||
                  state.activeBuffs.slowtime  > 0 ||
                  state.activeBuffs.invuln    > 0 ||
                  state.activeBuffs.berserk   > 0;
    if (anyBuff) drawBuffVignette(255, 194, 0, 0.28);
  }

  function drawBuffVignette(r, g, b, alpha){
    var rad = Math.max(W, H);
    var grad = ctx.createRadialGradient(W/2, H/2, rad*0.35, W/2, H/2, rad*0.75);
    grad.addColorStop(0, 'rgba('+r+','+g+','+b+',0)');
    grad.addColorStop(1, 'rgba('+r+','+g+','+b+','+alpha+')');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGrid(){
    var size = 50;
    var startX = Math.floor((state.camX - W/2)/size)*size;
    var startY = Math.floor((state.camY - H/2)/size)*size;
    var endX = state.camX + W/2;
    var endY = state.camY + H/2;
    ctx.strokeStyle = COLOR_BG_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x=startX; x<=endX; x+=size){
      ctx.moveTo(x, startY); ctx.lineTo(x, endY);
    }
    for (var y=startY; y<=endY; y+=size){
      ctx.moveTo(startX, y); ctx.lineTo(endX, y);
    }
    ctx.stroke();
  }

  function drawPlayer(){
    var p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    // iframe-мерцание прозрачности (после хита или после level-up)
    if (p.iframes > 0 && Math.floor(p.iframes*20) % 2 === 0){
      ctx.globalAlpha = 0.45;
    }
    ctx.shadowColor = COLOR_PLAYER;
    ctx.shadowBlur = 14;

    if (catImgLoaded){
      // ── Котик: картинка, без поворота (всегда смотрит прямо) ──
      var size = PLAYER_RADIUS * 2.6;
      ctx.drawImage(catImg, -size/2, -size/2, size, size);
      // Красный overlay при получении урона
      if (p.hurtFlash > 0){
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(255, 80, 80, 0.55)';
        ctx.fillRect(-size/2, -size/2, size, size);
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // ── Фолбэк: жёлтый треугольник как раньше ──
      var ang;
      if (state.aim.manual){
        ang = Math.atan2(state.aim.y - p.y, state.aim.x - p.x);
      } else {
        ang = Math.atan2(p.vy, p.vx);
      }
      if (state.aim.manual || p.vx || p.vy) ctx.rotate(ang);
      ctx.fillStyle = p.hurtFlash > 0 ? '#ff5e5e' : COLOR_PLAYER;
      ctx.strokeStyle = '#fff076';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PLAYER_RADIUS+2, 0);
      ctx.lineTo(-PLAYER_RADIUS, -PLAYER_RADIUS*0.85);
      ctx.lineTo(-PLAYER_RADIUS*0.55, 0);
      ctx.lineTo(-PLAYER_RADIUS, PLAYER_RADIUS*0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMegaLaser(e){
    if (e.laserState === 'none') return;
    // В aim — рендерим к target (он лерпится с задержкой),
    // в fire — рендерим в зафиксированной direction
    var nxL, nyL;
    if (e.laserState === 'fire'){
      nxL = e.laserDirX;
      nyL = e.laserDirY;
    } else {
      var dxL = e.laserTargetX - e.x, dyL = e.laserTargetY - e.y;
      var lenL = Math.hypot(dxL, dyL) || 1;
      nxL = dxL/lenL; nyL = dyL/lenL;
    }
    var endX = e.x + nxL * 2000;
    var endY = e.y + nyL * 2000;

    if (e.laserState === 'aim'){
      // бледно-красный пунктир (телеграф) ×3 толщина
      ctx.strokeStyle = 'rgba(255, 80, 80, ' + (0.35 + Math.sin(state.timeAcc * 14) * 0.18) + ')';
      ctx.lineWidth = 12;
      ctx.setLineDash([22, 16]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (e.laserState === 'fire'){
      // сплошной пульсирующий красный луч ×3 толщина
      var pulse = 0.7 + Math.sin(state.timeAcc * 24) * 0.3;
      // внешнее свечение
      ctx.strokeStyle = 'rgba(255, 60, 60, ' + (0.45 * pulse) + ')';
      ctx.lineWidth = 90;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      // средний слой
      ctx.strokeStyle = 'rgba(255, 90, 90, ' + (0.7 * pulse) + ')';
      ctx.lineWidth = 42;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      // яркий центр
      ctx.shadowColor = '#ff3030';
      ctx.shadowBlur = 28;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawAoeMarkers(){
    for (var i=0; i<state.aoeMarkers.length; i++){
      var m = state.aoeMarkers[i];
      var alpha;
      if (m._phase === 'tele'){
        // пульсирующий жёлтый телеграф
        alpha = 0.35 + Math.sin(state.timeAcc * 12) * 0.18;
      } else if (m._phase === 'fire'){
        // яркая вспышка удара
        alpha = 0.85;
      } else continue;

      var fill = 'rgba(255, 194, 0, ' + alpha + ')';
      var stroke = 'rgba(255, 255, 255, ' + (alpha * 0.6) + ')';

      if (m.type === 'circle'){
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.radius, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (m.type === 'line'){
        ctx.save();
        ctx.translate(m.originX, m.originY);
        ctx.rotate(Math.atan2(m.dirY, m.dirX));
        ctx.fillStyle = fill;
        ctx.fillRect(0, -m.halfWidth, m.length, m.halfWidth * 2);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -m.halfWidth, m.length, m.halfWidth * 2);
        ctx.restore();
      } else if (m.type === 'cross'){
        ctx.fillStyle = fill;
        // Вертикальная полоса (N-S)
        ctx.fillRect(m.x - m.halfWidth, m.y - m.length, m.halfWidth * 2, m.length * 2);
        // Горизонтальная полоса (E-W)
        ctx.fillRect(m.x - m.length, m.y - m.halfWidth, m.length * 2, m.halfWidth * 2);
      }
    }
  }

  function drawStorm(e){
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    var ratio = Math.max(0, e.hp / e.hpMax);
    var pulse = 1 + Math.sin(state.timeAcc * 3) * 0.04;
    var R = e.r * pulse;

    // S-образный силуэт через две кривые Безье
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 28;
    ctx.strokeStyle = e.hitFlash > 0 ? '#fff' : e.color;
    ctx.lineWidth = R * 0.35;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(R*0.5, -R);
    ctx.bezierCurveTo(-R*0.8, -R*1.1, -R*0.7, -R*0.2, 0, 0);
    ctx.bezierCurveTo(R*0.7, R*0.2, R*0.8, R*1.1, -R*0.5, R);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Внутреннее ядро
    var coreFill = (ratio < 0.25) ? '#ff5050' : '#fff';
    ctx.fillStyle = coreFill;
    ctx.shadowColor = coreFill;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.18, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Электрические искры по бокам (вероятностно)
    if (Math.random() < 0.4){
      ctx.fillStyle = '#fff';
      var sa = Math.random() * Math.PI*2;
      var sd = R * (0.7 + Math.random() * 0.35);
      ctx.beginPath();
      ctx.arc(Math.cos(sa)*sd, Math.sin(sa)*sd, 1.8, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawMega(e){
    // лазер — сначала, чтобы появлялся «из-под» босса
    drawMegaLaser(e);

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    var ratio = Math.max(0, e.hp / e.hpMax);
    var pulse = 1 + Math.sin(state.timeAcc * 3) * 0.04;
    // внешнее свечение
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 28;
    ctx.fillStyle = e.hitFlash > 0 ? '#fff' : e.color;
    ctx.beginPath();
    var sides = 8;
    for (var s=0; s<sides; s++){
      var a = (s/sides) * Math.PI*2 - Math.PI/2;
      var px = Math.cos(a) * e.r * pulse, py = Math.sin(a) * e.r * pulse;
      if (s===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // белая обводка
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // внутренний ядро
    ctx.fillStyle = ratio < 0.25 ? '#ff5050' : '#fff';
    ctx.shadowColor = ratio < 0.25 ? '#ff5050' : '#fff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.42, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawEnemies(){
    for (var i=0; i<state.enemies.length; i++){
      var e = state.enemies[i];
      if (e.type === 'mega'){
        drawMega(e);
        continue;
      }
      if (e.type === 'storm'){
        drawStorm(e);
        continue;
      }
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot || 0);
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : e.color;
      ctx.strokeStyle = 'rgba(255,255,255,.3)';
      ctx.lineWidth = 1;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = IS_MOBILE ? 0 : 8;
      ctx.beginPath();
      var sides = e.sides;
      for (var s=0; s<sides; s++){
        var a = (s/sides) * Math.PI*2 - Math.PI/2;
        var px = Math.cos(a)*e.r, py = Math.sin(a)*e.r;
        if (s===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // HP бар для хексы
      if (e.type === 'hex'){
        var bw = 32, bh = 4;
        var ratio2 = Math.max(0, e.hp / e.hpMax);
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(e.x - bw/2, e.y - e.r - 12, bw, bh);
        ctx.fillStyle = '#5ad7ff';
        ctx.fillRect(e.x - bw/2, e.y - e.r - 12, bw*ratio2, bh);
      }
    }
  }

  function drawProjectiles(){
    ctx.fillStyle = COLOR_PROJ;
    ctx.shadowColor = COLOR_PROJ;
    ctx.shadowBlur = IS_MOBILE ? 0 : 8;
    for (var i=0; i<state.projectiles.length; i++){
      var pr = state.projectiles[i];
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function drawBossProjectiles(){
    ctx.fillStyle = '#5ad7ff';
    ctx.shadowColor = '#5ad7ff';
    ctx.shadowBlur = IS_MOBILE ? 0 : 14;
    for (var i=0; i<state.bossProjectiles.length; i++){
      var bp = state.bossProjectiles[i];
      // внешний halo
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, bp.r * 1.8, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // ядро
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, bp.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function drawReticle(){
    if (!state.aim.manual) return;
    var ax = state.aim.x, ay = state.aim.y;
    ctx.strokeStyle = 'rgba(255,194,0,.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ax, ay - 12); ctx.lineTo(ax, ay - 5);
    ctx.moveTo(ax + 5, ay);  ctx.lineTo(ax + 12, ay);
    ctx.moveTo(ax, ay + 5);  ctx.lineTo(ax, ay + 12);
    ctx.moveTo(ax - 5, ay);  ctx.lineTo(ax - 12, ay);
    ctx.stroke();
    ctx.fillStyle = '#ffc200';
    ctx.beginPath();
    ctx.arc(ax, ay, 1.8, 0, Math.PI*2);
    ctx.fill();
  }

  function drawGems(){
    for (var i=0; i<state.gems.length; i++){
      var g = state.gems[i];

      // v5.16: «большие» кристаллы (с боссов/мини-босса) — голубые, крупнее, со свечением-halo
      if (g.big){
        var pulse = 1 + Math.sin(state.timeAcc * 4 + i * 0.7) * 0.18;
        var haloR = 22 * pulse;
        if (!IS_MOBILE){
          var grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, haloR);
          grad.addColorStop(0,    'rgba(120, 200, 255, 0.55)');
          grad.addColorStop(0.4,  'rgba(80, 170, 255, 0.25)');
          grad.addColorStop(1,    'rgba(80, 170, 255, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(g.x, g.y, haloR, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(state.timeAcc * 2.5);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#9ed6ff';
        ctx.shadowColor = '#5fb8ff';
        ctx.shadowBlur = IS_MOBILE ? 0 : 16;
        var bigSize = 8;
        ctx.beginPath();
        ctx.moveTo(0, -bigSize);
        ctx.lineTo(bigSize, 0);
        ctx.lineTo(0, bigSize);
        ctx.lineTo(-bigSize, 0);
        ctx.closePath();
        ctx.fill();
        // внутренний блик
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(0, -bigSize*0.55);
        ctx.lineTo(bigSize*0.35, 0);
        ctx.lineTo(0, bigSize*0.15);
        ctx.lineTo(-bigSize*0.35, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        continue;
      }

      // обычный жёлтый гем
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(state.timeAcc * 3);
      ctx.fillStyle = COLOR_GEM;
      ctx.shadowColor = COLOR_GEM;
      ctx.shadowBlur = IS_MOBILE ? 0 : 8;
      var size = 4;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHearts(){
    for (var i=0; i<state.hearts.length; i++){
      var h = state.hearts[i];
      var pulse = 1 + Math.sin(state.timeAcc * 5.5 + i) * 0.22;

      // ── внешнее свечение: пульсирующий розовый halo ──
      var haloR = 22 * pulse;
      var grad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, haloR);
      grad.addColorStop(0,    'rgba(255, 95, 130, 0.55)');
      grad.addColorStop(0.35, 'rgba(255, 95, 130, 0.25)');
      grad.addColorStop(1,    'rgba(255, 95, 130, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(h.x, h.y, haloR, 0, Math.PI*2);
      ctx.fill();

      // ── сердечко из двух дуг и V-острия ──
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ff5577';
      ctx.shadowColor = '#ff5577';
      ctx.shadowBlur = IS_MOBILE ? 0 : 18;
      var r = 8;       // v1.8: радиус 6 → 8
      ctx.beginPath();
      ctx.arc(-r*0.55, -r*0.3, r*0.7, Math.PI, 0);
      ctx.arc( r*0.55, -r*0.3, r*0.7, Math.PI, 0);
      ctx.lineTo(0, r*1.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  function drawOrbitals(){
    if (state.weapons.orbit.level <= 0) return;
    var p = state.player;
    var n = state.weapons.orbit.level;
    var radius = 50;
    var pulse = 1 + Math.sin(state.timeAcc * 5) * 0.18;
    for (var i=0; i<n; i++){
      var a = state.weapons.orbit.angle + i*(Math.PI*2/n);
      var ox = p.x + Math.cos(a)*radius;
      var oy = p.y + Math.sin(a)*radius;
      // внешнее свечение — radial gradient
      var R = 26 * pulse;
      var grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, R);
      grad.addColorStop(0,    'rgba(255,224,90,0.85)');
      grad.addColorStop(0.35, 'rgba(255,194,0,0.45)');
      grad.addColorStop(0.75, 'rgba(255,194,0,0.12)');
      grad.addColorStop(1,    'rgba(255,194,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, R, 0, Math.PI*2);
      ctx.fill();
      // яркий центр щита
      ctx.shadowColor = '#ffc200';
      ctx.shadowBlur = 28;
      ctx.fillStyle = '#fff8b8';
      ctx.beginPath();
      ctx.arc(ox, oy, 8, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // тонкое кольцо-обводка
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ox, oy, 8.5, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  // Рисуем чёрную иконку соответствующего баффа в (0,0) с радиусом ~size
  function drawBuffIcon(type, size){
    ctx.fillStyle = '#060606';
    ctx.strokeStyle = '#060606';
    ctx.lineWidth = Math.max(1, size * 0.13);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (type === 'rapidfire'){
      // 5 точек как пунктир выстрелов: центр + 4 вокруг
      var dotR = size * 0.13;
      var off  = size * 0.42;
      var pts = [[0,0],[off,0],[-off,0],[0,off],[0,-off]];
      for (var i=0; i<pts.length; i++){
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], dotR, 0, Math.PI*2);
        ctx.fill();
      }
    } else if (type === 'slowtime'){
      // Часы: круг-обводка + 2 стрелки
      ctx.beginPath();
      ctx.arc(0, 0, size*0.62, 0, Math.PI*2);
      ctx.stroke();
      // часовая стрелка — вверх
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -size*0.42);
      ctx.stroke();
      // минутная — вправо
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size*0.5, 0);
      ctx.stroke();
      // центральная точка
      ctx.beginPath();
      ctx.arc(0, 0, size*0.08, 0, Math.PI*2);
      ctx.fill();
    } else if (type === 'invuln'){
      // Щит: округлый верх, заострённый низ
      ctx.beginPath();
      ctx.moveTo(0, -size*0.62);
      ctx.bezierCurveTo(size*0.6, -size*0.5, size*0.6, size*0.1, 0, size*0.65);
      ctx.bezierCurveTo(-size*0.6, size*0.1, -size*0.6, -size*0.5, 0, -size*0.62);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'berserk'){
      // Нож: длинный клинок вверх + гарда + рукоять
      // клинок
      ctx.beginPath();
      ctx.moveTo(0, -size*0.7);
      ctx.lineTo(size*0.13, -size*0.1);
      ctx.lineTo(-size*0.13, -size*0.1);
      ctx.closePath();
      ctx.fill();
      // гарда
      ctx.fillRect(-size*0.32, -size*0.13, size*0.64, size*0.1);
      // рукоять
      ctx.fillRect(-size*0.13, 0, size*0.26, size*0.5);
      // навершие
      ctx.beginPath();
      ctx.arc(0, size*0.58, size*0.13, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function drawBuffOrbs(){
    // Все капсулы одинаковые по цвету (брендовый жёлтый),
    // различаются чёрной иконкой внутри.
    for (var i=0; i<state.buffOrbs.length; i++){
      var bo = state.buffOrbs[i];
      var pulse = 1 + Math.sin(state.timeAcc * 5 + i) * 0.28;

      // ── Жёлтый halo (radial gradient) ──
      var R = 32 * pulse;
      var grad = ctx.createRadialGradient(bo.x, bo.y, 0, bo.x, bo.y, R);
      grad.addColorStop(0,    'rgba(255, 194, 0, 0.80)');
      grad.addColorStop(0.45, 'rgba(255, 194, 0, 0.32)');
      grad.addColorStop(1,    'rgba(255, 194, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bo.x, bo.y, R, 0, Math.PI*2);
      ctx.fill();

      // ── Жёлтый круг-фон под иконку ──
      ctx.save();
      ctx.translate(bo.x, bo.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ffc200';
      ctx.shadowColor = '#ffc200';
      ctx.shadowBlur = 24;
      var coreR = 11;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // тонкая белая обводка для контраста
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, coreR + 0.5, 0, Math.PI*2);
      ctx.stroke();

      // ── Чёрная иконка внутри ──
      drawBuffIcon(bo.type, coreR * 0.95);
      ctx.restore();
    }
  }

  function drawWhipRing(){
    if (state.weapons.whip.anim > 0){
      var p = state.player;
      var t = state.weapons.whip.anim / 0.25;
      var r = state.weapons.whip.radius || 90;
      ctx.strokeStyle = 'rgba(255,194,0,' + t + ')';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r*(1.05 - t*0.05), 0, Math.PI*2);
      ctx.stroke();
    }
  }

  function drawParticles(){
    for (var i=0; i<state.particles.length; i++){
      var pt = state.particles[i];
      var t = Math.max(0, pt.life / 0.6);
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = t;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawDamageNums(){
    ctx.textAlign = 'center';
    for (var i=0; i<state.damageNums.length; i++){
      var d = state.damageNums[i];
      var t = Math.max(0, d.life / 0.75);
      if (d.dodge){
        ctx.font = '800 13px Montserrat, sans-serif';
        ctx.fillStyle = 'rgba(255, 194, 0, ' + t + ')';
        ctx.shadowColor = '#ffc200';
        ctx.shadowBlur = 8;
      } else if (d.crit){
        ctx.font = '900 17px Montserrat, sans-serif';
        ctx.fillStyle = 'rgba(255, 194, 0, ' + t + ')';
        ctx.shadowColor = '#ffc200';
        ctx.shadowBlur = 10;
      } else {
        ctx.font = '700 11px Montserrat, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,' + t + ')';
        ctx.shadowBlur = 0;
      }
      ctx.fillText(d.val, d.x, d.y);
    }
    ctx.shadowBlur = 0;
  }

  // ════════════════════════════════════════════════════
  // HUD
  // ════════════════════════════════════════════════════
  var hpFill   = document.getElementById('fgsHpFill');
  var xpFill   = document.getElementById('fgsXpFill');
  var hpText   = document.getElementById('fgsHpText');
  var xpText   = document.getElementById('fgsXpText');
  var buffRowEl = document.getElementById('fgsBuffRow');
  var megaBarEl = document.getElementById('fgsMegaBar');
  var megaBarFillEl = document.getElementById('fgsMegaBarFill');
  var megaAnnounceEl = document.getElementById('fgsMegaAnnounce');
  var scoreEl  = document.getElementById('fgsScore');
  var timeEl   = document.getElementById('fgsTime');
  var levelEl  = document.getElementById('fgsLevel');

  var BUFF_INFO = {
    rapidfire: { name: 'Шквал огня',         desc: 'скорость выстрела ×4' },
    slowtime:  { name: 'Замедление времени', desc: 'враги на 25% скорости' },
    invuln:    { name: 'Иммунитет',           desc: 'урон не проходит' },
    berserk:   { name: 'Берсерк',             desc: 'урон ×3' }
  };
  var BUFF_DURATION = 10.0;

  function updateMusicMode(){
    if (!Audio8.isEnabled()) return;
    var bossAlive = false;
    for (var i=0; i<state.enemies.length; i++){
      var t = state.enemies[i].type;
      if (t === 'mega' || t === 'storm'){ bossAlive = true; break; }
    }
    var want = bossAlive ? 'boss' : 'ambient';
    if (state._musicMode !== want){
      state._musicMode = want;
      Audio8.music(want);
    }
  }

  function updateMegaHUD(){
    if (!megaBarEl) return;
    var boss = null;
    for (var i=0; i<state.enemies.length; i++){
      var bt = state.enemies[i].type;
      if (bt === 'mega' || bt === 'storm'){ boss = state.enemies[i]; break; }
    }
    if (!boss){
      megaBarEl.classList.remove('is-visible');
      megaBarEl.classList.remove('is-low');
    } else {
      megaBarEl.classList.add('is-visible');
      var ratio = Math.max(0, boss.hp / boss.hpMax);
      megaBarFillEl.style.width = (ratio * 100).toFixed(1) + '%';
      megaBarEl.classList.toggle('is-low', ratio < 0.25);
      // v5.9: подпись HP в формате "X / Y"
      var hpEl = document.getElementById('fgsMegaBarHp');
      if (hpEl){
        var hpNow = Math.max(0, Math.round(boss.hp));
        var hpMax = Math.round(boss.hpMax);
        hpEl.textContent = hpNow + ' / ' + hpMax;
      }
      // динамическая подпись по типу босса
      var labelEl = megaBarEl.querySelector('.fgs__megabar-label');
      if (labelEl){
        var bossName = boss.type === 'storm' ? 'ГРОЗОВИК' : 'ОКТОГОН-ЛОРД';
        var dmgMulTxt = '';
        var dm = boss.damageMul || 1;
        if (dm > 1){
          dmgMulTxt = ' (x' + (dm >= 10 ? dm.toFixed(0) : dm.toFixed(1)) + ' урон)';
        }
        labelEl.textContent = 'МЕГА-БОСС · ' + bossName + dmgMulTxt;
      }
    }
    // анонс с динамическим именем
    if (state.megaAnnounceTimer > 0){
      if (!megaAnnounceEl.classList.contains('is-visible')){
        megaAnnounceEl.textContent = state.megaAnnounceName || 'МЕГА-БОСС';
        megaAnnounceEl.classList.add('is-visible');
        void megaAnnounceEl.offsetWidth;
      }
    } else {
      megaAnnounceEl.classList.remove('is-visible');
    }
  }

  function updateBuffsHUD(){
    if (!buffRowEl) return;
    var bs = state.activeBuffs;
    var types = ['rapidfire','slowtime','invuln','berserk'];
    var html = '';
    for (var i=0; i<types.length; i++){
      var t = types[i];
      if (bs[t] > 0){
        var info = BUFF_INFO[t];
        var pct = (bs[t] / BUFF_DURATION) * 100;
        html +=
          '<div class="fgs__buff-item">' +
            '<div class="fgs__buff-item-text">Бонус: <b>' + info.name + '</b> — ' + info.desc + '</div>' +
            '<div class="fgs__buff-item-bar"><div class="fgs__buff-item-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
          '</div>';
      }
    }
    buffRowEl.innerHTML = html;
  }

  function updateHUD(){
    var p = state.player;
    hpFill.style.width = Math.max(0, Math.round((p.hp / p.hpMax)*100)) + '%';
    if (hpText) hpText.textContent = Math.max(0, Math.round(p.hp)) + ' / ' + p.hpMax;
    // XP-полоска: при полной прокачке — белая, фиксированная на 100%
    var maxed = isFullyMaxed();
    if (maxed){
      xpFill.style.width = '100%';
      xpFill.classList.add('is-maxed');
      if (xpText) xpText.textContent = 'МАКС';
    } else {
      xpFill.style.width = Math.round((p.xp / p.xpNext)*100) + '%';
      xpFill.classList.remove('is-maxed');
      if (xpText) xpText.textContent = Math.round(p.xp) + ' / ' + p.xpNext;
    }
    updateBuffsHUD();
    updateMegaHUD();
    updateMusicMode();
    scoreEl.textContent = Math.floor(state.score);
    var mm = Math.floor(state.timeAcc / 60);
    var ss = Math.floor(state.timeAcc) % 60;
    timeEl.textContent = mm + ':' + (ss < 10 ? '0' + ss : ss);
    levelEl.textContent = p.level;
  }

  // Throttle-обёртка над updateHUD: на мобиле обновляет 5 раз в секунду.
  function maybeUpdateHUD(){
    if (!IS_MOBILE){ updateHUD(); return; }
    if (state.timeAcc - state.lastHudUpdate >= 0.2){
      state.lastHudUpdate = state.timeAcc;
      updateHUD();
    }
  }

  // ════════════════════════════════════════════════════
  // LEVEL-UP МОДАЛКА
  // ════════════════════════════════════════════════════
  var lvlUpEl = document.getElementById('fgsLevelUp');
  var upgradesEl = document.getElementById('fgsUpgrades');

  var lockFill = document.getElementById('fgsLockFill');

  function renderPlayerStats(){
    var el = document.getElementById('fgsPlayerStats');
    if (!el) return;
    var p = state.player;
    function pctChance(v){ return (v * 100).toFixed(1).replace(/\.0$/, '') + '%'; }
    // v5.15: значения в единицах (не процентах) для скорости/дамага/магнита,
    // а оружия (щиты/молния/хлыст/пушка) убраны
    var moveSpeed   = Math.round(PLAYER_BASE_SPEED * p.speedMul);          // px/с
    var fireRate    = (PLAYER_FIRE_RATE * p.fireRateMul).toFixed(2);       // выстр/с
    var dmgValue    = (1 * p.dmgMul).toFixed(2);                           // ед. урона за выстрел
    var magnetR     = Math.round(GEM_PICKUP_BASE * p.magnetMul);           // px радиус
    var stats = [
      { name: 'HP',              value: Math.max(0, Math.round(p.hp)) + ' / ' + p.hpMax,
        maxed: false, zero: false },
      { name: 'Скорость',        value: moveSpeed + ' px/с',
        maxed: p.speedMul >= 1.75, zero: p.speedMul === 1 },
      { name: 'Скорострельность',value: fireRate + ' выстр/с',
        maxed: p.fireRateMul >= 2.30, zero: p.fireRateMul === 1 },
      { name: 'Урон',            value: dmgValue,
        maxed: p.dmgMul >= 2.00, zero: p.dmgMul === 1 },
      { name: 'Магнит',          value: magnetR + ' px',
        maxed: p.magnetMul >= 3.00, zero: p.magnetMul === 1 },
      { name: 'Криты',           value: pctChance(p.critChance),
        maxed: p.critChance >= 0.20, zero: p.critChance === 0 },
      { name: 'Уворот',          value: pctChance(p.dodgeChance),
        maxed: p.dodgeChance >= 0.10, zero: p.dodgeChance === 0 },
      { name: 'Вампиризм',       value: pctChance(p.vampMul),
        maxed: p.vampMul >= 0.03, zero: p.vampMul === 0 },
      { name: 'Пробитие',        value: pctChance(p.pierceChance || 0),
        maxed: (p.pierceChance || 0) >= 0.10, zero: !p.pierceChance }
    ];
    var html = '';
    stats.forEach(function(s){
      var cls = 'fgs__stat-chip';
      if (s.maxed) cls += ' is-maxed';
      else if (s.zero) cls += ' is-zero';
      html += '<div class="' + cls + '">';
      html += '<div class="fgs__stat-chip-name">' + s.name + '</div>';
      html += '<div class="fgs__stat-chip-value">' + s.value + '</div>';
      html += '</div>';
    });
    el.innerHTML = html;
  }

  function openLevelUp(){
    state.paused = true;
    var p = state.player;
    var pool = UPGRADES.filter(function(u){
      var cur = p.upgrades[u.id] || 0;
      return cur < u.maxLvl;
    });
    // случайно 3 (или сколько есть)
    var picks = [];
    var poolCopy = pool.slice();
    while (picks.length < 3 && poolCopy.length){
      var idx = Math.floor(Math.random() * poolCopy.length);
      picks.push(poolCopy[idx]);
      poolCopy.splice(idx, 1);
    }
    upgradesEl.innerHTML = '';

    function pickAndResume(u, lvl){
      p.upgrades[u.id] = lvl;
      u.apply(state, lvl);
      lvlUpEl.classList.remove('is-visible');
      state.paused = false;
      p.iframes = 3.0;   // 3 секунды неуязвимости после выбора (v5.14: 1.5 → 3)
      // Декрементим очередь и если ещё остались уровни — показываем
      state.pendingLevelUps = Math.max(0, (state.pendingLevelUps || 0) - 1);
      if (state.pendingLevelUps > 0){
        setTimeout(openLevelUp, 200);
      }
    }

    picks.forEach(function(u){
      var lvl = (p.upgrades[u.id] || 0) + 1;
      var b = document.createElement('button');
      b.className = 'fgs__upgrade';
      b.innerHTML =
        '<div class="fgs__up-name">' + u.name + '</div>' +
        '<div class="fgs__up-desc">' + u.desc(lvl) + '</div>' +
        '<div class="fgs__up-lvl">Уровень '+lvl+' / '+u.maxLvl+'</div>';
      b.addEventListener('click', function(){ pickAndResume(u, lvl); });
      upgradesEl.appendChild(b);
    });
    if (picks.length === 0){
      // Всё прокачано — не показываем модалку. Чистим очередь.
      state.paused = false;
      state.pendingLevelUps = 0;
      return;
    }

    // 1-секундный anti-misclick лок: кнопки серые, тонкая жёлтая
    // полоска снизу заголовка заполняется за 1с.
    upgradesEl.classList.add('is-locked');
    if (lockFill){
      lockFill.classList.remove('is-running');
      lockFill.style.width = '0%';
      // reflow чтобы transition отыграл с нуля
      void lockFill.offsetWidth;
      lockFill.classList.add('is-running');
    }
    setTimeout(function(){
      upgradesEl.classList.remove('is-locked');
    }, 1000);

    renderPlayerStats();
    lvlUpEl.classList.add('is-visible');
  }

  // ════════════════════════════════════════════════════
  // СТАРТ / GAME OVER
  // ════════════════════════════════════════════════════
  var startOverlay = document.getElementById('fgsStart');
  var startBtn = document.getElementById('fgsStartBtn');
  var gameOverEl = document.getElementById('fgsGameOver');
  var goStats = document.getElementById('fgsGoStats');
  var goName = document.getElementById('fgsGoName');
  var goSubmit = document.getElementById('fgsGoSubmit');
  var goRestart = document.getElementById('fgsGoRestart');
  var goStatus = document.getElementById('fgsGoStatus');

  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) goName.value = saved;
  } catch(e){}

  startBtn.addEventListener('click', startRound);
  goRestart.addEventListener('click', function(){
    gameOverEl.classList.remove('is-visible');
    startRound();
  });
  goSubmit.addEventListener('click', submitScore);

  function startRound(){
    state = freshState();
    resizeCanvas();
    state.player.x = 0; state.player.y = 0;
    state.camX = 0; state.camY = 0;
    state.running = true;
    startOverlay.style.display = 'none';
    gameOverEl.classList.remove('is-visible');
    goStatus.textContent = '';
    goStatus.className = 'fgs__go-status';
    lastT = 0;
    startLoop();   // петля заводится тут, а не при init
  }

  function endRound(){
    Audio8.sfx('gameover');
    Audio8.music(null);
    state._musicMode = null;
    state.running = false;
    var mm = Math.floor(state.timeAcc / 60);
    var ss = Math.floor(state.timeAcc) % 60;
    var timeStr = mm + ':' + (ss < 10 ? '0' + ss : ss);
    goStats.innerHTML =
      'Время: <b>' + timeStr + '</b><br>' +
      'Убито: <b>' + state.kills + '</b><br>' +
      'Уровень: <b>' + state.player.level + '</b><br>' +
      'Очки: <span class="hi">' + Math.floor(state.score) + '</span>';
    gameOverEl.classList.add('is-visible');
  }

  // ════════════════════════════════════════════════════
  // ЛИДЕРБОРД (Apps Script)
  // ════════════════════════════════════════════════════
  var lbList = document.getElementById('fgsLbList');
  var lbRefresh = document.getElementById('fgsLbRefresh');
  var lastSubmittedScore = -1;

  function fetchLeaderboard(){
    lbList.innerHTML = '<li class="fgs__lb-empty">Загружаю топ…</li>';
    var url = APPS_SCRIPT_URL + '?action=top&game=' + GAME_KEY + '&top=7';
    fetch(url, { method: 'GET' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        renderLB(data && data.top ? data.top : []);
      })
      .catch(function(){
        lbList.innerHTML = '<li class="fgs__lb-empty">Не удалось загрузить топ</li>';
      });
  }

  function renderLB(list){
    if (!list || !list.length){
      lbList.innerHTML = '<li class="fgs__lb-empty">Топ пока пустой. Будь первым!</li>';
      return;
    }
    lbList.innerHTML = '';
    var myName = '';
    try { myName = (localStorage.getItem(STORAGE_KEY) || '').toLowerCase(); } catch(e){}
    list.slice(0, 7).forEach(function(row, i){
      var li = document.createElement('li');
      if (myName && row.name && row.name.toLowerCase() === myName) li.classList.add('is-self');
      var isMobile = row.device === 'mobile';
      var iconUrl = 'https://cdn.jsdelivr.net/gh/SASHA25111/forest@main/source/'
        + (isMobile ? 'mobile.svg' : 'pc.svg');
      var iconAlt = isMobile ? 'Телефон' : 'ПК';
      li.innerHTML =
        '<span class="fgs__lb-rank">' + (i+1) + '</span>' +
        '<span class="fgs__lb-name">' + escapeHtml(row.name || '—') + '</span>' +
        '<span class="fgs__lb-score">' + row.score + '</span>' +
        '<img class="fgs__lb-device" src="' + iconUrl + '" alt="' + iconAlt + '">';
      lbList.appendChild(li);
    });
  }

  function submitScore(){
    var name = (goName.value || '').trim();
    if (!name){ goStatus.textContent = 'Введи имя'; goStatus.className = 'fgs__go-status is-error'; return; }
    var s = Math.floor(state.score);
    if (s <= 0){ goStatus.textContent = '0 очков не отправить'; goStatus.className = 'fgs__go-status is-error'; return; }
    if (s === lastSubmittedScore){ goStatus.textContent = 'Уже отправлено'; goStatus.className = 'fgs__go-status'; return; }
    try { localStorage.setItem(STORAGE_KEY, name); } catch(e){}
    goSubmit.disabled = true;
    goStatus.textContent = 'Отправляю…';
    goStatus.className = 'fgs__go-status';

    // POST с JSON-телом — формат как у всех остальных игр в Apps Script.
    // Content-Type text/plain нужен чтобы избежать preflight OPTIONS
    // (Apps Script на него не отвечает; сам payload — это JSON.stringify).
    var isMobile = window.matchMedia &&
                   window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    var body = JSON.stringify({
      game: GAME_KEY,
      name: name,
      score: s,
      device: isMobile ? 'mobile' : 'desktop'
    });

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    })
      .then(function(r){ return r.json(); })
      .then(function(data){
        goSubmit.disabled = false;
        if (data && data.ok){
          goStatus.textContent = 'Сохранено';
          goStatus.className = 'fgs__go-status is-success';
          lastSubmittedScore = s;
          fetchLeaderboard();
        } else {
          goStatus.textContent = (data && data.error) ? data.error : 'Ошибка отправки';
          goStatus.className = 'fgs__go-status is-error';
        }
      })
      .catch(function(){
        goSubmit.disabled = false;
        goStatus.textContent = 'Сеть подвела';
        goStatus.className = 'fgs__go-status is-error';
      });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  lbRefresh.addEventListener('click', fetchLeaderboard);

  // ════════════════════════════════════════════════════
  // INIT + INTERSECTION OBSERVER (lazy lb + auto pause)
  // ════════════════════════════════════════════════════
  resizeCanvas();
  state = freshState();   // чтобы render не падал до старта

  var blockEl = document.getElementById('forest-geosurv');
  if ('IntersectionObserver' in window && blockEl){
    var io = new IntersectionObserver(function(entries){
      // v3.2: пока игра в фейк-фуллскрине, IO не трогает ничего —
      // иначе scrollTo(0) при входе уводит внешний контейнер с
      // экрана, IO решает что блок невидим и останавливает петлю.
      if (fakeFsState && fakeFsState.active) return;
      entries.forEach(function(entry){
        isVisible = entry.isIntersecting;
        if (isVisible){
          // первый показ блока — грузим лидерборд
          if (!leaderboardFetched){
            fetchLeaderboard();
            leaderboardFetched = true;
          }
          // возобновляем петлю, если игра в процессе или на паузе level-up
          if (state && (state.running || state.paused)) startLoop();
        } else {
          // блок ушёл с экрана — гасим петлю
          stopLoop();
        }
      });
    }, { rootMargin: '200px' });
    io.observe(blockEl);
  } else {
    // браузер без IO — работаем как раньше
    isVisible = true;
    fetchLeaderboard();
    leaderboardFetched = true;
  }

  // На случай ухода вкладки в фон (visibilityState) — петлю паузим
  document.addEventListener('visibilitychange', function(){
    if (document.hidden){
      stopLoop();
    } else if (isVisible && state && (state.running || state.paused)){
      startLoop();
    }
  });

  // ════════════════════════════════════════════════════
  // FULLSCREEN + PAUSE
  // ════════════════════════════════════════════════════
  var gameEl = document.getElementById('fgsGame');
  var fullscreenBtn = document.getElementById('fgsFullscreenBtn');
  var fullscreenLabel = document.getElementById('fgsFullscreenLabel');
  var pauseBtn = document.getElementById('fgsPauseBtn');
  var pauseLabel = document.getElementById('fgsPauseLabel');
  var pauseOverlay = document.getElementById('fgsPauseOverlay');
  var soundBtn = document.getElementById('fgsSoundBtn');
  var soundLabel = document.getElementById('fgsSoundLabel');
  function syncSoundBtn(){
    if (!soundBtn) return;
    if (Audio8.isEnabled()){
      soundBtn.classList.add('is-active');
      if (soundLabel) soundLabel.textContent = 'Звук';
    } else {
      soundBtn.classList.remove('is-active');
      if (soundLabel) soundLabel.textContent = 'Звук';
    }
  }
  syncSoundBtn();
  if (soundBtn){
    soundBtn.addEventListener('click', function(){
      var newVal = !Audio8.isEnabled();
      Audio8.setEnabled(newVal);
      syncSoundBtn();
      // если включили и идёт игра — сразу запустить нужный режим
      if (newVal && state && state.running && !state.paused){
        state._musicMode = null; // форс обновление в updateMusicMode
      }
    });
  }

  var exitFsBtn = document.getElementById('fgsExitFsBtn');

  // Куда вернуть элемент после выхода из псевдо-фуллскрина
  var fakeFsState = { origParent: null, origNext: null, scrollY: 0, active: false };

  function isInFullscreen(){
    return !!(document.fullscreenElement || document.webkitFullscreenElement ||
              document.mozFullScreenElement || document.msFullscreenElement);
  }
  function requestFs(el){
    var req = el.requestFullscreen || el.webkitRequestFullscreen ||
              el.mozRequestFullScreen || el.msRequestFullscreen;
    if (!req) return Promise.reject(new Error('no FS API'));
    var ret;
    try { ret = req.call(el); } catch(e){ return Promise.reject(e); }
    return ret && ret.then ? ret : Promise.resolve();
  }
  function exitFs(){
    var exit = document.exitFullscreen || document.webkitExitFullscreen ||
               document.mozCancelFullScreen || document.msExitFullscreen;
    if (!exit) return Promise.reject();
    var ret;
    try { ret = exit.call(document); } catch(e){ return Promise.reject(e); }
    return ret && ret.then ? ret : Promise.resolve();
  }

  function enterFakeFs(){
    if (fakeFsState.active) return;
    fakeFsState.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    fakeFsState.origParent = gameEl.parentNode;
    fakeFsState.origNext   = gameEl.nextSibling;
    // Переносим в body чтобы выйти из любых stacking context Tilda
    document.body.appendChild(gameEl);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    gameEl.classList.add('is-fakefullscreen');
    window.scrollTo(0, 0);
    fakeFsState.active = true;
    // v3.1: внешний #forest-geosurv уехал с экрана при scrollTo(0),
    // IntersectionObserver отдаст isVisible=false и петля встанет.
    // Принудительно делаем isVisible=true пока в фейк-фуллскрине.
    isVisible = true;
    if (state && (state.running || state.paused)) startLoop();
    updateFullscreenUI();
  }
  function exitFakeFs(){
    if (!fakeFsState.active) return;
    gameEl.classList.remove('is-fakefullscreen');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    // Возвращаем элемент на родное место
    if (fakeFsState.origParent){
      if (fakeFsState.origNext) fakeFsState.origParent.insertBefore(gameEl, fakeFsState.origNext);
      else fakeFsState.origParent.appendChild(gameEl);
    }
    window.scrollTo(0, fakeFsState.scrollY);
    fakeFsState.active = false;
    // v3.1: пересчитываем isVisible вручную, т.к. IO может не среагировать
    var rect = blockEl.getBoundingClientRect();
    isVisible = rect.bottom > 0 && rect.top < (window.innerHeight || document.documentElement.clientHeight);
    if (isVisible && state && (state.running || state.paused)) startLoop();
    else stopLoop();
    updateFullscreenUI();
  }

  function updateFullscreenUI(){
    var isNative = isInFullscreen();
    var isFake   = gameEl.classList.contains('is-fakefullscreen');
    var isOn     = isNative || isFake;
    fullscreenBtn.classList.toggle('is-active', isOn);
    fullscreenLabel.textContent = isOn ? 'Свернуть' : 'На весь экран';
    gameEl.classList.toggle('is-native-fs', isNative);
    setTimeout(resizeCanvas, 80);
  }
  function toggleFullscreen(){
    if (isInFullscreen()){
      exitFs().catch(function(){});
      return;
    }
    if (fakeFsState.active){
      exitFakeFs();
      return;
    }
    requestFs(gameEl).then(function(){
      // натив-режим — updateFullscreenUI сработает по событию
    }).catch(function(){
      // фолбэк: «псевдо-фуллскрин» (iOS Safari и любой другой
      // браузер где Fullscreen API не работает / запрещён).
      enterFakeFs();
    });
  }
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  exitFsBtn.addEventListener('click', toggleFullscreen);
  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
    .forEach(function(ev){ document.addEventListener(ev, updateFullscreenUI); });

  // ── Пауза ──
  function updatePauseUI(){
    var isPaused = state && state.paused && !lvlUpEl.classList.contains('is-visible');
    pauseBtn.classList.toggle('is-active', isPaused);
    pauseLabel.textContent = isPaused ? 'Продолжить' : 'Пауза';
    if (pauseOverlay){
      pauseOverlay.classList.toggle('is-visible', !!isPaused);
    }
  }
  function togglePause(){
    if (!state || !state.running) return;
    // не паузим, если открыто level-up окно (там своя пауза)
    if (lvlUpEl.classList.contains('is-visible')) return;
    state.paused = !state.paused;
    updatePauseUI();
    if (!state.paused && isVisible) startLoop();
  }
  pauseBtn.addEventListener('click', togglePause);

  // Esc / P — кнопки на клавиатуре тоже работают
  window.addEventListener('keydown', function(e){
    if (e.key === 'p' || e.key === 'P' || e.key === 'З' || e.key === 'з'){
      togglePause();
    }
  });

  // Изначальный статус
  updateFullscreenUI();
  updatePauseUI();
})();