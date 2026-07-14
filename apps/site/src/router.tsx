import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { NotFound } from '@/components/not-found';

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    basepath: import.meta.env.BASE_URL?.replace(/\/$/, '') || undefined,
    defaultPreload: 'intent',
    scrollRestoration: true,
    scrollToTopSelectors: ['#nd-page'],
    // Any unknown URL — an unmatched route (notFound) or a missing docs page
    // whose static loader fails — redirects to the home page instead of
    // showing a 404 or error screen.
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: NotFound,
  });
}
