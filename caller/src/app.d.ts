// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces

declare namespace App {
  interface Locals {
    user: import('@supabase/supabase-js').User | null;
  }
  interface PageData {
    session?: import('@supabase/supabase-js').User | null;
  }
}
