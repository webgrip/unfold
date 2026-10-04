(function () {
  try {
    var storage = window.localStorage;
    var renamed = [];
    for (var position = 0; position < storage.length; position++) {
      var key = storage.key(position);
      if (key && key.indexOf('vloer.') === 0) renamed.push(key);
    }
    for (var each = 0; each < renamed.length; each++) {
      var target = 'unfold.' + renamed[each].slice('vloer.'.length);
      if (storage.getItem(target) === null) storage.setItem(target, storage.getItem(renamed[each]));
      storage.removeItem(renamed[each]);
    }
    var saved = JSON.parse(window.localStorage.getItem('unfold.prefs') || '{}') || {};
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
