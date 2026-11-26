(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('pref-theme');
  } catch (error) {
    theme = null;
  }
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();
