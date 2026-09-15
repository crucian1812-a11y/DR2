/* Компоненты A-Frame для открытки: текст на канвасе, спрайты (сердечки,
   искры, облака, солнце), покачивание и стерео-режим для картонных очков. */
(function () {
  var THREE = AFRAME.THREE;

  // ——— вспомогательные текстуры, рисуются прямо в браузере ———

  function svgTexture(svg) {
    var img = new Image();
    var tex = new THREE.Texture(img);
    img.onload = function () { tex.needsUpdate = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  var TEX = {};

  TEX.heart = function () {
    return svgTexture(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">' +
      '<path d="M16 29C6 21 2 15.5 2 11a6.5 6.5 0 0 1 14-3.2A6.5 6.5 0 0 1 30 11c0 4.5-4 10-14 18z" ' +
      'fill="#ff5f86" stroke="#ffffff" stroke-width="1.2"/></svg>');
  };

  TEX.spark = function () {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,240,170,0.9)');
    g.addColorStop(1, 'rgba(255,220,120,0)');
    var ctx = c.getContext('2d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  TEX.cloud = function () {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    var ctx = c.getContext('2d');
    [[70, 80, 46], [120, 62, 56], [180, 82, 42], [100, 88, 38], [150, 90, 40]].forEach(function (b) {
      var g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2]);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 128);
    });
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  TEX.sun = function () {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,235,1)');
    g.addColorStop(0.18, 'rgba(255,238,150,0.95)');
    g.addColorStop(0.45, 'rgba(255,200,90,0.35)');
    g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  TEX.skyGradient = function () {
    var c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, '#1f7fe0');
    g.addColorStop(0.45, '#6fc0f5');
    g.addColorStop(0.75, '#bfe6ff');
    g.addColorStop(1.00, '#eaf6ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  AFRAME.CARD_TEX = TEX;

  // Небо и земля — это фон: рисуются первыми и не пишут глубину. Иначе
  // непрозрачный «пол» перекрывает рисунок, который лежит ближе к зрителю.
  AFRAME.registerComponent('backdrop', {
    init: function () {
      var el = this.el;
      var apply = function () {
        var mesh = el.getObject3D('mesh');
        if (!mesh) return;
        mesh.renderOrder = -10;
        mesh.material.depthWrite = false;
        mesh.material.needsUpdate = true;
      };
      apply();
      el.addEventListener('object3dset', apply);
      el.addEventListener('materialtextureloaded', apply);
    }
  });

  // Явный порядок отрисовки: A-Frame сортирует полупрозрачные плоскости
  // по расстоянию, и близкие по глубине слои открытки спорят друг с другом.
  AFRAME.registerComponent('render-order', {
    schema: { type: 'number', default: 0 },
    init: function () {
      var el = this.el;
      var data = this.data;
      var apply = function () {
        var mesh = el.getObject3D('mesh');
        if (mesh) mesh.renderOrder = data;
      };
      apply();
      el.addEventListener('object3dset', apply);
      el.addEventListener('materialtextureloaded', apply);
    }
  });

  // ——— текст: кириллицы во встроенных шрифтах A-Frame нет, рисую на канвасе ———

  AFRAME.registerComponent('canvas-text', {
    schema: {
      value: { default: '' },
      size: { type: 'number', default: 64 },
      color: { default: '#ffffff' },
      weight: { default: '700' },
      maxWidth: { type: 'number', default: 900 },
      pxToM: { type: 'number', default: 0.0024 },
      bg: { default: '' },
      pad: { type: 'number', default: 24 },
      opacity: { type: 'number', default: 1 }
    },

    init: function () {
      this.canvas = document.createElement('canvas');
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false })
      );
      this.el.setObject3D('mesh', this.mesh);
    },

    update: function () {
      var d = this.data;
      var ctx = this.canvas.getContext('2d');
      var font = d.weight + ' ' + d.size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

      // перенос по словам, плюс явные переводы строки из текста
      ctx.font = font;
      var lines = [];
      d.value.split('\n').forEach(function (para) {
        var line = '';
        para.split(' ').forEach(function (word) {
          var probe = line ? line + ' ' + word : word;
          if (ctx.measureText(probe).width > d.maxWidth && line) { lines.push(line); line = word; }
          else { line = probe; }
        });
        lines.push(line);
      });

      var lineH = Math.round(d.size * 1.25);
      var textW = lines.reduce(function (m, l) { return Math.max(m, ctx.measureText(l).width); }, 1);
      var w = Math.ceil(textW + d.pad * 2);
      var h = Math.ceil(lines.length * lineH + d.pad * 2);

      this.canvas.width = w;
      this.canvas.height = h;
      ctx = this.canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      if (d.bg) {
        ctx.fillStyle = d.bg;
        var r = Math.min(h / 2, 28);
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r);
        ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r); ctx.closePath(); ctx.fill();
      }

      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(12,40,80,0.6)';
      ctx.shadowBlur = Math.round(d.size * 0.34);
      ctx.shadowOffsetY = Math.round(d.size * 0.06);
      ctx.fillStyle = d.color;
      lines.forEach(function (line, i) {
        ctx.fillText(line, w / 2, d.pad + lineH * (i + 0.5));
      });

      this.texture.needsUpdate = true;
      this.mesh.material.opacity = d.opacity;
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(w * d.pxToM, h * d.pxToM);
    },

    remove: function () { this.el.removeObject3D('mesh'); }
  });

  // ——— лёгкое покачивание ———

  AFRAME.registerComponent('bob', {
    schema: {
      amp: { type: 'number', default: 0.06 },
      speed: { type: 'number', default: 1 },
      tilt: { type: 'number', default: 2 }
    },
    init: function () {
      this.base = this.el.object3D.position.y;
      this.phase = Math.random() * Math.PI * 2;
    },
    tick: function (t) {
      var a = t / 1000 * this.data.speed + this.phase;
      this.el.object3D.position.y = this.base + Math.sin(a) * this.data.amp;
      this.el.object3D.rotation.z = Math.sin(a * 0.7) * THREE.MathUtils.degToRad(this.data.tilt);
    }
  });

  // ——— фонтан сердечек ———

  AFRAME.registerComponent('hearts', {
    schema: {
      count: { type: 'int', default: 26 },
      enabled: { default: false },
      spread: { type: 'number', default: 3.4 }
    },
    init: function () {
      var tex = TEX.heart();
      this.parts = [];
      this.group = new THREE.Group();
      for (var i = 0; i < this.data.count; i++) {
        var s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, transparent: true, depthWrite: false, opacity: 0
        }));
        s.renderOrder = 30;
        this.group.add(s);
        this.parts.push({ sprite: s, life: -Math.random() * 6 });
      }
      this.el.setObject3D('hearts', this.group);
    },
    respawn: function (p) {
      var a = Math.random() * Math.PI * 2;
      var r = 2.6 + Math.random() * 3.4;
      p.sprite.position.set(Math.sin(a) * r, -0.6 - Math.random() * 0.8, -Math.cos(a) * r);
      p.scale = 0.09 + Math.random() * 0.1;
      p.speed = 0.25 + Math.random() * 0.35;
      p.sway = 0.2 + Math.random() * 0.4;
      p.phase = Math.random() * 6.28;
      p.total = 6 + Math.random() * 4;
      p.life = 0;
    },
    tick: function (t, dt) {
      if (!this.data.enabled || !dt) return;
      var s = dt / 1000;
      var self = this;
      this.parts.forEach(function (p) {
        p.life += s;
        if (p.life < 0) return;
        if (p.total === undefined || p.life > p.total) { self.respawn(p); return; }
        var k = p.life / p.total;
        p.sprite.position.y += p.speed * s;
        p.sprite.position.x += Math.sin(t / 900 + p.phase) * p.sway * s;
        p.sprite.position.z += Math.cos(t / 1100 + p.phase) * p.sway * 0.4 * s;
        p.sprite.material.opacity = Math.min(1, k * 5) * (1 - Math.pow(k, 3)) * 0.95;
        var wobble = 1 + Math.sin(t / 300 + p.phase) * 0.12;
        p.sprite.scale.setScalar(p.scale * wobble);
      });
    }
  });

  // ——— вспышка искр в момент превращения ———

  AFRAME.registerComponent('sparkles', {
    schema: { count: { type: 'int', default: 70 } },
    init: function () {
      var tex = TEX.spark();
      this.group = new THREE.Group();
      this.parts = [];
      for (var i = 0; i < this.data.count; i++) {
        var s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, transparent: true, depthWrite: false, opacity: 0,
          blending: THREE.AdditiveBlending
        }));
        this.group.add(s);
        this.parts.push({ sprite: s, life: 99 });
      }
      this.el.setObject3D('sparkles', this.group);
    },
    burst: function () {
      this.parts.forEach(function (p) {
        var a = Math.random() * Math.PI * 2;
        var r = Math.random();
        p.sprite.position.set(0, 0, 0);
        p.vel = new THREE.Vector3(Math.cos(a) * (1.2 + r), Math.sin(a) * (0.9 + r), (Math.random() - 0.5) * 0.7);
        p.scale = 0.08 + Math.random() * 0.16;
        p.total = 1.1 + Math.random() * 1.2;
        p.life = 0;
      });
    },
    tick: function (t, dt) {
      if (!dt) return;
      var s = dt / 1000;
      this.parts.forEach(function (p) {
        if (p.life >= (p.total || 0)) { p.sprite.material.opacity = 0; return; }
        p.life += s;
        var k = p.life / p.total;
        p.sprite.position.addScaledVector(p.vel, s);
        p.vel.multiplyScalar(0.97);
        p.vel.y -= 0.35 * s;
        p.sprite.material.opacity = (1 - k) * 0.95;
        p.sprite.scale.setScalar(p.scale * (1 + k));
      });
    }
  });

  // ——— облака и солнце ———

  AFRAME.registerComponent('clouds', {
    schema: { count: { type: 'int', default: 9 } },
    init: function () {
      var tex = TEX.cloud();
      this.group = new THREE.Group();
      this.parts = [];
      for (var i = 0; i < this.data.count; i++) {
        var s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, transparent: true, depthWrite: false, opacity: 0.25
        }));
        var a = Math.random() * Math.PI * 2;
        var r = 22 + Math.random() * 12;
        s.position.set(Math.cos(a) * r, 9 + Math.random() * 9, Math.sin(a) * r);
        var w = 7 + Math.random() * 6;
        s.scale.set(w, w * 0.5, 1);
        this.group.add(s);
        this.parts.push({ sprite: s, speed: 0.08 + Math.random() * 0.12, r: r, a: a });
      }
      this.el.setObject3D('clouds', this.group);
    },
    tick: function (t, dt) {
      if (!dt) return;
      var s = dt / 1000;
      this.parts.forEach(function (p) {
        p.a += p.speed * 0.02 * s;
        p.sprite.position.x = Math.cos(p.a) * p.r;
        p.sprite.position.z = Math.sin(p.a) * p.r;
      });
    }
  });

  AFRAME.registerComponent('sun-glow', {
    schema: { size: { type: 'number', default: 9 } },
    init: function () {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.sun(), transparent: true, depthWrite: false,
        opacity: 0, blending: THREE.AdditiveBlending
      }));
      s.scale.setScalar(this.data.size);
      this.el.setObject3D('sun', s);
      this.sprite = s;
    },
    fadeIn: function (target) {
      this.target = target === undefined ? 0.9 : target;
    },
    tick: function (t, dt) {
      if (this.target === undefined || !dt) return;
      var m = this.sprite.material;
      m.opacity += (this.target - m.opacity) * Math.min(1, dt / 900);
      this.sprite.scale.setScalar(this.data.size * (1 + Math.sin(t / 1600) * 0.03));
    }
  });

  // ——— стерео-режим: две картинки рядом для картонных очков ———

  AFRAME.registerComponent('stereo-view', {
    init: function () {
      this.enabled = false;
      this.stereo = new THREE.StereoCamera();
      this.stereo.eyeSep = 0.064;
      this.size = new THREE.Vector2();
      var sceneEl = this.el;
      var self = this;

      var apply = function () {
        var renderer = sceneEl.renderer;
        if (!renderer || renderer.__stereoPatched) return;
        renderer.__stereoPatched = true;
        var original = renderer.render.bind(renderer);
        renderer.render = function (scene, camera) {
          if (!self.enabled || !camera.isPerspectiveCamera) { return original(scene, camera); }
          renderer.getSize(self.size);
          var w = self.size.width / 2;
          var h = self.size.height;
          // каждый глаз занимает половину экрана — пропорции считаем по ней
          var savedAspect = camera.aspect;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          camera.updateWorldMatrix(true, false);
          self.stereo.update(camera);
          renderer.setScissorTest(true);
          renderer.setScissor(0, 0, w, h);
          renderer.setViewport(0, 0, w, h);
          original(scene, self.stereo.cameraL);
          renderer.setScissor(w, 0, w, h);
          renderer.setViewport(w, 0, w, h);
          original(scene, self.stereo.cameraR);
          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, self.size.width, self.size.height);
          camera.aspect = savedAspect;
          camera.updateProjectionMatrix();
        };
      };

      if (sceneEl.renderer) { apply(); } else { sceneEl.addEventListener('render-target-loaded', apply); }
    },
    set: function (on) { this.enabled = on; }
  });
})();
