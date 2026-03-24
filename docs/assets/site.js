import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const pagePath = window.location.pathname.split('/').pop() || 'index.html';

for (const link of document.querySelectorAll('[data-nav] a')) {
  const href = link.getAttribute('href');
  if (href === pagePath || (pagePath === '' && href === 'index.html')) {
    link.setAttribute('aria-current', 'page');
  }
}

const mermaidConfigPath = new URL('./../diagrams/mermaid.config.json', import.meta.url);

const fallbackMermaidConfig = {
  startOnLoad: false,
  securityLevel: 'loose',
  theme: 'base',
  themeVariables: {
    fontFamily: 'Nunito, Segoe UI, sans-serif',
    fontSize: '14px',
    background: 'transparent',
    primaryColor: '#ffffff',
    primaryTextColor: '#262632',
    primaryBorderColor: '#6b3df0',
    secondaryColor: '#f0ecff',
    secondaryTextColor: '#262632',
    secondaryBorderColor: '#8f74ef',
    tertiaryColor: '#dffaf8',
    tertiaryTextColor: '#262632',
    tertiaryBorderColor: '#44e1d8',
    mainBkg: '#ffffff',
    nodeBorder: '#6b3df0',
    clusterBkg: '#f9f9fb',
    clusterBorder: '#44e1d8',
    lineColor: '#666a7c',
    edgeLabelBackground: '#ffffff',
    labelBackground: '#ffffff',
    textColor: '#262632',
    titleColor: '#262632'
  },
  themeCSS: '.node rect,.node circle,.node ellipse,.node polygon,.node path,.label-container{rx:14px!important;ry:14px!important;} .cluster rect{rx:18px!important;ry:18px!important;} .cluster text,.nodeLabel,.edgeLabel{font-weight:700;} .cluster-label .background{fill:#ffffff!important;stroke:#d9d9e4!important;stroke-width:1.2px!important;rx:12px!important;ry:12px!important;} .cluster-label text,.cluster-label span{font-weight:800!important;fill:#262632!important;color:#262632!important;} .cluster-label .text-outer-tspan{font-size:13px!important;} .edgeLabel rect,.labelBkg{fill:#ffffff!important;stroke:#d9d9e4!important;stroke-width:1px!important;} .flowchart-link,.edgePath path{stroke:#666a7c!important;stroke-width:1.8px!important;} .marker path{fill:#666a7c!important;stroke:#666a7c!important;} .cluster span,.nodeLabel p{line-height:1.3!important;}',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: false,
    curve: 'linear',
    nodeSpacing: 36,
    rankSpacing: 56,
    padding: 16
  },
  sequence: {
    useMaxWidth: true
  }
};

async function getMermaidConfig() {
  try {
    const response = await fetch(mermaidConfigPath);
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
    return fallbackMermaidConfig;
  }
}

async function loadDiagrams() {
  const targets = [...document.querySelectorAll('[data-mermaid-source]')];
  if (targets.length === 0) {
    return;
  }

  mermaid.initialize(await getMermaidConfig());

  for (const target of targets) {
    const sourcePath = target.getAttribute('data-mermaid-source');
    try {
      const response = await fetch(sourcePath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      target.textContent = await response.text();
      target.classList.add('mermaid');
    } catch (error) {
      target.outerHTML = `<p class="status-note">Unable to load diagram source from <code>${sourcePath}</code>.</p>`;
      console.error(error);
    }
  }

  await mermaid.run({
    querySelector: '.mermaid'
  });

  for (const target of targets) {
    rewriteGuideLinks(target);
  }
}

async function loadFileSamples() {
  const targets = [...document.querySelectorAll('[data-file-source]')];
  for (const target of targets) {
    const sourcePath = target.getAttribute('data-file-source');
    try {
      const response = await fetch(sourcePath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      target.textContent = await response.text();
    } catch (error) {
      target.outerHTML = `<p class="status-note">Unable to load example file from <code>${sourcePath}</code>.</p>`;
      console.error(error);
    }
  }
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

Promise.all([loadDiagrams(), loadFileSamples()]).catch((error) => {
  console.error(error);
});
