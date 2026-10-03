try {
  var theme = localStorage.getItem('natively_resolved_theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  }
} catch (error) {
  // Theme initialization must not prevent the renderer from starting.
}
