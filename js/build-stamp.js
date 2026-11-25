/* Build stamp.

   Shows which commit the page was published from, read from ./version.json,
   which tools/build-dist.sh writes at publish time. If the file is missing or
   the fetch fails the line simply stays hidden — the game never depends on it. */
(function () {
  var el = document.getElementById('buildStamp');
  if (!el) return;

  fetch('./version.json', { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('no version.json');
      return res.json();
    })
    .then(function (v) {
      if (!v || !v.commit) return;
      var short = v.short || String(v.commit).slice(0, 7);
      el.textContent = 'build ' + short + (v.dirty ? ' · local' : '');
      el.title =
        'Published from ' + (v.branch || 'master') + ' at ' + v.commit +
        (v.builtAt ? ' on ' + String(v.builtAt).slice(0, 10) : '');
      el.dataset.commit = v.commit;
      el.hidden = false;
      window.__rfBuild = v;
    })
    .catch(function () {
      el.hidden = true;
    });
})();
