document.addEventListener('DOMContentLoaded', () => {
  const contactName = document.getElementById('contactName');
  const contactPhone = document.getElementById('contactPhone');
  const addContactBtn = document.getElementById('addContactBtn');
  const btnText = document.getElementById('btnText');
  const btnIcon = document.getElementById('btnIcon');
  const contactsContainer = document.getElementById('contactsContainer');
  let editOriginalPhone = null;

  chrome.storage.local.get(['updateAvailable'], (data) => {
    if (data.updateAvailable) {
      const alertBox = document.getElementById('updateAlertBox');
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
  });

  document.getElementById('navOptions').addEventListener('click', () => { window.location.href = 'options.html'; });
  document.getElementById('navFilters').addEventListener('click', () => { window.location.href = 'filters.html'; });
  document.getElementById('navSendSms').addEventListener('click', () => { window.location.href = 'send_sms.html'; });

  loadContacts();

  addContactBtn.addEventListener('click', () => {
    const name = contactName.value.trim();
    const phone = contactPhone.value.trim();

    if (!name || !phone) return alert('נא להזין שם ומספר טלפון');

    chrome.storage.local.get(['contacts'], (data) => {
      let contacts = data.contacts || [];
      
      if (editOriginalPhone) {
        contacts = contacts.filter(c => c.phone !== editOriginalPhone);
      }
      
      contacts = contacts.filter(c => c.phone !== phone);
      contacts.push({ name, phone });
      
      chrome.storage.local.set({ contacts }, () => {
        contactName.value = '';
        contactPhone.value = '';
        
        editOriginalPhone = null;
        btnText.textContent = "שמור איש קשר חדש";
        btnIcon.innerHTML = `<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>`;
        contactName.classList.remove('editing-mode');
        contactPhone.classList.remove('editing-mode');
        
        loadContacts();
      });
    });
  });

  function loadContacts() {
    chrome.storage.local.get(['contacts'], (data) => {
      const contacts = data.contacts || [];
      contactsContainer.innerHTML = '';

      if (contacts.length === 0) {
        contactsContainer.innerHTML = '<div style="text-align:center; color:#64748b; font-size:13px;">אין אנשי קשר עדיין.</div>';
        return;
      }

      contacts.forEach((contact, index) => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        
        item.innerHTML = `
          <div class="contact-details">
            <span class="contact-name">${contact.name}</span>
            <span class="contact-phone">${contact.phone}</span>
          </div>
          <div class="contact-actions">
            <button class="btn-action btn-send-sms" data-phone="${contact.phone}" data-name="${contact.name}" title="שלח SMS">
              <svg class="svg-icon" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
            <button class="btn-action btn-filter" data-phone="${contact.phone}" title="סנן איש קשר">
              <svg class="svg-icon" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            </button>
            <button class="btn-action btn-edit" data-index="${index}" title="ערוך">
              <svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button class="btn-action btn-action-delete" data-index="${index}" title="מחק">
              <svg class="svg-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        `;
        contactsContainer.appendChild(item);
      });

      document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = e.currentTarget.getAttribute('data-index');
          const c = contacts[index];
          document.getElementById('contactName').value = c.name;
          document.getElementById('contactPhone').value = c.phone;
          
          editOriginalPhone = c.phone;
          btnText.textContent = "עדכן איש קשר מקומי";
          btnIcon.innerHTML = `<polyline points="20 6 9 17 4 12"></polyline>`;
          
          contactName.classList.add('editing-mode');
          contactPhone.classList.add('editing-mode');
          window.scrollTo(0, 0);
        });
      });

      document.querySelectorAll('.btn-action-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = e.currentTarget.getAttribute('data-index');
          contacts.splice(index, 1);
          chrome.storage.local.set({ contacts }, loadContacts);
        });
      });
      
      document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const phone = e.currentTarget.getAttribute('data-phone');
          window.location.href = `filters.html?sender=${encodeURIComponent(phone)}`;
        });
      });

      document.querySelectorAll('.btn-send-sms').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const phone = e.currentTarget.getAttribute('data-phone');
          const name = e.currentTarget.getAttribute('data-name');
          const formatted = `${name} - ${phone}`;
          window.location.href = `send_sms.html?to=${encodeURIComponent(formatted)}`;
        });
      });
    });
  }
});