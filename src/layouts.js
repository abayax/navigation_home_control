// Saved layouts live in layouts/<id>/layout.json and are listed in layouts/index.json.
// The chosen layout comes from ?layout=<id>, else the last one used, else index.json's "default".

const STORAGE_KEY = 'home-explorer:layout';

const getJson = async (url) => {
  const res = await fetch(url, { cache: 'no-store' }); // pick up freshly generated layouts
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

export async function loadLayout() {
  const { layouts, default: defaultId } = await getJson('layouts/index.json');
  const wanted = new URLSearchParams(location.search).get('layout') ?? localStorage.getItem(STORAGE_KEY);
  const entry = layouts.find((l) => l.id === wanted) ?? layouts.find((l) => l.id === defaultId) ?? layouts[0];
  localStorage.setItem(STORAGE_KEY, entry.id);
  const data = await getJson(`layouts/${entry.id}/layout.json`);
  return { layouts, current: entry, data };
}

export function setupLayoutPicker(layouts, current) {
  const btn = document.getElementById('layout-btn');
  const panel = document.getElementById('layout-panel');
  const list = panel.querySelector('ul');

  for (const l of layouts) {
    const li = document.createElement('li');
    const item = document.createElement('button');
    item.textContent = l.name;
    if (l.id === current.id) item.classList.add('current');
    item.addEventListener('click', () => {
      localStorage.setItem(STORAGE_KEY, l.id);
      location.search = `?layout=${encodeURIComponent(l.id)}`;
    });
    li.appendChild(item);
    list.appendChild(li);
  }

  btn.addEventListener('click', () => (panel.hidden = !panel.hidden));
  panel.querySelector('.close').addEventListener('click', () => (panel.hidden = true));
  document.title = `Home Explorer - ${current.name}`;
}
