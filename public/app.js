/**
 * ATELIER — Curated Shopping List & Functional Showcase
 * 
 * Flow:
 * 1. Homescreen displays ONLY collections (Image 1: Represent card style).
 * 2. Opening any collection eases in the products under it (Image 2: Console⁹ style)
 *    with a smooth staggered animation.
 * 3. Desktop edge back hover button, breadcrumb back button, and mobile swipe-right gesture.
 * 4. Zero navbar.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    shelves: [],
    collections: [],
    activeShelves: [],
    allItems: [],
    currentView: 'home', // 'home' | 'collection'
    currentCollectionId: null,
    activeProduct: null
  };

  // DOM Elements: Views & Navigation
  const homeView = document.getElementById('home-view');
  const collectionView = document.getElementById('collection-view');
  const collectionsCardsGrid = document.getElementById('collections-cards-grid');
  const edgeBackBtn = document.getElementById('edge-back-btn');

  // DOM Elements: Top Title Bar & Collection Details
  const siteTopBar = document.getElementById('site-top-bar');
  const collectionBadge = document.getElementById('collection-badge');
  const collectionTitleText = document.getElementById('collection-title-text');
  const collectionSubText = document.getElementById('collection-sub-text');
  const collectionProductsGrid = document.getElementById('collection-products-grid');

  // DOM Elements: Lightbox Modal
  const productLightboxBackdrop = document.getElementById('product-lightbox-backdrop');
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
  const lightboxPhotoImg = document.getElementById('lightbox-photo-img');
  const modalProdTitle = document.getElementById('modal-prod-title');
  const lightboxPrice = document.getElementById('lightbox-price');
  const lightboxStoreTag = document.getElementById('lightbox-store-tag');
  const lightboxNotes = document.getElementById('lightbox-notes');
  const lightboxCategoryVal = document.getElementById('lightbox-category-val');
  const lightboxDomainVal = document.getElementById('lightbox-domain-val');
  const btnLightboxDirect = document.getElementById('btn-lightbox-direct');

  // DOM Elements: Sync Pill
  const topBarSyncBtn = document.getElementById('top-bar-sync-btn');
  const syncLabel = document.getElementById('sync-label');

  // Cheeky editorial quotes for the blank canvas
  const CHEEKY_EMPTY_QUOTES = [
    "The shelf is currently empty. Either the curator has extraordinary self-restraint, or nothing in the world was worthy today.",
    "A completely blank canvas. Either supreme minimalism, or the curator is still searching for perfection.",
    "Nothing on the shelf. True curation is the supreme art of saying no.",
    "Zero objects found. The curator's taste currently exceeds available market supply.",
    "An empty shelf is infinitely more elegant than mediocre clutter.",
    "Pure, deliberate negative space. When objects meet our standards, they shall appear."
  ];

  // ==========================================================================
  // 1. Data Fetching & Setup (Live Notion Sync - Zero Stale / Static Fallback)
  // ==========================================================================
  async function loadData(forceRefresh = false) {
    if (topBarSyncBtn) {
      topBarSyncBtn.classList.add('is-syncing');
      topBarSyncBtn.classList.remove('is-offline');
      topBarSyncBtn.setAttribute('title', 'Checking live sync status...');
      topBarSyncBtn.setAttribute('aria-label', 'Checking live sync status...');
      if (syncLabel) syncLabel.textContent = 'Syncing...';
    }

    try {
      const queryParam = forceRefresh ? `?refresh=true&_t=${Date.now()}` : '';
      const baseApi = window.SHELF_API_BASE || '/api';
      const shelvesUrl = `${baseApi}/shelves${queryParam}`;
      const colsUrl = `${baseApi}/collections${queryParam}`;

      let [resShelves, resCols] = await Promise.all([
        fetch(shelvesUrl).catch(() => ({ ok: false })),
        fetch(colsUrl).catch(() => ({ ok: false }))
      ]);

      // Static JSON snapshot fallback for GitHub Pages or static deployments
      if (!resShelves || !resShelves.ok) {
        const cacheBuster = forceRefresh ? `?_t=${Date.now()}` : '';
        const [staticShelves, staticCols] = await Promise.all([
          fetch(`data/shelves.json${cacheBuster}`).catch(() => ({ ok: false })),
          fetch(`data/collections.json${cacheBuster}`).catch(() => ({ ok: false }))
        ]);
        if (staticShelves && staticShelves.ok) resShelves = staticShelves;
        if (staticCols && staticCols.ok) resCols = staticCols;
      }

      let hasLiveData = false;

      if (resShelves && resShelves.ok) {
        const data = await resShelves.json().catch(() => null);
        if (data && data.success && Array.isArray(data.shelves)) {
          state.shelves = data.shelves;

          // Only shelves that contain at least 1 product
          state.activeShelves = data.shelves.filter(
            s => Array.isArray(s.products) && s.products.length > 0
          );

          // Deduplicated flat list
          const itemsMap = new Map();
          data.shelves.forEach(shelf => {
            (shelf.products || []).forEach(prod => {
              if (prod.id && !itemsMap.has(prod.id)) {
                itemsMap.set(prod.id, {
                  ...prod,
                  shelfName: shelf.name,
                  shelfId: shelf.id
                });
              }
            });
          });
          state.allItems = Array.from(itemsMap.values());
          if (state.activeShelves.length > 0) hasLiveData = true;
        } else {
          state.shelves = [];
          state.activeShelves = [];
          state.allItems = [];
        }
      } else {
        state.shelves = [];
        state.activeShelves = [];
        state.allItems = [];
      }

      if (resCols && resCols.ok) {
        const data = await resCols.json().catch(() => null);
        if (data && data.success && Array.isArray(data.collections)) {
          state.collections = data.collections;
        } else {
          state.collections = [];
        }
      } else {
        state.collections = [];
      }

      if (topBarSyncBtn) {
        topBarSyncBtn.classList.remove('is-offline');
        if (hasLiveData) {
          topBarSyncBtn.setAttribute('title', 'Synced with Notion. Click to re-sync.');
          topBarSyncBtn.setAttribute('aria-label', 'Synced with Notion. Click to re-sync.');
        } else {
          topBarSyncBtn.setAttribute('title', 'Canvas is empty. Click to check for arrivals.');
          topBarSyncBtn.setAttribute('aria-label', 'Canvas is empty. Click to check for arrivals.');
        }
      }
      if (syncLabel) {
        syncLabel.textContent = hasLiveData ? 'Notion Synced' : 'Clean Canvas';
      }
    } catch (err) {
      console.warn('[ATELIER] Live connection notice:', err.message);
      state.shelves = [];
      state.activeShelves = [];
      state.allItems = [];
      state.collections = [];
      if (topBarSyncBtn) {
        topBarSyncBtn.classList.add('is-offline');
        topBarSyncBtn.setAttribute('title', 'Canvas is clean. Click to check for updates.');
        topBarSyncBtn.setAttribute('aria-label', 'Canvas is clean. Click to check for updates.');
      }
      if (syncLabel) syncLabel.textContent = 'Clean Canvas';
    } finally {
      if (topBarSyncBtn) {
        topBarSyncBtn.classList.remove('is-syncing');
      }
    }

    renderHomescreenCollections();

    // If currently viewing a collection, re-render it with fresh products
    if (state.currentView === 'collection' && state.currentCollectionId) {
      openCollection(state.currentCollectionId, false);
    } else {
      handleInitialRoute();
    }
  }

  // Hook sync button
  if (topBarSyncBtn) {
    topBarSyncBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loadData(true);
    });
  }

  // Auto-sync whenever user returns to the browser tab from Notion
  window.addEventListener('focus', () => {
    loadData(true);
  });

  // Periodic background check for Notion edits every 30 seconds
  setInterval(() => {
    loadData(false);
  }, 30000);

  // ==========================================================================
  // 2. Render Homescreen: Collections OR Blank Canvas With Cheeky Line
  // ==========================================================================
  function renderEmptyCanvasState() {
    if (!collectionsCardsGrid) return;
    
    const quote = CHEEKY_EMPTY_QUOTES[Math.floor(Math.random() * CHEEKY_EMPTY_QUOTES.length)];

    collectionsCardsGrid.innerHTML = `
      <div class="empty-canvas-container" id="empty-canvas-container">
        <div class="empty-canvas-frame">
          <div class="empty-canvas-icon-wrap" aria-hidden="true">
            <svg class="empty-canvas-glyph" width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="8" y="10" width="32" height="28" rx="2" stroke="currentColor" stroke-width="1.25" stroke-dasharray="3 3"/>
              <line x1="14" y1="28" x2="34" y2="28" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="24" cy="20" r="3.5" stroke="currentColor" stroke-width="1.25"/>
            </svg>
          </div>
          <span class="empty-canvas-kicker">EDITION 00 · UNTOUCHED CANVAS</span>
          <h2 class="empty-canvas-title">The Shelf Is Empty.</h2>
          <p class="empty-canvas-quote" id="empty-canvas-quote">“${escapeHtml(quote)}”</p>
          <div class="empty-canvas-meta">
            <span class="empty-canvas-badge">0 OBJECTS ACROSS 0 COLLECTIONS</span>
          </div>
          <button type="button" class="empty-canvas-refresh-btn" id="empty-canvas-refresh-btn" title="Check for arrivals">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            <span>Check For Arrivals</span>
          </button>
        </div>
      </div>
    `;

    const refreshBtn = document.getElementById('empty-canvas-refresh-btn');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        loadData(true);
      };
    }
  }

  function renderHomescreenCollections() {
    if (!collectionsCardsGrid) return;
    collectionsCardsGrid.innerHTML = '';

    // If there is zero data: keep it a blank canvas with a cheeky line on emptiness
    if (!state.activeShelves || state.activeShelves.length === 0) {
      renderEmptyCanvasState();
      return;
    }

    state.activeShelves.forEach(shelf => {
      const products = shelf.products || [];
      const count = shelf.productCount || products.length;

      // Layout: 4 items (2x2 grid) or 5+ items (2 top + 3 bottom)
      const numCells = products.length === 4 ? 4 : Math.min(products.length, 5);
      const previewItems = products.slice(0, numCells);

      const card = document.createElement('div');
      card.className = 'mosaic-showcase-card';
      card.id = `card-${shelf.id}`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      const objectWord = count === 1 ? 'object' : 'objects';
      card.setAttribute('aria-label', `Open ${shelf.name} collection with ${count} ${objectWord}`);

      // Mosaic Image Grid
      let mosaicGridHtml = `<div class="mosaic-grid mosaic-grid-${numCells}">`;
      previewItems.forEach((prod, idx) => {
        const cleanTitle = cleanProductTitle(prod.title);
        mosaicGridHtml += `
          <div class="mosaic-cell cell-${idx + 1}" title="${escapeHtml(cleanTitle)}">
            <img src="${prod.image}" alt="${escapeHtml(cleanTitle)}" class="mosaic-img" loading="lazy">
          </div>
        `;
      });
      mosaicGridHtml += `</div>`;

      // Footer with avatar, name, gold checkmark, and Explore button
      const initial = (shelf.name || 'C').charAt(0).toUpperCase();
      const sub = getShelfCuratorSubtitle(shelf);

      const footerHtml = `
        <div class="mosaic-footer">
          <div class="creator-profile">
            <div class="creator-avatar">${initial}</div>
            <div class="creator-meta">
              <div class="creator-name-row">
                <span class="creator-name">${escapeHtml(shelf.name)}</span>
                <svg class="verified-badge-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Verified collection">
                  <circle cx="12" cy="12" r="10" fill="#D4AF37"/>
                  <path d="M8.5 12.5L10.5 14.5L15.5 9.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <span class="creator-sub">${escapeHtml(sub)} · ${count} ${objectWord}</span>
            </div>
          </div>
          <button type="button" class="btn-shop-pill">
            Explore
          </button>
        </div>
      `;

      card.innerHTML = mosaicGridHtml + footerHtml;

      // Clicking ANYWHERE on the card opens the collection and eases in products
      card.onclick = () => {
        openCollection(shelf.id);
      };

      // Keyboard accessibility
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCollection(shelf.id);
        }
      };

      collectionsCardsGrid.appendChild(card);
    });
  }

  // Helper: Find shelf by id, name, or slug safely
  function findShelf(identifier) {
    if (!identifier) return null;
    let decoded = String(identifier).trim();
    try {
      decoded = decodeURIComponent(decoded).trim();
    } catch (e) {}
    const norm = decoded.toLowerCase();

    return state.activeShelves.find(s => {
      const sId = (s.id || '').toLowerCase();
      const sName = (s.name || '').toLowerCase();
      const sColId = (s.collectionId || '').toLowerCase();
      return (
        sId === norm ||
        sName === norm ||
        sColId === norm ||
        sId.replace(/\s+/g, '-') === norm.replace(/\s+/g, '-') ||
        sName.replace(/\s+/g, '-') === norm.replace(/\s+/g, '-')
      );
    }) || null;
  }

  let hasInternalNavigation = false;

  // ==========================================================================
  // 3. Open Collection: Ease In Products View (Image 2 "Console⁹" style)
  // ==========================================================================
  function openCollection(shelfId, updateHash = true) {
    const shelf = findShelf(shelfId);
    if (!shelf) return;

    state.currentView = 'collection';
    state.currentCollectionId = shelf.id;

    // Push new hash to browser history so going back takes you back to homepage
    const targetHash = `#/collection/${encodeURIComponent(shelf.id)}`;
    if (updateHash) {
      hasInternalNavigation = true;
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }

    const products = shelf.products || [];
    const count = shelf.productCount || products.length;
    const desc = getShelfCuratorDescription(shelf);

    // Apply single-row layout helper class
    if (collectionView) {
      if (products.length <= 3) {
        collectionView.classList.add('is-single-row');
      } else {
        collectionView.classList.remove('is-single-row');
      }
    }

    // Update Original Large Collection Title & Top Bar Badge
    if (collectionTitleText) {
      collectionTitleText.innerHTML = `${escapeHtml(shelf.name)}<sup>${count}</sup>`;
      collectionTitleText.style.opacity = '1';
      collectionTitleText.style.transform = 'translateY(0px)';
    }
    if (collectionBadge) {
      collectionBadge.innerHTML = `${escapeHtml(shelf.name)}<sup>${count}</sup>`;
      collectionBadge.style.opacity = '0';
      collectionBadge.style.transform = 'translateX(0px)';
      collectionBadge.style.pointerEvents = 'none';
    }
    if (collectionSubText) {
      collectionSubText.textContent = desc;
      collectionSubText.style.opacity = '1';
      collectionSubText.style.transform = 'translateY(0px)';
      collectionSubText.style.pointerEvents = 'auto';
    }

    // Populate Products Grid with Staggered Delays
    if (collectionProductsGrid) {
      collectionProductsGrid.innerHTML = '';

      if (products.length === 0) {
        collectionProductsGrid.innerHTML = `
          <div class="empty-canvas-container is-collection-empty">
            <div class="empty-canvas-frame">
              <span class="empty-canvas-kicker">EMPTY COLLECTION</span>
              <h3 class="empty-canvas-title">Zero Objects Present.</h3>
              <p class="empty-canvas-quote">“True curation is the supreme art of saying no.”</p>
            </div>
          </div>
        `;
      } else {
        products.forEach((prod, idx) => {
        const cleanTitle = cleanProductTitle(prod.title);
        const storeName = (prod.store || 'STORE').toUpperCase();
        const commentary = prod.notes && prod.notes.trim() ? prod.notes.trim() : getCuratorCommentary(prod);

        const card = document.createElement('article');
        card.className = 'gallery-card';
        card.style.setProperty('--i', idx);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');

        card.innerHTML = `
          <div class="gallery-card-photo-box" title="Click to view details">
            <img src="${prod.image}" alt="${escapeHtml(prod.title)}" class="gallery-card-img" loading="lazy">
            <span class="gallery-card-tag">${escapeHtml(storeName)}</span>
          </div>
          <div class="gallery-card-info">
            <div class="gallery-card-header">
              <h3 class="gallery-card-title" title="${escapeHtml(prod.title)}">${escapeHtml(cleanTitle)}</h3>
              <span class="gallery-card-price">${escapeHtml(prod.price || '₹0')}</span>
            </div>
            <p class="gallery-card-sub">${escapeHtml(commentary)}</p>
            <div class="gallery-card-action">
              <span>View Details</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        `;

        card.onclick = () => openLightbox(prod);
        card.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openLightbox(prod);
          }
        };

        collectionProductsGrid.appendChild(card);
      });
      }
    }

    // Reset collection header state
    if (siteTopBar) {
      siteTopBar.classList.remove('is-scrolled');
    }
    if (collectionTitleText) {
      collectionTitleText.style.opacity = '1';
      collectionTitleText.style.transform = 'translateY(0px)';
    }
    if (collectionBadge) {
      collectionBadge.style.opacity = '0';
      collectionBadge.style.transform = 'translateX(0px)';
      collectionBadge.style.pointerEvents = 'none';
    }
    if (collectionSubText) {
      collectionSubText.style.opacity = '1';
      collectionSubText.style.transform = 'translateY(0px)';
      collectionSubText.style.pointerEvents = 'auto';
    }

    // In-Place Transition: Ease Out Home, Ease In Collection View
    if (homeView) {
      homeView.classList.add('is-easing-out');
    }

    setTimeout(() => {
      if (homeView) {
        homeView.style.display = 'none';
        homeView.classList.remove('is-easing-out');
      }

      // Reset scroll position instantly with zero scroll motion
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

      if (collectionView) {
        collectionView.style.display = 'flex';
        collectionView.classList.remove('is-easing-in');
        void collectionView.offsetWidth; // Force reflow
        collectionView.classList.add('is-easing-in');
      }

      // Activate Desktop Edge Back Button and Collection View state
      if (edgeBackBtn) {
        edgeBackBtn.classList.add('is-active');
      }
      document.body.classList.add('in-collection-view');

      handleCollectionScroll();
    }, 200);
  }

  // ==========================================================================
  // 4. Return to Homescreen (Only Collections)
  // ==========================================================================
  function handleBackAction() {
    if (state.currentView === 'collection') {
      if (hasInternalNavigation && window.history.length > 1) {
        window.history.back();
      } else {
        window.location.hash = '#/';
      }
    } else {
      showHomeView(false);
    }
  }

  // ==========================================================================
  // 4. Return to Homescreen (Only Collections)
  // ==========================================================================
  function showHomeView(updateHash = true) {
    state.currentView = 'home';
    state.currentCollectionId = null;

    if (updateHash && window.location.hash && window.location.hash !== '#/' && window.location.hash !== '#') {
      if (hasInternalNavigation && window.history.length > 1) {
        window.history.back();
        return;
      } else {
        window.location.hash = '#/';
        return;
      }
    }

    // Deactivate Desktop Edge Back Button and Collection View state
    if (edgeBackBtn) {
      edgeBackBtn.classList.remove('is-active');
    }
    document.body.classList.remove('in-collection-view');

    // Reset Top Bar and Collection Header elements
    if (siteTopBar) {
      siteTopBar.classList.remove('is-scrolled');
    }
    if (collectionBadge) {
      collectionBadge.style.opacity = '0';
      collectionBadge.style.transform = 'translateX(0px)';
      collectionBadge.style.pointerEvents = 'none';
    }
    if (collectionTitleText) {
      collectionTitleText.style.opacity = '1';
      collectionTitleText.style.transform = 'translateY(0px)';
    }
    if (collectionSubText) {
      collectionSubText.style.opacity = '1';
      collectionSubText.style.transform = 'translateY(0px)';
    }

    // In-Place Transition: Ease Out Collection, Ease In Home View
    if (collectionView) {
      collectionView.classList.add('is-easing-out');
    }

    setTimeout(() => {
      if (collectionView) {
        collectionView.style.display = 'none';
        collectionView.classList.remove('is-easing-out');
      }

      // Reset scroll position instantly with zero scroll motion
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

      if (homeView) {
        homeView.style.display = 'flex';
        homeView.classList.remove('is-easing-in');
        void homeView.offsetWidth; // Force reflow
        homeView.classList.add('is-easing-in');
      }
    }, 200);
  }

  // Clean up easing classes on animation end
  if (homeView) {
    homeView.addEventListener('animationend', (e) => {
      if (e.animationName === 'viewEaseIn') {
        homeView.classList.remove('is-easing-in');
      }
    });
  }
  if (collectionView) {
    collectionView.addEventListener('animationend', (e) => {
      if (e.animationName === 'viewEaseIn') {
        collectionView.classList.remove('is-easing-in');
      }
    });
  }

  // Wire Edge Back Button and Brandmark Corner Actions
  if (edgeBackBtn) {
    edgeBackBtn.onclick = (e) => {
      e.preventDefault();
      handleBackAction();
    };
  }
  const brandmarkCorner = document.getElementById('brandmark-corner');
  if (brandmarkCorner) {
    brandmarkCorner.onclick = (e) => {
      e.preventDefault();
      if (state.currentView !== 'home') {
        handleBackAction();
      }
    };
  }

  // ==========================================================================
  // 5. Scroll Interaction: In-page Title/Description fade out & Badge moves right
  // ==========================================================================
  function handleCollectionScroll() {
    if (state.currentView !== 'collection') return;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    // If maxScroll < 40, the collection fits on a single screen without vertical scroll.
    // Ensure large title is visible, badge is hidden, and nothing is stuck halfway.
    if (maxScroll < 40) {
      if (siteTopBar) siteTopBar.classList.remove('is-scrolled');
      if (collectionTitleText) {
        collectionTitleText.style.opacity = '1';
        collectionTitleText.style.transform = 'translateY(0px)';
      }
      if (collectionSubText) {
        collectionSubText.style.opacity = '1';
        collectionSubText.style.transform = 'translateY(0px)';
        collectionSubText.style.pointerEvents = 'auto';
      }
      if (collectionBadge) {
        collectionBadge.style.opacity = '0';
        collectionBadge.style.transform = 'translateX(0px)';
        collectionBadge.style.pointerEvents = 'none';
      }
      return;
    }

    // When scrolling IS possible (multi-row or smaller viewport):
    // Adaptive threshold so the badge completes its journey all the way to the right
    // well before scroll terminates (never stuck halfway)
    const threshold = Math.min(100, Math.max(30, maxScroll * 0.55));
    const progress = Math.min(Math.max(scrollY / threshold, 0), 1);

    // Toggle top bar frosted blur and blend gradient
    if (siteTopBar) {
      if (scrollY > 10) {
        siteTopBar.classList.add('is-scrolled');
      } else {
        siteTopBar.classList.remove('is-scrolled');
      }
    }

    // 1. Original large Collection Title & Description fade out as you scroll
    if (collectionTitleText) {
      const titleOpacity = Math.max(0, 1 - progress * 1.25);
      collectionTitleText.style.opacity = titleOpacity.toFixed(3);
      collectionTitleText.style.transform = `translateY(-${(progress * 12).toFixed(1)}px)`;
    }
    if (collectionSubText) {
      const subOpacity = Math.max(0, 1 - progress * 1.35);
      collectionSubText.style.opacity = subOpacity.toFixed(3);
      collectionSubText.style.transform = `translateY(-${(progress * 12).toFixed(1)}px)`;
      collectionSubText.style.pointerEvents = subOpacity <= 0.05 ? 'none' : 'auto';
    }

    // 2. Collection Badge in top bar (in same line as ATELIER, black background, white text)
    // Fades in and slides across to the right edge as you scroll
    if (collectionBadge && siteTopBar) {
      collectionBadge.style.opacity = progress.toFixed(3);
      collectionBadge.style.pointerEvents = progress > 0.4 ? 'auto' : 'none';

      const barWidth = siteTopBar.clientWidth;
      const paddingRight = window.innerWidth <= 768 ? 20 : 32;
      const badgeLeft = collectionBadge.offsetLeft;
      const badgeWidth = collectionBadge.offsetWidth;
      const targetRight = barWidth - paddingRight - badgeWidth;
      const maxShift = Math.max(targetRight - badgeLeft, 0);
      const currentShift = progress * maxShift;
      collectionBadge.style.transform = `translateX(${currentShift.toFixed(1)}px)`;
    }
  }

  let isScrollThrottled = false;
  function onScrollOrResize() {
    if (!isScrollThrottled) {
      window.requestAnimationFrame(() => {
        handleCollectionScroll();
        isScrollThrottled = false;
      });
      isScrollThrottled = true;
    }
  }

  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });

  // ==========================================================================
  // 5. Mobile Gesture Navigation (Fluid Swipe Right to go back)
  // ==========================================================================
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  window.addEventListener('touchstart', (e) => {
    if (state.currentView !== 'collection') return;
    if (state.activeProduct) return; // Do not trigger if lightbox is open
    if (e.touches && e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (state.currentView !== 'collection') return;
    if (state.activeProduct) return;
    if (e.changedTouches && e.changedTouches[0]) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const elapsed = Date.now() - touchStartTime;

      const diffX = touchEndX - touchStartX;
      const diffY = Math.abs(touchEndY - touchStartY);

      // Recognize swipe-right:
      // 1. Horizontal movement to the right: diffX > 55px
      // 2. Mostly horizontal, not vertical scrolling: diffX > diffY * 1.15
      // 3. Completed in reasonable swipe duration (< 800ms)
      // 4. Started in the left region (< window.innerWidth * 0.45) or quick flick (> 80px in < 350ms)
      const isHorizontalSwipe = diffX > 55 && diffX > diffY * 1.15;
      const isLeftRegionOrFlick = touchStartX < Math.min(window.innerWidth * 0.45, 200) || (diffX > 80 && elapsed < 350);

      if (isHorizontalSwipe && isLeftRegionOrFlick && elapsed < 800) {
        handleBackAction();
      }
    }
  }, { passive: true });

  // Handle URL Hash Navigation
  function handleInitialRoute() {
    const hash = window.location.hash || '';
    if (hash.includes('/collection/')) {
      const rawId = hash.split('/collection/')[1];
      const shelf = findShelf(rawId);
      if (shelf) {
        openCollection(shelf.id, false);
        return;
      }
    }
    // Clean initial route to #/
    if (!window.location.hash || window.location.hash === '#') {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#/');
      } else {
        window.location.hash = '#/';
      }
    }
    showHomeView(false);
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash || '';
    if (hash.includes('/collection/')) {
      const rawId = hash.split('/collection/')[1];
      const shelf = findShelf(rawId);
      if (shelf) {
        if (state.currentCollectionId !== shelf.id || state.currentView !== 'collection') {
          openCollection(shelf.id, false);
        }
        return;
      }
    }
    if (state.currentView !== 'home') {
      showHomeView(false);
    }
  });

  // ==========================================================================
  // 6. Product Quick Look Lightbox Modal
  // ==========================================================================
  function openLightbox(prod) {
    state.activeProduct = prod;

    if (lightboxPhotoImg) lightboxPhotoImg.src = prod.image;
    if (modalProdTitle) modalProdTitle.textContent = cleanProductTitle(prod.title);
    if (lightboxPrice) lightboxPrice.textContent = prod.price || '₹0';
    if (lightboxStoreTag) lightboxStoreTag.textContent = (prod.store || 'STORE').toUpperCase();
    if (lightboxNotes) lightboxNotes.textContent = prod.notes && prod.notes.trim() ? prod.notes.trim() : getCuratorCommentary(prod);
    if (lightboxCategoryVal) lightboxCategoryVal.textContent = (prod.category || prod.shelfName || 'CURATED OBJECT').toUpperCase();
    if (lightboxDomainVal) lightboxDomainVal.textContent = (prod.domain || prod.store || 'OFFICIAL STORE').toUpperCase();

    if (btnLightboxDirect) {
      btnLightboxDirect.href = prod.rawLink || '#';
      btnLightboxDirect.innerHTML = `
        <span>BUY ON ${escapeHtml((prod.store || 'STORE').toUpperCase())} (OFFICIAL STORE)</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
      `;
    }

    if (productLightboxBackdrop) {
      productLightboxBackdrop.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeLightbox() {
    state.activeProduct = null;
    if (productLightboxBackdrop) {
      productLightboxBackdrop.classList.remove('is-open');
      document.body.style.overflow = '';
    }
  }

  if (lightboxCloseBtn) lightboxCloseBtn.onclick = closeLightbox;
  if (productLightboxBackdrop) {
    productLightboxBackdrop.onclick = (e) => {
      if (e.target === productLightboxBackdrop) closeLightbox();
    };
  }

  // Keyboard Shortcuts: Escape closes lightbox first, or returns home
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.activeProduct) {
        closeLightbox();
      } else if (state.currentView === 'collection') {
        handleBackAction();
      }
    }
  });



  // ==========================================================================
  // 8. Curatorial Copy & Formatting Helpers (Accurate to Notion Database)
  // ==========================================================================
  function getShelfCuratorSubtitle(shelf) {
    const id = (shelf.id || '').toLowerCase();
    if (id.includes('helmet')) return 'ECE & DOT certified riding helmets';
    if (id.includes('tool')) return 'Workshop & precision instruments';
    if (id.includes('storage') || id.includes('bag')) return 'Motorcycle tank bags & luggage';
    if (id.includes('accessor')) return 'Riding gear & ear protection';
    if (id.includes('home')) return 'Studio utility & living essentials';
    return 'Curated collection';
  }

  function getShelfCuratorDescription(shelf) {
    const id = (shelf.id || '').toLowerCase();
    if (id.includes('helmet')) {
      return 'ECE 22.06 and DOT certified full-face motorcycle helmets, Pinlock 70 ready with aerodynamic protection.';
    }
    if (id.includes('tool')) {
      return 'Precision workshop tools, high-grade cutting mats, utility blades, and metric socket sets.';
    }
    if (id.includes('storage') || id.includes('bag')) {
      return 'Magnetic motorcycle tank bags and utilitarian luggage systems engineered for riding and travel.';
    }
    if (id.includes('accessor')) {
      return 'Essential motorcycle touring equipment, noise reduction protection, and rider utility.';
    }
    if (id.includes('home')) {
      return 'Curated studio instruments and functional objects for everyday precision.';
    }
    return 'Functional objects selected for enduring materiality, utility, and refined craftsmanship.';
  }

  function cleanProductTitle(raw) {
    if (!raw) return 'CURATED OBJECT';
    let title = raw.trim();
    // Trim excessively long e-commerce titles with pipe specifications (e.g. Amazon SEO titles)
    if (title.includes(' | ')) {
      const primary = title.split(' | ')[0].trim();
      if (primary.length >= 10) {
        return primary;
      }
    }
    return title;
  }

  function getCuratorCommentary(prod) {
    if (prod.notes && prod.notes.trim()) return prod.notes.trim();
    if (prod.secondaryTitle && prod.secondaryTitle.trim()) return prod.secondaryTitle.trim();
    return `Verified item from ${prod.store || 'Amazon'}.`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Initialize
  loadData();
});
