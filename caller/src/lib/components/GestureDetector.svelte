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
        const s = classifyArms(results);
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
