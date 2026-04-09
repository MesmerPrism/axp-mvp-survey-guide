function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function formatJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function detectFileFormat(file = {}) {
  const source = (file.source || '').toLowerCase();
  const dataType = (file.dataType || '').toLowerCase();

  if (source.endsWith('.csv') || dataType.includes('csv')) {
    return 'csv';
  }

  if (source.endsWith('.json') || dataType.includes('json')) {
    return 'json';
  }

  return 'text';
}

export function supportsLayoutMode(file = {}) {
  return detectFileFormat(file) !== 'text';
}

export function describeText(text) {
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

export function renderFilePreview(target, {
  file = {},
  text = '',
  view = 'layout',
  wrap = false,
  context = 'inline'
} = {}) {
  const format = detectFileFormat(file);
  const resolvedView = view === 'layout' && supportsLayoutMode(file) ? 'layout' : 'raw';

  target.innerHTML = '';
  target.classList.add('file-render-surface');
  target.dataset.context = context;
  target.dataset.format = format;
  target.dataset.view = resolvedView;

  if (resolvedView === 'layout' && format === 'csv') {
    target.appendChild(buildCsvSheet(text));
    return { format, view: resolvedView };
  }

  if (resolvedView === 'layout' && format === 'json') {
    target.appendChild(buildCodeView(formatJson(text), 'json'));
    return { format, view: resolvedView };
  }

  target.appendChild(buildRawView(text, wrap));
  return { format, view: 'raw' };
}

function buildCsvSheet(text) {
  const rows = parseCsv(text);
  const shell = document.createElement('div');
  shell.className = 'file-sheet-shell';

  if (rows.length === 0) {
    shell.innerHTML = '<p class="status-note">No rows available.</p>';
    return shell;
  }

  const table = document.createElement('table');
  table.className = 'file-sheet-table';

  const headerRow = rows[0];
  const header = document.createElement('thead');
  const headerTr = document.createElement('tr');

  const corner = document.createElement('th');
  corner.className = 'file-sheet-index file-sheet-index--corner';
  corner.scope = 'col';
  corner.textContent = '#';
  headerTr.appendChild(corner);

  for (const cell of headerRow) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = cell;
    headerTr.appendChild(th);
  }

  header.appendChild(headerTr);
  table.appendChild(header);

  const body = document.createElement('tbody');
  const bodyRows = rows.slice(1);

  bodyRows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');

    const indexCell = document.createElement('th');
    indexCell.className = 'file-sheet-index';
    indexCell.scope = 'row';
    indexCell.textContent = String(rowIndex + 1);
    tr.appendChild(indexCell);

    const width = Math.max(headerRow.length, row.length);
    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      const td = document.createElement('td');
      td.textContent = row[columnIndex] ?? '';
      tr.appendChild(td);
    }

    body.appendChild(tr);
  });

  table.appendChild(body);
  shell.appendChild(table);
  return shell;
}

function buildCodeView(text, variant) {
  const shell = document.createElement('div');
  shell.className = 'file-code-shell';
  shell.dataset.variant = variant;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const row = document.createElement('div');
    row.className = 'file-code-row';

    const lineNumber = document.createElement('span');
    lineNumber.className = 'file-code-line';
    lineNumber.textContent = String(index + 1);

    const code = document.createElement('code');
    code.className = 'file-code-text';
    code.innerHTML = variant === 'json'
      ? highlightJsonLine(line)
      : escapeHtml(line) || '&nbsp;';

    row.append(lineNumber, code);
    shell.appendChild(row);
  });

  return shell;
}

function buildRawView(text, wrap) {
  const shell = document.createElement('div');
  shell.className = 'file-raw-shell';
  if (wrap) {
    shell.classList.add('is-wrapped');
  }

  const pre = document.createElement('pre');
  pre.className = 'file-raw-pre';
  pre.textContent = text;
  shell.appendChild(pre);
  return shell;
}

function highlightJsonLine(line) {
  const safe = escapeHtml(line);
  return safe
    .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="json-key">$1</span>$2')
    .replace(/:\s*(&quot;.*?&quot;)/g, ': <span class="json-string">$1</span>')
    .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="json-number">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="json-literal">$1</span>');
}
