# ATELIER — Curated Editorial Storefront & Minimalist Showcase

A curated editorial showcase designed for presenting curated collections and objects in an ultra-refined, high-fashion layout.

---

## ✦ Design & Architecture

- **Zero Navbar**: Minimalist top bar with brandmark, live status indicator light, and smooth scroll-blending typography.
- **Collection Mosaic Grid**: Represent-style high-fashion collection cards featuring dynamic mosaic preview arrangements.
- **Console-Style Product View**: Opening any collection smoothly eases in the products under it with staggered delays and editorial curatorial statements.
- **Pure Edge Navigation**: Floating minimal arrow back button on desktop, breadcrumb link, and mobile swipe-right gesture navigation.
- **Quick Look Lightbox**: Slide-over product quick look with high-resolution imagery, store badges, specs, and direct official store links.
- **Pristine Blank Canvas**: Strictly avoids any stale or static mock data. If no live data is connected, it presents a clean, cheeky editorial canvas on emptiness.

---

## ✦ Running Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Optional: Configure Live Notion Sync
Create a `.env` file in the project root (see `.env.example`):
```env
NOTION_TOKEN=ntn_your_notion_integration_token_here
NOTION_DATABASE_ID=your_notion_database_id_here
PORT=3001
```

> **Security Note**: Never commit your `.env` file or actual Notion tokens to Git. The project `.gitignore` automatically excludes `.env` files.

### 3. Start Development Server
```bash
npm start
```
Open `http://localhost:3001` in your browser.

---

## ✦ Deploying to GitHub Pages

This project is built to run directly on GitHub Pages without requiring a build step:

1. Push the repository to GitHub.
2. In your repository settings, navigate to **Settings** → **Pages**.
3. Under **Build and deployment**, select:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (or `master`) / `/(root)`
4. Save your changes. Your showcase will be live at `https://<username>.github.io/<repository-name>/`.

When hosted statically on GitHub Pages with no backend server, the application displays the clean editorial blank canvas. If an external API is configured via `window.SHELF_API_BASE`, it will stream live data accordingly.
