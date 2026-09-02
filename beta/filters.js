document.addEventListener('DOMContentLoaded', () => {
  const filterType = document.getElementById('filterType');
  const valueLabel = document.getElementById('valueLabel');
  const filterValue = document.getElementById('filterValue');
  const addFilterBtn = document.getElementById('addFilterBtn');
  const filtersContainer = document.getElementById('filtersContainer');

  // שינוי תווית קלט טקסט בהתאם לבחירה
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

  loadFilters();

  addFilterBtn.addEventListener('click', () => {
    const type = filterType.value;
    const value = filterValue.value.trim();

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
      filtersContainer.innerHTML = '';

      if (filters.length === 0) {
        filtersContainer.innerHTML = '<div style="text-align:center; color:#64748b; font-size:13px;">אין מסננים פעילים.</div>';
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
        filtersContainer.appendChild(item);
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