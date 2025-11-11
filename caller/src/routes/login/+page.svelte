<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  let email = '';
  let password = '';
  let errorMsg = '';
  let loading = false;
  let status: number | null = null;
  let redirected = false;
  let redirectUrl = '';
  let responseText = '';
  let debugOpen = false;
  let fetchError = '';
  let tookMs: number | null = null;
  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    errorMsg = '';
    fetchError = '';
    status = null;
    redirected = false;
    redirectUrl = '';
    responseText = '';
    tookMs = null;
    loading = true;
    const started = performance.now();
    console.groupCollapsed('[Login] supabase.auth.signInWithPassword');
    console.log('payload', { email });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        status = 401;
        errorMsg = error.message || 'Login failed';
        responseText = JSON.stringify({ error: error.message }, null, 2);
        console.warn('signIn error', error);
      } else {
        status = 200;
        responseText = JSON.stringify({ user: data.user?.email, expires_at: data.session?.expires_at }, null, 2);
        redirected = true;
        redirectUrl = '/';
        window.location.href = '/';
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fetchError = msg;
      console.error('fetch error', err);
    } finally {
      tookMs = Math.round(performance.now() - started);
      console.log('tookMs', tookMs);
      console.groupEnd();
      loading = false;
      debugOpen = true;
    }
  }
</script>

<svelte:head>
  <title>Login</title>
</svelte:head>

<div class="wrap">
  <form class="card" on:submit|preventDefault={onSubmit}>
    <h1>Sign in</h1>
    {#if errorMsg}
      <p class="err">{errorMsg}</p>
    {/if}
    {#if fetchError}
      <p class="err">{fetchError}</p>
    {/if}
    <label>
      <span>Email</span>
      <input type="email" bind:value={email} required />
    </label>
    <label>
      <span>Password</span>
      <input type="password" bind:value={password} required />
    </label>
    <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Login'}</button>

    <details class="dbg" bind:open={debugOpen}>
      <summary>Debug</summary>
      <div class="grid">
        <div><b>Status</b><div>{status ?? '-'}</div></div>
        <div><b>Redirected</b><div>{redirected ? 'yes' : 'no'}</div></div>
        <div><b>URL</b><div class="mono">{redirectUrl || '-'}</div></div>
        <div><b>Took</b><div>{tookMs ? `${tookMs} ms` : '-'}</div></div>
      </div>
      <b>Response</b>
      <pre class="mono preview">{responseText || '(empty)'}</pre>
    </details>
  </form>
</div>

<style>
  .wrap { min-height: 100vh; display: grid; place-items: center; background: #0b0c10; }
  .card { width: 320px; padding: 24px; border-radius: 12px; background: #1f2833; color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.3); }
  h1 { margin: 0 0 16px; font-size: 20px; }
  label { display: grid; gap: 6px; margin: 12px 0; }
  input { padding: 10px 12px; border-radius: 8px; border: 1px solid #45a29e55; background: #0b0c10; color: #fff; }
  button { margin-top: 12px; width: 100%; padding: 10px 12px; border: 0; border-radius: 8px; background: #45a29e; color: #0b0c10; font-weight: 700; cursor: pointer; }
  .err { background: #ff4d4d22; color: #ffb3b3; padding: 8px 10px; border-radius: 6px; }
  .dbg { margin-top: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; margin: 8px 0 12px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; word-break: break-all; }
  .preview { max-height: 180px; overflow: auto; background: #0b0c10; border: 1px solid #45a29e33; padding: 8px; border-radius: 8px; }
</style>
