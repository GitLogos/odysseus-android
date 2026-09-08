# App icon source

Drop the launcher logo here as **`icon.png`** (1024×1024 PNG).

- The next build picks it up automatically (`npm run mobile:assets` in CI,
  skipped while the file is absent) and generates all Android
  `mipmap-*` densities (legacy + adaptive; background forced white to match
  the logo's backdrop).
- Nothing else (splash, theme, config) is touched by icon generation.
