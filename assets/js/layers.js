/* Pop-up layers (the account window and the reset confirmation).
   Rule for every pop-up layer in Recall: it closes ONLY with its X button, the Escape key, or the browser/phone Back button.
   Tapping outside it never closes it.
   Back support: when a layer opens it adds one history entry; Back removes that entry and closes the layer.
   Closing with X/Escape/Cancel removes the entry again. Opening or closing right after another layer closes is queued until the
   browser has finished going back, so entries never get out of step. This file only watches the layers; it does not change them. */
(function () {
  var stack = [];      // open layers, last = top: { id, el, close }
  var swallow = 0;     // popstate events caused by our own history.back()
  var busy = false, queue = [], timer = null;

  function run(fn) { if (busy) queue.push(fn); else fn(); }
  function release() {
    busy = false; clearTimeout(timer);
    var next = queue.shift(); if (next) run(next);
  }
  function goBack() {
    busy = true; swallow++;
    timer = setTimeout(function () { if (swallow > 0) swallow--; release(); }, 600);   // safety net: some browsers skip the event
    try { history.back(); } catch (e) { swallow = 0; release(); }
  }
  function shown(el) { return !!el && el.style.display !== 'none'; }

  function opened(layer) {
    run(function () {
      if (stack.some(function (l) { return l.id === layer.id; }) || !shown(layer.el)) return;
      stack.push(layer);
      try { history.pushState(Object.assign({}, history.state || {}, { layer: layer.id }), '', location.href); } catch (e) {}
    });
  }
  function closed(layer) {
    run(function () {
      var i = stack.indexOf(layer); if (i < 0) return;
      var onTop = i === stack.length - 1 && history.state && history.state.layer === layer.id;
      stack.splice(i, 1);
      if (onTop) goBack();
    });
  }

  window.RecallLayers = {
    // Watches an overlay element: it counts as open while its inline display is not "none".
    watch: function (id, closeFn) {
      var el = document.getElementById(id); if (!el) return;
      var layer = { id: id, el: el, close: closeFn };
      var was = shown(el);
      new MutationObserver(function () {
        var now = shown(el);
        if (now && !was) opened(layer); else if (!now && was) closed(layer);
        was = now;
      }).observe(el, { attributes: true, attributeFilter: ['style'] });
      if (was) opened(layer);
    },
    top: function () { return stack.length ? stack[stack.length - 1] : null; },
  };

  // Back button: close the top layer instead of leaving the page.
  window.addEventListener('popstate', function (e) {
    if (swallow > 0) { swallow--; e.stopImmediatePropagation(); release(); return; }
    var top = stack[stack.length - 1]; if (!top) return;
    e.stopImmediatePropagation();   // the app's own Back handling must not also run
    stack.pop();
    try { top.close(); } catch (err) {}
    if (shown(top.el)) {   // refused to close (for example while saving): put the layer and its entry back
      stack.push(top);
      try { history.pushState(Object.assign({}, history.state || {}, { layer: top.id }), '', location.href); } catch (err) {}
    }
  });
  // Escape key: close the top layer.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var top = stack[stack.length - 1]; if (!top) return;
    e.preventDefault(); top.close();
  });

  document.addEventListener('DOMContentLoaded', function () {
    var click = function (sel) { return function () { var b = document.querySelector(sel); if (b) b.click(); }; };
    window.RecallLayers.watch('account-modal', click('#account-close'));
    window.RecallLayers.watch('wipe-modal', click('#wipe-close'));
  });
})();
