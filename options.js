document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['token', 'phoneNumber', 'interval', 'notificationStyle', 'updateNotificationStyle', 'faxFolderPath'], (data) => {
    if (data.token) document.getElementById('token').value = data.token;
    if (data.phoneNumber) document.getElementById('phoneNumber').value = data.phoneNumber;
    if (data.interval !== undefined) document.getElementById('interval').value = data.interval;
    if (data.notificationStyle) {
      document.getElementById('notificationStyle').value = data.notificationStyle;
    } else {
      document.getElementById('notificationStyle').value = 'both';
    }
    if (data.updateNotificationStyle) {
      document.getElementById('updateNotificationStyle').value = data.updateNotificationStyle;
    } else {
      document.getElementById('updateNotificationStyle').value = 'both';
    }
    
    // הגדרת תיקיית הפקסים (אם קיימת בסטורג', אחרת ברירת מחדל)
    document.getElementById('faxFolderPath').value = data.faxFolderPath || 'ivr2:/FaxIn';
  });

  const manifest = chrome.runtime.getManifest();
  const currentVersion = manifest.version;
  document.getElementById('installedVersion').value = `v${currentVersion}`;

  chrome.storage.local.get(['updateAvailable'], (data) => {
    if (data.updateAvailable) {
      const alertBox = document.getElementById('updateAlertBox');
      alertBox.style.display = 'block';
      fetch('https://api.github.com/repos/Tzadikvtovlo/PushBox/releases/latest')
        .then(res => res.json())
        .then(releaseData => {
           const latestVersion = releaseData.tag_name ? releaseData.tag_name.replace(/^v/i, '').trim() : currentVersion;
           alertBox.textContent = `יש עדכון! מותקן: v${currentVersion} | זמין: v${latestVersion}`;
           alertBox.title = "לחץ כאן להורדה";
        }).catch(() => {
           alertBox.textContent = "עדכון גרסה זמין! לחץ כאן להורדה";
        });
      alertBox.addEventListener('click', () => { window.open('https://github.com/Tzadikvtovlo/PushBox/releases/latest/download/PushBox.zip', '_blank'); });
    }
  });

  // פידבק עבור כפתור רגיל המכיל טקסט
  function showBtnFeedback(btnId, message, type = 'success') {
    const btn = document.getElementById(btnId);
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    const originalHtml = btn.dataset.originalHtml;
    btn.innerHTML = `<span style="font-weight: bold;">${message}</span>`;
    
    if (type === 'success') {
      btn.style.backgroundColor = '#e9d5ff'; 
      btn.style.color = '#1e3a8a';
      btn.style.borderColor = '#c084fc';
    } else {
      btn.style.backgroundColor = '#fce7f3'; 
      btn.style.color = '#9f1239'; 
      btn.style.borderColor = '#fbcfe8';
    }
    btn.style.pointerEvents = 'none';

    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.style.backgroundColor = '';
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.style.pointerEvents = 'auto';
    }, 2000);
  }

  // פידבק עבור כפתור שהוא אייקון בלבד (כמו אמת טוקן)
  function showIconBtnFeedback(btnId, type = 'success') {
    const btn = document.getElementById(btnId);
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    const originalHtml = btn.dataset.originalHtml;
    
    if (type === 'success') {
      btn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24" style="stroke: #1e3a8a;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      btn.style.backgroundColor = '#e9d5ff'; 
      btn.style.borderColor = '#c084fc';
    } else if (type === 'loading') {
      btn.innerHTML = `<svg class="svg-icon spinning" viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`;
      btn.style.backgroundColor = '#f3e8ff';
      btn.style.borderColor = '#c084fc';
    } else {
      btn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24" style="stroke: #9f1239;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      btn.style.backgroundColor = '#fce7f3'; 
      btn.style.borderColor = '#fbcfe8';
    }
    btn.style.pointerEvents = 'none';

    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.style.backgroundColor = '';
      btn.style.borderColor = '';
      btn.style.pointerEvents = 'auto';
    }, 2000);
  }

  // פעולת ייצוא (גיבוי)
  document.getElementById('exportBtn').addEventListener('click', () => {
    chrome.storage.local.get(null, (allData) => {
      const jsonStr = JSON.stringify(allData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MyPushBox.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showBtnFeedback('exportBtn', 'הגיבוי הורד בהצלחה!', 'success');
    });
  });

  // פעולת ייבוא (שחזור)
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (typeof importedData === 'object' && importedData !== null) {
          chrome.storage.local.set(importedData, () => {
            showBtnFeedback('importBtn', 'הנתונים שוחזרו! מרענן...', 'success');
            setTimeout(() => window.location.reload(), 1500);
          });
        } else {
          showBtnFeedback('importBtn', 'קובץ שגוי', 'error');
        }
      } catch (err) {
        showBtnFeedback('importBtn', 'שגיאה בקריאת הקובץ', 'error');
      }
      e.target.value = ''; // ניקוי ה-Input לפעם הבאה
    };
    reader.readAsText(file);
  });

  // ניווט
  document.getElementById('navHome')?.addEventListener('click', () => { window.location.href = 'messages.html'; });
  document.getElementById('navOptions')?.addEventListener('click', () => { window.location.href = 'options.html'; });
  document.getElementById('navContacts')?.addEventListener('click', () => { window.location.href = 'contacts.html'; });
  document.getElementById('navFilters')?.addEventListener('click', () => { window.location.href = 'filters.html'; });
  document.getElementById('navSendSms')?.addEventListener('click', () => { window.location.href = 'send_sms.html'; });
  document.getElementById('navFax')?.addEventListener('click', () => { window.location.href = 'fax.html'; });
  
  // לוגיקה חכמה לכפתור השביעי
  const toggleViewBtn = document.getElementById('navToggleView');
  if (toggleViewBtn) {
    if (window.innerWidth < 800) {
      toggleViewBtn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
      toggleViewBtn.title = "פתח במסך מלא";
      toggleViewBtn.addEventListener('click', () => { 
        const currentPage = window.location.pathname.split('/').pop() || 'options.html';
        chrome.tabs.create({ url: currentPage + window.location.search + window.location.hash }); 
      });
    } else {
      toggleViewBtn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>`;
      toggleViewBtn.title = "פתח בחלונית צד";
      toggleViewBtn.addEventListener('click', () => {
        const currentPage = window.location.pathname.split('/').pop() || 'options.html';
        chrome.storage.local.set({ targetSidePanelPage: currentPage + window.location.search + window.location.hash }, () => {
          chrome.windows.getCurrent({ populate: true }, (window) => {
            chrome.runtime.sendMessage({ action: 'open-side-panel', windowId: window.id });
          });
        });
      });
    }
  }

  // איפוס נתיב התיקייה
  document.getElementById('resetFaxFolderBtn').addEventListener('click', () => {
    document.getElementById('faxFolderPath').value = 'ivr2:/FaxIn';
  });

  // הארת המקטע של תיקיית הפקס אם הגענו מקישור מהיר
  if (window.location.hash === '#faxFolderGroup') {
    const el = document.getElementById('faxFolderGroup');
    if (el) {
      el.style.backgroundColor = '#f3e8ff';
      el.style.borderColor = '#c084fc';
      setTimeout(() => {
        el.style.backgroundColor = 'transparent';
        el.style.borderColor = 'transparent';
      }, 3000);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async function fetchAndSavePhoneNumber(token) {
    try {
      const res = await fetch(`https://www.call2all.co.il/ym/api/GetSession?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (json.responseStatus === 'OK') {
         const systemPhone = json.username || json.user_name || json.did || json.phoneNumber || json.customer_did || '';
         if (systemPhone) {
           document.getElementById('phoneNumber').value = systemPhone;
           chrome.storage.local.set({ phoneNumber: systemPhone, connectionError: "" });
         } else {
           document.getElementById('phoneNumber').value = "לא אותר מספר אוטומטית";
           chrome.storage.local.set({ phoneNumber: "לא אותר מספר אוטומטית", connectionError: "" });
         }
         return true;
      }
    } catch (e) {
      console.error('Error fetching phone number:', e);
    }
    document.getElementById('phoneNumber').value = "שגיאה בשליפת המספר";
    chrome.storage.local.set({ phoneNumber: "שגיאה בשליפת המספר", connectionError: "שגיאה באימות הטוקן" });
    return false;
  }

  document.getElementById('verifyToken').addEventListener('click', async () => {
    const token = document.getElementById('token').value.trim();
    if (!token) return showIconBtnFeedback('verifyToken', 'error');
    showIconBtnFeedback('verifyToken', 'loading');
    
    const isValid = await fetchAndSavePhoneNumber(token);
    if (isValid) showIconBtnFeedback('verifyToken', 'success');
    else showIconBtnFeedback('verifyToken', 'error');
  });

  document.getElementById('save').addEventListener('click', async () => {
    const token = document.getElementById('token').value.trim();
    const interval = document.getElementById('interval').value;
    const notificationStyle = document.getElementById('notificationStyle').value; 
    const updateNotificationStyle = document.getElementById('updateNotificationStyle').value; 
    const faxFolderPath = document.getElementById('faxFolderPath').value.trim() || 'ivr2:/FaxIn';
    
    if (!token) return showBtnFeedback('save', 'הזן טוקן!', 'error');

    chrome.storage.local.set({ 
      token, 
      interval, 
      notificationStyle, 
      updateNotificationStyle,
      faxFolderPath 
    }, async () => {
       showBtnFeedback('save', 'נשמר בהצלחה!', 'success');
       const isValid = await fetchAndSavePhoneNumber(token);
       if (isValid) chrome.runtime.sendMessage({ action: 'check-now' });
    });
  });

  document.querySelectorAll('.email-copy').forEach(el => {
    el.addEventListener('click', (e) => {
      navigator.clipboard.writeText(e.target.innerText);
      const originalText = e.target.innerText;
      e.target.innerText = "הועתק!";
      setTimeout(() => e.target.innerText = originalText, 1500);
    });
  });
});
