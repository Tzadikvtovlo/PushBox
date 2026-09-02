document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['token', 'phoneNumber', 'interval', 'notificationStyle'], (data) => {
    if (data.token) document.getElementById('token').value = data.token;
    if (data.phoneNumber) document.getElementById('phoneNumber').value = data.phoneNumber;
    if (data.interval !== undefined) document.getElementById('interval').value = data.interval;
    if (data.notificationStyle) {
      document.getElementById('notificationStyle').value = data.notificationStyle;
    } else {
      document.getElementById('notificationStyle').value = 'both';
    }
  });

  const versionBox = document.getElementById('versionBox');
  const manifest = chrome.runtime.getManifest();
  const currentVersion = manifest.version;
  versionBox.textContent = `v${currentVersion}`;
  versionBox.style.direction = 'ltr';

  function isNewerVersion(latest, current) {
    const lParts = latest.split('.').map(Number);
    const cParts = current.split('.').map(Number);
    const len = Math.max(lParts.length, cParts.length);
    
    for (let i = 0; i < len; i++) {
      const l = lParts[i] || 0; 
      const c = cParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false; 
  }

  async function checkForUpdates(isManual = false) {
    if (isManual) {
      versionBox.textContent = 'בודק...';
      versionBox.style.direction = 'rtl';
      versionBox.style.pointerEvents = 'none';
      versionBox.title = 'בודק עדכונים...';
    }
    try {
      const res = await fetch('https://api.github.com/repos/Tzadikvtovlo/PushBox/releases/latest');
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      
      const latestVersion = data.tag_name ? data.tag_name.replace(/^v/i, '').trim() : currentVersion;

      if (isNewerVersion(latestVersion, currentVersion)) {
        chrome.storage.local.set({ updateAvailable: true });
        // שינוי הטקסט לתצוגה המפורטת כמו בתוסף 2
        versionBox.textContent = `מותקן: v${currentVersion} | זמין: v${latestVersion}`;
        versionBox.title = 'לחץ כאן להורדה';
        versionBox.style.direction = 'rtl';
        versionBox.classList.add('update');
      } else {
        chrome.storage.local.set({ updateAvailable: false });
        versionBox.title = 'לחץ לבדיקת עדכונים';
        versionBox.classList.remove('update');
        
        if (isManual) {
          versionBox.textContent = 'אתה מעודכן';
          versionBox.style.direction = 'rtl';
          setTimeout(() => { 
            versionBox.textContent = `v${currentVersion}`; 
            versionBox.style.direction = 'ltr';
          }, 3000);
        } else {
          versionBox.textContent = `v${currentVersion}`;
          versionBox.style.direction = 'ltr';
        }
      }
    } catch (e) {
      versionBox.title = 'לחץ לבדיקת עדכונים';
      if (isManual) {
        versionBox.textContent = 'שגיאה בבדיקה';
        versionBox.style.direction = 'rtl';
        setTimeout(() => { 
          versionBox.textContent = `v${currentVersion}`; 
          versionBox.style.direction = 'ltr';
        }, 3000);
      }
    } finally {
      versionBox.style.pointerEvents = 'auto';
    }
  }

  // מנגנון חכם ללחיצה: אם יש עדכון פותח חלון, אם לא מריץ בדיקה
  versionBox.onclick = () => {
    if (versionBox.classList.contains('update')) {
      window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank');
    } else {
      checkForUpdates(true);
    }
  };

  // בדיקה אוטומטית בפתיחת הדף
  checkForUpdates();

  function showBtnFeedback(btnId, message, type = 'success') {
    const btn = document.getElementById(btnId);
    
    if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    
    const originalHtml = btn.dataset.originalHtml;
    
    btn.innerHTML = `<span style="font-weight: bold;">${message}</span>`;
    
    if (type === 'success') {
      btn.style.backgroundColor = '#e9d5ff'; 
      btn.style.color = '#1e3a8a';
      btn.style.borderColor = '#c084fc';
    } else {
      btn.style.backgroundColor = '#f3e8ff'; 
      btn.style.color = '#581c87'; 
      btn.style.borderColor = '#d8b4fe';
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

  document.getElementById('manageFilters').addEventListener('click', () => {
    chrome.tabs.create({ url: 'filters.html' });
  });

  async function fetchAndSavePhoneNumber(token) {
    try {
      const res = await fetch(`https://www.call2all.co.il/ym/api/GetSession?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      
      console.log('API Response (GetSession):', json);
      
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
    if (!token) {
      showBtnFeedback('verifyToken', 'הזן טוקן!', 'error');
      return;
    }

    showBtnFeedback('verifyToken', 'מאמת...', 'success');
    
    const isValid = await fetchAndSavePhoneNumber(token);
    if (isValid) {
       showBtnFeedback('verifyToken', 'אומת בהצלחה!', 'success');
    } else {
       showBtnFeedback('verifyToken', 'טוקן שגוי!', 'error');
    }
  });

  document.getElementById('save').addEventListener('click', async () => {
    const token = document.getElementById('token').value.trim();
    const interval = document.getElementById('interval').value;
    const notificationStyle = document.getElementById('notificationStyle').value; 
    
    if (!token) {
       showBtnFeedback('save', 'הזן טוקן!', 'error');
       return;
    }

    chrome.storage.local.set({ 
      token: token, 
      interval: interval, 
      notificationStyle: notificationStyle 
    }, async () => {
       showBtnFeedback('save', 'נשמר בהצלחה!', 'success');
       
       const isValid = await fetchAndSavePhoneNumber(token);
       if (isValid) {
         chrome.runtime.sendMessage({ action: 'check-now' });
       }
    });
  });

  document.getElementById('resendNow').addEventListener('click', () => {
     chrome.runtime.sendMessage({ action: 'resend-latest-sms' });
     showBtnFeedback('resendNow', 'נשלח בהצלחה!', 'success');
  });

  document.getElementById('copyEmail').addEventListener('click', (e) => {
     navigator.clipboard.writeText(e.target.innerText);
     const originalText = e.target.innerText;
     e.target.innerText = "הועתק!";
     setTimeout(() => e.target.innerText = originalText, 1500);
  });
});
