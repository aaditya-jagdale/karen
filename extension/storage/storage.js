const find = id => document.getElementById(id);
let directory;
let selectedId;

async function message(action, data = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...data });
  if (!response?.success) throw new Error(response?.error || 'Storage unavailable.');
  return response;
}
const componentsOf = event => event.components || event.attachments?.filter(item => item.kind === 'component').map(item => ({ ...item.element, image: item.image })) || [];
const imageUrl = image => image?.data_url?.startsWith('data:image/') ? image.data_url : null;
const formatDate = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Unknown time';
function picture(source, alt, className) {
  const image = document.createElement('img');
  image.className = className;
  image.alt = alt;
  image.src = source;
  return image;
}
async function deleteEntry(id) {
  if (!confirm('Delete this captured entry?')) return;
  await message('deleteActivity', { id });
  if (selectedId === id) showList();
  await refresh();
}
function showList() {
  selectedId = null;
  find('detail-view').hidden = true;
  find('list-view').hidden = false;
}
function showDetail(event) {
  selectedId = event.id;
  find('list-view').hidden = true;
  find('detail-view').hidden = false;
  const content = document.createElement('article');
  content.className = 'detail-card';
  const heading = document.createElement('div');
  heading.className = 'detail-heading';
  const title = document.createElement('h2');
  title.textContent = event.page_title || 'Captured UI';
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = `${formatDate(event.created_at)} · ${event.url || 'Unknown page'}`;
  const remove = document.createElement('button');
  remove.className = 'danger';
  remove.textContent = 'Delete entry';
  remove.onclick = () => deleteEntry(event.id).catch(showError);
  heading.append(title, meta, remove);
  const commentTitle = document.createElement('h3');
  commentTitle.textContent = 'Comment';
  const comment = document.createElement('p');
  comment.className = 'full-comment';
  comment.textContent = event.comment || 'No comment';
  content.append(heading, commentTitle, comment);
  const snapshot = imageUrl(event.snapshot);
  if (snapshot) {
    const snapshotTitle = document.createElement('h3');
    snapshotTitle.textContent = 'Page snapshot';
    content.append(snapshotTitle, picture(snapshot, 'Captured page', 'detail-snapshot'));
  }
  const components = componentsOf(event).filter(component => imageUrl(component.image));
  if (components.length) {
    const componentTitle = document.createElement('h3');
    componentTitle.textContent = `Components (${components.length})`;
    const gallery = document.createElement('div');
    gallery.className = 'component-gallery';
    for (const component of components) {
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.textContent = component.selector || component.classes?.join(' ') || component.tag || 'Component';
      figure.append(picture(imageUrl(component.image), caption.textContent, 'component-image'), caption);
      gallery.append(figure);
    }
    content.append(componentTitle, gallery);
  }
  find('detail').replaceChildren(content);
  scrollTo({ top: 0, behavior: 'smooth' });
}
function tile(event) {
  const article = document.createElement('article');
  article.className = 'activity-tile';
  const open = document.createElement('button');
  open.className = 'tile-open';
  open.setAttribute('aria-label', `Open capture from ${formatDate(event.created_at)}`);
  open.onclick = () => showDetail(event);
  const preview = imageUrl(event.snapshot) || componentsOf(event).map(component => imageUrl(component.image)).find(Boolean);
  const visual = document.createElement('div');
  visual.className = 'tile-visual';
  visual.append(preview ? picture(preview, '', 'tile-image') : Object.assign(document.createElement('span'), { textContent: 'No image' }));
  const copy = document.createElement('div');
  copy.className = 'tile-copy';
  const comment = document.createElement('strong');
  comment.textContent = event.comment || 'No comment';
  const count = componentsOf(event).length;
  const meta = document.createElement('span');
  meta.textContent = `${formatDate(event.created_at)} · ${count} component${count === 1 ? '' : 's'}`;
  const url = document.createElement('small');
  url.textContent = event.url || 'Unknown page';
  copy.append(comment, meta, url);
  open.append(visual, copy);
  const remove = document.createElement('button');
  remove.className = 'tile-delete';
  remove.textContent = 'Delete';
  remove.onclick = () => deleteEntry(event.id).catch(showError);
  article.append(open, remove);
  return article;
}
async function refresh() {
  const { activity, activityStatus, inspectorError } = await message('getActivity');
  find('count').textContent = `${activity.length} captured ${activity.length === 1 ? 'entry' : 'entries'}`;
  find('status').textContent = activityStatus?.warning || (activityStatus?.folder ? `Saving to ${activityStatus.folder}/karen-activity.json` : 'Activity is stored in this browser. Choose a folder for automatic JSON saves.');
  find('error').textContent = inspectorError || '';
  find('activity').replaceChildren(...activity.slice().reverse().map(tile));
  if (!activity.length) find('activity').textContent = 'Send a comment from the inspector to create your first visual capture.';
  if (selectedId) {
    const selected = activity.find(event => event.id === selectedId);
    selected ? showDetail(selected) : showList();
  }
}
function showError(error) { find('error').textContent = error.message; }
find('back').onclick = showList;
find('choose').onclick = async () => {
  try {
    const selected = await window.showDirectoryPicker({ mode: 'readwrite', id: 'karen-project' });
    await KarenStorage.directory(selected);
    directory = selected;
    find('reconnect').hidden = false;
    await message('syncActivity');
    await refresh();
  } catch (error) { if (error.name !== 'AbortError') showError(error); }
};
find('reconnect').onclick = async () => {
  try {
    if (await directory.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Folder access was not granted. Activity remains in this browser.');
    await message('syncActivity');
    await refresh();
  } catch (error) { showError(error); }
};
find('export').onclick = async () => {
  try {
    const { activity } = await message('getActivity');
    const url = URL.createObjectURL(new Blob([JSON.stringify(activity, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'karen-activity.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { showError(error); }
};
find('copy').onclick = async () => {
  try {
    const { activity } = await message('getActivity');
    await navigator.clipboard.writeText(JSON.stringify(activity, null, 2));
    find('status').textContent = 'JSON copied to clipboard.';
  } catch (error) { showError(error); }
};
find('clear').onclick = async () => {
  if (!confirm('Delete all captured activity? This cannot be undone.')) return;
  try {
    find('clear').disabled = true;
    await message('clearActivity');
    showList();
    await refresh();
  } catch (error) { showError(error); }
  finally { find('clear').disabled = false; }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.activity || changes.activityStatus)) refresh().catch(showError);
});
(async () => {
  if (!window.showDirectoryPicker) {
    find('choose').hidden = true;
    document.querySelector('.page-header > div > p:last-child').textContent = 'This browser stores captures locally. Export JSON to save them into your project folder.';
  } else {
    directory = await KarenStorage.directory();
    find('reconnect').hidden = !directory;
  }
  await refresh();
})().catch(showError);
