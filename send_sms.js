document.addEventListener('DOMContentLoaded', () => {
  const smsToInput = document.getElementById('smsTo');
  const smsBodyInput = document.getElementById('smsBody');
  const sendBtn = document.getElementById('sendBtn');
  const datalist = document.getElementById('contactsDataList');
  const feedbackMsg = document.getElementById('feedbackMsg');

  // באנר עדכונים
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
        const currentPage = window.location.pathname.split('/').pop() || 'send_sms.html';
        chrome.tabs.create({ url: currentPage + window.location.search }); 
      });
    } else {
      toggleViewBtn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>`;
      toggleViewBtn.title = "פתח בחלונית צד";
      toggleViewBtn.addEventListener('click', () => {
        const currentPage = window.location.pathname.split('/').pop() || 'send_sms.html';
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

  // קבלת נמען משורת הכתובת (אם הגיעו דרך כפתור "השב")
  const urlParams = new URLSearchParams(window.location.search);
  const toParam = urlParams.get('to');
  if (toParam) {
    smsToInput.value = toParam;
  }

  // טעינת אנשי קשר וטיוטות
  chrome.storage.local.get(['contacts', 'draftSmsTo', 'draftSmsBody'], (data) => {
    const contacts = data.contacts || [];
    contacts.forEach(c => {
      const option = document.createElement('option');
      option.value = `${c.name} - ${c.phone}`;
      datalist.appendChild(option);
    });

    if (!toParam && data.draftSmsTo) smsToInput.value = data.draftSmsTo;
    if (data.draftSmsBody) smsBodyInput.value = data.draftSmsBody;
  });

  // עדכון טיוטה בזמן אמת
  smsToInput.addEventListener('input', () => chrome.storage.local.set({ draftSmsTo: smsToInput.value }));
  smsBodyInput.addEventListener('input', () => chrome.storage.local.set({ draftSmsBody: smsBodyInput.value }));

  function showFeedback(msg, isSuccess) {
    feedbackMsg.textContent = msg;
    feedbackMsg.className = isSuccess ? 'success' : 'error';
    feedbackMsg.style.display = 'block';
    setTimeout(() => { feedbackMsg.style.display = 'none'; }, 3000);
  }

  sendBtn.addEventListener('click', async () => {
    let to = smsToInput.value.trim();
    const body = smsBodyInput.value.trim();
    
    if (!to || !body) return showFeedback("אנא הזן מספר נמען ותוכן הודעה.", false);
    
    // חילוץ המספר מתוך תצוגת "שם - מספר"
    if (to.includes(' - ')) {
      to = to.split(' - ')[1].trim();
    }
    
    sendBtn.innerHTML = 'שולח...';
    sendBtn.style.pointerEvents = 'none';

    chrome.storage.local.get(['token'], async (data) => {
      if (!data.token) {
        showFeedback("לא נמצא טוקן מחובר. היכנס להגדרות התוסף.", false);
        sendBtn.innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> שלח הודעה';
        sendBtn.style.pointerEvents = 'auto';
        return;
      }

      try {
        const url = `https://www.call2all.co.il/ym/api/SendSms?token=${encodeURIComponent(data.token)}&phones=${encodeURIComponent(to)}&message=${encodeURIComponent(body)}`;
        const res = await fetch(url);
        const json = await res.json();
        
        if (json && json.responseStatus === 'OK') {
          showFeedback("ההודעה נשלחה בהצלחה!", true);
          smsToInput.value = '';
          smsBodyInput.value = '';
          chrome.storage.local.set({ draftSmsTo: '', draftSmsBody: '' });
        } else {
          showFeedback("שגיאה בשליחת ההודעה מול השרת.", false);
        }
      } catch (err) {
        showFeedback("שגיאת רשת בעת שליחת הודעה.", false);
      } finally {
        sendBtn.innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> שלח הודעה';
        sendBtn.style.pointerEvents = 'auto';
      }
    });
  });
});
