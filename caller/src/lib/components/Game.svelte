<script lang="ts">
  import { onMount } from 'svelte';
  type SpinnerItem = { id: string; label: string; is_active: boolean; chance?: number };
  import Reel from '$lib/components/Reel.svelte';
  import { assets } from '$app/paths';
  import { supabase } from '$lib/supabaseClient';

  // Hardcoded spinner items
  const STATIC_ITEMS: SpinnerItem[] = [
    { id: '10_off', label: 'PHP 10 off!', is_active: true, chance: 10 },
    { id: '20_off', label: 'PHP 20 off!', is_active: true, chance: 5 },
    { id: 'add_toppings', label: 'Free Additional Toppings', is_active: true, chance: 5 },
    { id: 'chao_fan', label: 'Free Ala Carte Chao Fan', is_active: true, chance: 4 },
    { id: 'chongee', label: 'Free Chongee', is_active: true, chance: 3 },
    { id: 'double_bao', label: 'Free 1 Order Bao', is_active: true, chance: 1 },
    { id: 'egg', label: 'Free Egg', is_active: true, chance: 1 },
    { id: 'pineapple_juice', label: 'Free Pineapple Juice', is_active: true, chance: 1 },
    { id: 'single_bao', label: 'Free 1pc Bao', is_active: true, chance: 1 },
    { id: 'sweet_potato_fries', label: 'Free Sweet Potato Fries', is_active: true, chance: 3 }
  ];
  let items: SpinnerItem[] = STATIC_ITEMS.filter(i => i.is_active);
  let loading = false;
  let errorMsg = '';

  export let actionSignal: number = 0; // parent increments to trigger Do Action
  let lastActionSignal = actionSignal;

  type Phase = 'Idle' | 'Spinning' | 'Stop1' | 'Stop2' | 'Stop3' | 'Result';
  export let phase: Phase = 'Idle';
  let targets: number[] = [0, 1, 2];
  $: stopsCount = (phase === 'Spinning' ? 0 : phase === 'Stop1' ? 1 : phase === 'Stop2' ? 2 : phase === 'Stop3' ? 3 : 3);
  // Stop-captured results for the three reels
  let stoppedResults: ({ id: string; label: string } | null)[] = [null, null, null];
  let savedThisRound = false;
  $: idToIndex = new Map(items.map((it, i) => [it.id, i] as const));
  let highlights: [boolean, boolean, boolean] = [false, false, false];
  let dimCenters = false;
  // Expose match count to parent (0 when none, 2 for a pair, 3 for three of a kind)
  export let matchCount: 0 | 2 | 3 = 0;
  export let drawCode: string = '';
  export let winningImage: string = '';
  export let winningId: string = '';
  export let winningLabel: string = '';
  export let speedScale: number = 0.4;
  let roundId = 0; // increments to force reel remount

  function resetHighlights() {
    highlights = [false, false, false];
    dimCenters = false;
  }

  const asset = assets && assets.endsWith('/') ? assets : `${assets || ''}/`;
  function updateHighlights() {
    // Only highlight if we have at least two matching center items
    const ids = stoppedResults.map((r) => r?.id || null);
    if (!ids[0] || !ids[1] || !ids[2]) { highlights = [false, false, false]; return; }
    const counts = new Map<string, number>();
    for (const id of ids as string[]) counts.set(id, (counts.get(id) || 0) + 1);
    let winner: string | null = null;
    for (const [k, v] of counts) { if (v >= 2) { winner = k; break; } }
    if (!winner) { highlights = [false, false, false]; dimCenters = true; matchCount = 0; winningImage = ''; winningId = ''; winningLabel = ''; return; }
    highlights = [ids[0] === winner, ids[1] === winner, ids[2] === winner] as [boolean, boolean, boolean];
    dimCenters = false;
    // compute match count (2 or 3)
    const cnt = (ids as string[]).filter((id) => id === winner).length;
    matchCount = cnt === 3 ? 3 : 2;
    // set winning image path and winning id only for 3-of-a-kind
    winningImage = matchCount === 3 ? `${asset}items/${winner}.png` : '';
    winningId = matchCount === 3 ? winner : '';
    winningLabel = matchCount === 3 ? ((stoppedResults.find(r => r?.id === winner)?.label) || '') : '';
  }

  function randTarget() {
    const n = Math.max(items.length, 1);
    return Math.floor(Math.random() * n);
  }

  async function startSpin() {
    // Start spinning immediately for visual feedback
    phase = 'Spinning';
    // Clear previous captured results
    stoppedResults = [null, null, null];
    savedThisRound = false;
    resetHighlights();
    matchCount = 0;
    drawCode = '';
    winningImage = '';
    winningId = '';
    winningLabel = '';
    // Randomize targets for all reels to avoid snapping to same indices across rounds
    targets = [randTarget(), randTarget(), randTarget()];
    roundId += 1;
  }

  function doAction() {
    switch (phase) {
      case 'Idle':
        startSpin();
        break;
      case 'Spinning':
        phase = 'Stop1';
        break;
      case 'Stop1':
        phase = 'Stop2';
        break;
      case 'Stop2':
        phase = 'Stop3';
        break;
      case 'Stop3':
        // If there's a prize, advance to Result, otherwise restart immediately
        if (matchCount >= 2) {
          phase = 'Result';
        } else {
          void startSpin();
        }
        break;
      case 'Result':
        void startSpin();
        break;
    }
  }

  // React to external actionSignal changes
  $: if (actionSignal !== lastActionSignal) {
    lastActionSignal = actionSignal;
    doAction();
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') doAction();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });


  // Optional: labels of captured items during current spin
  $: selectedLabels = stoppedResults.map((r) => r?.label ?? '—');

  // Capture helpers for reel stop events
  function onReelStopped(i: number, e: CustomEvent<{ centerIndex: number; item: { id: string; label: string } }>) {
    const item = e.detail.item as { id: string; label: string };
    if (item && item.id) {
      stoppedResults[i] = { id: item.id, label: item.label };
    }
    // If third stop phase is active (or beyond) and all reels have stopped, save once
    if (stoppedResults[0] && stoppedResults[1] && stoppedResults[2]) {
      updateHighlights();
    }
    if (!savedThisRound && stoppedResults[0] && stoppedResults[1] && stoppedResults[2] && (phase === 'Stop3' || phase === 'Result')) {
      const [r1, r2, r3] = stoppedResults as [{ id: string; label: string }, { id: string; label: string }, { id: string; label: string }];
      savedThisRound = true;
      const bytes = self.crypto?.getRandomValues ? Array.from(self.crypto.getRandomValues(new Uint8Array(3))) : Array.from({ length: 3 }, () => Math.floor(Math.random() * 256));
      const code = bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      drawCode = code;
      const payload = { draw_1: r1.id, draw_2: r2.id, draw_3: r3.id, is_forced: false, code } as const;
      (async () => {
        try {
          const { error } = await supabase.from('spinner_draws').insert(payload);
          if (error) throw error;
        } catch {
          // Fallback: try Tauri fs via global, else localStorage
          try {
            const anyWin: any = window as any;
            const fs = anyWin.__TAURI__?.fs;
            const base = anyWin.__TAURI__?.path?.BaseDirectory || anyWin.__TAURI__?.fs?.BaseDirectory;
            const dir = 'baoz_logs';
            const file = `${dir}/spinner_draws_fallback.csv`;
            const header = 'timestamp,draw_1,draw_2,draw_3,is_forced,code\n';
            const line = `${new Date().toISOString()},${payload.draw_1},${payload.draw_2},${payload.draw_3},${payload.is_forced},${payload.code}\n`;
            if (fs && base) {
              const hasDir = await fs.exists(dir, { dir: base.Document });
              if (!hasDir) await fs.createDir(dir, { dir: base.Document, recursive: true });
              const hasFile = await fs.exists(file, { dir: base.Document });
              if (hasFile) {
                const prev = await fs.readTextFile(file, { dir: base.Document });
                await fs.writeTextFile({ path: file, contents: prev + line }, { dir: base.Document });
              } else {
                await fs.writeTextFile({ path: file, contents: header + line }, { dir: base.Document });
              }
            } else {
              const key = 'spinner_draws_fallback.csv';
              const prev = localStorage.getItem(key) ?? header;
              localStorage.setItem(key, prev + line);
            }
          } catch {
            // swallow
          }
        }
      })();
    }
  }
  
</script>

{#if loading}
  <div class="stage">
    {#each Array(3) as _, col}
      <div class="reel skeleton">
        {#each Array(3) as __, row}
          <div class="cell sk"></div>
        {/each}
      </div>
    {/each}
  </div>
{:else if errorMsg}
  <div class="status err">{errorMsg}</div>
{:else}
  <div class="game-wrap">
    <div class="stage">
      {#key roundId}
        {#if phase === 'Idle'}
          <Reel items={items} target={0} spin={false} stop={true} speedScale={speedScale} highlight={highlights[0]} dim={dimCenters} on:stopped={(e) => onReelStopped(0, e)} />
          <Reel items={items} target={1} spin={false} stop={true} speedScale={speedScale} highlight={highlights[1]} dim={dimCenters} on:stopped={(e) => onReelStopped(1, e)} />
          <Reel items={items} target={2} spin={false} stop={true} speedScale={speedScale} highlight={highlights[2]} dim={dimCenters} on:stopped={(e) => onReelStopped(2, e)} />
        {:else}
          <Reel items={items} target={targets[0]} spin={true} stop={stopsCount > 0} speedScale={speedScale} highlight={highlights[0]} dim={dimCenters} on:stopped={(e) => onReelStopped(0, e)} />
          <Reel items={items} target={targets[1]} spin={true} stop={stopsCount > 1} speedScale={speedScale} highlight={highlights[1]} dim={dimCenters} on:stopped={(e) => onReelStopped(1, e)} />
          <Reel items={items} target={targets[2]} spin={true} stop={stopsCount > 2} speedScale={speedScale} highlight={highlights[2]} dim={dimCenters} on:stopped={(e) => onReelStopped(2, e)} />
        {/if}
      {/key}
    </div>
  </div>
{/if}

<style>
  .status { color: #9fd9d6; font-size: 14px; text-align: center; }
  .status.err { color: #ffb3b3; }
  .game-wrap { position: relative; width: 100%; }
  .stage {
    width: 90vw;
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  
  /* Reel styling now lives in Reel.svelte */
  /* Skeleton styles */
  .skeleton { border-color: #2b3a3a; background: #0b0c10; }
  .cell.sk { background: linear-gradient(90deg, #1a2024 25%, #243036 50%, #1a2024 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @media (max-width: 640px) {
    .stage { gap: 8px; }
  }
</style>
