import { writable, get } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';

export type SpinnerItem = {
  id: string;
  label: string;
  is_active: boolean;
  chance?: number;
};

export const spinnerItems = writable<SpinnerItem[]>([]);
export const spinnerLoading = writable<boolean>(false);
export const spinnerError = writable<string>('');

let loadedOnce = false;

export async function refreshSpinnerItems(force = false) {
  if (get(spinnerLoading)) return;
  if (loadedOnce && !force && get(spinnerItems).length) return;
  spinnerLoading.set(true);
  spinnerError.set('');
  try {
    const { data, error } = await supabase
      .from('spinner_items')
      .select('id,label,is_active,chance')
      .eq('is_active', true)
      .order('label', { ascending: true });
    if (error) throw error;
    spinnerItems.set(data ?? []);
    loadedOnce = true;
  } catch (e: unknown) {
    spinnerError.set(e instanceof Error ? e.message : String(e));
  } finally {
    spinnerLoading.set(false);
  }
}
