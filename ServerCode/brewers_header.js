(function () {
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
        document.addEventListener('DOMContentLoaded', initBrewersDropdowns);
      } else {
        initBrewersDropdowns();
      }
    })();
