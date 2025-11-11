<script lang="ts">
    import { onMount } from "svelte";

    export let phase: string = "Idle";
    export let isPrize: boolean = false;
    export let isTryAgain: boolean = false;
    export let matchCount: number = 0;
    let preferMp4 = false;
    onMount(() => {
        // Prefer mp4 on macOS (Safari), prefer webm elsewhere (e.g., Windows/Chrome)
        try {
            const ua = navigator.userAgent || "";
            const plat =
                (navigator as any).userAgentData?.platform ||
                navigator.platform ||
                "";
            preferMp4 =
                /Mac|iPhone|iPad|iPod/i.test(plat) || /Mac OS X/i.test(ua);
        } catch {}
    });

    $: isMedium = isPrize || isTryAgain;
    $: videoBase = isPrize ? 'winning' : (isTryAgain ? 'try_again' : 'raise_2');
</script>

{#if isPrize}

{:else if isTryAgain}
  <video class="overlay medium" autoplay loop muted playsinline preload="auto"
    on:error={(e) => {
      const src = (e.currentTarget as HTMLVideoElement)?.querySelector('source')?.src;
      console.error('[OverlayVideo] try-again video error', { src, href: window.location.href, baseURI: document.baseURI });
    }}
  >
    {#if preferMp4}
      <source src={`try_again.mp4`} type="video/mp4" />
    {:else}
      <source src={`try_again.webm`} type="video/webm" />
    {/if}
  </video>
{:else}
  <video class="overlay {phase === 'Idle' ? 'idle' : 'mini'}" autoplay loop muted playsinline preload="auto"
    on:error={(e) => {
      const src = (e.currentTarget as HTMLVideoElement)?.querySelector('source')?.src;
      console.error('[OverlayVideo] base video error', { src, href: window.location.href, baseURI: document.baseURI });
    }}
  >
    {#if preferMp4}
      <source src={`raise_2.mp4`} type="video/mp4" />
    {:else}
      <source src={`raise_2.webm`} type="video/webm" />
    {/if}
  </video>
{/if}

<style>
    .overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        z-index: 4;
        pointer-events: none;
    }
    .overlay.mini {
        display: none;
        width: 30%;
        height: auto;
        left: 10px;
        /* transform: translateX(50%); */
        bottom: 20px;
        inset-inline: auto;
        inset-block-start: auto;
    }
    .overlay.medium {
        width: 50%;
        height: auto;
        left: 25%;
        bottom: 70px;
        inset-inline: auto;
        inset-block-start: auto;
    }
    .overlay.win {
        width: 30%;
        height: auto;
        left: 10px;
        bottom: 200px;
        inset-inline: auto;
        inset-block-start: auto;
    }
</style>
