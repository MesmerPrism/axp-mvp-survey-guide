import {
  describeText,
  renderFilePreview,
  supportsLayoutMode
} from './file-renderer.js';

const manifestUrl = new URL('../mock-data/manifest.json', import.meta.url);

const dom = {
  navList: document.getElementById('file-nav-list'),
  shell: document.getElementById('file-viewer-shell'),
  stage: document.getElementById('file-viewer-stage'),
  title: document.getElementById('file-title'),
  description: document.getElementById('file-description'),
  what: document.getElementById('file-what'),
  why: document.getElementById('file-why'),
  inspect: document.getElementById('file-inspect'),
  category: document.getElementById('file-category'),
  dataType: document.getElementById('file-datatype'),
  source: document.getElementById('file-source'),
  stats: document.getElementById('file-stats'),
  layoutToggle: document.getElementById('btn-file-layout'),
  rawToggle: document.getElementById('btn-file-raw'),
  wrapToggle: document.getElementById('btn-file-wrap'),
  fullscreen: document.getElementById('btn-file-fullscreen'),
  copyLink: document.getElementById('btn-file-copy-link'),
  rawLink: document.getElementById('link-file-raw'),
  relatedLink: document.getElementById('link-file-related')
};

let manifest = null;
let activeFile = null;
let activeText = '';
let wrapEnabled = false;
let currentView = 'layout';

init().catch((error) => {
  console.error(error);
  dom.stage.innerHTML = '<p class="status-note">Unable to initialize the file viewer.</p>';
});

async function init() {
  manifest = await loadManifest();
  renderNavigation();
  bindControls();

  const requestedId = window.location.hash.replace('#', '');
  const initialFile = manifest.files.find((item) => item.id === requestedId) || manifest.files[0];
  if (initialFile) {
    await selectFile(initialFile);
  }
}

async function loadManifest() {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Unable to load mock-data manifest (${response.status})`);
  }

  return response.json();
}

function renderNavigation() {
  const groups = new Map();

  for (const file of manifest.files) {
    const category = file.category || 'other';
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category).push(file);
  }

  dom.navList.innerHTML = '';

  for (const [category, files] of groups) {
    const section = document.createElement('section');
    section.className = 'viewer-nav-group';

    const label = document.createElement('h3');
    label.className = 'category-label';
    label.textContent = formatLabel(category);
    section.appendChild(label);

    const list = document.createElement('div');
    list.className = 'nav-list';

    for (const file of files) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'nav-item';
      item.dataset.id = file.id;

      const title = document.createElement('strong');
      title.textContent = file.title;
      item.appendChild(title);

      if (file.description) {
        const description = document.createElement('span');
        description.textContent = file.description;
        item.appendChild(description);
      }

      item.addEventListener('click', () => {
        void selectFile(file);
      });

      list.appendChild(item);
    }

    section.appendChild(list);
    dom.navList.appendChild(section);
  }
}

function bindControls() {
  dom.layoutToggle.addEventListener('click', () => {
    if (!activeFile || !supportsLayoutMode(activeFile)) {
      return;
    }
    currentView = 'layout';
    renderActiveFile();
  });

  dom.rawToggle.addEventListener('click', () => {
    currentView = 'raw';
    renderActiveFile();
  });

  dom.wrapToggle.addEventListener('click', () => {
    wrapEnabled = !wrapEnabled;
    renderActiveFile();
  });

  dom.fullscreen.addEventListener('click', async () => {
    if (document.fullscreenElement === dom.shell) {
      await document.exitFullscreen();
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }

    await dom.shell.requestFullscreen();
  });

  dom.copyLink.addEventListener('click', async () => {
    if (!activeFile) {
      return;
    }

    const link = new URL(`#${activeFile.id}`, window.location.href).href;
    try {
      await navigator.clipboard.writeText(link);
      dom.copyLink.textContent = 'Link copied';
      window.setTimeout(() => {
        dom.copyLink.textContent = 'Copy link';
      }, 1400);
    } catch {
      window.prompt('Copy file link', link);
    }
  });

  document.addEventListener('fullscreenchange', syncFullscreenButton);

  window.addEventListener('hashchange', () => {
    const nextId = window.location.hash.replace('#', '');
    if (!nextId || nextId === activeFile?.id) {
      return;
    }

    const nextFile = manifest.files.find((item) => item.id === nextId);
    if (nextFile) {
      void selectFile(nextFile);
    }
  });
}

async function selectFile(file) {
  activeFile = file;
  activeText = '';
  wrapEnabled = false;
  currentView = supportsLayoutMode(file) ? 'layout' : 'raw';

  dom.navList.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.id === file.id);
  });

  dom.title.textContent = file.title;
  dom.description.textContent = file.description || 'No description available.';
  dom.what.textContent = file.whatItShows || file.description || 'No explanation available.';
  dom.why.textContent = file.whyItMatters || 'No explanation available.';
  dom.inspect.textContent = file.lookFor || 'Use raw mode when you need the exact stored text.';
  dom.category.textContent = formatLabel(file.category || 'other');
  dom.dataType.textContent = file.dataType || 'Text file';
  dom.source.textContent = file.source;

  const sourceUrl = new URL(file.source, manifestUrl);
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Unable to load ${file.source} (${response.status})`);
  }

  activeText = await response.text();
  dom.stats.textContent = describeText(activeText);
  dom.rawLink.href = sourceUrl.href;

  if (file.relatedDoc) {
    dom.relatedLink.hidden = false;
    dom.relatedLink.href = new URL(file.relatedDoc, manifestUrl).href;
  } else {
    dom.relatedLink.hidden = true;
    dom.relatedLink.removeAttribute('href');
  }

  renderActiveFile();

  if (window.location.hash !== `#${file.id}`) {
    window.location.hash = file.id;
  }
}

function renderActiveFile() {
  if (!activeFile) {
    return;
  }

  renderFilePreview(dom.stage, {
    file: activeFile,
    text: activeText,
    view: currentView,
    wrap: wrapEnabled,
    context: 'viewer'
  });

  dom.stage.scrollTop = 0;
  dom.stage.scrollLeft = 0;
  syncViewButtons();
  syncWrapButton();
  syncFullscreenButton();
}

function syncViewButtons() {
  const canLayout = activeFile && supportsLayoutMode(activeFile);
  dom.layoutToggle.disabled = !canLayout;
  dom.layoutToggle.setAttribute('aria-pressed', String(canLayout && currentView === 'layout'));
  dom.rawToggle.setAttribute('aria-pressed', String(currentView === 'raw'));
}

function syncWrapButton() {
  const wrapAvailable = currentView === 'raw';
  dom.wrapToggle.disabled = !wrapAvailable;
  dom.wrapToggle.textContent = wrapAvailable
    ? (wrapEnabled ? 'Wrap on' : 'Wrap off')
    : 'Wrap n/a';
}

function syncFullscreenButton() {
  dom.fullscreen.textContent = document.fullscreenElement === dom.shell ? 'Exit fullscreen' : 'Fullscreen';
}

function formatLabel(value) {
  return value
    .split(/[-_\s]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
