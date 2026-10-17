const DATABASE_NAME = 'thyroid-tracker-files';
const DATABASE_VERSION = 1;
const FILE_ACCEPT = '.pdf,.doc,.docx,.docm,.odt,.rtf,.txt,.md,.pages,.xls,.xlsx,.ppt,.pptx,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
const root = document.getElementById('foldersList');
const status = document.getElementById('foldersStatus');
let database;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function createId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Storage operation was cancelled.'));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('folders', { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
      const documents = request.result.createObjectStore('documents', { keyPath: 'id' });
      documents.createIndex('folderId', 'folderId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other tracker tabs to finish setting up document storage.'));
  });
}

async function getAll(storeName) {
  const transaction = database.transaction(storeName, 'readonly');
  const result = await requestResult(transaction.objectStore(storeName).getAll());
  await transactionResult(transaction);
  return result;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function documentKind(document) {
  const extension = document.name.split('.').pop()?.toLowerCase() || '';
  return extension.slice(0, 5) || 'FILE';
}

function renderDocument(document) {
  return `<div class="folder-document"><div class="document-info"><span class="document-type" aria-hidden="true">${escapeHtml(documentKind(document))}</span><span class="document-copy"><strong class="document-name">${escapeHtml(document.name)}</strong><span class="document-meta">${formatSize(document.size)} · Added ${new Date(document.addedAt).toLocaleDateString()}</span></span></div><div class="document-actions"><button class="button secondary" type="button" data-action="open-document" data-document-id="${escapeHtml(document.id)}">Open</button><button class="button secondary" type="button" data-action="download-document" data-document-id="${escapeHtml(document.id)}">Download</button><button class="text-button" type="button" data-action="rename-document" data-document-id="${escapeHtml(document.id)}">Rename</button><button class="text-button" type="button" data-action="delete-document" data-document-id="${escapeHtml(document.id)}">Delete</button></div></div>`;
}

async function render() {
  const [folders, documents] = await Promise.all([getAll('folders'), getAll('documents')]);
  folders.sort((first, second) => first.createdAt - second.createdAt || first.name.localeCompare(second.name));
  if (!folders.length) {
    root.innerHTML = '<div class="folders-empty"><strong>No folders yet</strong>Create a folder to keep your documents together.</div>';
    return;
  }
  root.innerHTML = folders.map((folder) => {
    const folderDocuments = documents.filter((document) => document.folderId === folder.id).sort((first, second) => first.name.localeCompare(second.name));
    return `<details class="folder-item"><summary><span class="folder-title">${escapeHtml(folder.name)}</span><span class="folder-count">${folderDocuments.length} ${folderDocuments.length === 1 ? 'file' : 'files'}</span></summary><div class="folder-actions"><label class="folder-upload">＋ Upload files<input type="file" multiple accept="${FILE_ACCEPT}" data-upload-to="${escapeHtml(folder.id)}" aria-label="Upload files to ${escapeHtml(folder.name)}"></label><button class="button secondary" type="button" data-action="rename-folder" data-folder-id="${escapeHtml(folder.id)}">Rename folder</button><button class="text-button" type="button" data-action="delete-folder" data-folder-id="${escapeHtml(folder.id)}">Delete folder</button></div><div class="folder-documents">${folderDocuments.length ? folderDocuments.map(renderDocument).join('') : '<p class="folder-empty">No documents in this folder yet.</p>'}</div></details>`;
  }).join('');
}

async function addFolder(name) {
  const transaction = database.transaction('folders', 'readwrite');
  const completion = transactionResult(transaction);
  transaction.objectStore('folders').add({ id: createId('folder'), name, createdAt: Date.now() });
  await completion;
}

async function addDocuments(folderId, files) {
  const transaction = database.transaction('documents', 'readwrite');
  const completion = transactionResult(transaction);
  const store = transaction.objectStore('documents');
  const addedAt = Date.now();
  files.forEach((file) => store.add({ id: createId('document'), folderId, name: file.name, type: file.type, size: file.size, addedAt, blob: file }));
  await completion;
}

async function updateRecord(storeName, id, update) {
  const transaction = database.transaction(storeName, 'readwrite');
  const completion = transactionResult(transaction);
  const store = transaction.objectStore(storeName);
  const record = await requestResult(store.get(id));
  if (!record) { transaction.abort(); await completion.catch(() => {}); return false; }
  update(record);
  store.put(record);
  await completion;
  return true;
}

async function removeDocument(id) {
  const transaction = database.transaction('documents', 'readwrite');
  const completion = transactionResult(transaction);
  transaction.objectStore('documents').delete(id);
  await completion;
}

async function removeFolder(id) {
  const transaction = database.transaction(['folders', 'documents'], 'readwrite');
  const completion = transactionResult(transaction);
  const folders = transaction.objectStore('folders');
  const documents = transaction.objectStore('documents');
  const folderDocuments = await requestResult(documents.index('folderId').getAll(id));
  folderDocuments.forEach((document) => documents.delete(document.id));
  folders.delete(id);
  await completion;
}

async function openDocument(id, download) {
  const transaction = database.transaction('documents', 'readonly');
  const document = await requestResult(transaction.objectStore('documents').get(id));
  await transactionResult(transaction);
  if (!document) throw new Error('That document is no longer available.');
  const url = URL.createObjectURL(document.blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.target = download ? '_self' : '_blank';
  link.rel = 'noopener';
  if (download) link.download = document.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function reportError(error) {
  status.textContent = error?.name === 'QuotaExceededError'
    ? 'There is not enough local storage space for these files. Remove files or free device storage and try again.'
    : error?.message || 'Could not update local folders.';
}

document.getElementById('folderForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('folderName');
  const name = input.value.trim();
  if (!name || !database) return;
  try {
    await addFolder(name);
    input.value = '';
    status.textContent = `Folder “${name}” created.`;
    await render();
  } catch (error) { reportError(error); }
});

root.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-upload-to]');
  if (!input || !input.files?.length) return;
  const files = [...input.files];
  const folderId = input.dataset.uploadTo;
  input.value = '';
  try {
    await addDocuments(folderId, files);
    status.textContent = `${files.length} ${files.length === 1 ? 'file' : 'files'} added.`;
    await render();
  } catch (error) { reportError(error); }
});

root.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, folderId, documentId } = button.dataset;
  try {
    if (action === 'rename-folder') {
      const folders = await getAll('folders');
      const folder = folders.find((item) => item.id === folderId);
      const name = window.prompt('Folder name', folder?.name || '')?.trim();
      if (name) { await updateRecord('folders', folderId, (record) => { record.name = name; }); status.textContent = 'Folder renamed.'; }
    } else if (action === 'delete-folder') {
      if (!window.confirm('Delete this folder and all documents inside it?')) return;
      await removeFolder(folderId);
      status.textContent = 'Folder and its documents deleted.';
    } else if (action === 'rename-document') {
      const documents = await getAll('documents');
      const document = documents.find((item) => item.id === documentId);
      const name = window.prompt('Document name', document?.name || '')?.trim();
      if (name) { await updateRecord('documents', documentId, (record) => { record.name = name; }); status.textContent = 'Document renamed.'; }
    } else if (action === 'delete-document') {
      if (!window.confirm('Delete this document from this device?')) return;
      await removeDocument(documentId);
      status.textContent = 'Document deleted.';
    } else if (action === 'open-document') {
      await openDocument(documentId, false);
      return;
    } else if (action === 'download-document') {
      await openDocument(documentId, true);
      return;
    }
    await render();
  } catch (error) { reportError(error); }
});

try {
  if (!('indexedDB' in window)) throw new Error('This browser does not support local document storage.');
  database = await openDatabase();
  await render();
} catch (error) {
  status.textContent = error?.message || 'Local document storage could not be opened.';
  root.innerHTML = '<div class="folders-empty"><strong>Folders are unavailable</strong>Local document storage could not be opened in this browser.</div>';
}