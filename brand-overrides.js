(function () {
  // The site's own React tree re-renders parts of its layout in response to
  // viewport resize (breakpoint-gated components swapping their rendered
  // subtree). If one of this file's DOM-mutating passes runs while that
  // reconciliation is still settling, it can remove/relocate a node React
  // still expects to find in a specific spot, which throws a hard
  // (uncatchable-by-us, since it's thrown inside React's own commit code)
  // "insertBefore: node is not a child" crash that takes down the whole
  // page. Track recent resize activity so every DOM-mutating pass below can
  // wait for it to go quiet before touching the tree again.
  var RESIZE_QUIET_MS = 500;
  var lastResizeAt = 0;
  window.addEventListener(
    'resize',
    function () {
      lastResizeAt = Date.now();
    },
    { passive: true }
  );
  function msUntilResizeQuiet() {
    var elapsed = Date.now() - lastResizeAt;
    return elapsed < RESIZE_QUIET_MS ? RESIZE_QUIET_MS - elapsed : 0;
  }

  // Detaching nodes outright (Node.remove() / Node.replaceWith()) is what
  // actually causes the crash described above: several of the elements this
  // file edits (header buttons, nav items, hero visuals, whole content
  // sections) sit inside subtrees the site's own React components
  // reconcile on resize, and a fully-detached node leaves React holding a
  // reference to a sibling that no longer exists anywhere in the document,
  // which throws the moment it next tries to reconcile that area (confirmed
  // by bisecting cleanup()'s functions one at a time -- both the header
  // button removal and one of the homepage section replacements
  // independently reproduced the exact same crash). Hiding via CSS instead
  // keeps the original node (and its position among siblings) intact for
  // React to reconcile against, while still being fully invisible and
  // non-interactive -- functionally identical to removal from the user's
  // perspective.
  function hideAxioEl(el) {
    if (!el || el.hasAttribute('data-axio-hidden')) return;
    el.setAttribute('data-axio-hidden', '1');
    el.style.setProperty('display', 'none', 'important');
  }

  // Same idea for "replace this element with new content": hide the
  // original in place and insert the replacement as its next sibling,
  // rather than detaching the original from the tree. Guarded by the same
  // data-axio-hidden marker hideAxioEl sets, since a hidden-but-still-
  // attached original keeps matching the same attribute/class selectors
  // that found it in the first place -- without this check, every
  // recurring cleanup() pass would insert another replacement alongside
  // the last one (this actually happened during testing: the header logo
  // duplicated once per cleanup cycle before this guard was added).
  function replaceAxioEl(oldEl, newEl) {
    if (oldEl.hasAttribute('data-axio-hidden')) return;
    hideAxioEl(oldEl);
    oldEl.insertAdjacentElement('afterend', newEl);
  }

  var PATH = location.pathname;
  // Vercel's `cleanUrls: true` serves pages without the `.html` suffix in
  // production (e.g. `/contact-us`), while local/static testing typically
  // uses the literal `.html` file (`/contact-us.html`). Normalize once so
  // every page-detection check below works under both URL shapes.
  var PATH_NORM = PATH.replace(/\.html$/i, '').replace(/\/+$/, '');
  var IS_HOME = /(^|\/)index$/.test(PATH_NORM) || PATH_NORM === '' || /\/$/.test(PATH);
  var DEPTH = /\/programs\//.test(PATH) ? '../' : '';
  var LOGO_SRC = DEPTH + 'assets/brand/axio-ventures-logo.png';

  // Next.js's App Router streams <title>/<meta> tags via a serialized RSC
  // payload embedded in a <script> tag, and when React hydrates that
  // payload it reasserts the *original* title/description over whatever's
  // in the static HTML -- confirmed empirically: the raw HTML shows the
  // correct title at first paint, then flips back to the old one about a
  // second later. Same class of bug as the image/video fixes elsewhere in
  // this file; same fix shape: set it via JS and keep re-asserting it.
  var PAGE_META = {
    index: {
      title: 'Axio Ventures | Procurement, Technology & Security Solutions',
      description:
        'Axio Ventures delivers reliable procurement, smart security, and technology solutions for government, corporate, and residential clients across Pakistan.',
    },
    how: {
      title: 'About Us | Axio Ventures',
      description:
        'Discover who we are, what drives us, and how Axio Ventures is transforming procurement, technology, and security solutions across Pakistan and beyond.',
    },
    academy: {
      title: 'Axio Ventures',
      description:
        'Axio Ventures is a Pakistan-based procurement, technology, and security solutions provider serving government, corporate, and residential clients.',
    },
    affiliate: {
      title: 'Axio Ventures',
      description:
        'Axio Ventures is a Pakistan-based procurement, technology, and security solutions provider serving government, corporate, and residential clients.',
    },
    'contact-us': {
      title: 'Contact Us | Axio Ventures',
      description: "Get in touch with Axio Ventures for procurement, technology, and security solutions. We're ready to help with your next project.",
    },
    'direct-to-sim-live': {
      title: 'Turnkey Procurement Services | Axio Ventures',
      description:
        'Our turnkey procurement services offer a complete, hassle-free solution covering the entire process, from strategic sourcing to final delivery and implementation.',
    },
    'programs/expert': {
      title: 'Smart Security & Automation | Axio Ventures',
      description:
        'Cutting-edge security and automation solutions for safer, smarter, and more connected living and working spaces, from AI-driven cameras to smart access control.',
    },
    'programs/standard': {
      title: 'Procurement & Construction | Axio Ventures',
      description:
        'Cutting-edge procurement and construction solutions for government, defense, and private sector clients, delivered with reliability and regulatory compliance.',
    },
  };

  function enforcePageMeta() {
    var key = PATH_NORM.replace(/^\/+/, '') || 'index';
    var meta = PAGE_META[key];
    if (!meta) return;

    if (document.title !== meta.title) document.title = meta.title;
    var descEl = document.querySelector('meta[name="description"]');
    if (descEl && descEl.getAttribute('content') !== meta.description) {
      descEl.setAttribute('content', meta.description);
    }

    if (window.__axioMetaObserver) return;
    window.__axioMetaObserver = new MutationObserver(function () {
      if (document.title !== meta.title) document.title = meta.title;
      var d = document.querySelector('meta[name="description"]');
      if (d && d.getAttribute('content') !== meta.description) d.setAttribute('content', meta.description);
    });
    var titleEl = document.querySelector('title');
    if (titleEl) window.__axioMetaObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
    if (descEl) window.__axioMetaObserver.observe(descEl, { attributes: true, attributeFilter: ['content'] });
    window.__axioMetaObserver.observe(document.head, { childList: true });
  }

  // Same hydration-reversion problem as the title/description above: the
  // static markup's favicon <link> tags get replaced by React's own
  // hydrated version (plain "/favicon.ico" for both icon and
  // apple-touch-icon, no sizes, no PNG variants, no cache-busting). Updates
  // the two React-managed tags in place (never removes them, consistent
  // with how every other DOM-mutating pass in this file avoids detaching
  // nodes React might reconcile against) and appends the two extra PNG
  // size variants once.
  var FAVICON_ICO_HREF = DEPTH + 'favicon.ico?v=2';
  var FAVICON_APPLE_HREF = DEPTH + 'apple-touch-icon.png?v=2';
  var FAVICON_PNG_VARIANTS = [
    { href: DEPTH + 'favicon-32x32.png?v=2', sizes: '32x32' },
    { href: DEPTH + 'favicon-16x16.png?v=2', sizes: '16x16' },
  ];

  function enforceFavicon() {
    var iconLink = Array.prototype.filter
      .call(document.querySelectorAll('link[rel="icon"]'), function (l) {
        return !l.hasAttribute('data-axio-favicon-extra');
      })
      .pop();
    if (iconLink) {
      if (iconLink.getAttribute('href') !== FAVICON_ICO_HREF) iconLink.setAttribute('href', FAVICON_ICO_HREF);
      if (iconLink.getAttribute('sizes') !== 'any') iconLink.setAttribute('sizes', 'any');
    }

    var appleLink = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleLink) {
      if (appleLink.getAttribute('href') !== FAVICON_APPLE_HREF) appleLink.setAttribute('href', FAVICON_APPLE_HREF);
      if (appleLink.getAttribute('sizes') !== '180x180') appleLink.setAttribute('sizes', '180x180');
    }

    if (!document.querySelector('link[data-axio-favicon-extra]')) {
      FAVICON_PNG_VARIANTS.forEach(function (item) {
        var el = document.createElement('link');
        el.rel = 'icon';
        el.type = 'image/png';
        el.setAttribute('sizes', item.sizes);
        el.href = item.href;
        el.setAttribute('data-axio-favicon-extra', '1');
        document.head.appendChild(el);
      });
    }
  }

  // The mirrored markup points every optimized <img> at a static filename
  // that impersonates a Next.js image-proxy query string (e.g.
  // "_next/image@url=%252Fassets%252F...&w=2048&q=75"). That literal
  // double-encoded "%252F" survives fine on a plain static server, but at
  // least one real host (Vercel) decodes the request path once before
  // matching it against the filesystem, so it 404s there even though it
  // works locally.
  //
  // The site's own React tree partially hydrates around our text edits
  // (mismatched content trips hydration bail-outs elsewhere on the page,
  // but not everywhere), and for images where it succeeds it re-renders
  // the <Image> component and overwrites BOTH `src` and `srcset` with a
  // live "/_next/image?url=...&w=..." request -- which has no backing
  // route at all on a static export, so it 404s too, just later and in a
  // different-looking shape. That means the clean path can't be read off
  // `srcset` reliably (hydration can beat this script to the punch and
  // clobber it first), so decode it directly out of whatever `_next/image`
  // URL is currently present -- both the "@url=" static form and the
  // "?url=" hydrated form encode the same real path, just with one vs two
  // rounds of percent-encoding. A MutationObserver re-applies this any time
  // `src`/`srcset` change, regardless of hydration timing.
  function decodeNextImageUrl(value) {
    var m = /[?@]url=([^&]+)/.exec(value);
    if (!m) return null;
    var decoded = m[1];
    for (var i = 0; i < 3; i++) {
      var next = decoded.replace(/%25/g, '%');
      if (next === decoded) break;
      decoded = next;
    }
    try {
      return decodeURIComponent(decoded);
    } catch (e) {
      return null;
    }
  }

  function fixNextImageSrcs(root) {
    var clean = function (img) {
      var raw = img.getAttribute('src') || '';
      if (raw.indexOf('_next/image') === -1) return;
      var path = decodeNextImageUrl(raw);
      if (!path) return;
      if (img.getAttribute('src') !== path) img.setAttribute('src', path);
      if (img.hasAttribute('srcset')) img.removeAttribute('srcset');
    };
    root.querySelectorAll('img[src*="_next/image"]').forEach(clean);

    if (window.__axioImageObserver) return;
    window.__axioImageObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'attributes' && m.target.tagName === 'IMG') clean(m.target);
      });
    });
    window.__axioImageObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['src', 'srcset'],
      subtree: true,
    });
  }

  // A couple of custom-built sections (not part of the original template)
  // need a real responsive grid instead of ad-hoc flex-wrap so cards don't
  // orphan awkwardly (e.g. 3 cards on one row, 1 alone on the next) at
  // tablet widths.
  function injectAxioStyles() {
    if (document.getElementById('axio-custom-styles')) return;
    var style = document.createElement('style');
    style.id = 'axio-custom-styles';
    style.textContent =
      '.axio-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:1.5rem;}' +
      '@media (max-width:900px){.axio-grid-4{grid-template-columns:repeat(2,1fr);}}' +
      '@media (max-width:480px){.axio-grid-4{grid-template-columns:1fr;}}' +
      '.axio-orbit-hero-video{opacity:0;transition:opacity .6s ease;}' +
      '.axio-orbit-hero-video.axio-orbit-video-ready{opacity:1;}' +
      '.axio-journey-glow{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;}' +
      '.axio-journey-glow>span{position:absolute;border-radius:50%;filter:blur(70px);will-change:opacity,transform;}' +
      '.axio-journey-glow>span:nth-child(1){width:52vw;height:52vw;max-width:760px;max-height:760px;right:-8%;bottom:6%;' +
      'background:radial-gradient(circle,rgba(58,72,224,0.65) 0%,rgba(58,72,224,0) 70%);' +
      'opacity:calc(0.15 + var(--glow-progress,0) * 0.75);' +
      'transform:scale(calc(0.82 + var(--glow-progress,0) * 0.28)) translateY(calc((1 - var(--glow-progress,0)) * 40px));}' +
      '.axio-journey-glow>span:nth-child(2){width:32vw;height:32vw;max-width:460px;max-height:460px;right:8%;bottom:26%;' +
      'background:radial-gradient(circle,rgba(122,127,220,0.6) 0%,rgba(122,127,220,0) 70%);' +
      'opacity:calc(0.1 + var(--glow-progress,0) * 0.6);' +
      'transform:scale(calc(0.85 + var(--glow-progress,0) * 0.22)) translateY(calc((1 - var(--glow-progress,0)) * 25px));}' +
      '.axio-journey-glow>span:nth-child(3){width:20vw;height:20vw;max-width:280px;max-height:280px;right:20%;bottom:42%;' +
      'background:radial-gradient(circle,rgba(180,190,255,0.5) 0%,rgba(180,190,255,0) 70%);' +
      'opacity:calc(0.08 + var(--glow-progress,0) * 0.5);' +
      'transform:scale(calc(0.9 + var(--glow-progress,0) * 0.15));}' +
      '@media (max-width:900px){.axio-journey-glow>span:nth-child(1){width:80vw;height:80vw;right:-15%;}' +
      '.axio-journey-glow>span:nth-child(2){width:55vw;height:55vw;}' +
      '.axio-journey-glow>span:nth-child(3){width:38vw;height:38vw;}}';
    document.head.appendChild(style);
  }

  // The About Us hero already has a full-bleed background <video> with
  // exactly the right sizing/positioning for this (100vh, object-fit:cover,
  // top-fade mask, title anchored to the bottom of the same section) --
  // that's the site's own original CSS, already correct. Reuse it instead
  // of building a parallel section: just swap its source to the supplied
  // orbit animation and drop the old (still-stale-branded) footage, so the
  // video only ever appears once, sized exactly like the reference.
  function buildAboutUsOrbitAnimation(root) {
    if (!/(^|\/)how$/i.test(PATH_NORM)) return;
    var main = root.querySelector('main');
    var hero = main ? main.querySelector('[class*="__01-hero_Hero__"]') : null;
    var video = hero ? hero.querySelector(':scope > video') : null;
    if (!video || video.hasAttribute('data-axio-orbit-wired')) return;
    video.setAttribute('data-axio-orbit-wired', 'true');

    video.src = DEPTH + 'assets/how/orbit/orbit-animation.mp4';
    video.loop = true;
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.classList.add('axio-orbit-hero-video');
    video.addEventListener('loadeddata', function () {
      video.classList.add('axio-orbit-video-ready');
    });

    var tryPlay = function () {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    };
    tryPlay();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && video.paused) tryPlay();
    });
  }

  // The journey timeline's decorative "blue-4.webp" is a flat rectangle --
  // solid black over roughly two-thirds of the frame, solid blue over the
  // rest, no soft alpha edge at all. It only ever looked fine because it
  // was 404ing (see fixNextImageSrcs) and the SVG curve's own blurred
  // stroke was doing 100% of the visible glow on its own; fixing the 404
  // exposed it as a hard-edged box. Drop it and replace it with a proper
  // layered radial-gradient glow that brightens and drifts as the section
  // scrolls through the viewport, driven by a --glow-progress custom
  // property (see injectAxioStyles for the layer definitions).
  function buildJourneyScrollGlow(root) {
    if (!/(^|\/)how$/i.test(PATH_NORM)) return;
    var journey = root.querySelector('[class*="__02-how-it-works_HowItWorks__"]');
    var lineContainer = journey ? journey.querySelector('[class*="__02-how-it-works_HowItWorks_line__"]') : null;
    if (!journey || !lineContainer || lineContainer.querySelector('.axio-journey-glow')) return;

    var oldImg = journey.querySelector('#home-how-blue');
    if (oldImg) hideAxioEl(oldImg);

    var glow = document.createElement('div');
    glow.className = 'axio-journey-glow';
    glow.innerHTML = '<span></span><span></span><span></span>';
    lineContainer.insertBefore(glow, lineContainer.firstChild);

    // Guard against React re-inserting the image later: hydration can
    // re-render this subtree after our initial removal runs. Deferred past
    // any in-flight resize so this doesn't remove a node React is mid-way
    // through reconciling (see msUntilResizeQuiet above).
    new MutationObserver(function () {
      var wait = msUntilResizeQuiet();
      var run = function () {
        var reinserted = journey.querySelector('#home-how-blue');
        if (reinserted) hideAxioEl(reinserted);
      };
      if (wait > 0) setTimeout(run, wait);
      else run();
    }).observe(lineContainer, { childList: true, subtree: true });

    var ticking = false;
    var update = function () {
      ticking = false;
      var rect = journey.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var total = rect.height + vh;
      var progress = total > 0 ? (vh - rect.top) / total : 0;
      progress = Math.max(0, Math.min(1, progress));
      journey.style.setProperty('--glow-progress', progress.toFixed(4));
    };
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  // The homepage's "Loved" testimonial section (a Three.js WebGL scene) has
  // been removed entirely per explicit request -- it didn't fit the design.
  // The static markup's own "#loved" / "lovedv2_Loved__" node is removed
  // every cleanup() cycle by buildHomeContent below; nothing else to build
  // here.
  function removeLovedSection(root) {
    var el = root.getElementById('loved');
    if (el) hideAxioEl(el);
  }

  // The "Ready to dive in?" video background already ships in the mirrored
  // markup, but the source SSR output never sets autoplay/loop on the
  // <video> tag (the original site drives play/pause imperatively via JS
  // tied to an IntersectionObserver). Wire that up directly so it behaves
  // the same without depending on that fragile client bundle.
  function enableReadyVideoAutoplay(root) {
    var section = root.querySelector('[class*="__10-ready_Ready__"]');
    var video = section ? section.querySelector('[class*="__10-ready_Ready_bg__"] video') : null;
    if (!video || video.hasAttribute('data-axio-autoplay-wired')) return;
    video.setAttribute('data-axio-autoplay-wired', 'true');
    video.muted = true;
    video.loop = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.removeAttribute('controls');

    var tryPlay = function () {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    };

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) tryPlay();
            else video.pause();
          });
        },
        { threshold: 0.1 }
      );
      io.observe(section);
    } else {
      tryPlay();
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && video.paused) tryPlay();
    });
  }

  function hrefTo(target) {
    if (DEPTH) {
      if (target.indexOf('programs/') === 0) return target.slice('programs/'.length);
      return '../' + target;
    }
    return target;
  }

  function logoImg(heightPx) {
    var img = document.createElement('img');
    img.src = LOGO_SRC;
    img.alt = 'Axio Ventures';
    img.style.height = heightPx + 'px';
    img.style.width = 'auto';
    img.style.display = 'inline-block';
    img.style.objectFit = 'contain';
    return img;
  }

  function textWalk(root, fn) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].indexOf(p.tagName) !== -1) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var node;
    var nodes = [];
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(fn);
  }

  function findByText(root, substring) {
    var found = null;
    textWalk(root, function (n) {
      if (!found && n.textContent.indexOf(substring) !== -1) found = n;
    });
    return found;
  }

  function replaceOnce(marker, findFn, html) {
    if (document.querySelector('[data-axio-replaced="' + marker + '"]')) return;
    var el = findFn();
    if (!el) return;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    var replacement = wrapper.firstElementChild;
    replacement.setAttribute('data-axio-replaced', marker);
    replaceAxioEl(el, replacement);
  }

  // ---------------------------------------------------------------------
  // Cleanup: removals inherited from earlier rounds
  // ---------------------------------------------------------------------

  function removeDiscordLinks(root) {
    root.querySelectorAll('a[href*="discord.com"]').forEach(function (a) {
      var parent = a.parentElement;
      if (parent && parent.tagName === 'BUTTON' && !a.textContent.trim()) hideAxioEl(parent);
      else hideAxioEl(a);
    });
  }

  function removeSocialLinks(root) {
    root.querySelectorAll('a[href*="instagram.com"], a[href*="x.com/"], a[href*="twitter.com"]').forEach(function (a) {
      hideAxioEl(a);
    });
    root.querySelectorAll('*').forEach(function (el) {
      if (el.children.length === 0 && el.textContent.trim() === 'Follow') {
        var target = el.parentElement;
        for (var i = 0; i < 3 && target; i++) {
          if (target.className && /Nav_col__|nav_Nav_col/.test(String(target.className))) break;
          target = target.parentElement;
        }
        if (target) hideAxioEl(target);
      }
    });
  }

  function removeJoinSection(root) {
    root.querySelectorAll('*').forEach(function (el) {
      var cls = el.className;
      if (typeof cls === 'string' && /_Join__/.test(cls)) hideAxioEl(el);
    });
  }

  function removeVerifiedPayouts(root) {
    root.querySelectorAll('section').forEach(function (sec) {
      if (/verified payout/i.test(sec.textContent)) hideAxioEl(sec);
    });
  }

  function removeTradingDisclaimer(root) {
    root.querySelectorAll('*').forEach(function (el) {
      if (el.children.length === 0 && /Hypothetical or Simulated performance/i.test(el.textContent)) {
        var wrapper = el.closest('[class*="ListItem__"]') || el.parentElement;
        if (wrapper) hideAxioEl(wrapper);
      }
    });
  }

  function replaceLogos(root) {
    root.querySelectorAll('svg[width="190"][height="22"]').forEach(function (svg) {
      replaceAxioEl(svg, logoImg(36));
    });
    root.querySelectorAll('img[src*="logo.770084dd"]').forEach(function (img) {
      replaceAxioEl(img, logoImg(20));
    });
  }

  // Both the header and footer logo slots render differently depending on
  // hydration timing: the static markup ships a plain gradient-square
  // placeholder next to "Axio Ventures" text, but once the site's own React
  // hydrates, it replaces the slot's entire contents with its real client
  // component -- a bare 190x22 SVG wordmark, no wrapping <span>, no separate
  // text nodes (confirmed by inspecting the live post-hydration DOM).
  // Rather than special-case both shapes, hide *everything* currently
  // inside the logo container and build one consistent icon + text markup
  // ourselves, guarded by our own marker so repeated cleanup() cycles don't
  // pile up duplicates.
  function buildLogoIcon(container, iconPx, fontPx) {
    if (container.querySelector('[data-axio-logo-built]')) return;
    Array.from(container.children).forEach(function (child) {
      hideAxioEl(child);
    });
    var wrap = document.createElement('span');
    wrap.setAttribute('data-axio-logo-built', '1');
    wrap.style.cssText =
      'display:inline-flex;align-items:center;gap:7px;font-weight:800;font-size:' +
      fontPx +
      'px;line-height:1;letter-spacing:-0.02em;white-space:nowrap;color:#fff;';
    var img = document.createElement('img');
    img.src = DEPTH + 'assets/brand/axio-ventures-icon.png';
    img.alt = 'Axio Ventures';
    img.style.cssText = 'display:inline-block;height:' + iconPx + 'px;width:auto;object-fit:contain;flex-shrink:0;';
    var ventures = document.createElement('span');
    ventures.style.cssText = 'font-weight:400;opacity:.75;margin-left:.3em;';
    ventures.textContent = 'Ventures';
    wrap.appendChild(img);
    wrap.appendChild(document.createTextNode('Axio'));
    wrap.appendChild(ventures);
    container.appendChild(wrap);
  }

  function buildHeaderLogoIcon(root) {
    root.querySelectorAll('[class*="Header_logo__"]').forEach(function (a) {
      buildLogoIcon(a, 24, 20);
    });
    root.querySelectorAll('[class*="Footer_info_logo__"]').forEach(function (div) {
      buildLogoIcon(div, 20, 17);
    });
  }

  // The "Get started today with [icon] Axio Ventures" headline
  // (affiliate.html, direct-to-sim-live.html) embeds the original,
  // un-rebranded logo mark (class "LogoSmall__") inline in a run of text.
  // As a plain inline element it takes the default baseline vertical-align,
  // which puts most of its 42px-tall artwork above the surrounding text --
  // reading as "positioned too high, not centered". Swap it for our own
  // icon, explicitly middle-aligned and sized relative to the surrounding
  // text so it centers correctly regardless of heading size/breakpoint.
  function fixGetStartedTitleLogo(root) {
    root.querySelectorAll('[class*="LogoSmall__"]').forEach(function (a) {
      if (a.querySelector('img[data-axio-logo-icon]')) return;
      Array.from(a.children).forEach(function (child) {
        hideAxioEl(child);
      });
      var img = document.createElement('img');
      img.src = DEPTH + 'assets/brand/axio-ventures-icon.png';
      img.alt = 'Axio Ventures';
      img.setAttribute('data-axio-logo-icon', '1');
      img.style.cssText = 'display:inline-block;height:0.8em;width:auto;object-fit:contain;vertical-align:middle;margin:0 0.1em;';
      a.appendChild(img);
    });
  }

  // The top announcement banner (class "banner_Banner__") has no backend
  // behind this static export to ever feed it real content, so it's
  // permanently stuck rendering its own loading skeleton on every page --
  // and reserves 50px of space for it at the top of <body> via inline
  // padding-top / a --banner-offset custom property. Hide it and reclaim
  // that space so nothing shows or keeps "loading" at the top of the page.
  function removeTopBanner(root) {
    root.querySelectorAll('[class*="banner_Banner__"]').forEach(function (el) {
      hideAxioEl(el);
    });
    if (document.body.style.paddingTop !== '0px') document.body.style.paddingTop = '0px';
    document.body.style.setProperty('--banner-offset', '0px');
  }

  function removeMarketingButtons(root) {
    var pattern = /^(get funded|choose\b|become an affil|start a challenge|get started|login)/i;
    root.querySelectorAll('button').forEach(function (btn) {
      if (pattern.test(btn.textContent.trim())) hideAxioEl(btn);
    });
    root
      .querySelectorAll(
        'a[href*="trader/register"], a[href*="trader/login"], a[href="https://app.fxifyfutures.com/"], a[href="https://app.axioventures.com/"], a[href*="trader/challenges/create"]'
      )
      .forEach(function (a) {
        var btn = a.closest('button');
        hideAxioEl(btn || a);
      });
    root.querySelectorAll('*').forEach(function (el) {
      if (el.className && typeof el.className === 'string' && /GetStartedCard/.test(el.className)) hideAxioEl(el);
    });
  }

  function insertContactCta(marker, container) {
    if (!container || container.querySelector('[data-axio-cta="' + marker + '"]')) return;
    var btn = document.createElement('a');
    btn.href = hrefTo('contact-us.html');
    btn.setAttribute('data-axio-cta', marker);
    btn.textContent = 'Contact Us';
    btn.style.cssText =
      'display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#4a6cf7,#6c5ce7);color:#fff;font-weight:600;padding:12px 24px;border-radius:999px;text-decoration:none;white-space:nowrap;';
    container.appendChild(btn);
  }

  function fixLingeringDomains(root) {
    root.querySelectorAll('a[href*="fxifyfutures.com"]').forEach(function (a) {
      a.setAttribute('href', a.getAttribute('href').replace(/fxifyfutures\.com/gi, 'axioventurez.com'));
    });
  }

  // The homepage hero visual is hardcoded into the site's own compiled
  // React bundle, not just the static markup -- editing it directly in
  // index.html gets silently reverted by hydration a moment after page
  // load. What hydration actually renders varies (confirmed by testing):
  // sometimes a static <img alt="Hero img"> pointing at the original
  // mirrored asset, sometimes a <video src="...starter-2.mp4">, depending
  // on exactly what the static markup had going into hydration -- so this
  // matches on either. Handle it entirely at the JS level with a
  // MutationObserver to keep correcting it, deferred past any in-flight
  // resize (this hero visual is exactly the kind of element a
  // breakpoint-gated component might re-render on resize, so this follows
  // the same resize-quiet guard as buildJourneyScrollGlow above).
  function replaceHeroVisual(root) {
    if (!IS_HOME) return;
    var swapVideo = function () {
      var old = document.querySelector('img[alt="Hero img"]') || document.querySelector('video[src*="starter-2.mp4"]');
      if (!old) return;
      var banner = document.createElement('img');
      banner.className = 'w-full h-full object-contain object-bottom-right';
      banner.alt = 'Axio Ventures';
      banner.src = DEPTH + 'assets/home/01-hero/banner.png';
      replaceAxioEl(old, banner);
    };
    swapVideo();
    if (window.__axioHeroObserver) return;
    window.__axioHeroObserver = new MutationObserver(function () {
      var wait = msUntilResizeQuiet();
      if (wait > 0) setTimeout(swapVideo, wait);
      else swapVideo();
    });
    window.__axioHeroObserver.observe(document.body, { childList: true, subtree: true });
  }

  function replaceBrandText(root) {
    var pattern = /FXIFY(\s*Futures)?(\.com)?/gi;
    textWalk(root, function (n) {
      if (pattern.test(n.textContent)) {
        pattern.lastIndex = 0;
        n.textContent = n.textContent.replace(pattern, 'Axio Ventures');
      }
      pattern.lastIndex = 0;
    });
    document.querySelectorAll('title, meta[name="description"], meta[property="og:title"], meta[property="og:description"]').forEach(function (el) {
      if (el.tagName === 'TITLE') el.textContent = el.textContent.replace(pattern, 'Axio Ventures');
      else if (el.hasAttribute('content')) el.setAttribute('content', el.getAttribute('content').replace(pattern, 'Axio Ventures'));
    });
  }

  // ---------------------------------------------------------------------
  // Nav / footer label renames + Services mega-dropdown
  // ---------------------------------------------------------------------

  function renameNavLabels(root) {
    root.querySelectorAll('a[href*="how.html"], a[href="/how"], a[href*="how"]').forEach(function (a) {
      if (/^\/?how(\.html)?$/.test(a.getAttribute('href') || '') || /how\.html$/.test(a.getAttribute('href') || '')) {
        if (a.textContent.trim() === 'How it Works') a.textContent = 'About Us';
      }
    });
    // "How it Works" nav dropdown trigger (no href, just header text)
    root.querySelectorAll('[class*="NavItem_header"]').forEach(function (a) {
      var firstTextNode = Array.from(a.childNodes).find(function (n) {
        return n.nodeType === 3 && n.textContent.trim();
      });
      if (!firstTextNode) return;
      var t = firstTextNode.textContent.trim();
      if (t === 'How it Works') firstTextNode.textContent = firstTextNode.textContent.replace('How it Works', 'About Us');
    });
  }

  // "Plans" nav dropdown trigger (header, mobile menu, and a hidden duplicate
  // nav list) -> "Services", matching the mega-dropdown content already
  // rebuilt by restructureServicesDropdown.
  function renamePlansToServices(root) {
    root.querySelectorAll('[class*="NavItem_header"]').forEach(function (a) {
      var firstTextNode = Array.from(a.childNodes).find(function (n) {
        return n.nodeType === 3 && n.textContent.trim();
      });
      if (!firstTextNode) return;
      if (firstTextNode.textContent.trim() === 'Plans') firstTextNode.textContent = firstTextNode.textContent.replace('Plans', 'Services');
    });
    root.querySelectorAll('[class*="NavItem__"]').forEach(function (el) {
      if (el.children.length === 0 && el.textContent.trim() === 'Plans') el.textContent = 'Services';
    });
  }

  // "Standard plan" is the original trading-tier label for the
  // Procurement & Construction service, and shows up in several places:
  // the Services nav dropdown card, a hidden footer sitemap list, and the
  // Standard/Expert "Choose" pricing widget (card title + CTA button) on
  // programs/standard.html. The dropdown and Choose widget are already
  // handled structurally elsewhere in this file (restructureServicesDropdown,
  // removeChooseWidget), but this text-level pass runs everywhere as a
  // second line of defense so the wording is correct regardless of which
  // structural fix a given instance goes through.
  function renameStandardPlanText(root) {
    textWalk(root, function (n) {
      var t = n.textContent.trim();
      if (t === 'Standard plan' || t === 'Standard Plan') {
        n.textContent = n.textContent.replace(/Standard [Pp]lan/, 'Procurement & Construction');
      } else if (t === 'Choose Standard plan' || t === 'Choose Standard Plan') {
        n.textContent = n.textContent.replace(/Standard [Pp]lan/, 'Procurement & Construction');
      }
    });
    root.querySelectorAll('[class*="card_Card_title__"]').forEach(function (el) {
      if (el.textContent.trim() === 'Standard') el.textContent = 'Procurement & Construction';
    });
  }

  // The "Affiliate" nav entry duplicated the About Us page; remove it
  // outright (header link, mobile menu item) instead of relabeling it.
  function removeAffiliateNavItem(root) {
    root.querySelectorAll('a[href*="affiliate"]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!/affiliate(\.html)?$/.test(href)) return;
      var wrapper = a.closest('[class*="NavItem__"]') || a;
      hideAxioEl(wrapper);
    });
  }

  // Add a plain "Home" nav item at the start of the nav (header + mobile menu).
  function addHomeNavLink(root) {
    var homeHref = hrefTo('index.html');
    root.querySelectorAll('[class*="Header_nav__"]').forEach(function (nav) {
      if (nav.getAttribute('data-axio-home-link-done')) return;
      var ref = nav.querySelector('a[href*="how.html"], [class*="NavItem__"]');
      var a = document.createElement('a');
      a.className = ref ? ref.className : 'nav-item_NavItem__7HvXY';
      a.href = homeHref;
      a.textContent = 'Home';
      nav.insertBefore(a, nav.firstChild);
      nav.setAttribute('data-axio-home-link-done', '1');
    });
    root.querySelectorAll('[class*="ModalMenu_inner__"]').forEach(function (inner) {
      if (inner.getAttribute('data-axio-home-link-done')) return;
      var refLink = inner.querySelector('a[class*="NavItem_header"]');
      var wrapper = document.createElement('div');
      wrapper.className = refLink && refLink.parentElement ? refLink.parentElement.className : 'nav-item_NavItem__Wt7vP';
      var a = document.createElement('a');
      a.className = refLink ? refLink.className : 'nav-item_NavItem_header__BmxB5';
      a.href = homeHref;
      a.textContent = 'Home';
      wrapper.appendChild(a);
      inner.insertBefore(wrapper, inner.firstChild);
      inner.setAttribute('data-axio-home-link-done', '1');
    });
  }

  // Header/mobile-menu "buttons" slot used to hold Login + Get Funded;
  // removeMarketingButtons strips both, leaving an empty wrapper that threw
  // off the header's alignment. Fill it with a single Contact Us CTA.
  function fixHeaderButtons(root) {
    root.querySelectorAll('[class*="Header_buttons__"], [class*="ModalMenu_buttons__"]').forEach(function (wrap) {
      if (wrap.getAttribute('data-axio-header-cta-done')) return;
      var visible = Array.from(wrap.children).filter(function (c) {
        return !c.hasAttribute('data-axio-hidden');
      });
      if (visible.length > 0) return;
      wrap.setAttribute('data-axio-header-cta-done', '1');
      var a = document.createElement('a');
      a.href = hrefTo('contact-us.html');
      a.className = 'button_Button__Feu4K button_purple__IzJId';
      a.style.textDecoration = 'none';
      a.textContent = 'Contact Us';
      wrap.appendChild(a);
    });
  }

  function collapseSupportDropdown(root) {
    root.querySelectorAll('[class*="NavItem_header"]').forEach(function (header) {
      if (header.textContent.trim().indexOf('Support') !== 0) return;
      var navItem = header.closest('[class*="NavItem__"]');
      if (!navItem || navItem.getAttribute('data-axio-support-collapsed')) return;
      navItem.setAttribute('data-axio-support-collapsed', '1');
      var a = document.createElement('a');
      a.href = hrefTo('contact-us.html');
      a.className = header.className;
      a.textContent = 'Contact Us';
      navItem.innerHTML = '';
      navItem.appendChild(a);
    });
  }

  var SERVICES_DROPDOWN_HTML =
    '<a href="__STANDARD__" class="list-item_ListItem__VbVRx" style="font-weight:700;">Procurement &amp; Construction</a>' +
    '<a href="__STANDARD__#defense-government-procurement" class="list-item_ListItem__VbVRx" style="padding-left:1.75rem;font-size:0.92em;opacity:0.85;">Defense &amp; Government Procurement</a>' +
    '<a href="__DTSL__" class="list-item_ListItem__VbVRx" style="padding-left:1.75rem;font-size:0.92em;opacity:0.85;">Turnkey Procurement</a>' +
    '<a href="__STANDARD__#technology-solutions-indenting" class="list-item_ListItem__VbVRx" style="padding-left:1.75rem;font-size:0.92em;opacity:0.85;">Technology Solutions &amp; Indenting</a>' +
    '<a href="__EXPERT__" class="list-item_ListItem__VbVRx" style="font-weight:700;margin-top:0.5rem;display:block;">Smart Security &amp; Automation</a>' +
    '<a href="__EXPERT__#security-alarm-systems" class="list-item_ListItem__VbVRx" style="padding-left:1.75rem;font-size:0.92em;opacity:0.85;">Security Alarm Systems</a>' +
    '<a href="__EXPERT__#smart-ai-cameras" class="list-item_ListItem__VbVRx" style="padding-left:1.75rem;font-size:0.92em;opacity:0.85;">Smart AI Cameras</a>' +
    '<a href="__EXPERT__#electric-fencing" class="list-item_ListItem__VbVRx" style="padding-left:1.75rem;font-size:0.92em;opacity:0.85;">Electric Fencing</a>' +
    '<a href="__EXPERT__#smart-access-control" class="list-item_ListItem__VbVRx" style="padding-left:1.75rem;font-size:0.92em;opacity:0.85;">Smart Access Control</a>' +
    '<a href="__EXPERT__#smart-homes" class="list-item_ListItem__VbVRx" style="padding-left:1.75rem;font-size:0.92em;opacity:0.85;">Smart Homes</a>';

  function restructureServicesDropdown(root) {
    var html = SERVICES_DROPDOWN_HTML.replace(/__STANDARD__/g, hrefTo('programs/standard.html'))
      .replace(/__EXPERT__/g, hrefTo('programs/expert.html'))
      .replace(/__DTSL__/g, hrefTo('direct-to-sim-live.html'));
    root.querySelectorAll('[class*="NavItem_list_inner"]').forEach(function (inner) {
      if (inner.getAttribute('data-axio-services-done')) return;
      var hasStandard = inner.querySelector('a[href*="standard"]');
      var hasSimLive = inner.querySelector('a[href*="direct-to-sim-live"]');
      if (!hasStandard || !hasSimLive) return;
      inner.innerHTML = html;
      inner.setAttribute('data-axio-services-done', '1');
    });
  }

  // ---------------------------------------------------------------------
  // Footer rewrite
  // ---------------------------------------------------------------------

  function rewriteFooter(root) {
    var footer = root.querySelector('[class*="Footer__"]');
    if (!footer) return;

    var infoBlock = footer.querySelector('[class*="Footer_info"]');
    if (infoBlock && !infoBlock.getAttribute('data-axio-footer-done')) {
      var taglineNode = findByText(infoBlock, 'premier futures prop trading firm');
      if (taglineNode) {
        taglineNode.textContent = 'Your trusted partner in procurement, technology, and security solutions. Delivering excellence across all sectors.';
      }
      textWalk(infoBlock, function (n) {
        if (/Axio Ventures (Limited|is the premier)/i.test(n.textContent) && n.textContent.trim() === 'Axio Ventures Limited') {
          n.textContent = 'Axio Ventures Private Limited';
        }
        if (/Pembroke Street|Dublin|Sector B Commercial/i.test(n.textContent)) {
          n.textContent = 'Office Number 3034, 3rd Floor Giga Mall, DHA Phase 2, Islamabad';
        }
      });
      infoBlock.setAttribute('data-axio-footer-done', '1');
    }

    var copyrightNode = findByText(footer, 'All rights reserved');
    if (copyrightNode && copyrightNode.parentElement) {
      copyrightNode.parentElement.textContent = '© 2026 Axio Ventures Private Limited. All rights reserved. Made with ❤';
    }

    removeTradingDisclaimer(footer);

    var cols = footer.querySelectorAll('[class*="NavCol__"]');
    cols.forEach(function (col) {
      if (col.getAttribute('data-axio-col-done')) return;
      var title = col.querySelector('[class*="NavCol_title"]');
      var list = col.querySelector('[class*="NavCol_list"]');
      if (!title || !list) return;
      var titleText = title.textContent.trim();

      if (titleText === 'Get Started') {
        title.textContent = 'Quick Links';
        list.innerHTML =
          '<a href="' + hrefTo('index.html') + '" class="' + (list.firstElementChild ? list.firstElementChild.className : '') + '">Home</a>' +
          '<a href="' + hrefTo('how.html') + '" class="' + (list.firstElementChild ? list.firstElementChild.className : '') + '">About Us</a>' +
          '<a href="' + hrefTo('programs/standard.html') + '" class="' + (list.firstElementChild ? list.firstElementChild.className : '') + '">Services</a>' +
          '<a href="' + hrefTo('contact-us.html') + '" class="' + (list.firstElementChild ? list.firstElementChild.className : '') + '">Contact Us</a>';
        col.setAttribute('data-axio-col-done', '1');
      } else if (titleText === 'Support') {
        title.textContent = 'Our Services';
        list.innerHTML =
          '<a href="' + hrefTo('programs/standard.html') + '" class="' + (list.firstElementChild ? list.firstElementChild.className : '') + '">Procurement &amp; Construction</a>' +
          '<a href="' + hrefTo('programs/expert.html') + '" class="' + (list.firstElementChild ? list.firstElementChild.className : '') + '">Smart Security &amp; Automation</a>';
        col.setAttribute('data-axio-col-done', '1');
      } else if (titleText === 'Info') {
        col.setAttribute('data-axio-col-done', '1');
      }
    });
  }

  // ---------------------------------------------------------------------
  // Home page content
  // ---------------------------------------------------------------------

  var USP_BADGES = ['Smart Security', 'Advanced Protection', 'Fast Delivery', 'On-Time Results', 'Certified', 'Quality Assured'];

  function buildHomeContent(root) {
    if (!IS_HOME) return;

    // Hero -- find it via the page's actual <h1> rather than "whichever
    // section/main-child happens to sort first": a "Get started today"
    // card also sits as a direct child of <main> and, depending on DOM
    // order, could be selected instead of the real hero (has no <h1>,
    // which silently skipped the edit while still permanently marking the
    // one-time guard, leaving the real hero text unedited forever).
    var homeH1 = root.querySelector('main h1');
    var hero = homeH1 ? homeH1.closest('section') : null;
    if (hero && !hero.getAttribute('data-axio-hero-done')) {
      var h1 = homeH1;
      if (h1) {
        h1.innerHTML = 'Your Trusted Partner in <span class="text-main-soft">Procurement &amp; Technology</span>';
      }
      var heroPara = hero.querySelector('p');
      if (heroPara) {
        heroPara.textContent =
          'Delivering tailored, innovative, and cost-effective solutions in government & defense procurement, smart security, IT & software development, and infrastructure.';
      }
      var buttonRow = hero.querySelector('[class*="flex items-stretch gap-6"]') || (heroPara && heroPara.parentElement.querySelector('div'));
      if (buttonRow) insertContactCta('hero', buttonRow);
      hero.setAttribute('data-axio-hero-done', '1');
    }

    // USP scroller -> trust badges
    root.querySelectorAll('[class*="item_USP_Title"]').forEach(function (el, i) {
      el.textContent = USP_BADGES[i % USP_BADGES.length];
    });

    // Fill the slot left by the removed pricing/account-size swiper with Vision content
    replaceOnce(
      'vision-section',
      function () {
        return root.querySelector('[data-axio-replaced="choose-widget-slot"]');
      },
      '<section class="container-v2" style="padding:5rem 0;display:flex;flex-direction:column;align-items:center;gap:1.25rem;text-align:center;">' +
        '<p style="color:#7A7FDC;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;font-size:0.85rem;">Our Vision</p>' +
        '<h2 style="font-size:2rem;font-weight:600;color:#fff;max-width:700px;">Shaping the Future of Procurement &amp; Technology</h2>' +
        '<p style="color:#d8defe;font-size:1.05rem;line-height:1.6;max-width:700px;">' +
        'To be the leading partner in procurement and technology solutions, empowering organizations with innovative, secure, and sustainable solutions that drive growth and operational excellence across all sectors.' +
        '</p>' +
        '</section>'
    );

    // "How it Works" 4-step -> "Our Process"
    var processNode = findByText(root, 'A simple path to becoming a funded trader');
    if (processNode) {
      processNode.textContent = 'A simple path from inquiry to delivery';
      var processSection = processNode.parentElement ? processNode.parentElement.closest('section') : null;
      if (processSection) {
        var headingNode = findByText(processSection, 'How it Works');
        if (headingNode) headingNode.textContent = 'Our Process';
        var stepTitles = [
          ['Select a Program that works for you', 'Inquiry & Consultation'],
          ['Complete the objectives', 'Sourcing & Planning'],
          ['Receive your Live Account credentials', 'Project Execution'],
          ['Performance pays', 'Delivery & After-Sales Support'],
        ];
        var stepBodies = [
          'Share your requirements and we’ll consult on the right procurement, security, or technology solution for your needs.',
          'We handle strategic sourcing, vendor management, and detailed project planning.',
          'Our team executes the project, from procurement and construction to system installation.',
          'We deliver on time and stand behind our work with ongoing support.',
        ];
        stepTitles.forEach(function (pair, i) {
          var n = findByText(processSection, pair[0]);
          if (n) {
            n.textContent = pair[1];
            var container = n.parentElement;
            var bodyEl = container ? container.nextElementSibling : null;
            if (bodyEl) bodyEl.textContent = stepBodies[i];
          }
        });
      }
    }

    // Why-Choose-Us cards (id="benefits" on home; plain Tailwind, no CSS-module classes)
    var benefitsSection = root.querySelector('#benefits') || root.querySelector('[class*="03-our-benefits_OutBenefits"]');
    if (benefitsSection && !benefitsSection.getAttribute('data-axio-benefits-done')) {
      var bHeading = findByText(benefitsSection, 'Our Benefits');
      if (bHeading) bHeading.textContent = 'Why Choose Us';
      var bSubheading = findByText(benefitsSection, 'Why choose');
      if (bSubheading && bSubheading.parentElement) bSubheading.parentElement.innerHTML = 'Excellence in<br> Every Aspect';
      var bIntro = findByText(benefitsSection, 'Unlock your potential');
      if (bIntro) {
        bIntro.textContent =
          'Innovation, expertise, and client-focused solutions that deliver lasting impact. With a proven track record and 100% commitment to client satisfaction, we bring unmatched value to every project.';
      }
      var whyItems = [
        ['Expertise', 'Unparalleled Expertise', 'Years of experience in procurement & technology, delivering reliable results across every sector we serve.'],
        ['Support', 'End-to-End Support', 'From strategy to implementation, we’re with you at every step of your project.'],
        ['Tailored', 'Tailor-Made Solutions', 'Customized for your unique challenges, no one-size-fits-all approach.'],
        ['Value', 'Cost-Effective & Scalable', 'Maximum efficiency and quality assured, scaled to fit projects of any size.'],
        ['Innovation', 'Innovative Technologies', 'Smart security, automation, and IT infrastructure solutions that keep you ahead.'],
      ];

      var cards = Array.from(benefitsSection.querySelectorAll('[class*="card_Card__"]'));
      if (cards.length === 0) {
        // Home page variant: cards identified via their benefit videos, no scoped classes.
        var videos = Array.from(benefitsSection.querySelectorAll('video[src*="03-our-benefits/card-"]'));
        cards = videos
          .map(function (v) {
            var el = v;
            var depth = 0;
            while (el && depth < 6 && !/col-span/.test(el.className || '')) {
              el = el.parentElement;
              depth++;
            }
            return el;
          })
          .filter(Boolean);
      }

      cards.forEach(function (card, i) {
        if (!whyItems[i]) return;
        var label = card.querySelector('[class*="card_Card_label"]') || card.querySelector(':scope > div:last-child > div:nth-child(1)');
        var title = card.querySelector('[class*="card_Card_title"]') || card.querySelector(':scope > div:last-child > div:nth-child(2)');
        var text = card.querySelector('[class*="card_Card_text"]') || card.querySelector(':scope > div:last-child > div:nth-child(3)');
        if (label) {
          var labelText = Array.from(label.childNodes).find(function (n) { return n.nodeType === 3 && n.textContent.trim(); });
          if (labelText) labelText.textContent = ' ' + whyItems[i][0];
        }
        if (title) title.textContent = whyItems[i][1];
        if (text) text.textContent = whyItems[i][2];
      });
      benefitsSection.setAttribute('data-axio-benefits-done', '1');
    }

    // "Our Advantages" comparison table -> Industries We Serve
    replaceOnce(
      'industries',
      function () {
        var n = findByText(root, 'Comparison with other firms');
        return n && n.parentElement ? n.parentElement.closest('section') : null;
      },
      '<section class="container-v2" style="padding:5rem 0;text-align:center;">' +
        '<h2 style="font-size:2rem;font-weight:600;color:#fff;">Industries We Serve</h2>' +
        '<p style="color:#9aa0c9;font-size:1rem;margin:0.75rem auto 2.5rem;max-width:600px;">Seamless execution, scalable impact. We work with diverse sectors.</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:1rem;justify-content:center;">' +
        ['Government', 'Defense', 'Private Enterprise', 'Residential', 'Commercial', 'Telecom']
          .map(function (name) {
            return (
              '<div style="padding:0.9rem 1.6rem;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:0.95rem;">' +
              name +
              '</div>'
            );
          })
          .join('') +
        '</div>' +
        '</section>'
    );

    // "Get started" dashboard mockup -> Services overview (4 items)
    replaceOnce(
      'services-overview-v2',
      function () {
        return root.querySelector('[class*="-get-started_GetStarted__"]');
      },
      '<section class="container-v2" style="padding:5rem 0;">' +
        '<div style="max-width:1000px;margin:0 auto;text-align:center;">' +
        '<h2 style="font-size:2rem;font-weight:600;color:#fff;">Comprehensive Solutions for Every Need</h2>' +
        '<p style="color:#9aa0c9;font-size:1rem;margin:0.75rem 0 2.5rem;">Tailored services delivered with quality, compliance, and innovation</p>' +
        '<div class="axio-grid-4">' +
        [
          ['Defense & Government Procurement', 'Strategic sourcing, compliance assurance, and risk-managed acquisition for public sector institutions.'],
          ['Turnkey Procurement Solutions', 'Fully managed procurement processes from planning to delivery.'],
          ['Technology Solutions & Indenting', 'Global sourcing of specialized equipment with expert integration.'],
          ['Smart Security & Automation', 'Cutting-edge systems including smart surveillance, alarms, automation, and energy solutions.'],
        ]
          .map(function (pair) {
            return (
              '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:1.75rem;text-align:left;">' +
              '<h3 style="color:#fff;font-size:1.05rem;margin-bottom:0.6rem;">' +
              pair[0] +
              '</h3>' +
              '<p style="color:#9aa0c9;font-size:0.9rem;line-height:1.5;">' +
              pair[1] +
              '</p></div>'
            );
          })
          .join('') +
        '</div></div></section>'
    );

    // Platforms/broker-logos banner -> CTA section
    replaceOnce(
      'cta-section',
      function () {
        var img = root.querySelector('img[alt="Platforms"]');
        return img ? img.closest('section') : null;
      },
      '<section class="container-v2" style="padding:5rem 0;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.25rem;">' +
        '<p style="color:#7A7FDC;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;font-size:0.85rem;">Let’s Start Your Project</p>' +
        '<h2 style="font-size:2rem;font-weight:600;color:#fff;max-width:700px;">Build Something Smart &amp; Secure Together</h2>' +
        '<p style="color:#9aa0c9;font-size:1rem;max-width:600px;">Whether you’re a public sector department, private enterprise, or residential client, we’re ready to deliver excellence.</p>' +
        '<div style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;">' +
        '<a href="' +
        hrefTo('contact-us.html') +
        '" style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#4a6cf7,#6c5ce7);color:#fff;font-weight:600;padding:12px 24px;border-radius:999px;text-decoration:none;">✉ Contact Us</a>' +
        '<a href="' +
        hrefTo('programs/standard.html') +
        '" style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#fff;font-weight:600;padding:12px 24px;border-radius:999px;text-decoration:none;">View Services</a>' +
        '</div></section>'
    );

    // Remove testimonials/loved section (Trustpilot-specific, no equivalent)
    root.querySelectorAll('[class*="lovedv2_Loved__"]').forEach(function (el) {
      hideAxioEl(el);
    });
  }

  // ---------------------------------------------------------------------
  // About Us (how.html) — edits the original sections in place so the
  // hero video, scroll-reveal timeline, and card animations are preserved;
  // only text is swapped and the trading-only widgets are dropped.
  // ---------------------------------------------------------------------

  var ABOUT_US_JOURNEY = [
    ['Founded with a Vision', 'Axio Ventures Private Limited was founded to bridge the gap between reliable procurement and forward-thinking technology, bringing deep sector expertise together under one roof.'],
    ['Expanding Our Expertise', 'We grew across defense & government procurement, construction, telecom infrastructure, and smart security & automation, becoming a trusted single-window partner for complex projects.'],
    ['Building Lasting Partnerships', 'Through transparency, compliance, and technical excellence, we built long-term relationships with government, corporate, and residential clients across Pakistan.'],
    ['Looking Ahead', 'Today, we continue innovating at the intersection of infrastructure and technology, driven by our mission to deliver measurable value and a more secure, efficient future.'],
  ];

  var ABOUT_US_BENEFIT_CARDS = [
    ['Ownership', 'End-to-End Ownership', 'From requirement scoping to final delivery, we manage every step of your project as a single accountable partner.'],
    ['Scalable', 'Scalable to Any Project Size', "Whether it's a small residential installation or a large-scale government procurement, our solutions scale to match your needs."],
    ['Reliable', 'Reliable & Timely Delivery', 'We are committed to meeting deadlines and delivering consistent quality on every project, every time.'],
    ['Compliant', 'Compliance & Quality Assured', 'Every project meets strict regulatory and quality benchmarks, ensuring dependable, audit-ready results.'],
    ['Reach', 'Nationwide Reach', 'Serving government, corporate, and residential clients across Pakistan with local expertise and global standards.'],
  ];

  function setSectionLabel(section, text) {
    var el = section.querySelector('[class*="SectionLabel_text"]');
    if (el) el.textContent = text;
  }

  function setSectionTitle(section, html) {
    var el = section.querySelector('[class*="SectionTitle"]');
    if (el) el.innerHTML = html;
  }

  function buildAboutUsContent(root) {
    if (!/(^|\/)how$/i.test(PATH_NORM)) return;
    var main = root.querySelector('main');
    if (!main || main.getAttribute('data-axio-about-v2-done')) return;

    // Hero
    var hero = main.querySelector('[class*="__01-hero_Hero__"]');
    if (hero) {
      var heroTitle = hero.querySelector('[class*="SectionTitle"]');
      if (heroTitle) heroTitle.textContent = 'About Us';
      var heroText = hero.querySelector('[class*="__01-hero_Hero_text__"]');
      if (heroText) {
        heroText.textContent =
          'Discover who we are, what drives us, and how Axio Ventures is transforming procurement, technology, and security solutions across Pakistan and beyond.';
      }
    }

    // "First Trade Setup" -> "Who We Are"; drop the trading-dashboard demo widget
    var setup = main.querySelector('[class*="__03-setup_Setup__"]');
    if (setup) {
      setSectionLabel(setup, 'Who We Are');
      setSectionTitle(setup, 'A Forward-Thinking Organization Built for Impact');
      var setupText = setup.querySelector('[class*="__03-setup_text__"]');
      if (setupText) {
        setupText.innerHTML =
          'A forward-thinking organization at the intersection of technology innovation and infrastructure development. We are dedicated to transforming how homes, businesses, and governments operate, secure, and grow.<br><br>' +
          'With our dual-domain expertise in Smart Technology Solutions and Procurement &amp; Construction Services, Axio Ventures delivers reliable, innovative, and future-ready solutions across every sector we serve.';
      }
      var setupSelector = setup.querySelector('[class*="selector_Selector_wrapper__"]');
      if (setupSelector) hideAxioEl(setupSelector);
      var setupAppCard = setup.querySelector('[class*="__03-setup_GetStarted_app__"]');
      if (setupAppCard) hideAxioEl(setupAppCard);
    }

    // "Step by step" / "Before trading" timeline -> "Our Evolution"
    var journey = main.querySelector('[class*="__02-how-it-works_HowItWorks__"]');
    if (journey) {
      setSectionLabel(journey, 'Our Journey');
      setSectionTitle(journey, 'Our Evolution');
      var steps = journey.querySelectorAll('[class*="_list_item__"]');
      steps.forEach(function (step, i) {
        var item = ABOUT_US_JOURNEY[i];
        if (!item) return;
        var stepTitle = step.querySelector('[class*="ListItem_title__"]');
        var stepText = step.querySelector('[class*="ListItem_text__"]');
        if (stepTitle) stepTitle.textContent = item[0];
        if (stepText) stepText.textContent = item[1];
      });
    }

    // Plans/pricing + "3 Platforms To Choose From" already stripped globally
    // by removeChooseWidget (the whole __11-choose_Choose__ widget).

    // Benefits grid -> company strengths
    var benefits = main.querySelector('[class*="03-our-benefits_OutBenefits"]');
    if (benefits) {
      setSectionLabel(benefits, 'Our Strengths');
      setSectionTitle(benefits, 'Why Choose<br> Axio Ventures');
      var benefitsText = benefits.querySelector('[class*="OutBenefits_text__"]');
      if (benefitsText) {
        benefitsText.textContent =
          'Partner with a team that combines procurement expertise, technology innovation, and security engineering to deliver dependable results. Every engagement is backed by our commitment to quality, compliance, and long-term client success.';
      }
      var benefitCards = benefits.querySelectorAll('[class*="card_Card__"]');
      benefitCards.forEach(function (card, i) {
        var item = ABOUT_US_BENEFIT_CARDS[i];
        if (!item) return;
        var label = card.querySelector('[class*="card_Card_label"]');
        var title = card.querySelector('[class*="card_Card_title"]');
        var text = card.querySelector('[class*="card_Card_text"]');
        if (label) {
          var labelText = Array.from(label.childNodes).find(function (n) { return n.nodeType === 3 && n.textContent.trim(); });
          if (labelText) labelText.textContent = item[0];
        }
        if (title) title.textContent = item[1];
        if (text) text.textContent = item[2];
      });
    }

    // Payout / certificate section — remove entirely (incl. certificate image)
    var certificate = main.querySelector('[class*="__04-certificate_Certificate__"]');
    if (certificate) hideAxioEl(certificate);

    main.setAttribute('data-axio-about-v2-done', '1');
    var title = document.querySelector('title');
    if (title) title.textContent = 'About Us | Axio Ventures';
  }

  // ---------------------------------------------------------------------
  // Service overview pages (standard.html / expert.html) sub-service cards
  // ---------------------------------------------------------------------

  var STANDARD_SUBSERVICES = [
    ['Defense', 'Defense & Government Procurement', 'Strategic sourcing, compliance assurance, and risk-managed acquisition for public sector institutions.', 'defense-government-procurement'],
    ['Construction', 'Construction & Civil Engineering Services', 'From planning to execution, we handle residential, commercial, and public infrastructure projects, including civil works and electrical infrastructure.', ''],
    ['Technology', 'Technology Solutions & Indenting', 'Global sourcing of specialized equipment with expert integration, connecting you with the right technology partners worldwide.', 'technology-solutions-indenting'],
    ['Telecom', 'Telecom Infrastructure Development', 'Supporting telecom providers with infrastructure rollouts including pole installations, cable ducting, and fiber optic laying.', ''],
    ['Turnkey', 'Turnkey Solutions', 'From planning and procurement to construction and after-sales support, we act as a single-window partner for diverse needs.', ''],
  ];

  var EXPERT_SUBSERVICES = [
    ['Alarms', 'Security Alarm Systems', 'Advanced intrusion detection and alarm systems for comprehensive security coverage.', 'security-alarm-systems'],
    ['AI Vision', 'Smart AI Cameras', 'Intelligent surveillance with AI-powered analytics and real-time monitoring.', 'smart-ai-cameras'],
    ['Fencing', 'Electric Fencing', 'High-security perimeter protection with advanced electric fencing solutions.', 'electric-fencing'],
    ['Access', 'Smart Access Control', 'Biometric and card-based access control systems for enhanced security.', 'smart-access-control'],
    ['Automation', 'Smart Homes', 'Complete home automation solutions for modern, connected living.', 'smart-homes'],
  ];

  var SERVICE_HERO_TEXT = {
    standard:
      'Delivering cutting-edge procurement and construction solutions for government, defense, and private sector excellence. We specialize in comprehensive procurement tailored to complex sector needs, sourcing and supplying high-quality equipment, technology, and essential services with reliability, regulatory compliance, and operational efficiency.',
    expert:
      'Delivering cutting-edge security and automation solutions for safer, smarter, and more connected living and working spaces, from advanced alarm systems and AI-driven cameras to smart access control and automated homes.',
    directToSimLive:
      'Our turnkey procurement services offer a complete, hassle-free solution covering the entire process, from strategic sourcing and vendor management to final delivery and implementation. We take full ownership of procurement cycles, ensuring optimized costs, minimized risks, and maximum transparency.',
  };

  var SERVICE_HERO_TITLE = {
    standard: 'Procurement & Construction',
    expert: 'Smart Security & Automation',
    directToSimLive: 'Turnkey Procurement',
  };

  function replaceHeroCopy(root) {
    var key = /(^|\/)standard$/i.test(PATH_NORM)
      ? 'standard'
      : /(^|\/)expert$/i.test(PATH_NORM)
        ? 'expert'
        : /(^|\/)direct-to-sim-live$/i.test(PATH_NORM)
          ? 'directToSimLive'
          : null;
    if (!key) return;

    var heroTitle = root.querySelector('[class*="Hero_title"]');
    if (heroTitle && !heroTitle.getAttribute('data-axio-hero-title-done')) {
      heroTitle.textContent = SERVICE_HERO_TITLE[key];
      heroTitle.setAttribute('data-axio-hero-title-done', '1');
    }

    var heroText = root.querySelector('[class*="Hero_text"]');
    if (heroText && !heroText.getAttribute('data-axio-hero-text-done')) {
      heroText.textContent = SERVICE_HERO_TEXT[key];
      heroText.setAttribute('data-axio-hero-text-done', '1');
    }
  }

  function buildServiceSubsections(root) {
    var isStandard = /(^|\/)standard$/i.test(PATH_NORM);
    var isExpert = /(^|\/)expert$/i.test(PATH_NORM);
    if (!isStandard && !isExpert) return;
    var items = isStandard ? STANDARD_SUBSERVICES : EXPERT_SUBSERVICES;
    var section = root.querySelector('[class*="03-our-benefits_OutBenefits"]');
    if (!section || section.getAttribute('data-axio-subservices-done')) return;

    var heading = findByText(section, 'Our Benefits');
    if (heading) heading.textContent = isStandard ? 'Our Procurement Services' : 'Our Security Services';
    var intro = findByText(section, 'Unlock your potential');
    if (intro) {
      intro.textContent = isStandard
        ? 'End-to-end procurement and construction solutions covering government, defense, and private sector needs.'
        : 'Cutting-edge security and automation systems for residential, commercial, and government clients.';
    }

    var cards = Array.from(section.querySelectorAll('[class*="card_Card__"]'));
    cards.forEach(function (card, i) {
      var item = items[i];
      if (!item) return;
      if (item[3]) card.id = item[3];
      var label = card.querySelector('[class*="card_Card_label"]');
      var title = card.querySelector('[class*="card_Card_title"]');
      var text = card.querySelector('[class*="card_Card_text"]');
      if (label) {
        var labelText = Array.from(label.childNodes).find(function (n) { return n.nodeType === 3 && n.textContent.trim(); });
        if (labelText) labelText.textContent = item[0];
      }
      if (title) title.textContent = item[1];
      if (text) text.textContent = item[2];
    });
    section.setAttribute('data-axio-subservices-done', '1');
  }

  // ---------------------------------------------------------------------
  // Turnkey Procurement (direct-to-sim-live.html)
  // ---------------------------------------------------------------------

  function buildTurnkeyProcurementBody(root) {
    if (!/(^|\/)direct-to-sim-live$/i.test(PATH_NORM)) return;
    var hero = root.querySelector('[class*="01-hero_Hero__"]');
    if (!hero || hero.getAttribute('data-axio-turnkey-done')) return;
    var extra = document.createElement('section');
    extra.className = 'container-v2';
    extra.style.cssText = 'padding:3rem 0;';
    extra.innerHTML =
      '<p style="color:#d8defe;font-size:1rem;line-height:1.7;max-width:800px;margin:0 auto;text-align:center;">' +
      'Our turnkey procurement model means you deal with a single, accountable partner from day one: we scope the requirement, source and vet suppliers, manage logistics, and oversee delivery and installation, ' +
      'so your team is not left coordinating between multiple vendors. It is the fastest route from requirement to a fully delivered solution.' +
      '</p>';
    hero.parentElement.insertBefore(extra, hero.nextSibling);
    hero.setAttribute('data-axio-turnkey-done', '1');
  }

  var TURNKEY_BENEFITS = [
    ['Fast Track', 'Skip the Delays', 'Start your project immediately, no lengthy vendor onboarding, no waiting. Designed for clients who need results from day one.'],
    ['Full Ownership', 'End-to-End Accountability', 'We own every step of the process, from sourcing to delivery, so you deal with a single accountable partner.'],
    ['Simplicity', 'No Hidden Costs', 'Get started with transparent, one-time project pricing. No recurring fees, no hidden charges.'],
    ['Flexibility', 'Milestone-Based Delivery', 'Track progress through clear delivery milestones, with transparent reporting at every stage.'],
    ['Reliability', 'Consistent Quality Standards', 'Every project meets strict quality and compliance benchmarks, ensuring dependable results every time.'],
  ];

  function buildTurnkeyBenefits(root) {
    if (!/(^|\/)direct-to-sim-live$/i.test(PATH_NORM)) return;
    var section = root.querySelector('[class*="05-our-benefits_OutBenefits"]');
    if (!section || section.getAttribute('data-axio-turnkey-benefits-done')) return;

    var heading = findByText(section, 'Our Benefits');
    if (heading) heading.textContent = 'Why Turnkey Procurement';
    var subheading = findByText(section, 'Why choose');
    if (subheading && subheading.parentElement) subheading.parentElement.innerHTML = 'Built for<br> Speed &amp; Accountability';
    var intro = findByText(section, 'Unlock instant access');
    if (intro) {
      intro.textContent =
        'Our turnkey procurement service removes the friction of coordinating multiple vendors. You get a single accountable partner from day one, no fragmented vendors, no delays, with expert sourcing, reliable delivery, and full ownership of your project from start to finish.';
    }

    var cards = Array.from(section.querySelectorAll('[class*="card_Card__"]'));
    cards.forEach(function (card, i) {
      var item = TURNKEY_BENEFITS[i];
      if (!item) return;
      var label = card.querySelector('[class*="card_Card_label"]');
      var title = card.querySelector('[class*="card_Card_title"]');
      var text = card.querySelector('[class*="card_Card_text"]');
      if (label) {
        var labelText = Array.from(label.childNodes).find(function (n) { return n.nodeType === 3 && n.textContent.trim(); });
        if (labelText) labelText.textContent = ' ' + item[0];
      }
      if (title) title.textContent = item[1];
      if (text) text.textContent = item[2];
    });
    section.setAttribute('data-axio-turnkey-benefits-done', '1');
  }

  // ---------------------------------------------------------------------
  // Contact Us page
  // ---------------------------------------------------------------------

  function buildContactUsContent(root) {
    if (!/(^|\/)contact-us$/i.test(PATH_NORM)) return;

    var addressNode =
      findByText(root, 'PEMBROKE STREET') ||
      findByText(root, 'Pembroke Street') ||
      findByText(root, 'Sector B Commercial') ||
      findByText(root, 'Giga  Mall') ||
      findByText(root, 'Giga Mall');
    if (addressNode && addressNode.parentElement) {
      addressNode.parentElement.innerHTML = 'Office Number 3034, 3rd Floor<br>Giga Mall, DHA Phase 2<br>Islamabad';
    }

    // "Hours" item is replaced entirely with a "Phone Number" item per spec.
    var hoursNode =
      findByText(root, '24/5 for Emails and Live Chat') ||
      findByText(root, 'Monday - Friday') ||
      findByText(root, '+9251-5129494') ||
      findByText(root, '051-6108411');
    if (hoursNode && hoursNode.parentElement) {
      hoursNode.parentElement.innerHTML = '051-6108411<br>0302-0598888';
    }
    var hoursTitle = findByText(root, 'Hours');
    if (hoursTitle && (hoursTitle.textContent.trim() === 'Hours' || hoursTitle.textContent.trim() === 'Business Hours')) {
      hoursTitle.textContent = 'Phone Number';
    }

    root.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
      a.setAttribute('href', 'mailto:info@axioventurez.com');
    });
    textWalk(root, function (n) {
      if (/support@/i.test(n.textContent) || /^info@axioventurez\.com\s+\S/i.test(n.textContent)) {
        n.textContent = 'info@axioventurez.com';
      }
    });
    var emailTitle = findByText(root, 'Email');
    if (emailTitle && emailTitle.textContent.trim() === 'Email') emailTitle.textContent = 'Email Address';

    // Remove FAQs link from Support dropdown (collapseSupportDropdown handles the trigger itself globally)
    root.querySelectorAll('a[href*="intercom.help"]').forEach(function (a) {
      hideAxioEl(a);
    });

    // Decorative FXIFY brand-mark image above the "Have questions?" form heading
    root.querySelectorAll('[class*="form_Form_logo__"]').forEach(function (el) {
      hideAxioEl(el);
    });
  }

  // Submitting the contact form hands the visitor off to WhatsApp with a
  // pre-filled message (to 0302-0598888) instead of posting anywhere —
  // there's no backend behind this static site, and the client decides
  // whether to actually send it from there.
  var CONTACT_WHATSAPP_NUMBER = '923020598888';

  function wireContactForm(root) {
    if (!/(^|\/)contact-us$/i.test(PATH_NORM)) return;
    var form = root.querySelector('[class*="form_Form_form__"]');
    if (!form || form.getAttribute('data-axio-wa-wired')) return;
    form.setAttribute('data-axio-wa-wired', '1');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = form.querySelectorAll('input, textarea');
      var firstName = fields[0] ? fields[0].value.trim() : '';
      var lastName = fields[1] ? fields[1].value.trim() : '';
      var email = fields[2] ? fields[2].value.trim() : '';
      var phone = fields[3] ? fields[3].value.trim() : '';
      var message = fields[4] ? fields[4].value.trim() : '';
      var text =
        'New inquiry from axioventurez.com\n' +
        'Name: ' + (firstName + ' ' + lastName).trim() + '\n' +
        'Email: ' + email + '\n' +
        'Phone: ' + phone + '\n' +
        'Message: ' + message;
      window.location.href = 'https://wa.me/' + CONTACT_WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text);
    });
  }

  // ---------------------------------------------------------------------
  // Academy link removal
  // ---------------------------------------------------------------------

  function removeAcademyLinks(root) {
    root.querySelectorAll('a[href*="academy"]').forEach(function (a) {
      hideAxioEl(a);
    });
  }

  function removeFaqLink(root) {
    root.querySelectorAll('a[href*="intercom.help"]').forEach(function (a) {
      hideAxioEl(a);
    });
  }

  // Pricing/account-size comparison swiper (Payout Policy, Profit Split, drawdown
  // rules etc.) is a shared component across home + all service pages; it has no
  // procurement/security equivalent, so it's removed everywhere. On the home page
  // the slot left behind is then filled with the Vision section (see buildHomeContent).
  function removeChooseWidget(root) {
    var el = root.querySelector('[class*="-choose_Choose__"]');
    if (!el) return;
    var placeholder = document.createElement('div');
    placeholder.setAttribute('data-axio-replaced', 'choose-widget-slot');
    replaceAxioEl(el, placeholder);
  }

  // The "Get started today" CTA block (affiliate.html, direct-to-sim-live.html,
  // programs/standard.html, programs/expert.html) references a desktop app
  // screenshot the original mirror never captured (only mobile variants exist
  // on disk), so the image 404s and leaves an empty bordered box. Drop it and
  // rewrite the leftover trading-specific copy next to it; the background
  // glow/light images around it do exist and are left alone.
  function fixGetStartedCta(root) {
    root.querySelectorAll('[class*="GetStarted_app_card__"]').forEach(function (el) {
      hideAxioEl(el);
    });
    textWalk(root, function (n) {
      if (/select your desired challenge account and Get Funded/i.test(n.textContent)) {
        n.textContent = 'Reach out and our team will help you scope the right procurement, security, or technology solution for your needs.';
      }
      if (/Join our Affiliate Program today/i.test(n.textContent)) {
        n.textContent = 'Reach out and our team will help you scope the right procurement, security, or technology solution for your needs.';
      }
    });
  }

  // ---------------------------------------------------------------------
  // Main cleanup pipeline
  // ---------------------------------------------------------------------

  function cleanup() {
    enforcePageMeta();
    enforceFavicon();
    fixNextImageSrcs(document);
    injectAxioStyles();
    removeJoinSection(document);
    removeVerifiedPayouts(document);
    removeDiscordLinks(document);
    removeSocialLinks(document);
    removeMarketingButtons(document);
    fixHeaderButtons(document);
    replaceLogos(document);
    buildHeaderLogoIcon(document);
    fixGetStartedTitleLogo(document);
    removeTopBanner(document);
    replaceHeroVisual(document);
    replaceBrandText(document.body);
    renameNavLabels(document);
    renamePlansToServices(document);
    renameStandardPlanText(document);
    removeAffiliateNavItem(document);
    addHomeNavLink(document);
    collapseSupportDropdown(document);
    restructureServicesDropdown(document);
    rewriteFooter(document);
    removeAcademyLinks(document);
    removeFaqLink(document);
    removeChooseWidget(document);
    fixGetStartedCta(document);
    buildHomeContent(document);
    buildAboutUsContent(document);
    buildAboutUsOrbitAnimation(document);
    buildJourneyScrollGlow(document);
    removeLovedSection(document);
    enableReadyVideoAutoplay(document);
    replaceHeroCopy(document);
    buildServiceSubsections(document);
    buildTurnkeyProcurementBody(document);
    buildTurnkeyBenefits(document);
    buildContactUsContent(document);
    wireContactForm(document);
    fixLingeringDomains(document);
  }

  cleanup();

  var scheduled = false;
  function scheduleCleanup(delay) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      var wait = msUntilResizeQuiet();
      if (wait > 0) {
        scheduleCleanup(wait);
        return;
      }
      cleanup();
    }, delay);
  }

  var observer = new MutationObserver(function () {
    scheduleCleanup(150);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  [0, 300, 800, 1500, 3000, 5000].forEach(function (delay) {
    setTimeout(function () {
      scheduleCleanup(0);
    }, delay);
  });
})();
