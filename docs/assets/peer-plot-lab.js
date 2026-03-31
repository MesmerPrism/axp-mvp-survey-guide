const MANIFEST_PATH = 'assets/peer-plot-data/manifest.json';
const MIN_VALUE = 0;
const MAX_VALUE = 100;
const DENSITY_POINTS = 160;

const DEFAULTS = {
  innerRadius: 0.24,
  outerRadius: 0.9,
  violinHalfWidth: 0.085,
  boxHalfWidth: 0.012,
  densityAdjust: 1.15,
  widthMode: 'per_scale',
  densityExponent: 0.6,
  peerColor: '#c8b17a',
  invert: false,
  showUserFill: false,
  showPeerMedian: false,
  showQuartiles: true,
  showOutliers: false,
  userMode: 'sample_peer'
};

const state = {
  manifest: null,
  contextCache: new Map(),
  currentContextKey: null,
  sampledPeerId: null,
  renderQueued: false,
  controls: { ...DEFAULTS }
};

const dom = {
  inductionSelect: document.getElementById('induction-select'),
  doseSelect: document.getElementById('dose-select'),
  userModeSelect: document.getElementById('user-mode-select'),
  resamplePeerButton: document.getElementById('resample-peer-button'),
  resetDefaultsButton: document.getElementById('reset-defaults-button'),
  innerRadiusRange: document.getElementById('inner-radius-range'),
  outerRadiusRange: document.getElementById('outer-radius-range'),
  violinHalfWidthRange: document.getElementById('violin-half-width-range'),
  boxHalfWidthRange: document.getElementById('box-half-width-range'),
  densityAdjustRange: document.getElementById('density-adjust-range'),
  densityExponentRange: document.getElementById('density-exponent-range'),
  peerColorInput: document.getElementById('peer-color-input'),
  widthModeSelect: document.getElementById('width-mode-select'),
  invertScaleCheckbox: document.getElementById('invert-scale-checkbox'),
  showUserFillCheckbox: document.getElementById('show-user-fill-checkbox'),
  showPeerMedianCheckbox: document.getElementById('show-peer-median-checkbox'),
  showQuartilesCheckbox: document.getElementById('show-quartiles-checkbox'),
  showOutliersCheckbox: document.getElementById('show-outliers-checkbox'),
  innerRadiusValue: document.getElementById('inner-radius-value'),
  outerRadiusValue: document.getElementById('outer-radius-value'),
  violinHalfWidthValue: document.getElementById('violin-half-width-value'),
  boxHalfWidthValue: document.getElementById('box-half-width-value'),
  densityAdjustValue: document.getElementById('density-adjust-value'),
  densityExponentValue: document.getElementById('density-exponent-value'),
  selectionSummary: document.getElementById('selection-summary'),
  plotLegend: document.getElementById('plot-legend'),
  plotMeta: document.getElementById('plot-meta'),
  plotSvg: document.getElementById('peer-plot-svg'),
  toggleGuideButton: document.getElementById('toggle-guide-button'),
  guideShell: document.getElementById('reading-guide'),
  guideSvg: document.getElementById('guide-plot-svg')
};

initNav();
initControls();
boot().catch((error) => {
  console.error(error);
  showFatalError('Unable to load the plot lab data bundle.');
});

function initNav() {
  const pagePath = window.location.pathname.split('/').pop() || 'index.html';
  for (const link of document.querySelectorAll('[data-nav] a')) {
    const href = link.getAttribute('href');
    if (href === pagePath || (pagePath === '' && href === 'index.html')) {
      link.setAttribute('aria-current', 'page');
    }
  }
}

function initControls() {
  const controlBindings = [
    [dom.innerRadiusRange, 'innerRadius', 'input'],
    [dom.outerRadiusRange, 'outerRadius', 'input'],
    [dom.violinHalfWidthRange, 'violinHalfWidth', 'input'],
    [dom.boxHalfWidthRange, 'boxHalfWidth', 'input'],
    [dom.densityAdjustRange, 'densityAdjust', 'input'],
    [dom.densityExponentRange, 'densityExponent', 'input'],
    [dom.peerColorInput, 'peerColor', 'input'],
    [dom.widthModeSelect, 'widthMode', 'change'],
    [dom.userModeSelect, 'userMode', 'change']
  ];

  for (const [element, key, eventName] of controlBindings) {
    element.addEventListener(eventName, () => {
      state.controls[key] = readControlValue(element);
      syncOutputs();
      if (key === 'userMode' && state.controls.userMode !== 'sample_peer') {
        state.sampledPeerId = null;
      }
      scheduleRender();
    });
  }

  const toggleBindings = [
    [dom.invertScaleCheckbox, 'invert'],
    [dom.showUserFillCheckbox, 'showUserFill'],
    [dom.showPeerMedianCheckbox, 'showPeerMedian'],
    [dom.showQuartilesCheckbox, 'showQuartiles'],
    [dom.showOutliersCheckbox, 'showOutliers']
  ];

  for (const [element, key] of toggleBindings) {
    element.addEventListener('change', () => {
      state.controls[key] = element.checked;
      scheduleRender();
    });
  }

  dom.inductionSelect.addEventListener('change', () => {
    syncDoseChoices();
    state.sampledPeerId = null;
    loadSelectedContext().catch((error) => {
      console.error(error);
      showFatalError('Unable to load the selected induction and dose subset.');
    });
  });

  dom.doseSelect.addEventListener('change', () => {
    state.sampledPeerId = null;
    loadSelectedContext().catch((error) => {
      console.error(error);
      showFatalError('Unable to load the selected induction and dose subset.');
    });
  });

  dom.resamplePeerButton.addEventListener('click', () => {
    const context = getCurrentContext();
    if (!context) return;
    state.sampledPeerId = sampleRandomPeerId(context);
    scheduleRender();
  });

  dom.resetDefaultsButton.addEventListener('click', () => {
    state.controls = { ...DEFAULTS };
    state.sampledPeerId = null;
    applyControlState();
    syncOutputs();
    scheduleRender();
  });

  dom.toggleGuideButton.addEventListener('click', () => {
    const nextHidden = !dom.guideShell.hidden;
    dom.guideShell.hidden = nextHidden;
    dom.toggleGuideButton.textContent = nextHidden
      ? 'How to read the graph in detail'
      : 'Hide detailed reading guide';
    if (!nextHidden) {
      renderGuidePlot();
    }
  });

  applyControlState();
  syncOutputs();
}

async function boot() {
  const manifest = await fetchJson(MANIFEST_PATH);
  state.manifest = manifest;
  populateContextControls(manifest);
  await loadSelectedContext();
}

async function loadSelectedContext() {
  const contextKey = getSelectedContextKey();
  const context = await ensureContext(contextKey);
  state.currentContextKey = context.key;
  if (!state.sampledPeerId || !context.profileMap.has(state.sampledPeerId)) {
    state.sampledPeerId = sampleRandomPeerId(context);
  }
  render();
}

function populateContextControls(manifest) {
  const inductionChoices = [...new Set(manifest.contexts.map((item) => item.induction))];
  const defaultContext = manifest.contexts.find((item) => item.key === manifest.defaultContext);
  setSelectOptions(
    dom.inductionSelect,
    inductionChoices,
    defaultContext?.induction || inductionChoices[0]
  );
  syncDoseChoices(manifest.defaultContext);
}

function syncDoseChoices(preferredContextKey = null) {
  const induction = dom.inductionSelect.value;
  const availableContexts = state.manifest.contexts.filter((item) => item.induction === induction);
  const doses = availableContexts.map((item) => item.dose);
  const preferredDose = preferredContextKey
    ? state.manifest.contexts.find((item) => item.key === preferredContextKey)?.dose
    : dom.doseSelect.value;
  setSelectOptions(dom.doseSelect, doses, doses.includes(preferredDose) ? preferredDose : doses[0]);
}

function getSelectedContextKey() {
  const induction = dom.inductionSelect.value;
  const dose = dom.doseSelect.value;
  const match = state.manifest.contexts.find((item) => item.induction === induction && item.dose === dose);
  return match?.key ?? state.manifest.defaultContext;
}

async function ensureContext(contextKey) {
  if (state.contextCache.has(contextKey)) {
    return state.contextCache.get(contextKey);
  }

  const contextInfo = state.manifest.contexts.find((item) => item.key === contextKey);
  if (!contextInfo) {
    throw new Error(`Unknown context key: ${contextKey}`);
  }

  const payload = await fetchJson(contextInfo.path);
  const normalized = normalizeContextPayload(payload);
  state.contextCache.set(contextKey, normalized);
  return normalized;
}

function normalizeContextPayload(payload) {
  const profileMap = new Map();
  const valuesByScale = payload.scaleOrder.map(() => []);
  const profiles = payload.profiles.map((profile) => {
    const values = profile.values.map((value) => Number(value));
    const entry = { peerId: profile.peerId, values };
    profileMap.set(profile.peerId, entry);
    values.forEach((value, index) => valuesByScale[index].push(value));
    return entry;
  });

  valuesByScale.forEach((values) => values.sort((a, b) => a - b));
  return {
    ...payload,
    profiles,
    profileMap,
    valuesByScale
  };
}

function getCurrentContext() {
  return state.currentContextKey ? state.contextCache.get(state.currentContextKey) : null;
}

function render() {
  const context = getCurrentContext();
  if (!context) {
    showFatalError('No peer context is currently loaded.');
    return;
  }

  syncOutputs();
  const palette = paletteFromPeerColor(state.controls.peerColor);
  updateLegend(palette);
  updateMeta(context);
  updateSelectionSummary(context);
  renderPlot(context, palette);
  if (!dom.guideShell.hidden) {
    renderGuidePlot(palette);
  }
}

function scheduleRender() {
  if (state.renderQueued) {
    return;
  }

  state.renderQueued = true;
  window.requestAnimationFrame(() => {
    state.renderQueued = false;
    render();
  });
}

function renderPlot(context, palette) {
  const controls = state.controls;
  const geometry = buildRadialGeometry(context.scaleOrder, controls.innerRadius, controls.outerRadius);
  const ringValues = [0, 25, 50, 75, 100];
  const ringRadii = ringValues.map((value) =>
    radiusFromValue(value, controls.innerRadius, controls.outerRadius, controls.invert)
  );

  const spokeLines = geometry.map((row) => `
    <line x1="${formatNumber(row.ux * controls.innerRadius)}" y1="${formatNumber(row.uy * controls.innerRadius)}"
          x2="${formatNumber(row.ux * controls.outerRadius)}" y2="${formatNumber(row.uy * controls.outerRadius)}"
          stroke="${palette.grid}" stroke-width="0.0045" />
  `).join('');

  const ringPaths = [controls.innerRadius, ...ringRadii.slice(1)]
    .map((radius) => circlePath(radius))
    .map((path) => `<path d="${path}" fill="none" stroke="${palette.grid}" stroke-width="0.0045"></path>`)
    .join('');

  const violinPolygons = buildViolinPolygons(context, geometry, controls).map((polygon) => {
    const path = polygonPath(polygon.points);
    return `<path d="${path}" fill="${withAlpha(palette.peerFill, 0.56)}" stroke="${withAlpha(palette.peerLine, 0.72)}" stroke-width="0.0045"></path>`;
  }).join('');

  const boxSummary = controls.showQuartiles
    ? buildBoxSummary(context, geometry, controls, palette)
    : { whiskers: '', endpoints: '', boxes: '', medians: '', outliers: '' };

  const userProfile = buildUserProfile(context, controls);
  const userPolygon = buildUserPolygon(userProfile, geometry, controls);
  const userFill = controls.showUserFill
    ? `<path d="${polygonPath(userPolygon.closed)}" fill="${withAlpha(palette.userFill, 0.12)}" stroke="none"></path>`
    : '';

  const peerMedianProfile = controls.showPeerMedian ? buildQuantileProfile(context, 0.5) : null;
  const peerMedianPolygon = peerMedianProfile
    ? `<path d="${polygonPath(buildUserPolygon(peerMedianProfile, geometry, controls).closed)}"
         fill="none" stroke="${withAlpha(palette.median, 0.86)}" stroke-width="0.008"
         stroke-dasharray="0.02 0.02"></path>`
    : '';

  const userPath = `
    <path d="${polygonPath(userPolygon.closed)}" fill="none" stroke="${palette.user}" stroke-width="0.0095"
          stroke-linejoin="round" stroke-linecap="round"></path>
    ${userPolygon.points.map((point) => `<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="0.016" fill="${palette.user}"></circle>`).join('')}
  `;

  const labelRadius = Math.max(controls.outerRadius + 0.14, 1.1);
  const labels = geometry.map((row, index) => {
    const label = wrapLabel(context.scaleOrder[index], 15);
    const x = row.ux * labelRadius;
    const y = row.uy * labelRadius;
    const anchor = Math.cos(row.theta) > 0.25 ? 'start' : (Math.cos(row.theta) < -0.25 ? 'end' : 'middle');
    const dyStart = label.length > 1 ? -0.03 : 0;
    return `
      <text x="${formatNumber(x)}" y="${formatNumber(y)}" text-anchor="${anchor}" dominant-baseline="middle"
            font-size="0.052" font-weight="700" fill="${palette.label}">
        ${label.map((line, lineIndex) => `<tspan x="${formatNumber(x)}" dy="${formatNumber(lineIndex === 0 ? dyStart : 0.08)}">${escapeHtml(line)}</tspan>`).join('')}
      </text>
    `;
  }).join('');

  dom.plotSvg.innerHTML = `
    <rect x="-1.38" y="-1.38" width="2.76" height="2.76" fill="#ffffff"></rect>
    ${ringPaths}
    ${spokeLines}
    ${violinPolygons}
    ${userFill}
    ${peerMedianPolygon}
    ${boxSummary.whiskers}
    ${boxSummary.endpoints}
    ${boxSummary.boxes}
    ${boxSummary.medians}
    ${controls.showOutliers ? boxSummary.outliers : ''}
    ${userPath}
    ${labels}
  `;
}

function renderGuidePlot(palette = paletteFromPeerColor(state.controls.peerColor)) {
  const invert = state.controls.invert;
  const demoValues = [
    16, 19, 21, 24, 26, 27, 29, 31, 33, 35, 36, 38,
    41, 44, 46, 48, 50, 52, 55, 58, 60, 62, 64, 67,
    69, 72, 75, 80, 92
  ];

  const dens = computeDensity(demoValues, 8, 90, 180, 1.05);
  const guideX = (value) => invert ? 100 - value : value;
  const maxDensity = Math.max(...dens.y, 1);
  const topHalf = dens.x.map((value, index) => ({
    x: guideX(value) / 100,
    y: (dens.y[index] / maxDensity) * 0.35
  }));
  const bottomHalf = [...topHalf].reverse().map((point) => ({ x: point.x, y: -point.y }));
  const violinPath = polygonPath([...topHalf, ...bottomHalf]);

  const sorted = [...demoValues].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const q2 = quantileSorted(sorted, 0.5);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const inliers = sorted.filter((value) => value >= lowFence && value <= highFence);
  const whiskerLow = inliers[0];
  const whiskerHigh = inliers[inliers.length - 1];
  const outlier = sorted.find((value) => value < whiskerLow || value > whiskerHigh) ?? whiskerHigh + 8;

  const q1x = guideX(q1) / 100;
  const q2x = guideX(q2) / 100;
  const q3x = guideX(q3) / 100;
  const minx = guideX(whiskerLow) / 100;
  const maxx = guideX(whiskerHigh) / 100;
  const outx = guideX(outlier) / 100;
  const directionNote = invert ? 'higher values near center' : 'lower values near center';

  dom.guideSvg.innerHTML = `
    <rect x="-0.08" y="-0.78" width="1.22" height="1.56" fill="#ffffff"></rect>
    <path d="${violinPath}" fill="${withAlpha(palette.peerFill, 0.82)}" stroke="none"></path>
    <line x1="${formatNumber(minx)}" y1="0" x2="${formatNumber(maxx)}" y2="0" stroke="${palette.boxLine}" stroke-width="0.012"></line>
    <rect x="${formatNumber(Math.min(q1x, q3x))}" y="-0.10" width="${formatNumber(Math.abs(q3x - q1x))}" height="0.20"
          fill="${palette.boxFill}" stroke="${palette.boxLine}" stroke-width="0.01"></rect>
    <line x1="${formatNumber(q2x)}" y1="-0.10" x2="${formatNumber(q2x)}" y2="0.10" stroke="${palette.median}" stroke-width="0.015"></line>
    <circle cx="${formatNumber(minx)}" cy="0" r="0.034" fill="${palette.boxLine}"></circle>
    <circle cx="${formatNumber(maxx)}" cy="0" r="0.034" fill="${palette.boxLine}"></circle>
    <circle cx="${formatNumber(outx)}" cy="0" r="0.034" fill="${palette.outlier}"></circle>

    ${annotationLine(minx, 0.08, minx, 0.55)}
    ${annotationText(minx, 0.64, 'minimum')}
    ${annotationLine(q2x, 0.12, q2x, 0.48)}
    ${annotationText(q2x, 0.60, 'Q2 median')}
    ${annotationLine(maxx, 0.08, maxx, 0.55)}
    ${annotationText(maxx, 0.64, 'maximum')}
    ${annotationLine(q1x, -0.12, q1x, -0.52)}
    ${annotationText(q1x, -0.64, 'Q1 lower quartile', true)}
    ${annotationLine(q3x, -0.12, q3x, -0.52)}
    ${annotationText(q3x, -0.64, 'Q3 upper quartile', true)}

    <line x1="${formatNumber(invert ? 0.18 : 0.81)}" y1="${formatNumber(invert ? 0.46 : 0.06)}"
          x2="${formatNumber(invert ? 0.30 : 0.68)}" y2="${formatNumber(invert ? 0.06 : 0.19)}"
          stroke="${palette.label}" stroke-width="0.008" stroke-dasharray="0.025 0.02"></line>
    <text x="${formatNumber(invert ? 0.12 : 0.86)}" y="${formatNumber(invert ? 0.52 : 0.08)}"
          font-size="0.070" font-weight="700" fill="${palette.label}" text-anchor="${invert ? 'end' : 'start'}">outlier</text>

    <line x1="${formatNumber(invert ? 0.22 : 0.78)}" y1="${formatNumber(invert ? -0.54 : -0.50)}"
          x2="${formatNumber(invert ? 0.33 : 0.67)}" y2="-0.17"
          stroke="${palette.label}" stroke-width="0.008" stroke-dasharray="0.025 0.02"></line>
    <text x="${formatNumber(invert ? 0.18 : 0.82)}" y="${formatNumber(invert ? -0.58 : -0.54)}"
          font-size="0.070" font-weight="700" fill="${palette.label}" text-anchor="${invert ? 'end' : 'start'}">data distribution</text>

    <circle cx="${formatNumber(invert ? 1.01 : -0.02)}" cy="0" r="0.10" fill="#ffffff" stroke="#8e919d" stroke-width="0.008"></circle>
    <text x="${formatNumber(invert ? 1.01 : -0.02)}" y="-0.02" font-size="0.060" font-weight="700" fill="${palette.label}" text-anchor="middle">toward</text>
    <text x="${formatNumber(invert ? 1.01 : -0.02)}" y="0.06" font-size="0.060" font-weight="700" fill="${palette.label}" text-anchor="middle">chart center</text>
    <text x="${formatNumber(invert ? 1.01 : -0.02)}" y="0.16" font-size="0.050" fill="${palette.textMuted}" text-anchor="middle">${escapeHtml(directionNote)}</text>
  `;
}

function buildViolinPolygons(context, geometry, controls) {
  const densityMap = context.valuesByScale.map((values) =>
    computeDensity(values, MIN_VALUE, MAX_VALUE, DENSITY_POINTS, controls.densityAdjust)
  );
  const maxByScale = densityMap.map((dens) => Math.max(...dens.y, 0));
  const globalMax = Math.max(...maxByScale, 1);
  const positiveMaxima = maxByScale.filter((value) => value > 0);
  const robustGlobal = positiveMaxima.length
    ? quantileSorted([...positiveMaxima].sort((a, b) => a - b), 0.85)
    : globalMax;

  return densityMap.map((dens, index) => {
    const row = geometry[index];
    let refMax = robustGlobal;
    if (controls.widthMode === 'per_scale') refMax = maxByScale[index];
    if (controls.widthMode === 'global_raw') refMax = globalMax;
    if (!Number.isFinite(refMax) || refMax <= 0) refMax = globalMax;

    const left = [];
    const right = [];
    for (let pointIndex = 0; pointIndex < dens.x.length; pointIndex += 1) {
      const radius = radiusFromValue(dens.x[pointIndex], controls.innerRadius, controls.outerRadius, controls.invert);
      const scaledDensity = Math.min(dens.y[pointIndex] / refMax, 1);
      const halfWidth = Math.pow(Math.max(scaledDensity, 0), controls.densityExponent) * controls.violinHalfWidth;
      left.push(pointOnSpoke(radius, row, halfWidth));
    }
    for (let pointIndex = dens.x.length - 1; pointIndex >= 0; pointIndex -= 1) {
      const radius = radiusFromValue(dens.x[pointIndex], controls.innerRadius, controls.outerRadius, controls.invert);
      const scaledDensity = Math.min(dens.y[pointIndex] / refMax, 1);
      const halfWidth = Math.pow(Math.max(scaledDensity, 0), controls.densityExponent) * controls.violinHalfWidth;
      right.push(pointOnSpoke(radius, row, -halfWidth));
    }

    return { scaleId: context.scaleOrder[index], points: [...left, ...right] };
  });
}

function buildBoxSummary(context, geometry, controls, palette) {
  const parts = {
    whiskers: [],
    endpoints: [],
    boxes: [],
    medians: [],
    outliers: []
  };

  context.valuesByScale.forEach((sortedValues, index) => {
    if (!sortedValues.length) {
      return;
    }

    const row = geometry[index];
    const q1 = quantileSorted(sortedValues, 0.25);
    const q2 = quantileSorted(sortedValues, 0.5);
    const q3 = quantileSorted(sortedValues, 0.75);
    const iqr = q3 - q1;
    const lowFence = q1 - 1.5 * iqr;
    const highFence = q3 + 1.5 * iqr;
    const inliers = sortedValues.filter((value) => value >= lowFence && value <= highFence);
    const whiskerLow = inliers[0] ?? sortedValues[0];
    const whiskerHigh = inliers[inliers.length - 1] ?? sortedValues[sortedValues.length - 1];
    const outliers = sortedValues.filter((value) => value < whiskerLow || value > whiskerHigh);

    const whiskerStart = pointOnSpoke(radiusFromValue(whiskerLow, controls.innerRadius, controls.outerRadius, controls.invert), row, 0);
    const whiskerEnd = pointOnSpoke(radiusFromValue(whiskerHigh, controls.innerRadius, controls.outerRadius, controls.invert), row, 0);
    parts.whiskers.push(`<line x1="${formatNumber(whiskerStart.x)}" y1="${formatNumber(whiskerStart.y)}" x2="${formatNumber(whiskerEnd.x)}" y2="${formatNumber(whiskerEnd.y)}" stroke="${palette.boxLine}" stroke-width="0.008"></line>`);
    parts.endpoints.push(`<circle cx="${formatNumber(whiskerStart.x)}" cy="${formatNumber(whiskerStart.y)}" r="0.012" fill="${palette.boxLine}"></circle>`);
    parts.endpoints.push(`<circle cx="${formatNumber(whiskerEnd.x)}" cy="${formatNumber(whiskerEnd.y)}" r="0.012" fill="${palette.boxLine}"></circle>`);

    const q1r = radiusFromValue(q1, controls.innerRadius, controls.outerRadius, controls.invert);
    const q3r = radiusFromValue(q3, controls.innerRadius, controls.outerRadius, controls.invert);
    const boxPoints = [
      pointOnSpoke(q1r, row, controls.boxHalfWidth),
      pointOnSpoke(q3r, row, controls.boxHalfWidth),
      pointOnSpoke(q3r, row, -controls.boxHalfWidth),
      pointOnSpoke(q1r, row, -controls.boxHalfWidth)
    ];
    parts.boxes.push(`<path d="${polygonPath(boxPoints)}" fill="${palette.boxFill}" stroke="${palette.boxLine}" stroke-width="0.006"></path>`);

    const medianRadius = radiusFromValue(q2, controls.innerRadius, controls.outerRadius, controls.invert);
    const medianStart = pointOnSpoke(medianRadius, row, controls.boxHalfWidth);
    const medianEnd = pointOnSpoke(medianRadius, row, -controls.boxHalfWidth);
    parts.medians.push(`<line x1="${formatNumber(medianStart.x)}" y1="${formatNumber(medianStart.y)}" x2="${formatNumber(medianEnd.x)}" y2="${formatNumber(medianEnd.y)}" stroke="${palette.median}" stroke-width="0.0095"></line>`);

    if (controls.showOutliers) {
      outliers.forEach((value) => {
        const point = pointOnSpoke(radiusFromValue(value, controls.innerRadius, controls.outerRadius, controls.invert), row, 0);
        parts.outliers.push(`<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="0.010" fill="${palette.outlier}" fill-opacity="0.78"></circle>`);
      });
    }
  });

  return {
    whiskers: parts.whiskers.join(''),
    endpoints: parts.endpoints.join(''),
    boxes: parts.boxes.join(''),
    medians: parts.medians.join(''),
    outliers: parts.outliers.join('')
  };
}

function buildUserProfile(context, controls) {
  if (controls.userMode === 'sample_peer') {
    if (!state.sampledPeerId || !context.profileMap.has(state.sampledPeerId)) {
      state.sampledPeerId = sampleRandomPeerId(context);
    }
    return context.profileMap.get(state.sampledPeerId)?.values ?? buildQuantileProfile(context, 0.5);
  }

  if (controls.userMode === 'p75') {
    return buildQuantileProfile(context, 0.75);
  }

  if (controls.userMode === 'p25') {
    return buildQuantileProfile(context, 0.25);
  }

  return buildQuantileProfile(context, 0.5);
}

function buildQuantileProfile(context, probability) {
  return context.valuesByScale.map((values) => quantileSorted(values, probability));
}

function buildUserPolygon(profileValues, geometry, controls) {
  const points = profileValues.map((value, index) => {
    const radius = radiusFromValue(value, controls.innerRadius, controls.outerRadius, controls.invert);
    return {
      scaleId: geometry[index].scaleId,
      ...pointOnSpoke(radius, geometry[index], 0)
    };
  });
  return {
    points,
    closed: [...points, points[0]]
  };
}

function buildRadialGeometry(scaleOrder, innerRadius, outerRadius) {
  const count = scaleOrder.length;
  return scaleOrder.map((scaleId, index) => {
    const angle = (index / count) * Math.PI * 2;
    const theta = Math.PI / 2 - angle;
    return {
      scaleId,
      angle,
      theta,
      ux: Math.cos(theta),
      uy: Math.sin(theta),
      tx: -Math.sin(theta),
      ty: Math.cos(theta),
      innerRadius,
      outerRadius
    };
  });
}

function computeDensity(values, from, to, points, adjust) {
  if (!values || values.length < 2) {
    return { x: [from, to], y: [0, 0] };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const spread = sorted[sorted.length - 1] - sorted[0];
  if (spread < 1e-8) {
    return { x: [from, to], y: [0, 0] };
  }

  const bandwidth = Math.max(silvermanBandwidth(sorted) * adjust, 1.2);
  const xs = [];
  const ys = [];
  const step = (to - from) / (points - 1);
  const normalizer = sorted.length * bandwidth * Math.sqrt(2 * Math.PI);

  for (let pointIndex = 0; pointIndex < points; pointIndex += 1) {
    const x = from + step * pointIndex;
    let sum = 0;
    for (const value of sorted) {
      const u = (x - value) / bandwidth;
      sum += Math.exp(-0.5 * u * u);
    }
    xs.push(x);
    ys.push(sum / normalizer);
  }

  return { x: xs, y: ys };
}

function silvermanBandwidth(sortedValues) {
  const n = sortedValues.length;
  const mean = sortedValues.reduce((sum, value) => sum + value, 0) / n;
  const variance = sortedValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(n - 1, 1);
  const sd = Math.sqrt(variance);
  const iqr = quantileSorted(sortedValues, 0.75) - quantileSorted(sortedValues, 0.25);
  const sigma = Math.min(sd, iqr / 1.34) || sd || 1;
  return 0.9 * sigma * Math.pow(n, -0.2);
}

function quantileSorted(sortedValues, probability) {
  if (!sortedValues.length) {
    return 0;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];
  const weight = position - lowerIndex;
  return lowerValue + (upperValue - lowerValue) * weight;
}

function radiusFromValue(value, innerRadius, outerRadius, invert) {
  const clamped = Math.max(MIN_VALUE, Math.min(MAX_VALUE, value));
  const scaled = (clamped - MIN_VALUE) / (MAX_VALUE - MIN_VALUE);
  const mapped = invert ? 1 - scaled : scaled;
  return innerRadius + mapped * (outerRadius - innerRadius);
}

function pointOnSpoke(radius, geometryRow, offset = 0) {
  return {
    x: geometryRow.ux * radius + geometryRow.tx * offset,
    y: geometryRow.uy * radius + geometryRow.ty * offset
  };
}

function circlePath(radius) {
  const steps = 240;
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const theta = Math.PI / 2 - angle;
    points.push({
      x: Math.cos(theta) * radius,
      y: Math.sin(theta) * radius
    });
  }
  return polylinePath(points, true);
}

function polygonPath(points) {
  return polylinePath(points, true);
}

function polylinePath(points, closePath = false) {
  if (!points.length) {
    return '';
  }
  const [first, ...rest] = points;
  const commands = [`M ${formatNumber(first.x)} ${formatNumber(first.y)}`];
  rest.forEach((point) => {
    commands.push(`L ${formatNumber(point.x)} ${formatNumber(point.y)}`);
  });
  if (closePath) {
    commands.push('Z');
  }
  return commands.join(' ');
}

function wrapLabel(label, width) {
  const words = label.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  if (lines.length <= 2) {
    return lines;
  }
  return [lines[0], lines.slice(1).join(' ')];
}

function sampleRandomPeerId(context) {
  if (!context.profiles.length) {
    return null;
  }
  const index = Math.floor(Math.random() * context.profiles.length);
  return context.profiles[index].peerId;
}

function updateSelectionSummary(context) {
  const overlayLabel = {
    sample_peer: 'Sample matching peer',
    median: 'Median profile',
    p75: '75th percentile profile',
    p25: '25th percentile profile'
  }[state.controls.userMode];

  const selectedPeer = state.controls.userMode === 'sample_peer' && state.sampledPeerId
    ? state.sampledPeerId
    : 'n/a';
  const scaleDirection = state.controls.invert ? 'Higher values toward center' : 'Higher values outward';

  dom.selectionSummary.innerHTML = [
    ['Context', `${titleCase(context.induction)} / ${titleCase(context.dose)}`],
    ['Peers', `${context.peerCount.toLocaleString()} complete profiles`],
    ['Overlay', overlayLabel],
    ['Sample id', selectedPeer],
    ['Direction', scaleDirection]
  ].map(([term, description]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(description)}</dd></div>`).join('');
}

function updateMeta(context) {
  const overlayDescription = {
    sample_peer: 'one randomly sampled peer profile from the selected subset',
    median: 'the per-scale median profile from the selected subset',
    p75: 'the per-scale 75th percentile profile from the selected subset',
    p25: 'the per-scale 25th percentile profile from the selected subset'
  }[state.controls.userMode];

  dom.plotMeta.innerHTML = [
    `<div class="meta-line"><strong>Showing:</strong> ${escapeHtml(titleCase(context.induction))} / ${escapeHtml(titleCase(context.dose))} peers</div>`,
    `<div class="meta-line"><strong>Data used:</strong> ${context.peerCount.toLocaleString()} complete peer profiles from the public AXP legacy factor-score export</div>`,
    `<div class="meta-line"><strong>Overlay:</strong> ${escapeHtml(overlayDescription)}</div>`
  ].join('');
}

function updateLegend(palette) {
  dom.plotLegend.innerHTML = `
    <article class="legend-item">
      <span class="legend-mark"><span class="legend-fill" style="background:${withAlpha(palette.peerFill, 0.56)}; border-color:${withAlpha(palette.peerLine, 0.72)};"></span></span>
      <span><strong>Peer distribution</strong><span>Violin width shows where matching peers are denser on each ASC spoke.</span></span>
    </article>
    <article class="legend-item">
      <span class="legend-mark"><span class="legend-fill" style="background:${palette.boxFill}; border-color:${palette.boxLine};"></span></span>
      <span><strong>Quartiles and whiskers</strong><span>The box spans Q1 to Q3 and the short darker line marks the median.</span></span>
    </article>
    <article class="legend-item">
      <span class="legend-mark"><span class="legend-line" style="border-top-color:${palette.user};"></span></span>
      <span><strong>Reference profile</strong><span>The purple path is the sampled or percentile-based overlay selected in the controls.</span></span>
    </article>
    <article class="legend-item">
      <span class="legend-mark"><span class="legend-line legend-dashed" style="border-top-color:${palette.median};"></span></span>
      <span><strong>Peer median path</strong><span>Optional dashed connection through the per-scale peer medians.</span></span>
    </article>
  `;
}

function paletteFromPeerColor(peerColor) {
  const resolvedPeer = resolveColor(peerColor, '#c8b17a');
  const userColor = '#6b3df0';
  return {
    user: userColor,
    userFill: userColor,
    peerFill: resolvedPeer,
    peerLine: mixColor(resolvedPeer, '#2d2412', 0.42),
    boxFill: mixColor(resolvedPeer, '#ffffff', 0.76),
    boxLine: mixColor(resolvedPeer, '#352d1f', 0.58),
    median: mixColor(resolvedPeer, '#1f1a12', 0.74),
    outlier: mixColor(resolvedPeer, '#23211d', 0.72),
    grid: '#d8dde6',
    label: '#171b24',
    textMuted: '#566273'
  };
}

function resolveColor(color, fallback) {
  const normalized = color?.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }
  return fallback;
}

function mixColor(color, target, amount) {
  const base = hexToRgb(resolveColor(color, '#c8b17a'));
  const other = hexToRgb(resolveColor(target, '#ffffff'));
  const mixed = [0, 1, 2].map((index) =>
    Math.round(base[index] * (1 - amount) + other[index] * amount)
  );
  return rgbToHex(mixed);
}

function withAlpha(color, alpha) {
  const [r, g, b] = hexToRgb(resolveColor(color, '#000000'));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(color) {
  const normalized = resolveColor(color, '#000000').slice(1);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function readControlValue(element) {
  if (element.type === 'range') {
    return Number(element.value);
  }
  if (element.type === 'color') {
    return element.value;
  }
  return element.value;
}

function applyControlState() {
  dom.innerRadiusRange.value = state.controls.innerRadius;
  dom.outerRadiusRange.value = state.controls.outerRadius;
  dom.violinHalfWidthRange.value = state.controls.violinHalfWidth;
  dom.boxHalfWidthRange.value = state.controls.boxHalfWidth;
  dom.densityAdjustRange.value = state.controls.densityAdjust;
  dom.densityExponentRange.value = state.controls.densityExponent;
  dom.peerColorInput.value = state.controls.peerColor;
  dom.widthModeSelect.value = state.controls.widthMode;
  dom.userModeSelect.value = state.controls.userMode;
  dom.invertScaleCheckbox.checked = state.controls.invert;
  dom.showUserFillCheckbox.checked = state.controls.showUserFill;
  dom.showPeerMedianCheckbox.checked = state.controls.showPeerMedian;
  dom.showQuartilesCheckbox.checked = state.controls.showQuartiles;
  dom.showOutliersCheckbox.checked = state.controls.showOutliers;
}

function syncOutputs() {
  dom.innerRadiusValue.value = trimNumber(state.controls.innerRadius, 2);
  dom.outerRadiusValue.value = trimNumber(state.controls.outerRadius, 2);
  dom.violinHalfWidthValue.value = trimNumber(state.controls.violinHalfWidth, 3);
  dom.boxHalfWidthValue.value = trimNumber(state.controls.boxHalfWidth, 3);
  dom.densityAdjustValue.value = trimNumber(state.controls.densityAdjust, 2);
  dom.densityExponentValue.value = trimNumber(state.controls.densityExponent, 2);
}

function setSelectOptions(select, values, selectedValue) {
  select.innerHTML = values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(titleCase(value))}</option>`)
    .join('');
  if (selectedValue && values.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}`);
  }
  return response.json();
}

function showFatalError(message) {
  dom.plotMeta.innerHTML = `<p class="status-note">${escapeHtml(message)}</p>`;
  dom.plotLegend.innerHTML = '';
  dom.selectionSummary.innerHTML = '';
  dom.plotSvg.innerHTML = '';
  dom.guideSvg.innerHTML = '';
}

function annotationLine(x1, y1, x2, y2) {
  return `
    <line x1="${formatNumber(x1)}" y1="${formatNumber(y1)}" x2="${formatNumber(x2)}" y2="${formatNumber(y2)}"
          stroke="#171b24" stroke-width="0.008" stroke-dasharray="0.025 0.02"></line>
  `;
}

function annotationText(x, y, text, below = false) {
  return `
    <text x="${formatNumber(x)}" y="${formatNumber(y)}" font-size="0.070" font-weight="700"
          fill="#171b24" text-anchor="middle" dominant-baseline="${below ? 'hanging' : 'auto'}">${escapeHtml(text)}</text>
  `;
}

function formatNumber(value) {
  return Number(value).toFixed(4);
}

function trimNumber(value, decimals) {
  return Number(value).toFixed(decimals).replace(/\.?0+$/, '');
}

function titleCase(text) {
  return text.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
