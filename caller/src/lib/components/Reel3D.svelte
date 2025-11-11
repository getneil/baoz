<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import * as THREE from 'three';

  type Item = { id: string; label: string; image_url: string };

  export let items: Item[] = [];
  export let target: number = 0; // kept for API compatibility (unused for stopping)
  export let spin: boolean = false;
  export let stop: boolean = false;

  const dispatch = createEventDispatcher<{ stopped: { centerIndex: number; item: Item } }>();

  let host: HTMLDivElement | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let ring: THREE.Group | null = null;
  let raf = 0;

  // spin state
  let phase: 'idle' | 'spinning' | 'decel' | 'stopped' = 'idle';
  let angularVelocity = 0; // radians/sec
  let angle = 0; // current rotation angle around X axis
  let decelStart = 0;
  let decelDuration = 1000; // ms
  let angleStart = 0;
  let angleGoal = 0;

  function segmentAngle() { return items.length ? (Math.PI * 2) / items.length : Math.PI * 2; }

  function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0c10);

    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 8);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(3, 4, 5);
    scene.add(dir);

    ring = new THREE.Group();
    scene.add(ring);

    rebuildItems();
  }

  let textures: THREE.Texture[] = [];

  function disposeRing() {
    if (!ring) return;
    for (const child of [...ring.children]) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      // materials
      const mat = mesh.material as THREE.Material | THREE.Material[];
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) m.dispose?.();
      ring.remove(mesh);
    }
    for (const t of textures) t.dispose();
    textures = [];
  }

  async function rebuildItems() {
    if (!ring) return;
    disposeRing();
    const n = Math.max(items.length, 1);
    const radius = 1.8; // reduced visual radius to avoid front-face clipping
    const seg = (Math.PI * 2) / n;
    const planeW = 2.2; // roughly fits view, tuned below by camera
    const planeH = 2.2; // square-ish faces

    const loader = new THREE.TextureLoader();
    for (let i = 0; i < n; i++) {
      let tex: THREE.Texture;
      try {
        tex = await new Promise<THREE.Texture>((resolve, reject) => {
          loader.load(items[i]?.image_url ?? '', resolve, undefined, () => resolve(new THREE.Texture()));
        });
      } catch {
        tex = new THREE.Texture();
      }
      if (tex.image) {
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
      }
      textures.push(tex);
      const geo = new THREE.PlaneGeometry(planeW, planeH);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      // place around a vertical cylinder (rotate around X so vertical spin)
      const theta = i * seg;
      mesh.position.set(0, Math.sin(theta) * radius, Math.cos(theta) * radius);
      mesh.rotation.x = theta; // orient plane to face camera as it rotates around X
      ring.add(mesh);
    }
  }

  function resize() {
    if (!host || !renderer || !camera) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let ro: ResizeObserver | null = null;

  function prepareDecel(now: number) {
    const n = Math.max(items.length, 1);
    const seg = (Math.PI * 2) / n;
    angleStart = angle;
    // Keep current center: center occurs when angle aligns a segment to front (theta ~ 0 mod seg)
    // Choose goal as nearest integer multiple of seg from angleStart plus 2-3 extra spins
    const extraSpins = 2 + Math.floor(Math.random() * 2);
    const turns = extraSpins * (Math.PI * 2);
    const nearest = Math.round(angleStart / seg) * seg;
    angleGoal = nearest + turns;
    decelDuration = 900 + Math.floor(Math.random() * 500);
    decelStart = now;
    phase = 'decel';
  }

  function tick(ts: number) {
    if (!renderer || !scene || !camera || !ring) return;
    const now = performance.now();
    const dt = Math.min(50, now - lastTime);

    if (phase === 'spinning') {
      angle += angularVelocity * (dt / 1000);
    } else if (phase === 'decel') {
      const t = Math.min(1, (now - decelStart) / decelDuration);
      const k = easeOutCubic(t);
      angle = angleStart + (angleGoal - angleStart) * k;
      if (t >= 1) {
        phase = 'stopped';
        angle = angleGoal;
        // Determine centered index: index whose plane is front (theta ~ 0 modulo seg)
        const n = Math.max(items.length, 1);
        const seg = (Math.PI * 2) / n;
        const idx = ((Math.round(angle / seg) % n) + n) % n;
        const item = items[idx] ?? { id: 'ph', label: '—', image_url: '' };
        dispatch('stopped', { centerIndex: idx, item });
      }
    }

    // apply rotation: ring spins around X
    ring.rotation.x = angle;

    renderer.render(scene, camera);
    lastTime = now;
    raf = requestAnimationFrame(tick);
  }

  let lastTime = performance.now();

  $: (function syncSpinStop() {
    if (spin && phase === 'idle') {
      // start with slower base speed
      angularVelocity = (Math.PI * 2) * (0.3 + Math.random() * 0.3); // 0.3-0.6 turns/sec
      phase = 'spinning';
    }
    if (spin && !stop && phase === 'stopped') {
      // restart from stopped
      angularVelocity = (Math.PI * 2) * (0.3 + Math.random() * 0.3);
      phase = 'spinning';
    }
    if (stop && phase === 'spinning') {
      prepareDecel(performance.now());
    }
    if (!spin && !stop && phase !== 'idle') {
      phase = 'idle';
    }
  })();

  onMount(() => {
    if (!host) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    host.appendChild(renderer.domElement);
    buildScene();
    resize();
    ro = new ResizeObserver(resize);
    ro.observe(host);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        renderer = null;
      }
      disposeRing();
      textures = [];
      scene = null;
      camera = null;
      ring = null;
    };
  });
</script>

<div class="reel3d" bind:this={host}></div>

<style>
  .reel3d {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 6; /* 50% of previous height */
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid #45a29e33;
    background: #0b0c10;
  }
</style>
