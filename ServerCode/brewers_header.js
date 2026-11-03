(function () {
      // The shared footer is injected asynchronously; update its year once it arrives.
      function updateFooterYear() {
        var year = document.querySelector('[data-footer-year]');
        if (!year) return false;
        year.textContent = String(new Date().getFullYear());
        return true;
      }
      if (!updateFooterYear()) {
        var footerObserver = new MutationObserver(function(){
          if (updateFooterYear()) footerObserver.disconnect();
        });
        footerObserver.observe(document.documentElement, {childList:true, subtree:true});
      }

      var bindMobileMenu = document.currentScript && document.currentScript.dataset.bindMobileMenu === 'true';
      function initMenuAccessibility() {
        var menu = document.getElementById('brewers-menu');
        if (!menu || menu.dataset.accessibilityBound === '1') return;
        menu.dataset.accessibilityBound = '1';
        var icons = ['menu-icon', 'menu-icon-fixed'].map(function(id){ return document.getElementById(id); }).filter(Boolean);
        var overlay = document.getElementById('menu-overlay');
        var fixed = document.getElementById('menu-icon-fixed');
        function syncExpanded(){ icons.forEach(function(icon){ icon.setAttribute('aria-expanded', String(menu.classList.contains('open'))); }); }
        function closeMenu(){
          menu.classList.remove('open');
          if (overlay) overlay.classList.remove('active');
          if (fixed) fixed.style.display = 'none';
        }
        icons.forEach(function(icon){
          icon.addEventListener('keydown', function(e){
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); icon.click(); }
          });
          // Most pages already bind their mobile menu; only missing callers opt in.
          if (bindMobileMenu) icon.addEventListener('click', function(){
            var opening = !menu.classList.contains('open');
            menu.classList.toggle('open');
            if (overlay) overlay.classList.toggle('active', opening);
            icons.forEach(function(i){ i.classList.add('bounce'); });
            setTimeout(function(){ icons.forEach(function(i){ i.classList.remove('bounce'); }); }, 500);
            if (fixed) fixed.style.display = opening ? 'block' : 'none';
          });
        });
        if (bindMobileMenu && overlay) overlay.addEventListener('click', closeMenu);
        document.addEventListener('keydown', function(e){
          if (e.key !== 'Escape') return;
          document.querySelectorAll('.brewers-dropdown.open').forEach(function(dropdown){
            dropdown.classList.remove('open');
            var toggle = dropdown.querySelector('.brewers-dropdown-toggle');
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
          });
          if (menu.classList.contains('open')) { closeMenu(); if (icons[0]) icons[0].focus(); }
        });
        new MutationObserver(syncExpanded).observe(menu, {attributes:true, attributeFilter:['class']});
        syncExpanded();
      }
      function initBrewersDropdowns() {
        var dropdowns = document.querySelectorAll('.brewers-dropdown');
        if (!dropdowns.length) return;
        dropdowns.forEach(function (dropdown) {
          var toggle = dropdown.querySelector('.brewers-dropdown-toggle');
          if (!toggle || toggle.dataset.bound === '1') return;
          toggle.dataset.bound = '1';
          toggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var isOpen = dropdown.classList.contains('open');
            dropdowns.forEach(function (d) {
              d.classList.remove('open');
              var t = d.querySelector('.brewers-dropdown-toggle');
              if (t) t.setAttribute('aria-expanded', 'false');
            });
            if (!isOpen) {
              dropdown.classList.add('open');
              toggle.setAttribute('aria-expanded', 'true');
            }
          });
        }); 
        document.addEventListener('click', function (e) {
          if (!e.target.closest('.brewers-dropdown')) {
            dropdowns.forEach(function (d) {
              d.classList.remove('open');
              var t = d.querySelector('.brewers-dropdown-toggle');
              if (t) t.setAttribute('aria-expanded', 'false');
            });
          }
        });
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function(){ initBrewersDropdowns(); initMenuAccessibility(); });
      } else {
        initBrewersDropdowns();
        initMenuAccessibility();
      }
    })();
