<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { Pose, POSE_LANDMARKS } from '@mediapipe/pose';
  import type { Results } from '@mediapipe/pose';
  import { Camera } from '@mediapipe/camera_utils';

  const dispatch = createEventDispatcher<{ status: string }>();

  let videoEl: HTMLVideoElement | null = null;
  let canvasEl: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let camera: Camera | null = null;
  let pose: Pose | null = null;

  let status = 'Initializing…';
  const HOLD_MS = 250;
  let bothUpSince = 0;
  // Multiperson handling
  const CENTER_MIN = 0.3; // normalized x band [0..1]
  const CENTER_MAX = 0.7;
  const LOCK_MS = 5000; // soft lock duration
  const LOCK_TOL = 0.12; // tolerance in normalized units
  let lockAnchorX = 0;
  let lockAnchorY = 0;
  let lockUntil = 0;

  function classifyArms(results: Results): string {
    const lm = results.poseLandmarks;
    if (!lm || lm.length === 0) return 'Arms not raised';

    const leftWrist = lm[POSE_LANDMARKS.LEFT_WRIST];
    const rightWrist = lm[POSE_LANDMARKS.RIGHT_WRIST];
    const leftShoulder = lm[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = lm[POSE_LANDMARKS.RIGHT_SHOULDER];

    // y is normalized [0..1]; smaller is higher on screen
    const leftUp = leftWrist && leftShoulder ? leftWrist.y < leftShoulder.y - 0.05 : false;
    const rightUp = rightWrist && rightShoulder ? rightWrist.y < rightShoulder.y - 0.05 : false;

    if (leftUp && rightUp) return 'Both Arms Raised';
    if (leftUp || rightUp) return 'Single Arm Raised';
    return 'Arms not raised';
  }

  function draw(results: Results) {
    if (!ctx || !canvasEl || !videoEl) return;
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    canvasEl.width = vw;
    canvasEl.height = vh;

    ctx.save();
    ctx.clearRect(0, 0, vw, vh);
    ctx.drawImage(results.image, 0, 0, vw, vh);

    const lm = results.poseLandmarks || [];
    ctx.fillStyle = '#45a29e';
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * vw, p.y * vh, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  onMount(async () => {
    try {
      ctx = (canvasEl as HTMLCanvasElement).getContext('2d');
      pose = new Pose({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`
      });
      pose.setOptions({
        modelComplexity: 0,
        selfieMode: true,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      pose.onResults((results: Results) => {
        const lm = results.poseLandmarks;
        const leftWrist = lm?.[POSE_LANDMARKS.LEFT_WRIST];
        const rightWrist = lm?.[POSE_LANDMARKS.RIGHT_WRIST];
        const leftShoulder = lm?.[POSE_LANDMARKS.LEFT_SHOULDER];
        const rightShoulder = lm?.[POSE_LANDMARKS.RIGHT_SHOULDER];
        const leftUp = leftWrist && leftShoulder ? leftWrist.y < leftShoulder.y - 0.05 : false;
        const rightUp = rightWrist && rightShoulder ? rightWrist.y < rightShoulder.y - 0.05 : false;
        const now = performance.now();
        // Compute torso center when available
        const hasShoulders = !!(leftShoulder && rightShoulder);
        const centerX = hasShoulders ? (leftShoulder!.x + rightShoulder!.x) / 2 : 0.5;
        const centerY = hasShoulders ? (leftShoulder!.y + rightShoulder!.y) / 2 : 0.5;
        const inCenterBand = centerX >= CENTER_MIN && centerX <= CENTER_MAX;
        const inSoftLock = now < lockUntil;
        const withinLockTol = inSoftLock
          ? Math.abs(centerX - lockAnchorX) <= LOCK_TOL && Math.abs(centerY - lockAnchorY) <= LOCK_TOL
          : true;
        let s = 'Arms not raised';
        if (leftUp && rightUp) {
          if (bothUpSince === 0) bothUpSince = now;
          if (now - bothUpSince >= HOLD_MS && inCenterBand && withinLockTol) {
            s = 'Both Arms Raised';
            // Establish/refresh soft lock when accepted
            lockAnchorX = centerX;
            lockAnchorY = centerY;
            lockUntil = now + LOCK_MS;
          } else {
            s = 'Single Arm Raised';
          }
        } else {
          bothUpSince = 0;
          if (leftUp || rightUp) s = 'Single Arm Raised';
        }
        status = s;
        dispatch('status', s);
        draw(results);
      });

      camera = new Camera(videoEl as HTMLVideoElement, {
        onFrame: async () => {
          if (pose && videoEl) {
            await pose.send({ image: videoEl });
          }
        },
        width: 640,
        height: 480
      });
      await camera.start();
      status = 'Detecting…';
    } catch (e) {
      console.error('[GestureDetector] init error', e);
      status = 'Camera unavailable';
    }
  });

  onDestroy(() => {
    try { camera?.stop(); } catch {}
    try { (pose as any)?.close?.(); } catch {}
  });
</script>

<div class="wrap">
  <video bind:this={videoEl} class="hidden" autoplay muted playsinline></video>
  <canvas bind:this={canvasEl} class="preview"></canvas>
  <div class="label">{status}</div>
</div>

<style>
  .wrap { display: grid; gap: 8px; justify-items: center; }
  .preview { width: 320px; height: auto; border-radius: 8px; border: 1px solid #45a29e33; background: #0b0c10; }
  .hidden { display: none; }
  .label { color: #9fd9d6; font-size: 12px; }
</style>
