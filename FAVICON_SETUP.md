# Favicon and App Icon

SavedTube uses the Next.js App Router file-based icon convention. No separate `public/favicon.ico` is required.

## Current setup

| Asset | Location | Purpose |
|-------|----------|---------|
| App icon | `src/app/icon.svg` | Served automatically by Next.js |
| Logo (light) | `public/savedtube-logo-light.svg` | UI branding |
| Logo (dark) | `public/savedtube-logo-dark.svg` | UI branding |
| Logo component | `src/components/Logo.tsx` | Reused across pages |

Metadata in `src/app/layout.tsx`:

```typescript
icons: {
  icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  shortcut: '/icon.svg',
  apple: '/icon.svg',
},
```

## Logo placement

- Landing page — large logo in hero
- Dashboard — medium logo in navigation
- Playlist pages — medium logo in navigation
- Footer — small icon-only logo

## Optional: multi-format favicons

If you need `.ico` or PNG fallbacks for older browsers, generate them from `src/app/icon.svg` and place in `public/`:

```bash
# With ImageMagick
convert src/app/icon.svg -resize 32x32 public/favicon-32x32.png
convert src/app/icon.svg -resize 16x16 public/favicon-16x16.png
```

Then extend the `icons` array in `layout.tsx` with the additional sizes. This is optional — the SVG icon works in all modern browsers.

## Online generator

[realfavicongenerator.net](https://realfavicongenerator.net/) can produce a full favicon package from the SVG if you want apple-touch-icon and web manifest files.
