(function () {
  try {
    var saved = JSON.parse(window.localStorage.getItem('vloer.prefs') || '{}') || {};
    var root = document.documentElement;
    var colors = { light: '#FFFFFF', dark: '#15191C' };
    if (saved.theme === 'light' || saved.theme === 'dark') {
      root.setAttribute('data-theme', saved.theme);
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      for (var index = 0; index < metas.length; index++) metas[index].setAttribute('content', colors[saved.theme]);
    }
    if (saved.density === 'compact') root.setAttribute('data-density', 'compact');
  } catch (error) {
    return;
  }
})();
