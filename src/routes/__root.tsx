import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { LinkHTMLAttributes, MetaHTMLAttributes } from "react";

const SITE_URL = "https://deepsearch.ing";
const SITE_NAME = "DeepSearch";
const TITLE = "DeepSearch — search the web, directly";
const DESCRIPTION =
  "Ranked web results with source metadata, straight from the DeepSeek Search API. Your API key stays in your browser; searches never pass through our servers.";
const IMAGE = `${SITE_URL}/og.png`;
const IMAGE_ALT = "DeepSearch — ranked web results from the DeepSeek Search API";

const META: MetaHTMLAttributes<HTMLMetaElement>[] = [
  { charSet: "utf-8" },
  { name: "viewport", content: "width=device-width, initial-scale=1" },
  { title: TITLE },
  { name: "description", content: DESCRIPTION },
  { name: "theme-color", content: "#0562EF" },
  { name: "color-scheme", content: "light" },
  { name: "robots", content: "index, follow, max-image-preview:large" },
  { name: "author", content: SITE_NAME },

  { property: "og:type", content: "website" },
  { property: "og:site_name", content: SITE_NAME },
  { property: "og:title", content: TITLE },
  { property: "og:description", content: DESCRIPTION },
  { property: "og:url", content: `${SITE_URL}/` },
  { property: "og:locale", content: "en_US" },
  { property: "og:image", content: IMAGE },
  { property: "og:image:type", content: "image/png" },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { property: "og:image:alt", content: IMAGE_ALT },

  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: TITLE },
  { name: "twitter:description", content: DESCRIPTION },
  { name: "twitter:image", content: IMAGE },
  { name: "twitter:image:alt", content: IMAGE_ALT },
];

const LINKS: LinkHTMLAttributes<HTMLLinkElement>[] = [
  { rel: "canonical", href: `${SITE_URL}/` },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

/**
 * The document shell and the site's share/search metadata. `HeadContent` and
 * `Scripts` are what make the SSR output hydrate and carry the client bundle.
 */
export const Route = createRootRoute({
  head: () => ({ meta: META, links: LINKS }),
  component: Root,
});

function Root() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
