import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
import Panzoom from 'https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.6.1/+esm';

const manifestUrl = new URL('../diagrams/manifest.json', import.meta.url);
const configUrl = new URL('../diagrams/mermaid.config.json', import.meta.url);

const dom = {
  navList: document.getElementById('nav-list'),
  viewer: document.getElementById('viewer'),
  viewerCanvasShell: document.getElementById('viewer-canvas-shell'),
  sourcePanel: document.getElementById('source-panel'),
  sourceCode: document.getElementById('source-code'),
  title: document.getElementById('title'),
  viewerMeta: document.getElementById('viewer-meta'),
  description: document.getElementById('viewer-description'),
  category: document.getElementById('viewer-category'),
  source: document.getElementById('viewer-source'),
  actions: document.getElementById('viewer-actions'),
  relatedNote: document.getElementById('viewer-related-note'),
  zoom: document.getElementById('viewer-zoom'),
  zoomOut: document.getElementById('btn-zoom-out'),
  fit: document.getElementById('btn-fit'),
  zoomIn: document.getElementById('btn-zoom-in'),
  sourceToggle: document.getElementById('btn-source'),
  fullscreen: document.getElementById('btn-fullscreen'),
  copyLink: document.getElementById('btn-copy-link'),
  svgLink: document.getElementById('link-svg'),
  sourceLink: document.getElementById('link-source-file'),
  relatedLink: document.getElementById('link-related-doc')
};

let manifest = null;
let activeDiagram = null;
let panzoom = null;
let activeSvg = null;
let resizeObserver = null;
let wheelHandler = null;
let panzoomChangeHandler = null;
let pointerDownHandler = null;
let pointerUpHandler = null;
let programmaticChange = false;
let userAdjustedView = false;
let showSource = false;
let fitFramePending = false;
let svgObjectUrl = null;

init().catch((error) => {
  console.error(error);
  showEmptyState('Unable to initialize the diagram viewer.');
});

async function init() {
  mermaid.initialize(await loadMermaidConfig());
  manifest = await loadManifest();
  renderNavigation();
  bindControls();

  const requestedId = window.location.hash.replace('#', '');
  const initialDiagram = manifest.diagrams.find((diagram) => diagram.id === requestedId) || manifest.diagrams[0];
  if (initialDiagram) {
    await selectDiagram(initialDiagram);
  } else {
    showEmptyState('No diagrams are registered in the manifest.');
  }
}

async function loadMermaidConfig() {
  try {
    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      startOnLoad: false,
      securityLevel: 'loose',
      ...(await response.json())
    };
  } catch (error) {
    console.error(error);
    return {
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base'
    };
  }
}

async function loadManifest() {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Unable to load manifest.json (${response.status})`);
  }

  return response.json();
}

function renderNavigation() {
  const groups = new Map();
  for (const diagram of manifest.diagrams) {
    const category = diagram.category || 'other';
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category).push(diagram);
  }

  dom.navList.innerHTML = '';
  for (const [category, diagrams] of groups) {
    const label = document.createElement('div');
    label.className = 'category-label';
    label.textContent = formatLabel(category);
    dom.navList.appendChild(label);

    for (const diagram of diagrams) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'nav-item';
      item.dataset.id = diagram.id;
      item.innerHTML = `<strong>${escapeHtml(diagram.title)}</strong>${diagram.description ? `<span>${escapeHtml(diagram.description)}</span>` : ''}`;
      item.addEventListener('click', () => {
        void selectDiagram(diagram);
      });
      dom.navList.appendChild(item);
    }
  }
}

function bindControls() {
  dom.sourceToggle.addEventListener('click', () => {
    showSource = !showSource;
    dom.viewer.hidden = showSource;
    dom.sourcePanel.hidden = !showSource;
    dom.sourceToggle.textContent = showSource ? 'Diagram' : 'Source';
    updateZoomControls();

    if (!showSource && activeSvg) {
      userAdjustedView = false;
      requestDiagramFit();
    }
  });

  dom.fullscreen.addEventListener('click', async () => {
    if (document.fullscreenElement === dom.viewerCanvasShell) {
      await document.exitFullscreen();
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }

    await dom.viewerCanvasShell.requestFullscreen();
  });

  dom.zoomIn.addEventListener('click', () => {
    zoomAtPoint(1, getViewportCenterPoint());
  });

  dom.zoomOut.addEventListener('click', () => {
    zoomAtPoint(-1, getViewportCenterPoint());
  });

  dom.fit.addEventListener('click', () => {
    userAdjustedView = false;
    requestDiagramFit();
  });

  dom.copyLink.addEventListener('click', async () => {
    if (!activeDiagram) {
      return;
    }

    const link = new URL(`#${activeDiagram.id}`, window.location.href).href;
    try {
      await navigator.clipboard.writeText(link);
      dom.copyLink.textContent = 'Link copied';
      window.setTimeout(() => {
        dom.copyLink.textContent = 'Copy link';
      }, 1400);
    } catch {
      window.prompt('Copy diagram link', link);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    syncFullscreenButton();
    if (!showSource && activeSvg) {
      userAdjustedView = false;
      requestDiagramFit();
    }
  });

  window.addEventListener('hashchange', () => {
    const nextId = window.location.hash.replace('#', '');
    if (!nextId || nextId === activeDiagram?.id) {
      return;
    }

    const nextDiagram = manifest.diagrams.find((diagram) => diagram.id === nextId);
    if (nextDiagram) {
      void selectDiagram(nextDiagram);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (svgObjectUrl) {
      URL.revokeObjectURL(svgObjectUrl);
    }
  });
}

async function selectDiagram(diagram) {
  try {
    activeDiagram = diagram;
    dom.navList.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.id === diagram.id);
    });

    dom.title.textContent = diagram.title;
    dom.description.textContent = diagram.description || 'Diagram notes unavailable.';
    dom.category.textContent = formatLabel(diagram.category || 'other');
    dom.source.textContent = diagram.source;
    dom.viewerMeta.hidden = false;
    dom.actions.hidden = false;
    dom.relatedNote.hidden = true;
    dom.relatedNote.textContent = '';

    const sourceUrl = new URL(diagram.source, manifestUrl);
    dom.sourceLink.href = sourceUrl.href;

    const sourceResponse = await fetch(sourceUrl);
    if (!sourceResponse.ok) {
      throw new Error(`Unable to load ${diagram.source} (${sourceResponse.status})`);
    }

    const sourceText = await sourceResponse.text();
    dom.sourceCode.textContent = sourceText;

    const rendered = await mermaid.render(`diagram-${diagram.id}-${Date.now()}`, sourceText);
    mountDiagram(rendered.svg);
    updateSvgLink(rendered.svg, diagram.title);
    updateRelatedLinks(diagram.relatedDocs);
    updateZoomControls();
    syncFullscreenButton();

    if (window.location.hash !== `#${diagram.id}`) {
      window.location.hash = diagram.id;
    }
  } catch (error) {
    console.error(error);
    dom.actions.hidden = true;
    dom.relatedNote.hidden = true;
    dom.relatedNote.textContent = '';
    showEmptyState(`Unable to load ${diagram.title}.`);
  }
}

function mountDiagram(svgMarkup) {
  cleanupPanzoom();
  dom.viewer.innerHTML = svgMarkup;
  rewriteGuideLinks(dom.viewer);

  activeSvg = dom.viewer.querySelector('svg');
  if (!activeSvg) {
    showEmptyState('The Mermaid source did not produce SVG output.');
    return;
  }

  for (const link of activeSvg.querySelectorAll('a')) {
    link.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });
    link.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  requestAnimationFrame(() => {
    attachPanzoom(dom.viewer, activeSvg);
  });
}

function attachPanzoom(surface, svg) {
  cleanupPanzoom(false);

  const fit = calculateFit(surface, svg);
  const minScale = Math.max(0.05, fit.scale * 0.65);
  const maxScale = Math.max(6, fit.scale * 10);

  panzoom = Panzoom(svg, {
    canvas: true,
    overflow: 'hidden',
    origin: '0 0',
    panOnlyWhenZoomed: true,
    pinchAndPan: true,
    startScale: fit.scale,
    startX: fit.x,
    startY: fit.y,
    minScale,
    maxScale,
    step: 0.18,
    touchAction: 'none'
  });

  wheelHandler = (event) => {
    if (!panzoom || showSource) {
      return;
    }

    event.preventDefault();
    const wantsZoom = event.ctrlKey || event.metaKey;
    if (wantsZoom) {
      const delta = event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY;
      zoomAtPoint(delta < 0 ? 1 : -1, getViewportCenterPoint(), 3);
      return;
    }

    panByScroll(event.deltaX, event.deltaY);
  };

  panzoomChangeHandler = () => {
    updateZoomLabel(panzoom ? panzoom.getScale() : 1);
    if (!programmaticChange) {
      userAdjustedView = true;
    }
  };

  pointerDownHandler = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    surface.classList.add('is-dragging');
  };

  pointerUpHandler = () => {
    surface.classList.remove('is-dragging');
  };

  surface.addEventListener('wheel', wheelHandler, { passive: false });
  svg.addEventListener('panzoomchange', panzoomChangeHandler);
  surface.addEventListener('pointerdown', pointerDownHandler);
  window.addEventListener('pointerup', pointerUpHandler);
  window.addEventListener('pointercancel', pointerUpHandler);

  resizeObserver = new ResizeObserver(() => {
    if (!userAdjustedView) {
      requestDiagramFit();
    }
  });
  resizeObserver.observe(surface);

  programmaticChange = true;
  updateZoomLabel(panzoom.getScale());
  programmaticChange = false;
  userAdjustedView = false;
  updateZoomControls();
}

function cleanupPanzoom(releaseSvg = true) {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (panzoom && activeSvg && panzoomChangeHandler) {
    activeSvg.removeEventListener('panzoomchange', panzoomChangeHandler);
  }

  if (wheelHandler) {
    dom.viewer.removeEventListener('wheel', wheelHandler);
    wheelHandler = null;
  }

  if (pointerDownHandler) {
    dom.viewer.removeEventListener('pointerdown', pointerDownHandler);
    pointerDownHandler = null;
  }

  if (pointerUpHandler) {
    window.removeEventListener('pointerup', pointerUpHandler);
    window.removeEventListener('pointercancel', pointerUpHandler);
    pointerUpHandler = null;
  }

  if (panzoom) {
    panzoom.destroy();
    panzoom = null;
  }

  dom.viewer.classList.remove('is-dragging');
  programmaticChange = false;
  userAdjustedView = false;
  fitFramePending = false;
  updateZoomLabel(1);
  updateZoomControls();

  if (releaseSvg) {
    activeSvg = null;
  }
}

function calculateFit(surface, svg) {
  const padding = 24;
  const rect = surface.getBoundingClientRect();
  const viewBox = svg.viewBox?.baseVal;
  const width = viewBox?.width || parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width || 1;
  const height = viewBox?.height || parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height || 1;
  const usableWidth = Math.max(rect.width - padding * 2, 1);
  const usableHeight = Math.max(rect.height - padding * 2, 1);
  const scale = Math.min(usableWidth / width, usableHeight / height, 1);

  return {
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    x: (rect.width - width * scale) / (2 * scale),
    y: (rect.height - height * scale) / (2 * scale)
  };
}

function requestDiagramFit() {
  if (!activeSvg || fitFramePending) {
    return;
  }

  fitFramePending = true;
  requestAnimationFrame(() => {
    fitFramePending = false;
    if (activeSvg) {
      attachPanzoom(dom.viewer, activeSvg);
    }
  });
}

function updateSvgLink(svgMarkup, title) {
  if (svgObjectUrl) {
    URL.revokeObjectURL(svgObjectUrl);
  }

  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  svgObjectUrl = URL.createObjectURL(blob);
  dom.svgLink.href = svgObjectUrl;
  dom.svgLink.download = `${slugify(title)}.svg`;
}

function updateRelatedLinks(relatedDocs = []) {
  const docs = Array.isArray(relatedDocs) ? relatedDocs : [];
  if (docs.length === 0) {
    dom.relatedLink.hidden = true;
    dom.relatedLink.removeAttribute('href');
    dom.relatedNote.hidden = true;
    dom.relatedNote.textContent = '';
    return;
  }

  dom.relatedLink.hidden = false;
  dom.relatedLink.href = docs[0];
  dom.relatedLink.textContent = 'Open related doc';

  if (docs.length > 1) {
    dom.relatedNote.hidden = false;
    dom.relatedNote.innerHTML = `Also related: ${docs.slice(1).map((path) => `<a href="${escapeAttribute(path)}">${escapeHtml(formatDocLabel(path))}</a>`).join(' | ')}`;
  } else {
    dom.relatedNote.hidden = true;
    dom.relatedNote.textContent = '';
  }
}

function formatDocLabel(path) {
  const name = path.split('/').pop().replace(/\.(html|md)$/i, '');
  return formatLabel(name);
}

function syncFullscreenButton() {
  dom.fullscreen.textContent = document.fullscreenElement === dom.viewerCanvasShell ? 'Exit fullscreen' : 'Fullscreen';
}

function updateZoomControls() {
  const enabled = Boolean(panzoom) && !showSource;
  dom.zoomOut.disabled = !enabled;
  dom.fit.disabled = !enabled;
  dom.zoomIn.disabled = !enabled;
}

function updateZoomLabel(scale = 1) {
  dom.zoom.textContent = `${Math.round(scale * 100)}%`;
}

function zoomAtPoint(direction, point, divisor = 1) {
  if (!panzoom) {
    return;
  }

  const rect = dom.viewer.getBoundingClientRect();
  const currentScale = panzoom.getScale();
  const currentPan = panzoom.getPan();
  const viewportX = point.clientX - rect.left;
  const viewportY = point.clientY - rect.top;
  const focalX = viewportX / currentScale - currentPan.x;
  const focalY = viewportY / currentScale - currentPan.y;
  const targetScale = currentScale * Math.exp(direction * getZoomStep() / divisor);
  userAdjustedView = true;
  const zoomResult = panzoom.zoom(targetScale, { animate: false, force: true });
  const appliedScale = zoomResult?.scale ?? panzoom.getScale();
  const targetPanX = viewportX / appliedScale - focalX;
  const targetPanY = viewportY / appliedScale - focalY;
  panzoom.pan(targetPanX, targetPanY, { animate: false, force: true });
}

function panByScroll(deltaX, deltaY) {
  if (!panzoom) {
    return;
  }

  userAdjustedView = true;
  const scale = panzoom.getScale() || 1;
  panzoom.pan(-deltaX / scale, -deltaY / scale, {
    animate: false,
    relative: true
  });
}

function getViewportCenterPoint() {
  const rect = dom.viewer.getBoundingClientRect();
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  };
}

function getZoomStep() {
  return panzoom?.getOptions?.().step ?? 0.18;
}

function showEmptyState(message) {
  cleanupPanzoom();
  showSource = false;
  dom.viewer.hidden = false;
  dom.sourcePanel.hidden = true;
  dom.sourceToggle.textContent = 'Source';
  dom.viewer.innerHTML = `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function getGuideRootPath() {
  const path = window.location.pathname.replace(/\/$/, '');
  if (/\/diagrams\/[^/]+$/.test(path)) {
    return path.replace(/\/diagrams\/[^/]+$/, '');
  }
  return path.replace(/\/[^/]+$/, '');
}

function rewriteGuideLinks(container) {
  const guideRoot = getGuideRootPath();
  for (const link of container.querySelectorAll('a')) {
    for (const attr of ['href', 'xlink:href']) {
      const current = link.getAttribute(attr);
      if (!current || !current.startsWith('__GUIDE_ROOT__/')) {
        continue;
      }

      link.setAttribute(attr, `${guideRoot}${current.slice('__GUIDE_ROOT__'.length)}`);
      link.setAttribute('target', '_self');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatLabel(value) {
  return value
    .split(/[-_\s]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;');
}
