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
    target.appendChild(buildJsonVisualView(text));
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

function buildJsonVisualView(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return buildCodeView(formatJson(text), 'json');
  }

  const shell = document.createElement('div');
  shell.className = 'json-visual-shell';

  if (Array.isArray(data)) {
    shell.appendChild(buildJsonArraySection('Records', data, 0));
    return shell;
  }

  if (!isPlainObject(data)) {
    shell.appendChild(buildJsonPrimitiveRecord('Value', data));
    return shell;
  }

  const entries = Object.entries(data);
  const simpleEntries = entries.filter(([, value]) => isSimpleJsonValue(value));
  const complexEntries = entries.filter(([, value]) => !isSimpleJsonValue(value));

  if (simpleEntries.length > 0) {
    const overview = document.createElement('section');
    overview.className = 'json-visual-section json-visual-section--overview';
    const heading = document.createElement('h3');
    heading.textContent = 'Overview';
    overview.append(heading, buildJsonFactGrid(simpleEntries));
    shell.appendChild(overview);
  }

  for (const [key, value] of complexEntries) {
    shell.appendChild(buildJsonValueSection(key, value, 0));
  }

  return shell;
}

function buildJsonValueSection(key, value, depth) {
  if (Array.isArray(value)) {
    return buildJsonArraySection(key, value, depth);
  }

  if (isPlainObject(value)) {
    return buildJsonObjectSection(key, value, depth);
  }

  return buildJsonPrimitiveRecord(humanizeKey(key), value);
}

function buildJsonObjectSection(key, value, depth) {
  const section = document.createElement('section');
  section.className = 'json-visual-section';
  section.dataset.depth = String(depth);

  const heading = document.createElement(depth === 0 ? 'h3' : 'h4');
  heading.textContent = humanizeKey(key);
  section.appendChild(heading);

  const entries = Object.entries(value);
  const simpleEntries = entries.filter(([, entryValue]) => isSimpleJsonValue(entryValue));
  const complexEntries = entries.filter(([, entryValue]) => !isSimpleJsonValue(entryValue));

  if (simpleEntries.length > 0) {
    section.appendChild(buildJsonFactGrid(simpleEntries));
  }

  if (complexEntries.length > 0) {
    const nested = document.createElement('div');
    nested.className = 'json-nested-grid';

    for (const [entryKey, entryValue] of complexEntries) {
      nested.appendChild(buildJsonNestedItem(entryKey, entryValue, depth + 1));
    }

    section.appendChild(nested);
  }

  return section;
}

function buildJsonArraySection(key, value, depth) {
  const section = document.createElement('section');
  section.className = 'json-visual-section';
  section.dataset.depth = String(depth);

  const heading = document.createElement(depth === 0 ? 'h3' : 'h4');
  heading.textContent = humanizeKey(key);
  section.appendChild(heading);

  const count = document.createElement('p');
  count.className = 'json-section-note';
  count.textContent = `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  section.appendChild(count);

  if (value.length === 0) {
    return section;
  }

  if (value.every((item) => isPlainObject(item))) {
    section.appendChild(buildJsonObjectTable(value));
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'json-value-list';
  for (const item of value) {
    const li = document.createElement('li');
    li.textContent = summarizeJsonValue(item);
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

function buildJsonNestedItem(key, value, depth) {
  const item = document.createElement('article');
  item.className = 'json-nested-item';

  const heading = document.createElement('h5');
  heading.textContent = humanizeKey(key);
  item.appendChild(heading);

  if (Array.isArray(value)) {
    const note = document.createElement('p');
    note.className = 'json-section-note';
    note.textContent = `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
    item.appendChild(note);

    if (value.every((entry) => isPlainObject(entry))) {
      item.appendChild(buildJsonObjectTable(value));
    } else {
      const list = document.createElement('ol');
      list.className = 'json-value-list';
      for (const entry of value) {
        const li = document.createElement('li');
        li.textContent = summarizeJsonValue(entry);
        list.appendChild(li);
      }
      item.appendChild(list);
    }
    return item;
  }

  if (isPlainObject(value) && depth <= 2) {
    const entries = Object.entries(value);
    const simpleEntries = entries.filter(([, entryValue]) => isSimpleJsonValue(entryValue));
    const complexEntries = entries.filter(([, entryValue]) => !isSimpleJsonValue(entryValue));

    if (simpleEntries.length > 0) {
      item.appendChild(buildJsonFactGrid(simpleEntries));
    }

    for (const [entryKey, entryValue] of complexEntries) {
      const summary = document.createElement('p');
      summary.className = 'json-section-note';
      summary.textContent = `${humanizeKey(entryKey)}: ${summarizeJsonValue(entryValue)}`;
      item.appendChild(summary);
    }
    return item;
  }

  const valueEl = document.createElement('p');
  valueEl.className = 'json-section-note';
  valueEl.textContent = summarizeJsonValue(value);
  item.appendChild(valueEl);
  return item;
}

function buildJsonFactGrid(entries) {
  const list = document.createElement('dl');
  list.className = 'json-fact-grid';

  for (const [key, value] of entries) {
    const item = document.createElement('div');
    item.className = 'json-fact';
    const dt = document.createElement('dt');
    dt.textContent = humanizeKey(key);
    const dd = document.createElement('dd');
    dd.textContent = formatJsonPrimitive(value);
    item.append(dt, dd);
    list.appendChild(item);
  }

  return list;
}

function buildJsonObjectTable(items) {
  const columns = collectTableColumns(items);

  if (columns.length === 0) {
    const list = document.createElement('ol');
    list.className = 'json-value-list';
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = summarizeJsonValue(item);
      list.appendChild(li);
    }
    return list;
  }

  const shell = document.createElement('div');
  shell.className = 'json-table-shell';

  const table = document.createElement('table');
  table.className = 'json-object-table';

  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const column of columns) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = humanizeKey(column);
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const item of items) {
    const row = document.createElement('tr');
    for (const column of columns) {
      const td = document.createElement('td');
      td.textContent = summarizeJsonValue(item[column]);
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  shell.appendChild(table);
  return shell;
}

function buildJsonPrimitiveRecord(label, value) {
  const section = document.createElement('section');
  section.className = 'json-visual-section';
  const heading = document.createElement('h3');
  heading.textContent = label;
  const body = document.createElement('p');
  body.className = 'json-section-note';
  body.textContent = formatJsonPrimitive(value);
  section.append(heading, body);
  return section;
}

function collectTableColumns(items) {
  const columns = [];
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      if (!columns.includes(key) && (isSimpleJsonValue(value) || columns.length < 6)) {
        columns.push(key);
      }
      if (columns.length >= 8) {
        return columns;
      }
    }
  }
  return columns;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSimpleJsonValue(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function formatJsonPrimitive(value) {
  if (value === null || value === undefined) {
    return 'blank';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

function summarizeJsonValue(value) {
  if (isSimpleJsonValue(value) || value === undefined) {
    return formatJsonPrimitive(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  }
  if (isPlainObject(value)) {
    const size = Object.keys(value).length;
    return `${size} ${size === 1 ? 'field' : 'fields'}`;
  }
  return String(value);
}

function humanizeKey(key) {
  const value = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (/^q\d+$/i.test(value)) {
    return value.toLowerCase();
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
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
