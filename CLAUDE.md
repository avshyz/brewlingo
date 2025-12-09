# Brewlingo

A coffee vocabulary and recipe reference app for baristas. Static site built with Vite, featuring 3D WebGL effects and modern CSS.

## Quick Reference

```bash
npm run dev        # Start dev server (http://localhost:5173)
npm run build      # Build to dist/
npm run preview    # Preview production build
npm run generate-og # Regenerate OG image with Puppeteer
```

## Project Structure

```
brewlingo/
├── src/                    # Source files (Vite root)
│   ├── index.html          # Landing page with 3D coffee beans
│   ├── language.html       # Coffee tasting vocabulary guide
│   ├── recipe.html         # Pourover brewing baselines
│   ├── js/
│   │   ├── main.js         # Dialog/card interactions with View Transitions API
│   │   └── particles.js    # Three.js 3D coffee beans with CMYK shader
│   └── styles/
│       ├── main.css        # Global styles, CSS variables, components
│       └── frills.css      # Decorative border/frill styles
├── public/                 # Static assets (copied as-is)
│   ├── assets/             # Images, SVGs, favicon
│   └── js/
│       └── page-transitions.js  # View transition navigation handler
├── scripts/
│   └── generate-og-image.js     # Puppeteer script for OG image
├── dist/                   # Build output (git-ignored except for deploy)
└── vite.config.js          # Vite config with multi-page setup
```

## Architecture

### Pages (Multi-page Vite app)
- **index.html** - Landing with animated 3D coffee bean background
- **language.html** - Tasting vocabulary cards (10 categories: Aromatics, Clarity, Vibrancy, Acidity, Sweetness, Body, Definition, Structure, Finish, Aftertaste)
- **recipe.html** - Pourover baselines by altitude, processing, roast

### Key Technologies
- **Vite 6** - Build tool, dev server
- **Three.js** - 3D coffee beans on landing page
- **GSAP** - Bean entrance animations (elastic easing)
- **View Transitions API** - Page-to-page and card dialog animations
- **lil-gui** - Debug UI (enabled with `?d=1` query param)

### Styling Approach
- CSS custom properties for theming (see `:root` in main.css)
- Color palette: `--yellow`, `--pink`, `--blue`, `--orange`, `--purple`, `--green`, `--red`, `--cyan`, `--indigo`, `--amber`
- Fonts: Space Mono (body), Archivo Black (headers)
- Font Awesome icons

### 3D Bean System (particles.js)
- Procedural bean geometry with crease
- CMYK chromatic aberration post-processing shader
- Configurable via `CONFIG` object and debug GUI
- Mobile-responsive (adjusts effect direction)

## Deployment

Deployed to GitHub Pages at `https://avshyz.github.io/brewlingo/`

The `base: '/brewlingo/'` in vite.config.js handles the subdirectory path.

## Development Notes

- Debug mode: Add `?d=1` to URL to show Three.js parameter GUI
- View transitions: All internal links use the View Transitions API for smooth page transitions
- Dialog animations: Card expansion uses view-transition-name for element continuity
- Public assets are served from `/assets/` and `/js/` paths (resolved by Vite's publicDir)

## Git Conventions

Recent commits show terse, descriptive messages. Follow the pattern:
- `particles fblz` - Short feature/fix description
- `fix evya` - Bug fixes with brief context
- `simplify page transitions` - Clear action + target
