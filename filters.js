document.addEventListener('DOMContentLoaded', () => {
  const filterType = document.getElementById('filterType');
  const valueLabel = document.getElementById('valueLabel');
  const filterValue = document.getElementById('filterValue');
  const addFilterBtn = document.getElementById('addFilterBtn');
  const filtersContainer = document.getElementById('filtersContainer');
  const datalist = document.getElementById('filterContactsDatalist');

  chrome.storage.local.get(['updateAvailable'], (data) => {
    if (data.updateAvailable) {
      const alertBox = document.getElementById('updateAlertBox');
      if (alertBox) {
        alertBox.style.display = 'block';
        const currentVersion = chrome.runtime.getManifest().version;
        fetch('https://api.github.com/repos/Tzadikvtovlo/PushBox/releases/latest')
          .then(res => res.json())
          .then(releaseData => {
             const latestVersion = releaseData.tag_name ? releaseData.tag_name.replace(/^v/i, '').trim() : currentVersion;
             alertBox.textContent = `יש עדכון! מותקן: v${currentVersion} | זמין: v${latestVersion}`;
          }).catch(() => { alertBox.textContent = "עדכון גרסה זמין! לחץ כאן להורדה"; });
        alertBox.addEventListener('click', () => { window.open('https://github.com/Tzadikvtovlo/PushBox/releases/latest/download/PushBox.zip', '_blank'); });
      }
    }
  });

  document.getElementById('navHome')?.addEventListener('click', () => { window.location.href = 'messages.html'; });
  document.getElementById('navSendSms')?.addEventListener('click', () => { window.location.href = 'send_sms.html'; });
  document.getElementById('navFax')?.addEventListener('click', () => { window.location.href = 'fax.html'; });
  document.getElementById('navOptions')?.addEventListener('click', () => { window.location.href = 'options.html'; });
  document.getElementById('navContacts')?.addEventListener('click', () => { window.location.href = 'contacts.html'; });
  document.getElementById('navFilters')?.addEventListener('click', () => { window.location.href = 'filters.html'; });
  
  // לוגיקת הכפתור השביעי
  const toggleViewBtn = document.getElementById('navToggleView');
  if (toggleViewBtn) {
    if (window.innerWidth < 800) {
      toggleViewBtn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
      toggleViewBtn.title = "פתח במסך מלא";
      toggleViewBtn.addEventListener('click', () => { 
        const currentPage = window.location.pathname.split('/').pop() || 'filters.html';
        chrome.tabs.create({ url: currentPage + window.location.search }); 
      });
    } else {
      toggleViewBtn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>`;
      toggleViewBtn.title = "פתח בחלונית צד";
      toggleViewBtn.addEventListener('click', () => {
        const currentPage = window.location.pathname.split('/').pop() || 'filters.html';
        chrome.storage.local.set({ targetSidePanelPage: currentPage + window.location.search }, () => {
          chrome.windows.getCurrent({ populate: true }, (window) => {
            chrome.runtime.sendMessage({ action: 'open-side-panel', windowId: window.id });
          });
        });
      });
    }
  }

  document.querySelectorAll('.email-copy').forEach(el => {
    el.addEventListener('click', (e) => {
      navigator.clipboard.writeText(e.target.innerText);
      const originalText = e.target.innerText;
      e.target.innerText = "הועתק!";
      setTimeout(() => e.target.innerText = originalText, 1500);
    });
  });

  filterType.addEventListener('change', () => {
    if(filterType.value === 'sender') {
      valueLabel.textContent = 'השולח:';
    } else {
      valueLabel.textContent = 'את המילה:';
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const senderParam = urlParams.get('sender');
  if (senderParam) {
    filterType.value = 'sender';
    filterValue.value = senderParam;
    filterType.dispatchEvent(new Event('change'));
  }

  chrome.storage.local.get(['contacts'], (data) => {
    const contacts = data.contacts || [];
    contacts.forEach(c => {
      const option = document.createElement('option');
      option.value = `${c.name} - ${c.phone}`;
      if (datalist) datalist.appendChild(option);
    });
  });

  loadFilters();

  addFilterBtn.addEventListener('click', () => {
    const type = filterType.value;
    let value = filterValue.value.trim();

    if (type === 'sender' && value.includes(' - ')) {
      value = value.split(' - ')[1].trim();
    }

    if (!value) return alert('נא להזין ערך לסינון');

    chrome.storage.local.get(['smsFilters'], (data) => {
      const filters = data.smsFilters || [];
      filters.push({ type, value });
      chrome.storage.local.set({ smsFilters: filters }, () => {
        filterValue.value = '';
        loadFilters();
      });
    });
  });

  function loadFilters() {
    chrome.storage.local.get(['smsFilters'], (data) => {
      const filters = data.smsFilters || [];
      if (filtersContainer) filtersContainer.innerHTML = '';

      if (filters.length === 0) {
        if (filtersContainer) filtersContainer.innerHTML = '<div style="text-align:center; color:#64748b; font-size:13px; margin-top:20px;">אין מסננים פעילים.</div>';
        return;
      }

      filters.forEach((filter, index) => {
        const item = document.createElement('div');
        item.className = 'filter-item';
        
        let typeText = '';
        if (filter.type === 'sender') typeText = 'מאת:';
        if (filter.type === 'contains') typeText = 'מכיל:';
        if (filter.type === 'not_contains') typeText = 'לא מכיל:';

        item.innerHTML = `
          <span class="filter-text">${typeText} "${filter.value}"</span>
          <button class="btn-delete" data-index="${index}">הסר</button>
        `;
        if (filtersContainer) filtersContainer.appendChild(item);
      });

      document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = e.target.getAttribute('data-index');
          removeFilter(index);
        });
      });
    });
  }

  function removeFilter(index) {
    chrome.storage.local.get(['smsFilters'], (data) => {
      let filters = data.smsFilters || [];
      filters.splice(index, 1);
      chrome.storage.local.set({ smsFilters: filters }, loadFilters);
    });
  }
});
