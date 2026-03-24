import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const pagePath = window.location.pathname.split('/').pop() || 'index.html';

for (const link of document.querySelectorAll('[data-nav] a')) {
  const href = link.getAttribute('href');
  if (href === pagePath || (pagePath === '' && href === 'index.html')) {
    link.setAttribute('aria-current', 'page');
  }
}

const mermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  themeVariables: {
    fontFamily: 'Bahnschrift, Segoe UI, Arial, sans-serif',
    fontSize: '14px',
    background: '#fffdf9',
    primaryColor: '#fffdf9',
    primaryTextColor: '#1f2328',
    primaryBorderColor: '#847a69',
    lineColor: '#6d7680',
    edgeLabelBackground: '#fffdf9',
    secondaryColor: '#eef3f7',
    tertiaryColor: '#f1e6d3',
    clusterBkg: '#fbf7f0',
    clusterBorder: '#b9b09e'
  },
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'linear',
    nodeSpacing: 35,
    rankSpacing: 50,
    padding: 12
  }
};

async function loadDiagrams() {
  const targets = [...document.querySelectorAll('[data-mermaid-source]')];
  if (targets.length === 0) {
    return;
  }

  mermaid.initialize(mermaidConfig);

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
}

loadDiagrams().catch((error) => {
  console.error(error);
});
