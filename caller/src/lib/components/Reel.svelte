<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    type Item = {
        id: string;
        label: string;
    };

    export let items: Item[] = [];
    export let target: number = 0; // index in items to center when stopped
    export let spin: boolean = false;
    export let stop: boolean = false;
    export let speedScale: number = 1; // 1 = normal, <1 slower, >1 faster
    export let highlight: boolean = false; // control whether to show center highlight
    export let dim: boolean = false; // when true and not highlighted, darken the middle cell

    let lastSpin = spin;
    let lastStop = stop;
    let lastTarget = target;
    const dispatch = createEventDispatcher<{
        stopped: { centerIndex: number; item: Item };
    }>();

    // simple ticker-based spin
    let raf = 0;
    let offset = 0; // float index (items)
    let baseSpeed = 2; // items per second (randomized per reel when spin starts)
    let phase: "idle" | "spinning" | "decel" | "bounce" | "stopped" = "idle";
    let decelStart = 0;
    let decelDuration = 1000; // ms
    let offsetStart = 0;
    let offsetGoal = 0;

    

    // per-reel shuffled order of indices to avoid feeling rigged
    let order: number[] = [];
    function shuffleIndices(n: number) {
        const arr = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    $: (function syncOrder() {
        const n = Math.max(items.length, 0);
        if (n && order.length !== n) {
            order = shuffleIndices(n);
        }
    })();

    function sequence(): Array<{ key: string; it: Item | { id: ""; label: string } }> {
        const n = Math.max(items.length, 1);
        const seq: Array<{ key: string; it: Item | { id: ""; label: string } }> = [];
        for (let i = 0; i < n + 3; i++) {
            const idxInOrder = order.length === n ? order[i % n] : i % n;
            const it: Item | { id: ""; label: string } = items[idxInOrder] ?? { id: "", label: "—" };
            const key = `${(it as Item).id ?? 'placeholder'}-${i}`;
            seq.push({ key, it });
        }
        return seq;
    }

    // derived scroll position relative to full cycle (items)
    $: nItems = Math.max(items.length, 1);
    $: rel = ((offset % nItems) + nItems) % nItems; // 0..nItems
    $: topIndex = Math.floor(rel);

    // sizing tied to reel height
    let reelEl: HTMLDivElement | null = null;
    let cellPx = 0;
    function updateSizes() {
        if (reelEl) {
            const cs = getComputedStyle(reelEl);
            const pt = parseFloat(cs.paddingTop || "0");
            const pb = parseFloat(cs.paddingBottom || "0");
            const contentH = reelEl.clientHeight - pt - pb;
            cellPx = Math.max(0, contentH / 3);
        }
    }
    let ro: ResizeObserver | null = null;

    function easeOutCubic(t: number) {
        return 1 - Math.pow(1 - t, 3);
    }
    function easeOutBack(t: number) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    

    // React to prop changes
    $: (function handleSpinStopChanges() {
        const n = Math.max(items.length, 1);
        if (spin && phase === "idle") {
            baseSpeed = (3 + Math.random() * 7) * Math.max(0.1, speedScale); // 3-10 ips scaled
            phase = "spinning";
            
        }
        if (spin && !stop && phase === "stopped") {
            // restarting from stopped
            baseSpeed = (3 + Math.random() * 7) * Math.max(0.1, speedScale); // scaled
            phase = "spinning";
            
        }
        if (stop && phase === "spinning") {
            // Short ease-out-back bounce to current center
            const currentRel = ((offset % n) + n) % n;
            const targetTop = Math.floor(currentRel);
            offsetStart = offset;
            offsetGoal = Math.floor(offset / n) * n + targetTop;
            decelStart = performance.now();
            decelDuration = 220; // quick bounce
            phase = "bounce";
        }
        if (!spin && !stop && phase !== "idle") {
            // reset if both are false
            phase = "idle";
        }
        // Ensure when stop is true and not spinning, snap to current center
        if (stop && !spin && (phase === "idle" || phase === "stopped")) {
            const currentRel = ((offset % n) + n) % n;
            const targetTop = Math.floor(currentRel);
            offset = Math.floor(offset / n) * n + targetTop; // align so center remains
            phase = "stopped";
            const topIndex = ((Math.floor(offset) % n) + n) % n; // within order
            const centerWithin = (topIndex + 1) % n;
            const centerIndex =
                order.length === n ? order[centerWithin] : centerWithin;
            const item = items[centerIndex] ?? {
                id: "ph",
                label: "—",
                image_url: "",
            };
            dispatch("stopped", { centerIndex, item });
        }
    })();

    $: if (spin !== lastSpin || stop !== lastStop || target !== lastTarget) {
        lastSpin = spin;
        lastStop = stop;
        lastTarget = target;
    }

    function tick(ts: number) {
        // use Date.now delta via closure
        const now = performance.now();
        const dt = now - lastTime;
        if (items.length > 0) {
            if (phase === "spinning") {
                // advance offset in item units per frame, add slight jitter to mimic inertia variations
                const jitter = 0.96 + Math.random() * 0.08; // 0.96 - 1.04
                offset += ((baseSpeed * jitter) / 1000) * dt;
            } else if (phase === "decel") {
                const t = Math.min(1, (now - decelStart) / decelDuration);
                const k = easeOutCubic(t);
                offset = offsetStart + (offsetGoal - offsetStart) * k;
                if (t >= 1) {
                    phase = "stopped";
                    // snap to goal to avoid rounding drift
                    offset = offsetGoal;
                    const n = Math.max(items.length, 1);
                    const topIdx = ((Math.floor(offset) % n) + n) % n;
                    const centerWithin = (topIdx + 1) % n;
                    const centerIndex =
                        order.length === n ? order[centerWithin] : centerWithin;
                    const item = items[centerIndex] ?? {
                        id: "ph",
                        label: "—",
                        image_url: "",
                    };
                    dispatch("stopped", { centerIndex, item });
                }
            } else if (phase === "bounce") {
                const t = Math.min(1, (now - decelStart) / decelDuration);
                const k = easeOutBack(t);
                offset = offsetStart + (offsetGoal - offsetStart) * k;
                if (t >= 1) {
                    phase = "stopped";
                    offset = offsetGoal;
                    const n = Math.max(items.length, 1);
                    const topIdx = ((Math.floor(offset) % n) + n) % n;
                    const centerWithin = (topIdx + 1) % n;
                    const centerIndex =
                        order.length === n ? order[centerWithin] : centerWithin;
                    const item = items[centerIndex] ?? {
                        id: "ph",
                        label: "—",
                        image_url: "",
                    };
                    dispatch("stopped", { centerIndex, item });
                }
            }
        }
        lastTime = now;
        raf = requestAnimationFrame(tick);
    }

    let lastTime = performance.now();
    onMount(() => {
        lastTime = performance.now();
        raf = requestAnimationFrame(tick);
        updateSizes();
        try {
            ro = new ResizeObserver(updateSizes);
            if (reelEl) ro.observe(reelEl);
        } catch {}
        return () => {
            cancelAnimationFrame(raf);
            try {
                ro?.disconnect();
            } catch {}
        };
    });
    onDestroy(() => cancelAnimationFrame(raf));

    // Choose video codec per platform
    let preferMp4 = false;
    onMount(() => {
        try {
            const ua = navigator.userAgent || "";
            const plat = (navigator as any).userAgentData?.platform || navigator.platform || "";
            preferMp4 = /Mac|iPhone|iPad|iPod/i.test(plat) || /Mac OS X/i.test(ua);
        } catch {}
    });
</script>

<div class="reel" bind:this={reelEl}>
    <div
        class="stack"
        style={`height:${cellPx * (Math.max(items.length, 1) + 3)}px; transform: translateY(${-rel * cellPx}px)`}
    >
        {#each sequence() as row, i (row.key)}
            <div
                class="cell {(i === topIndex + 1 && !highlight && dim) ? 'mid' : ''} {i === topIndex + 1 && highlight ? 'center' : ''}"
                style={`height:${cellPx}px`}
            >
                <div class="tile">
                    {#if row.it.id}
                        <video class="tilevid" autoplay loop muted playsinline preload="metadata">
                            {#if preferMp4}
                                <source src={`${row.it.id}.mp4`} type="video/mp4" />
                            {:else}
                                <source src={`${row.it.id}.webm`} type="video/webm" />
                            {/if}
                        </video>
                    {:else}
                        <div class="tilevid"></div>
                    {/if}
                    <div class="shadow"></div>
                </div>
            </div>
        {/each}
    </div>
    <aside></aside>
    <!-- <div class="dbg">{phase} · {rel.toFixed(2)}</div> -->
</div>

<style>
    .reel {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 3;
        overflow: hidden;
        border-radius: 16px;
        background: #ffffff;
        display: block;
        box-sizing: border-box;

        border: 2px solid #ff6600;
    }
    aside {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
            to bottom,
            rgb(0, 0, 0, 0.6) 0%,
            rgb(0, 0, 0,0.2) 15%,
            rgba(255,111,0,0) 30%,
            rgba(255,111,0,0) 70%,
            rgba(0,0,0,0.2) 85%,
            rgba(0,0,0,0.6) 100%
        );
    }
    .stack {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        will-change: transform, height;
    }
    .cell {
        position: relative;
        width: 100%;
        box-sizing: border-box;
        padding: 8px;
    }
    .shadow {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
    /* Middle cell default (no match) - 50% black overlay */
    .cell.mid .tile .shadow { background: rgba(0,0,0,.5); border-radius: 16px; }
    /* Center highlight as an inner shadow on the image (when highlight=true) */
    .cell.center .tile .shadow {
        box-shadow: inset 0 0 5px 6px #ff8a00;
        border-radius: 16px;
        background: none;
    }
    .tile {
        position: relative;
        width: 100%;
        height: 100%;
        background: #F7F7F7;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    .tilevid {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
    }
</style>
