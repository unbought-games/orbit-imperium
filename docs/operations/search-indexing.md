# Homepage discovery and search metadata

The HTTP server publishes `/robots.txt` and `/sitemap.xml` from `ORBIT_ORIGIN`.
The sitemap lists only `/`: authentication, universe routes and shared player
content are not discovery destinations. Keep the configured origin equal to the
public browser origin (including an explicit port when needed). Self-hosted
instances use their own URLs; request Host and Forwarded headers are not trusted
for canonical URLs or sitemap generation.

Anonymous `/` responses contain the search title and description, canonical,
Open Graph and Twitter card fields, and WebSite/VideoGame JSON-LD before JavaScript
runs. The shared template is `crates/transport-http/assets/home-head.html`; both
Rust and the browser consume it. It references the existing canonical hero asset.
There are no invented ratings, reviews, pricing or availability claims.

The server selects a separate built homepage entry only for anonymous home
requests. Its HTML is derived from index.html by the build, and Vite emits
independent script/preload graphs. Game routes retain their eager entry so
loading the public page faster does not delay game startup.
The browser's standalone anonymous landing entry uses the same presentation as
the routed home page and respects the server's registration flag. Authenticated,
unavailable, malformed and unknown bootstrap states retain the full game startup.
Homepage account links are ordinary links to the application entry routes.
The game startup and home lifecycle remove homepage metadata when leaving home.
Non-home application document responses have `X-Robots-Tag: noindex`; existing
stricter shared-report/alliance directives are preserved. Robots.txt permits
crawling so crawlers can read those directives and load required scripts/styles.
Authentication remains the access control for private data.

## Verify before publishing

```sh
npm run build
make test-homepage
npm run lint
npm run format:check
```

`test-homepage` exercises HTTP discovery/metadata boundaries, the anonymous
startup guard, and real browser landing/account navigation. Build validation
includes the shared template in the existing Rust Docker-stage `crates` copy.
The built homepage preloads the responsive hero and avoids loading the full
game startup when its embedded bootstrap is anonymous.

After deployment, verify the initial HTML (not just the rendered DOM), sitemap,
robots.txt, image URL and account/game route exclusions at the public origin.
Use Chrome Lighthouse against the anonymous production page on mobile and desktop.
A local build with fixture APIs is useful for development but does not establish
production latency or a real-user Core Web Vitals result. Lighthouse SEO scoring
is a limited checklist and does not guarantee indexing or search ranking.

For the official service, the Search Console domain property is already verified.
Submit `https://orbitimperium.com/sitemap.xml` only after the endpoint is live.
Then use URL Inspection's live test and inspect Google's rendered page. The
homepage indexing request was accepted on October 26, 2026; repeated submission
does not increase priority. Do not remove the DNS ownership-verification record.
