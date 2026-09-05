const STORAGE_KEY = 'atlas-theme';
const OPTIONS = ['auto', 'light', 'dark'];
const LABELS = { auto: 'Auto', light: 'Clair', dark: 'Sombre' };

function storedPreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return OPTIONS.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function resolvedTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(preference, persist = false) {
  const resolved = resolvedTheme(preference);
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b1210' : '#173b33');

  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.dataset.preference = preference;
    button.setAttribute('aria-label', `Thème : ${LABELS[preference]}. Appuyer pour changer.`);
    button.setAttribute('title', `Thème : ${LABELS[preference]}`);
    button.innerHTML = `<span aria-hidden="true">${resolved === 'dark' ? '◒' : '◐'}</span><span>${LABELS[preference]}</span>`;
  });

  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, preference); } catch {}
  }
}

let preference = storedPreference();
applyTheme(preference);

document.querySelectorAll('[data-theme-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const current = OPTIONS.includes(button.dataset.preference) ? button.dataset.preference : preference;
    preference = OPTIONS[(OPTIONS.indexOf(current) + 1) % OPTIONS.length];
    applyTheme(preference, true);
  });
});

const media = window.matchMedia?.('(prefers-color-scheme: dark)');
media?.addEventListener?.('change', () => {
  if (storedPreference() === 'auto') applyTheme('auto');
});
