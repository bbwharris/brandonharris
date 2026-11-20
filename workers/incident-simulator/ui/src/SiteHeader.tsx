import React from 'react';

const SITE_URL = 'https://brandon-harris.com';

const MENU = [
  { name: 'Home', path: '/' },
  { name: 'About', path: '/about/' },
  { name: 'Writing', path: '/posts/' },
  { name: 'Projects', path: '/projects/' },
  { name: 'Archive', path: '/archive/' },
];

const toggleTheme = () => {
  const root = document.documentElement;
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;

  try {
    localStorage.setItem('pref-theme', next);
  } catch {
    // Storage unavailable; the choice applies to this page view only.
  }
};

const SiteHeader: React.FC = () => (
  <header className="header">
    <nav className="nav">
      <div className="logo">
        <a href={`${SITE_URL}/`} accessKey="h" title="Home (Alt + H)">
          <img src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="" height="35" />Home
        </a>
        <div className="logo-switches">
          <button id="theme-toggle" type="button" accessKey="t" title="(Alt + T)" aria-label="Toggle theme" onClick={toggleTheme}>
            <svg id="moon" xmlns="http://www.w3.org/2000/svg" width="24" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <svg id="sun" xmlns="http://www.w3.org/2000/svg" width="24" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
        </div>
      </div>
      <ul id="menu">
        {MENU.map((item) => (
          <li key={item.name}>
            <a href={`${SITE_URL}${item.path}`} title={item.name}>
              <span className={item.name === 'Projects' ? 'active' : undefined}>{item.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  </header>
);

export default SiteHeader;
