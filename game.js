import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#game"), card = $(".game-card"), overlay = $("#overlay");
  const startButton = $("#start"), pauseButton = $("#pause");
  const title = $("#title"), eyebrow = $("#eyebrow"), lede = $("#lede");
  const bestEl = $("#bestScore"), distanceEl = $("#distance"), tokensEl = $("#tokens");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9dbbca);
  scene.fog = new THREE.Fog(0x9dbbca, 48, 150);

  const camera = new THREE.PerspectiveCamera(57, 1, 0.1, 210);
  camera.position.set(0, 5.4, 12.5);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight(0xc9f0ff, 0x423e53, 2));
  const sun = new THREE.DirectionalLight(0xffd0a1, 3);
  sun.position.set(-12, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 24, bottom: -24 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x71d9e8, 1.1);
  fill.position.set(8, 7, -12);
  scene.add(fill);

  const material = (color, roughness = 0.72, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const mats = {
    road: material(0x303a49, 0.92), curb: material(0xf0c16f, 0.55, { emissive: 0x57320a, emissiveIntensity: 0.35 }),
    line: material(0xdce9e9, 0.64, { emissive: 0x93d9df, emissiveIntensity: 0.18 }),
    walk: material(0x52636c, 0.82), dark: material(0x253243, 0.78),
    lime: material(0xc7ff70, 0.46, { emissive: 0x62a928, emissiveIntensity: 0.25 }),
    teal: material(0x70e2ca, 0.42, { emissive: 0x197769, emissiveIntensity: 0.32 }),
    skin: material(0xe9b38e, 0.78), hair: material(0x292c43, 0.78),
    coral: material(0xff795e, 0.5, { emissive: 0x6b180d, emissiveIntensity: 0.18 }),
    gold: material(0xffd36a, 0.38, { emissive: 0xa66410, emissiveIntensity: 0.4 }),
    glass: material(0x91fff0, 0.28, { emissive: 0x28d8c6, emissiveIntensity: 1.7 }),
    neonPink: material(0xff83c7, 0.3, { emissive: 0xf42494, emissiveIntensity: 1.8 }),
    neonBlue: material(0x85dfff, 0.3, { emissive: 0x218bff, emissiveIntensity: 1.7 }),
    train: material(0xf4f0e2, 0.38, { metalness: 0.26 }),
    trainNose: material(0x314459, 0.32, { metalness: 0.35 }),
    window: material(0xffd395, 0.4, { emissive: 0xd87934, emissiveIntensity: 0.9 }),
    buildings: [0x536673, 0x455c6c, 0x69757c, 0x48515f, 0x596a70].map((color) => material(color, 0.88))
  };
  const roadDashes = [], scenery = [], objects = [];
  const laneX = [-3.65, 0, 3.65];
  const rand = (min, max) => min + Math.random() * (max - min);
  let state = "ready", distance = 0, tokens = 0, speed = 20, elapsed = 0;
  let playerLane = 1, visualLane = 1, jumpTime = 0, slideTime = 0;
  let hoverTime = 0, boardCooldown = 0, spawnCount = 0;
  let nextSpawn = 22, lastTime = 0, lastTap = null, shake = 0, best = 0;

  function box(parent, size, mat, position, castShadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...position);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function addRoad() {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 240), mats.road);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.09, -42);
    road.receiveShadow = true;
    scene.add(road);
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 240), mats.curb);
      curb.position.set(side * 5.85, 0.02, -42);
      scene.add(curb);
      const walk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 240), mats.walk);
      walk.position.set(side * 7.15, -0.06, -42);
      walk.receiveShadow = true;
      scene.add(walk);
    }
    for (const x of [-2, 2]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.018, 240), mats.line);
      stripe.position.set(x, -0.065, -42);
      scene.add(stripe);
      const group = new THREE.Group();
      for (let i = 0; i < 20; i++) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.023, 3.3), mats.line);
        dash.position.set(x, -0.045, 70 - i * 11);
        group.add(dash);
      }
      scene.add(group);
      roadDashes.push(group);
    }
  }
  function addSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(160, 32, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: "varying vec3 vWorldPosition; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorldPosition=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }",
        fragmentShader: "varying vec3 vWorldPosition; void main(){ float h=clamp(normalize(vWorldPosition).y*0.68+0.38,0.0,1.0); vec3 low=vec3(0.95,0.66,0.52); vec3 mid=vec3(0.55,0.68,0.72); vec3 high=vec3(0.13,0.22,0.38); vec3 c=mix(low,mid,smoothstep(0.0,0.38,h)); c=mix(c,high,smoothstep(0.32,0.95,h)); gl_FragColor=vec4(c,1.0); }"
      })
    );
    scene.add(sky);
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3.2, 28, 20), new THREE.MeshBasicMaterial({ color: 0xffd391 }));
    sunDisc.position.set(22, 27, -105);
    scene.add(sunDisc);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(4.3, 20, 16), new THREE.MeshBasicMaterial({ color: 0xffc98d, transparent: true, opacity: 0.15, depthWrite: false }));
    halo.position.copy(sunDisc.position);
    scene.add(halo);
  }
  function addCity() {
    const seeded = (n) => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
    for (const side of [-1, 1]) {
      for (let i = 0; i < 22; i++) {
        const seed = i + (side + 2) * 90;
        const w = 3.5 + seeded(seed + 3) * 5.2, h = 9 + seeded(seed + 7) * 27, depth = 5 + seeded(seed + 11) * 5;
        const group = new THREE.Group();
        group.position.set(side * (11 + seeded(seed) * 11), 0, 54 - i * 10.1);
        const body = box(group, [w, h, depth], mats.buildings[Math.floor(seeded(seed + 13) * mats.buildings.length)], [0, h / 2, 0], false);
        body.receiveShadow = false;
        box(group, [w + 0.15, 0.22, depth + 0.15], mats.dark, [0, h + 0.11, 0], false);
        for (let row = 0; row < Math.floor((h - 2) / 2.8); row++) {
          for (let col = 0; col < 2; col++) {
            if (seeded(seed + row * 8 + col * 3) > 0.7) continue;
            const wx = (col - 0.5) * w * 0.52, wy = 1.4 + row * 2.8;
            const faceZ = side < 0 ? depth / 2 + 0.045 : -depth / 2 - 0.045;
            const windowMesh = box(group, [0.46, 0.82, 0.07], mats.window, [wx, wy, faceZ], false);
            if (side > 0) windowMesh.rotation.y = Math.PI;
          }
        }
        if (i % 5 === 0) {
          const sign = box(group, [w * 0.52, 1.05, 0.12], i % 2 === 0 ? mats.glass : mats.neonPink, [0, Math.min(h - 2, 8), side < 0 ? depth / 2 + 0.1 : -depth / 2 - 0.1], false);
          if (side > 0) sign.rotation.y = Math.PI;
        }
        if (i % 4 === 1) {
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 1.8, 8), mats.dark);
          mast.position.set(w * 0.24, h + 1, 0);
          group.add(mast);
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), i % 2 ? mats.neonBlue : mats.neonPink);
          beacon.position.set(w * 0.24, h + 2, 0);
          group.add(beacon);
        }
        scene.add(group);
        scenery.push({ group, phase: seeded(seed + 20) });
      }
    }
  }
  function makeRunner() {
    const root = new THREE.Group();
    root.position.z = 6;
    scene.add(root);
    const avatar = new THREE.Group();
    root.add(avatar);
    const leftLeg = new THREE.Group(), rightLeg = new THREE.Group();
    leftLeg.position.set(-0.2, 0.78, 0);
    rightLeg.position.set(0.2, 0.78, 0);
    avatar.add(leftLeg, rightLeg);
    for (const leg of [leftLeg, rightLeg]) {
      box(leg, [0.23, 0.68, 0.25], mats.dark, [0, -0.31, 0]);
      box(leg, [0.38, 0.16, 0.48], mats.dark, [0.06, -0.64, -0.08]);
      box(leg, [0.32, 0.035, 0.2], mats.coral, [0.06, -0.71, -0.06], false);
    }
    box(avatar, [0.76, 0.88, 0.43], mats.lime, [0, 1.45, 0]);
    box(avatar, [0.66, 0.17, 0.46], mats.teal, [0, 1.73, 0.015]);
    box(avatar, [0.42, 0.32, 0.28], mats.coral, [0, 1.42, 0.31]);
    box(avatar, [0.39, 0.52, 0.26], mats.dark, [0, 1.26, 0.36]);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18), mats.skin);
    head.position.set(0, 2.17, 0); head.castShadow = true; avatar.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.278, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), mats.hair);
    hair.position.set(0, 2.22, -0.01); hair.castShadow = true; avatar.add(hair);
    box(avatar, [0.31, 0.085, 0.19], mats.teal, [0, 2.13, 0.22]);
    box(avatar, [0.13, 0.048, 0.04], mats.gold, [0.09, 2.12, 0.32], false);
    const leftArm = new THREE.Group(), rightArm = new THREE.Group();
    leftArm.position.set(-0.46, 1.72, 0); rightArm.position.set(0.46, 1.72, 0);
    avatar.add(leftArm, rightArm);
    for (const arm of [leftArm, rightArm]) {
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.6, 10), mats.lime);
      sleeve.position.y = -0.25; sleeve.rotation.z = -0.12; sleeve.castShadow = true; arm.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), mats.skin);
      hand.position.set(0, -0.56, 0.02); hand.castShadow = true; arm.add(hand);
    }
    box(avatar, [0.45, 0.58, 0.24], mats.coral, [0, 1.46, -0.32]);
    box(avatar, [0.24, 0.32, 0.08], mats.gold, [0, 1.44, -0.48]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.035, 8, 28), mats.teal);
    ring.position.set(0, 1.43, -0.49); avatar.add(ring);
    const board = new THREE.Group();
    board.visible = false;
    box(board, [1.3, 0.15, 2.05], mats.dark, [0, 0, 0]);
    box(board, [1.08, 0.08, 1.15], mats.teal, [0, 0.09, 0]);
    box(board, [0.76, 0.035, 0.45], mats.lime, [0, 0.145, 0.35], false);
    for (const x of [-0.48, 0.48]) {
      const thruster = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 16), mats.glass);
      thruster.position.set(x, -0.03, -0.73);
      board.add(thruster);
    }
    root.add(board);
    return { root, avatar, leftLeg, rightLeg, leftArm, rightArm, board };
  }

  addRoad();
  addSky();
  addCity();
  const runner = makeRunner();
  try { best = Number(localStorage.getItem("skyline-sprint-best")) || 0; } catch (_) {}
  bestEl.textContent = best.toLocaleString();

  function resize() {
    const rect = card.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 600 ? 64 : 70;
    camera.position.set(0, w < 600 ? 7.5 : 5.4, w < 600 ? 21.5 : 12.5);
    camera.lookAt(0, 1.65, -15);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(card);
  resize();

  function addToken(lane, z) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.13, 10, 24), mats.gold);
    ring.rotation.y = Math.PI / 2; ring.castShadow = true; group.add(ring);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), mats.lime);
    core.castShadow = true; group.add(core);
    group.position.set(laneX[lane], 1.55, z);
    scene.add(group);
    objects.push({ type: "token", lane, group, collected: false, baseY: 1.55, phase: rand(0, Math.PI * 2) });
  }
  function addObstacle(type, lane, z) {
    const group = new THREE.Group();
    if (type === "crate") {
      box(group, [1.35, 1.25, 1.1], mats.coral, [0, 0.66, 0]);
      box(group, [1.39, 0.1, 1.14], mats.gold, [0, 1.2, 0]);
      box(group, [0.1, 1.3, 1.14], mats.gold, [0, 0.66, 0], false);
    } else if (type === "barrier") {
      box(group, [2.4, 0.25, 0.42], mats.gold, [0, 0.58, 0]);
      for (const x of [-0.85, 0.85]) box(group, [0.22, 0.62, 0.3], mats.coral, [x, 0.31, 0]);
      box(group, [2.15, 0.09, 0.46], mats.lime, [0, 0.62, 0.015]);
    } else if (type === "gate") {
      box(group, [0.25, 2.4, 0.28], mats.teal, [-1, 1.2, 0]);
      box(group, [0.25, 2.4, 0.28], mats.teal, [1, 1.2, 0]);
      box(group, [2.25, 0.35, 0.42], mats.glass, [0, 2.14, 0]);
      box(group, [1.6, 0.08, 0.06], mats.gold, [0, 2.14, 0.24], false);
    } else {
      box(group, [2.8, 2.7, 14], mats.train, [0, 1.52, 0]);
      box(group, [2.55, 0.16, 12.8], mats.teal, [0, 2.91, -0.2], false);
      box(group, [2.45, 0.42, 0.12], mats.coral, [0, 0.42, 7.06], false);
      box(group, [2.3, 0.1, 0.14], mats.gold, [0, 0.73, 7.09], false);
      box(group, [2.18, 0.86, 0.1], mats.trainNose, [0, 2.02, 7.08], false);
      box(group, [0.08, 0.72, 0.08], mats.teal, [0, 2.02, 7.15], false);
      for (const x of [-0.89, 0.89]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mats.gold);
        lamp.position.set(x, 0.94, 7.16);
        group.add(lamp);
        for (const z of [-5.2, -2.6, 0, 2.6, 5.1]) {
          box(group, [0.07, 0.76, 0.86], mats.glass, [x * 1.48, 2.02, z], false);
        }
        for (const z of [-5.2, -2.0, 2.0, 5.2]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 12), mats.dark);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x * 1.72, 0.27, z);
          group.add(wheel);
        }
      }
      box(group, [0.34, 0.32, 0.36], mats.dark, [0, 0.28, 7.25]);
    }
    group.position.set(laneX[lane], 0, z);
    scene.add(group);
    objects.push({ type, lane, group, cleared: false });
  }
  function spawnPattern() {
    const lane = Math.floor(Math.random() * 3);
    const type = spawnCount++ % 3 === 1 || Math.random() < 0.14
      ? "train"
      : ["crate", "barrier", "gate"][Math.floor(Math.random() * 3)];
    addObstacle(type, lane, -72);
    const safeLane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
    for (let i = 0; i < 5; i++) addToken(safeLane, -85 + i * 3.1);
    nextSpawn = distance + rand(34, 43);
  }
  function removeObject(object) {
    scene.remove(object.group);
    object.group.traverse((child) => { if (child.isMesh) child.geometry.dispose(); });
  }
  function newRun() {
    for (const object of objects) removeObject(object);
    objects.length = 0; distance = 0; tokens = 0; speed = 20;
    playerLane = 1; visualLane = 1; jumpTime = 0; slideTime = 0;
    hoverTime = 0; boardCooldown = 0; spawnCount = 0; runner.board.visible = false; nextSpawn = 22;
    runner.avatar.rotation.set(0, 0, 0);
    runner.root.position.set(0, 0, 6);
    startButton.innerHTML = `START RUN <span aria-hidden="true">→</span>`;
    lastTime = performance.now(); state = "running";
    overlay.classList.add("hidden");
    distanceEl.textContent = "0 m"; tokensEl.textContent = "0"; $("#boardStatus").textContent = "Ready";
  }
  function finishRun() {
    if (state !== "running") return;
    state = "over"; shake = 0.3;
    const score = Math.floor(distance);
    if (score > best) {
      best = score; bestEl.textContent = best.toLocaleString();
      try { localStorage.setItem("skyline-sprint-best", String(best)); } catch (_) {}
    }
    eyebrow.textContent = "Run complete";
    title.innerHTML = "NICE<br><span>FLIGHT</span>";
    lede.textContent = `${score.toLocaleString()} meters · ${tokens} glow token${tokens === 1 ? "" : "s"}. The rooftops are calling you back.`;
    startButton.innerHTML = `RUN IT BACK <span aria-hidden="true">↻</span>`;
    overlay.classList.remove("hidden");
  }
  function pauseRun() {
    if (state === "running") {
      state = "paused"; eyebrow.textContent = "Take a breather";
      title.innerHTML = "RUN<br><span>PAUSED</span>";
      lede.textContent = "Your rooftop dash is on hold. Pick up where you left off when you're ready.";
      startButton.textContent = "RESUME RUN"; overlay.classList.remove("hidden");
    } else if (state === "paused") {
      state = "running"; lastTime = performance.now(); overlay.classList.add("hidden");
    }
  }
  function action(which) {
    if (state !== "running") return;
    if (which === "left") playerLane = Math.max(0, playerLane - 1);
    if (which === "right") playerLane = Math.min(2, playerLane + 1);
    if (which === "jump" && jumpTime <= 0.08 && slideTime <= 0) jumpTime = 0.78;
    if (which === "slide" && jumpTime <= 0) slideTime = 0.68;
    if (which === "board" && hoverTime <= 0 && boardCooldown <= 0) {
      hoverTime = 6.5; boardCooldown = 14; runner.board.visible = true;
    }
  }
  startButton.addEventListener("click", () => { if (state === "paused") pauseRun(); else newRun(); });
  pauseButton.addEventListener("click", () => { if (state === "running" || state === "paused") pauseRun(); });
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "w", "a", "s", "d"].includes(key)) event.preventDefault();
    if (event.repeat) return;
    if (key === "arrowleft" || key === "a") action("left");
    else if (key === "arrowright" || key === "d") action("right");
    else if (key === "arrowup" || key === "w") action("jump");
    else if (key === "arrowdown" || key === "s") action("slide");
    else if (key === " ") action("board");
    else if (key === "p" || key === "escape") pauseRun();
    else if (key === "enter" && (state === "ready" || state === "over")) newRun();
  });
  document.querySelectorAll(".touch-button").forEach((button) => {
    button.addEventListener("pointerdown", (event) => { event.preventDefault(); action(button.dataset.action); });
  });
  canvas.addEventListener("pointerdown", (event) => { lastTap = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener("pointerup", (event) => {
    if (!lastTap || state !== "running") return;
    const dx = event.clientX - lastTap.x, dy = event.clientY - lastTap.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 22) {
      if (Math.abs(dx) > Math.abs(dy)) action(dx < 0 ? "left" : "right");
      else action(dy < 0 ? "jump" : "slide");
    }
    lastTap = null;
  });
  window.addEventListener("blur", () => { if (state === "running") pauseRun(); });

  function update(dt) {
    elapsed += dt;
    if (state !== "running") return;
    const step = Math.min(dt, 0.05);
    speed = Math.min(35, 20 + distance * 0.012);
    distance += speed * step;
    hoverTime = Math.max(0, hoverTime - step);
    boardCooldown = Math.max(0, boardCooldown - step);
    runner.board.visible = hoverTime > 0;
    runner.board.position.y = 0.2 + (hoverTime > 0 ? Math.sin(elapsed * 12) * 0.07 : 0);
    $("#boardStatus").textContent = hoverTime > 0 ? `${hoverTime.toFixed(1)}s` : boardCooldown > 0 ? `${Math.ceil(boardCooldown)}s` : "Ready";
    if (distance >= nextSpawn) spawnPattern();
    visualLane += (playerLane - visualLane) * Math.min(1, step * 12);
    const visualX = THREE.MathUtils.lerp(laneX[0], laneX[2], visualLane / 2);
    runner.root.position.x = THREE.MathUtils.lerp(runner.root.position.x, visualX, Math.min(1, step * 12));
    jumpTime = Math.max(0, jumpTime - step);
    slideTime = Math.max(0, slideTime - step);
    for (const object of objects) {
      object.group.position.z += speed * step;
      if (object.type === "token") {
        object.group.position.y = object.baseY + Math.sin(elapsed * 3.6 + object.phase) * 0.18;
        object.group.rotation.y += step * 1.8;
        if (!object.collected && object.group.position.z > 3.6 && object.group.position.z < 7.4 && Math.abs(object.lane - playerLane) < 0.46) {
          object.collected = true; tokens++; tokensEl.textContent = String(tokens);
        }
      } else if (!object.cleared && object.group.position.z > (object.type === "train" ? -1 : 3.6) && object.group.position.z < 7.8 && Math.abs(object.lane - playerLane) < 0.46) {
        if (hoverTime > 0) {
          hoverTime = 0; boardCooldown = Math.max(boardCooldown, 10); object.cleared = true;
          runner.board.visible = false; $("#boardStatus").textContent = "Saved!";
          continue;
        }
        const cleared = (object.type === "barrier" && jumpTime > 0.18) || (object.type === "gate" && slideTime > 0.15);
        if (!cleared) { finishRun(); break; }
        object.cleared = true;
      }
    }
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].group.position.z > 13 || objects[i].collected || objects[i].cleared) {
        removeObject(objects[i]); objects.splice(i, 1);
      }
    }
    for (const item of scenery) {
      item.group.position.z += speed * step * 0.74;
      if (item.group.position.z > 70) item.group.position.z -= 222.2;
    }
    for (const group of roadDashes) {
      for (const dash of group.children) {
        dash.position.z += speed * step;
        if (dash.position.z > 15) dash.position.z -= 220;
      }
    }
    runner.avatar.position.y = jumpTime > 0 ? Math.sin((1 - jumpTime / 0.78) * Math.PI) * 2.9 : hoverTime > 0 ? 0.12 : 0;
    runner.avatar.rotation.z = (laneX[playerLane] - visualX) * -0.055;
    const cycle = elapsed * Math.min(speed, 30) * 0.65;
    if (jumpTime <= 0 && slideTime <= 0) {
      runner.avatar.rotation.x = THREE.MathUtils.lerp(runner.avatar.rotation.x, 0, step * 8);
      runner.leftLeg.rotation.x = Math.sin(cycle) * 0.78;
      runner.rightLeg.rotation.x = Math.sin(cycle + Math.PI) * 0.78;
      runner.leftArm.rotation.x = Math.sin(cycle + Math.PI) * 0.55;
      runner.rightArm.rotation.x = Math.sin(cycle) * 0.55;
    } else if (slideTime > 0) {
      runner.avatar.rotation.x = THREE.MathUtils.lerp(runner.avatar.rotation.x, 0.78, step * 12);
    }
    distanceEl.textContent = `${Math.floor(distance)} m`;
  }
  function frame(time) {
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    update(dt);
    if (shake > 0 && state === "over") {
      camera.position.x = rand(-shake, shake);
      shake = Math.max(0, shake - 0.008);
    } else camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.08);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  window.skylineSprint3D = {
    getState: () => {
      const avatarPoint = runner.root.localToWorld(new THREE.Vector3(0, 1.3, 0)).project(camera);
      return {
        state, distance: Math.floor(distance), tokens, objects: objects.length, lane: playerLane,
        jumping: jumpTime > 0, sliding: slideTime > 0, hoverboarding: hoverTime > 0,
        boardCooldown: Math.ceil(boardCooldown),
        runnerNdcX: Number(avatarPoint.x.toFixed(2)),
        runnerVisible: Math.abs(avatarPoint.x) < 0.98 && avatarPoint.y > -0.98 && avatarPoint.y < 0.98,
        renderer: renderer.getContext().getParameter(renderer.getContext().VERSION)
      };
    }
  };
  requestAnimationFrame(frame);
})();
