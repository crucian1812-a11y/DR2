/* Сценарий открытки: старт по кнопке, превращение рисунка по взгляду,
   фотографии вокруг, звук, стерео-режим. */
(function () {
  var THREE = AFRAME.THREE;
  var cfg = window.CARD;

  var scene = document.getElementById('scene');
  var card = document.getElementById('card');
  var paper = document.getElementById('paper');
  var magic = document.getElementById('magic');
  var frame = document.getElementById('frame');
  var title = document.getElementById('title');
  var sky = document.getElementById('sky');
  var ground = document.getElementById('ground');
  var sunEl = document.getElementById('sun');
  var heartsEl = document.getElementById('hearts');
  var sparklesEl = document.getElementById('sparkles');
  var photosEl = document.getElementById('photos');

  var startScreen = document.getElementById('start');
  var startBtn = document.getElementById('startBtn');
  var hud = document.getElementById('hud');
  var hintEl = document.getElementById('hint');
  var captionEl = document.getElementById('caption');
  var flashEl = document.getElementById('flash');
  var soundBtn = document.getElementById('soundBtn');
  var vrBtn = document.getElementById('vrBtn');
  var replayBtn = document.getElementById('replayBtn');
  var centerBtn = document.getElementById('centerBtn');
  var rig = document.getElementById('rig');
  var camEl = document.getElementById('camera');
  var stereoHud = document.getElementById('stereoHud');
  var exitVrBtn = document.getElementById('exitVr');

  var voice = new Audio(cfg.voice);
  voice.preload = 'auto';

  var revealed = false;
  var autoTimer = null;
  var hintTimer = null;

  // ——— мелкие помощники ———

  function tween(dur, step, done) {
    var t0 = performance.now();
    (function frame(now) {
      var k = Math.min(1, (now - t0) / dur);
      step(k < 1 ? 1 - Math.pow(1 - k, 3) : 1);   // плавное замедление
      if (k < 1) requestAnimationFrame(frame);
      else if (done) done();
    })(t0);
  }

  function tweenColor(mesh, to, dur) {
    if (!mesh) return;
    var from = mesh.material.color.clone();
    var target = new THREE.Color(to);
    tween(dur, function (k) { mesh.material.color.copy(from).lerp(target, k); });
  }

  function fadeClouds(to, dur) {
    var group = document.getElementById('clouds').getObject3D('clouds');
    if (!group) return;
    var from = group.children[0].material.opacity;
    tween(dur, function (k) {
      var v = from + (to - from) * k;
      group.children.forEach(function (c) { c.material.opacity = v; });
    });
  }

  function showHint(text, hideAfter) {
    clearTimeout(hintTimer);
    if (!text) { hintEl.classList.remove('show'); return; }
    hintEl.textContent = text;
    hintEl.classList.add('show');
    if (hideAfter) hintTimer = setTimeout(function () { hintEl.classList.remove('show'); }, hideAfter);
  }

  // Гироскоп телефона отсчитывает направление от компаса, так что «вперёд»
  // для сцены — это та сторона, куда человек смотрит в момент старта.
  function recenter() {
    var q = new THREE.Quaternion();
    camEl.object3D.getWorldQuaternion(q);
    var e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    rig.object3D.rotation.y -= e.y;
  }

  // ——— фотографии по кругу ———

  var photoEls = [];

  function buildPhotos() {
    var radius = 3.4;
    cfg.photos.forEach(function (p) {
      var a = THREE.MathUtils.degToRad(p.angle);
      var wrap = document.createElement('a-entity');
      wrap.setAttribute('position', { x: Math.sin(a) * radius, y: 1.55, z: -Math.cos(a) * radius });
      wrap.setAttribute('rotation', { x: 0, y: -p.angle, z: 0 });
      wrap.setAttribute('visible', false);
      wrap.setAttribute('bob', { amp: 0.05, speed: 0.6 + Math.random() * 0.3, tilt: 1.5 });

      var frame = document.createElement('a-plane');
      frame.setAttribute('width', 1.12);
      frame.setAttribute('height', 1.52);
      frame.setAttribute('material', 'shader: flat; color: #ffffff; transparent: true; opacity: 0');
      frame.setAttribute('render-order', 4);

      var photo = document.createElement('a-plane');
      photo.setAttribute('width', 1.0);
      photo.setAttribute('height', 1.24);
      photo.setAttribute('position', '0 0.1 0.01');
      photo.setAttribute('material', 'shader: flat; src: ' + p.src + '; transparent: true; opacity: 0');
      photo.setAttribute('render-order', 5);

      var cap = document.createElement('a-entity');
      cap.setAttribute('position', '0 -0.63 0.02');
      cap.setAttribute('render-order', 6);
      cap.setAttribute('canvas-text', {
        value: p.caption, size: 42, color: '#3a2b1e', maxWidth: 620, pxToM: 0.0014, pad: 8
      });

      frame.classList.add('gaze');
      wrap.appendChild(frame);
      wrap.appendChild(photo);
      wrap.appendChild(cap);
      photosEl.appendChild(wrap);

      frame.addEventListener('mouseenter', function () {
        wrap.setAttribute('animation__in', 'property: scale; to: 1.12 1.12 1.12; dur: 300; easing: easeOutBack');
      });
      frame.addEventListener('mouseleave', function () {
        wrap.setAttribute('animation__in', 'property: scale; to: 1 1 1; dur: 300');
      });

      photoEls.push({ wrap: wrap, frame: frame, photo: photo });
    });
  }

  function showPhotos() {
    photoEls.forEach(function (p, i) {
      setTimeout(function () {
        p.wrap.setAttribute('visible', true);
        p.frame.setAttribute('animation__fade', 'property: material.opacity; to: 1; dur: 900');
        p.photo.setAttribute('animation__fade', 'property: material.opacity; to: 1; dur: 900');
        p.wrap.setAttribute('scale', '0.6 0.6 0.6');
        p.wrap.setAttribute('animation__pop', 'property: scale; to: 1 1 1; dur: 700; easing: easeOutBack');
      }, 400 + i * 350);
    });
    setTimeout(function () {
      var rc = document.getElementById('cursor').components.raycaster;
      if (rc) rc.refreshObjects();
    }, 400 + photoEls.length * 350 + 900);
  }

  // ——— превращение рисунка ———

  function reveal() {
    if (revealed) return;
    revealed = true;
    clearTimeout(autoTimer);

    flashEl.classList.remove('on');
    void flashEl.offsetWidth;
    flashEl.classList.add('on');

    // рисунок поднимается со стола и разворачивается к зрителю
    card.setAttribute('animation__rise', 'property: position; to: 0 1.55 -2.75; dur: 1700; easing: easeOutCubic');
    card.setAttribute('animation__turn', 'property: rotation; to: 0 0 0; dur: 1700; easing: easeOutCubic');

    paper.removeAttribute('bob');
    paper.setAttribute('animation__out', 'property: material.opacity; to: 0; dur: 900; easing: easeInQuad');
    paper.setAttribute('animation__up', 'property: scale; to: 1.35 1.35 1; dur: 1400; easing: easeOutQuad');
    paper.setAttribute('animation__lift', 'property: position; to: 0 0.3 0.2; dur: 1400; easing: easeOutQuad');
    paper.classList.remove('gaze');

    frame.setAttribute('visible', true);
    frame.setAttribute('animation__in', 'property: material.opacity; from: 0; to: 1; dur: 1200; delay: 250');
    magic.setAttribute('visible', true);
    magic.setAttribute('scale', '0.88 0.88 1');
    magic.setAttribute('animation__in', 'property: material.opacity; from: 0; to: 1; dur: 1200; delay: 250');
    magic.setAttribute('animation__pop', 'property: scale; to: 1 1 1; dur: 1400; delay: 250; easing: easeOutBack');

    tweenColor(sky.getObject3D('mesh'), '#ffffff', 2600);
    tweenColor(ground.getObject3D('mesh'), '#74c247', 2600);
    sunEl.components['sun-glow'].fadeIn(0.95);
    fadeClouds(0.85, 2600);
    heartsEl.setAttribute('hearts', 'enabled', true);
    sparklesEl.components.sparkles.burst();

    setTimeout(function () {
      title.setAttribute('visible', true);
      title.setAttribute('scale', '0.3 0.3 0.3');
      title.setAttribute('animation__pop', 'property: scale; to: 1 1 1; dur: 900; easing: easeOutBack');
      title.setAttribute('bob', { amp: 0.04, speed: 0.8, tilt: 1 });
    }, 900);

    showPhotos();
    showHint(cfg.hintAround, 6000);
  }

  // ——— старт ———

  function askGyro() {
    var DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      return DOE.requestPermission().catch(function () {});
    }
    return Promise.resolve();
  }

  function start() {
    voice.currentTime = 0;
    voice.play().catch(function () {});
    askGyro();

    startScreen.classList.add('gone');
    setTimeout(function () { startScreen.style.display = 'none'; }, 700);
    hud.hidden = false;

    // небо светлеет из ночи в утро, пока Глеб не оживил рисунок
    var skyMesh = sky.getObject3D('mesh');
    if (skyMesh) {
      skyMesh.material.map = AFRAME.CARD_TEX.skyGradient();
      skyMesh.material.color.set('#3c4a78');
      skyMesh.material.needsUpdate = true;
    }

    setTimeout(recenter, 600);
    setTimeout(function () {
      showHint(cfg.hintLook);
      armGaze();
    }, 2200);
    autoTimer = setTimeout(reveal, 25000);   // если не догадалась — покажем сами
  }

  function armGaze() {
    paper.classList.add('gaze');
    var rc = document.getElementById('cursor').components.raycaster;
    if (rc) rc.refreshObjects();
  }

  function replay() {
    revealed = false;
    clearTimeout(autoTimer);

    paper.removeAttribute('animation__out');
    paper.removeAttribute('animation__up');
    card.removeAttribute('animation__rise');
    card.removeAttribute('animation__turn');
    card.setAttribute('position', '0 0.85 -2.2');
    card.setAttribute('rotation', '-35 0 0');
    paper.removeAttribute('animation__lift');
    paper.setAttribute('material', 'opacity', 1);
    paper.setAttribute('scale', '1 1 1');
    paper.setAttribute('position', '0 0 0');
    paper.setAttribute('bob', 'amp: 0.035; speed: 0.7; tilt: 1.2');
    armGaze();

    frame.removeAttribute('animation__in');
    frame.setAttribute('material', 'opacity', 0);
    frame.setAttribute('visible', false);
    magic.removeAttribute('animation__in');
    magic.removeAttribute('animation__pop');
    magic.setAttribute('material', 'opacity', 0);
    magic.setAttribute('visible', false);

    title.setAttribute('visible', false);
    heartsEl.setAttribute('hearts', 'enabled', false);
    sunEl.components['sun-glow'].fadeIn(0);
    fadeClouds(0.25, 800);
    tweenColor(sky.getObject3D('mesh'), '#3c4a78', 800);
    tweenColor(ground.getObject3D('mesh'), '#223225', 800);

    photoEls.forEach(function (p) {
      p.wrap.setAttribute('visible', false);
      p.frame.setAttribute('material', 'opacity', 0);
      p.photo.setAttribute('material', 'opacity', 0);
    });
    captionEl.classList.remove('show');

    voice.currentTime = 0;
    voice.play().catch(function () {});
    showHint(cfg.hintLook);
    autoTimer = setTimeout(reveal, 25000);
  }

  // ——— стерео-режим ———

  var stereoOn = false;

  function setStereo(on) {
    stereoOn = on;
    scene.components['stereo-view'].set(on);
    document.body.classList.toggle('stereo', on);
    stereoHud.hidden = !on;
  }

  function enterVr() {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) { try { req.call(el); } catch (e) {} }
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(function () {});
    }
    askGyro();
    setStereo(true);
    setTimeout(recenter, 400);
  }

  function exitVr() {
    setStereo(false);
    if (screen.orientation && screen.orientation.unlock) {
      try { screen.orientation.unlock(); } catch (e) {}
    }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
  }

  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && stereoOn) setStereo(false);
  });

  // ——— субтитры ———

  if (cfg.captions && cfg.captions.length) {
    voice.addEventListener('timeupdate', function () {
      var cur = null;
      cfg.captions.forEach(function (c) { if (voice.currentTime >= c.at) cur = c; });
      if (cur && captionEl.textContent !== cur.text) {
        captionEl.textContent = cur.text;
        captionEl.classList.add('show');
      }
    });
    voice.addEventListener('ended', function () { captionEl.classList.remove('show'); });
  }

  voice.addEventListener('ended', function () {
    if (revealed) showHint(cfg.hintEnd, 7000);
  });

  // ——— кнопки ———

  startBtn.addEventListener('click', start);
  vrBtn.addEventListener('click', enterVr);
  exitVrBtn.addEventListener('click', exitVr);
  replayBtn.addEventListener('click', replay);
  centerBtn.addEventListener('click', recenter);
  soundBtn.addEventListener('click', function () {
    voice.muted = !voice.muted;
    soundBtn.textContent = voice.muted ? '🔇' : '🔊';
    soundBtn.classList.toggle('off', voice.muted);
  });

  paper.addEventListener('click', reveal);

  // ——— готовность ———

  function ready() {
    buildPhotos();
    startBtn.disabled = false;
    startBtn.textContent = 'Открыть открытку';
  }

  if (scene.hasLoaded) ready();
  else scene.addEventListener('loaded', ready);
})();
