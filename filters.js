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
        alertBox.addEventListener('click', () => { window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank'); });
      }
    }
  });

  document.getElementById('navOptions').addEventListener('click', () => { window.location.href = 'options.html'; });
  document.getElementById('navContacts').addEventListener('click', () => { window.location.href = 'contacts.html'; });
  document.getElementById('navSendSms').addEventListener('click', () => { window.location.href = 'send_sms.html'; });

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
        if (filtersContainer) filtersContainer.innerHTML = '<div style="text-align:center; color:#64748b; font-size:13px;">אין מסננים פעילים.</div>';
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
