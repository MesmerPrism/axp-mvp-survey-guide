const manifestUrl = new URL('../mock-data/manifest.json', import.meta.url);

const dom = {
  navList: document.getElementById('file-nav-list'),
  shell: document.getElementById('file-viewer-shell'),
  stage: document.getElementById('file-viewer-stage'),
  code: document.getElementById('file-viewer-code'),
  title: document.getElementById('file-title'),
  description: document.getElementById('file-description'),
  category: document.getElementById('file-category'),
  dataType: document.getElementById('file-datatype'),
  source: document.getElementById('file-source'),
  stats: document.getElementById('file-stats'),
  wrapToggle: document.getElementById('btn-file-wrap'),
  fullscreen: document.getElementById('btn-file-fullscreen'),
  copyLink: document.getElementById('btn-file-copy-link'),
  rawLink: document.getElementById('link-file-raw'),
  relatedLink: document.getElementById('link-file-related')
};

let manifest = null;
let activeFile = null;
let wrapEnabled = false;

init().catch((error) => {
  console.error(error);
  dom.code.textContent = 'Unable to initialize the file viewer.';
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
    const label = document.createElement('div');
    label.className = 'category-label';
    label.textContent = formatLabel(category);
    dom.navList.appendChild(label);

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

      dom.navList.appendChild(item);
    }
  }
}

function bindControls() {
  dom.wrapToggle.addEventListener('click', () => {
    wrapEnabled = !wrapEnabled;
    dom.stage.classList.toggle('is-wrapped', wrapEnabled);
    dom.wrapToggle.textContent = wrapEnabled ? 'Wrap on' : 'Wrap off';
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

  dom.navList.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.id === file.id);
  });

  dom.title.textContent = file.title;
  dom.description.textContent = file.description || 'No description available.';
  dom.category.textContent = formatLabel(file.category || 'other');
  dom.dataType.textContent = file.dataType || 'Text file';
  dom.source.textContent = file.source;

  const sourceUrl = new URL(file.source, manifestUrl);
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Unable to load ${file.source} (${response.status})`);
  }

  const text = await response.text();
  dom.code.textContent = text;
  dom.stats.textContent = describeText(text);
  dom.stage.scrollTop = 0;
  dom.stage.scrollLeft = 0;

  dom.rawLink.href = sourceUrl.href;

  if (file.relatedDoc) {
    dom.relatedLink.hidden = false;
    dom.relatedLink.href = new URL(file.relatedDoc, manifestUrl).href;
  } else {
    dom.relatedLink.hidden = true;
    dom.relatedLink.removeAttribute('href');
  }

  if (window.location.hash !== `#${file.id}`) {
    window.location.hash = file.id;
  }

  syncFullscreenButton();
}

function describeText(text) {
  const lines = text === '' ? 0 : text.split(/\r?\n/).length;
  const bytes = new TextEncoder().encode(text).length;
  return `${lines} lines • ${formatBytes(bytes)}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
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
