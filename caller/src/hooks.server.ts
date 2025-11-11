import type { Handle } from '@sveltejs/kit';
export const handle: Handle = async ({ event, resolve }) => {
  // Client-side auth: no SSR checks or redirects.
  event.locals.user = null;
  return resolve(event);
};
