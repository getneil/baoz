<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { supabase } from "$lib/supabaseClient";
  import GestureDetector from "$lib/components/GestureDetector.svelte";
  import Game from "$lib/components/Game.svelte";
  import OverlayVideo from "$lib/components/OverlayVideo.svelte";
  import { assets } from "$app/paths";
  let email: string | null = null;
  let gestureStatus: string = "Detecting…";
  let actionSignal = 0;
  let wasBoth = false;
  const COOLDOWN_MS = 1000;
  let lastBothAt = 0;
  let phase: "Idle" | "Spinning" | "Stop1" | "Stop2" | "Stop3" | "Result" =
    "Idle";
  let matchCount: 0 | 2 | 3 = 0;
  let showGame = true;
  let resultTimer: ReturnType<typeof setTimeout> | null = null;
  let tryAgainTimer: ReturnType<typeof setTimeout> | null = null;
  let noPrizeTimer: ReturnType<typeof setTimeout> | null = null;
  let drawCode = "";
  let winningImage = "";
  let winningId = "";
  let winningLabel = "";
  let validSeconds = 300; // 5 minutes
  let nextSeconds = 30; // auto-reset to Idle
  let validTick: ReturnType<typeof setInterval> | null = null;
  let nextTick: ReturnType<typeof setInterval> | null = null;
  $: isPrize = phase === "Stop3" && matchCount >= 2;
  $: isTryAgain = phase === "Stop3" && matchCount < 2;
  let preferMp4 = false;
  let lowerBlink = false;
  // Speed control (1..5)
  let speedLevel = 4; // default matching current feel
  // Map: 1->0.30, 2->0.70, 3->0.80, 4->0.90, 5->1.00
  const speedMap: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0.3,
    2: 0.7,
    3: 0.8,
    4: 0.9,
    5: 1.0,
  };
  $: speedScale =
    speedMap[Math.max(1, Math.min(5, speedLevel)) as 1 | 2 | 3 | 4 | 5];
  onMount(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      email = data.user?.email ?? null;
    })();
    try {
      const ua = navigator.userAgent || "";
      const plat =
        (navigator as any).userAgentData?.platform || navigator.platform || "";
      preferMp4 = /Mac|iPhone|iPad|iPod/i.test(plat) || /Mac OS X/i.test(ua);
    } catch {}
    // keyboard speed control
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "5") {
        speedLevel = parseInt(e.key, 10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });
  function clearTimers() {
    if (resultTimer) {
      clearTimeout(resultTimer);
      resultTimer = null;
    }
    if (noPrizeTimer) {
      clearTimeout(noPrizeTimer);
      noPrizeTimer = null;
    }
    if (tryAgainTimer) {
      clearTimeout(tryAgainTimer);
      tryAgainTimer = null;
    }
    if (validTick) {
      clearInterval(validTick);
      validTick = null;
    }
    if (nextTick) {
      clearInterval(nextTick);
      nextTick = null;
    }
  }
  function onGesture(e: CustomEvent<string>) {
    gestureStatus = e.detail;
    const isBoth = gestureStatus.toLowerCase().includes("both arms");
    const rising = isBoth && !wasBoth;
    // Cooldown: ignore rising edges within COOLDOWN_MS
    if (rising) {
      const now = Date.now();
      if (now - lastBothAt < COOLDOWN_MS) {
        wasBoth = isBoth;
        // During cooldown, instruct to lower arms
        lowerBlink = true;
        raiseText = "lower arms";
        return;
      }
      lastBothAt = now;
    }
    // Block gestures when at Stop3 with a prize; wait until Idle
    if (phase === "Stop3" && matchCount >= 2) {
      wasBoth = isBoth;
      return;
    }
    // From Stop3 with no prize, a rising edge should restart the game
    if (phase === "Stop3" && matchCount < 2 && rising) {
      phase = "Spinning";
      showGame = true;
      actionSignal += 1;
      wasBoth = isBoth;
      return;
    }
    // From Idle, a rising edge of both-arms should mount the game and trigger start
    if (phase === "Idle" && rising) {
      // Switch out of Idle first so the Idle reactive block won't auto-hide the game
      phase = "Spinning";
      showGame = true;
      actionSignal += 1;
      wasBoth = isBoth;
      return;
    }
    if (rising) {
      actionSignal += 1;
    }
    wasBoth = isBoth;
    // Update instruction text based on cooldown window
    const now2 = Date.now();
    const inCooldown = now2 - lastBothAt < COOLDOWN_MS;
    if (inCooldown) {
      raiseText = "lower arms";
      lowerBlink = true;
    } else {
      raiseText = "raise arms";
      lowerBlink = false;
    }
  }

  // Reset visibility and timers when a new round starts
  $: if (phase === "Spinning" || phase === "Stop1" || phase === "Stop2") {
    showGame = true;
    clearTimers();
    validSeconds = 300;
    nextSeconds = 30;
  }

  // When we reach Stop3 with no prize, start a 10s timer to auto-reset back to Idle
  $: if (phase === "Stop3" && matchCount < 2 && !tryAgainTimer) {
    tryAgainTimer = setTimeout(() => {
      // Only reset to Idle if we are still in the try-again state when the timer fires
      if (phase === "Stop3" && matchCount < 2) {
        phase = "Idle";
      }
      tryAgainTimer = null;
    }, 10000);
  }

  // On Idle, hide the game and reset timers
  $: if (phase === "Idle") {
    showGame = false;
    clearTimers();
    validSeconds = 300;
    nextSeconds = 30;
  }

  // When we reach Stop3 and have a 2- or 3-match, wait before hiding the game
  $: if (phase === "Stop3" && matchCount >= 2 && showGame && !resultTimer) {
    resultTimer = setTimeout(() => {
      showGame = false;
      resultTimer = null;
    }, 3000);
  }

  // When we reach Stop3 with no prize, wait before hiding the game (showing try-again)
  $: if (phase === "Stop3" && matchCount < 2 && showGame && !noPrizeTimer) {
    noPrizeTimer = setTimeout(() => {
      showGame = false;
      noPrizeTimer = null;
    }, 3000);
  }

  // Ensure prize timers are running whenever we're at Stop3 with a prize
  $: if (phase === "Stop3" && matchCount >= 2) {
    if (!validTick) {
      validTick = setInterval(() => {
        if (validSeconds > 0) validSeconds -= 1;
        else {
          clearInterval(validTick!);
          validTick = null;
        }
      }, 1000);
    }
    if (!nextTick) {
      nextTick = setInterval(() => {
        if (nextSeconds > 0) nextSeconds -= 1;
        else {
          clearInterval(nextTick!);
          nextTick = null;
          phase = "Idle";
        }
      }, 1000);
    }
  }

  function mmss(total: number) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  let raiseText = "raise arms";
</script>

<main class="home">
  <section class="card">
    <header class="hero">
      <h1 class="brand">BAOZ</h1>
      <div class="tagline">
        {#if ["Spinning", "Stop1", "Stop2"].includes(phase)}
          <div class="spinning" style="margin-top: 20px"><span class={lowerBlink ? 'blink' : ''}>{raiseText}</span> again to stop a reel</div>
        {:else if phase === "Stop3" && matchCount < 2}
          <div class="try-again-message"><span class={lowerBlink ? 'blink' : ''}>{raiseText}</span> to try again</div>
        {:else if phase === "Idle"}
          <div class="idle">Win Free Food or Discounts</div>
          <div style="font-size: 30px;">
            just <b>raise your arms</b>, <br/> match 2 or 3 items in the middle to win
          </div>
        {/if}
      </div>
    </header>
    <div class="overlay-wrap">
      {#if showGame}
        <div transition:fade={{ duration: 500 }}>
          <Game
            {actionSignal}
            bind:phase
            bind:matchCount
            bind:drawCode
            bind:winningImage
            bind:winningId
            bind:winningLabel
            {speedScale}
          />
        </div>
      {:else if !showGame && phase === "Stop3" && matchCount < 2}
        <div class="result-view" transition:fade={{ duration: 500 }}>
          <video class="idle-img" autoplay loop muted playsinline preload="auto">
            {#if preferMp4}
              <source src={`try_again.mp4`} type="video/mp4" />
            {:else}
              <source src={`try_again.webm`} type="video/webm" />
            {/if}
          </video>
        </div>
      {:else if phase === "Idle"}
        <div class="result-view" transition:fade={{ duration: 500 }}>
          <video
            class="idle-img"
            autoplay
            loop
            muted
            playsinline
            preload="auto"
          >
            {#if preferMp4}
              <source src={`invite.mp4`} type="video/mp4" />
            {:else}
              <source src={`invite.webm`} type="video/webm" />
            {/if}
          </video>
        </div>
      {:else}
        <div class="result-view" transition:fade={{ duration: 500 }}>
          {#if matchCount === 2}
            <div class="result-won">
              You Matched 2 items! <br /> You get a consolation prize
            </div>
            <div class="consolation-prize">PHP 5 OFF</div>
          {:else if matchCount === 3}
            {#if winningId}
              <div class="result-won">You won!</div>
              <div class="prize-title">{winningLabel}</div>
              <video class="prize-img" autoplay loop muted playsinline>
                {#if preferMp4}
                  <source src={`${winningId}.mp4`} type="video/mp4" />
                {:else}
                  <source src={`${winningId}.webm`} type="video/webm" />
                {/if}
              </video>
            {/if}
          {/if}
          {#if drawCode}
            <div class="code">code: {drawCode}</div>
          {/if}
          <div class="valid">
            VALID WITHIN <strong>{mmss(validSeconds)}</strong> ONLY
          </div>
        </div>
      {/if}
    </div>
    <div class="gest">
      <GestureDetector on:status={onGesture} />
    </div>
  </section>
  <!-- <OverlayVideo {phase} {isPrize} {isTryAgain} {matchCount} /> -->
</main>

{#if !showGame && phase === "Stop3" && matchCount >= 2}
  <footer class="footer-countdown">
    <p>
      take a picture now, show it to our cashier <br /> to claim reward on purchase
      of any item
    </p>
    <div>{nextSeconds}s before next chance</div>
  </footer>
{/if}

<!-- Speed indicator (bottom-right) -->
<div class="speed-ind">
  {#each [1, 2, 3, 4, 5] as n}
    <span class="dot {n <= speedLevel ? 'on' : ''}"></span>
  {/each}
</div>

<style>
  .home {
    min-height: 100vh;
    height: 1360px;
    overflow-x: hidden;
    width: 100vw;
  }
  .tagline .idle {
    font-size: 60px;
  }
  .tagline .spinning {
    font-size: 40px;
  }
  .card {
    position: inherit;
    width: 100%;
  }
  .gest {
    position: fixed;
    top: 12px;
    right: 12px;
    display: grid;
    gap: 6px;
    justify-items: end;
    z-index: 5;
  }
  .overlay-wrap {
    position: relative;
    width: 100%;
    height: auto;
    margin-top: 50px;
  }
  .hero {
    position: relative;
    top: 30px;
    width: 100%;
    height: auto;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
    gap: 12px;
    z-index: 3;
    box-sizing: border-box;
  }
  .brand {
    margin: 0;
    font-size: clamp(40px, 8vw, 84px);
    line-height: 0.9;
    color: #fff;
    font-weight: 800;
    letter-spacing: 1px;
    font-family: Arial, Helvetica, sans-serif;
  }
  .tagline {
    grid-column: 1 / -1;
    color: #fff;
    text-align: center;
    font-weight: 800;
    font-size: clamp(30px, 3.4vw, 60px);
    font-family: Arial, Helvetica, sans-serif;
    line-height: 1.15;
    display: grid;
    gap: 8px;
    padding: 8px 0 16px;
    margin-top: 20px;
    overflow-wrap: anywhere;
  }
  :global(.gest canvas.preview) {
    width: 100%;
    max-width: 96px;
    height: auto;
  }
  .consolation-prize {
    font-size: 120px;
    margin-top: 20px;
    margin-bottom: 20px;
    line-height: 0.5;
    font-family: Arial, Helvetica, sans-serif;
  }
  .result-view {
    display: grid;
    place-items: center;
    gap: 12px;
  }
  .prize-img {
    width: 90vw;
    max-height: 60vh;
    object-fit: contain;
    border-radius: 16px;
  }
  .idle-img {
    width: 90vw;
    max-height: 60vh;
    object-fit: contain;
    border-radius: 16px;
    margin-top: 50px;
  }
  .code {
    font-size: 32px;
    margin-top: 8px;
    font-family: Arial, Helvetica, sans-serif;
  }
  .valid {
    font-size: 28px;
    margin-top: 4px;
    font-family: Arial, Helvetica, sans-serif;
  }
  .footer-countdown {
    position: fixed;
    bottom: 16px;
    width: 100%;
    text-align: center;
    font-size: 28px;
  }
  .footer-countdown p {
    font-size: 18px;
  }
  .footer-countdown div {
    font-size: 28px;
  }
  :global(html, body) {
    overflow-x: hidden;
  }
  :global(#svelte) {
    overflow-x: hidden;
  }

  .try-again-message {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    font-size: 36px;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 4px 6px rgba(0, 0, 0, 1);
  }

  .result-won {
    font-size: 60px;
    color: white;
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    margin-bottom: 8px;
  }
  .prize-title {
    font-size: 100px;
    color: white;
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    padding-left: 20px;
    padding-right: 20px;
  }

  /* Blink indicator for cooldown instruction */
  .blink {
    animation: blink-colors 1s step-start infinite;
    font-weight: 800;
  }
  @keyframes blink-colors {
    0%, 50% { color: #ff4d4f; }
    51%, 100% { color: #ffffff; }
  }

  /* Speed indicator */
  .speed-ind {
    position: fixed;
    right: 14px;
    bottom: 14px;
    display: grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 6px;
    z-index: 6;
  }
  .speed-ind .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2) inset;
  }
  .speed-ind .dot.on {
    background: #ffffff;
  }
  .speed-ind .speed-label {
    color: #fff;
    font-size: 10px;
    opacity: 0.7;
    margin-left: 4px;
    font-family: Arial, Helvetica, sans-serif;
  }
</style>
