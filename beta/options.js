document.addEventListener('DOMContentLoaded', () => {
  // טעינת הגדרות שמורות
  chrome.storage.local.get(['token', 'phoneNumber', 'interval', 'notificationStyle', 'updateChannel', 'checkBetaUpdates'], (data) => {
    if (data.token) document.getElementById('token').value = data.token;
    if (data.phoneNumber) document.getElementById('phoneNumber').value = data.phoneNumber;
    if (data.interval !== undefined) document.getElementById('interval').value = data.interval;
    
    if (data.notificationStyle) {
      document.getElementById('notificationStyle').value = data.notificationStyle;
    } else {
      document.getElementById('notificationStyle').value = 'both';
    }

    const channelEl = document.getElementById('updateChannel');
    if (channelEl) {
      if (data.updateChannel) {
        channelEl.value = data.updateChannel;
      } else if (data.checkBetaUpdates === true) {
        channelEl.value = 'beta';
      } else {
        channelEl.value = 'stable';
      }
    }
  });

  const versionBox = document.getElementById('versionBox');
  const manifest = chrome.runtime.getManifest ? chrome.runtime.getManifest() : { version: '4.9' };
  const currentVersion = manifest.version || '4.9';
  const displayVersion = `v${currentVersion} (בטא)`;
  versionBox.textContent = displayVersion;
  versionBox.style.direction = 'ltr';

  // השוואת גרסאות מדויקת
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

  // בדיקת עדכונים לפי ערוץ נבחר
  async function checkForUpdates(isManual = false) {
    const channelSelect = document.getElementById('updateChannel');
    const channel = channelSelect ? channelSelect.value : 'stable';

    if (channel === 'none') {
      chrome.storage.local.set({ updateAvailable: false });
      versionBox.textContent = displayVersion;
      versionBox.title = 'בדיקת עדכונים מנוטרלת';
      versionBox.classList.remove('update');
      return;
    }

    if (isManual) {
      versionBox.textContent = 'בודק...';
      versionBox.style.direction = 'rtl';
      versionBox.style.pointerEvents = 'none';
      versionBox.title = 'בודק עדכונים ב-GitHub...';
    }

    try {
      let targetUrl = 'https://api.github.com/repos/Tzadikvtovlo/PushBox/releases/latest';
      if (channel === 'beta') {
        targetUrl = 'https://api.github.com/repos/Tzadikvtovlo/PushBox/releases';
      }

      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      
      let latestRelease = null;
      if (Array.isArray(data)) {
        latestRelease = data.length > 0 ? data[0] : null;
      } else {
        latestRelease = data;
      }

      if (!latestRelease || !latestRelease.tag_name) {
        throw new Error('No release tag found');
      }

      const latestVersion = latestRelease.tag_name.replace(/^v/i, '').trim();
      const isBeta = !!latestRelease.prerelease;

      if (isNewerVersion(latestVersion, currentVersion)) {
        chrome.storage.local.set({ updateAvailable: true, latestVersionName: latestVersion, isBetaUpdate: isBeta });
        versionBox.textContent = `מותקן: v${currentVersion} | זמין: v${latestVersion}${isBeta ? ' (בטא)' : ''}`;
        versionBox.title = 'לחץ כאן להורדת הגרסה החדשה';
        versionBox.style.direction = 'rtl';
        versionBox.classList.add('update');
      } else {
        chrome.storage.local.set({ updateAvailable: false });
        versionBox.title = 'לחץ לבדיקת עדכונים';
        versionBox.classList.remove('update');
        
        if (isManual) {
          versionBox.textContent = 'הגרסה מעודכנת';
          versionBox.style.direction = 'rtl';
          setTimeout(() => { 
            versionBox.textContent = displayVersion; 
            versionBox.style.direction = 'ltr';
          }, 3000);
        } else {
          versionBox.textContent = displayVersion;
          versionBox.style.direction = 'ltr';
        }
      }
    } catch (e) {
      versionBox.title = 'לחץ לבדיקת עדכונים';
      if (isManual) {
        versionBox.textContent = 'שגיאה בבדיקה';
        versionBox.style.direction = 'rtl';
        setTimeout(() => { 
          versionBox.textContent = displayVersion; 
          versionBox.style.direction = 'ltr';
        }, 3000);
      }
    } finally {
      versionBox.style.pointerEvents = 'auto';
    }
  }

  // פתיחת שחרורים בלחיצה אם יש עדכון, אחרת הרצת בדיקה
  versionBox.onclick = () => {
    if (versionBox.classList.contains('update')) {
      window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank');
    } else {
      checkForUpdates(true);
    }
  };

  const channelSelectEl = document.getElementById('updateChannel');
  if (channelSelectEl) {
    channelSelectEl.addEventListener('change', () => {
      const channel = channelSelectEl.value;
      chrome.storage.local.set({ 
        updateChannel: channel,
        checkBetaUpdates: channel === 'beta' 
      }, () => {
        checkForUpdates(false);
      });
    });
  }

  // בדיקה אוטומטית בפתיחה
  checkForUpdates(false);

  function showBtnFeedback(btnId, message, type = 'success') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    
    if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    
    const originalHtml = btn.dataset.originalHtml;
    btn.innerHTML = `<span style="font-weight: 600;">${message}</span>`;
    
    if (type === 'success') {
      btn.style.backgroundColor = '#ecfdf5'; 
      btn.style.color = '#065f46';
      btn.style.borderColor = '#a7f3d0';
    } else {
      btn.style.backgroundColor = '#fef2f2'; 
      btn.style.color = '#991b1b'; 
      btn.style.borderColor = '#fecaca';
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

  document.getElementById('manageFilters')?.addEventListener('click', () => {
    chrome.tabs ? chrome.tabs.create({ url: 'filters.html' }) : window.open('filters.html', '_blank');
  });

  // אימות טוקן ושליפת מספר המערכת
  async function fetchAndSavePhoneNumber(token) {
    try {
      const url = `https://www.call2all.co.il/ym/api/GetSession?token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const json = await res.json();
      
      console.log('API Response (GetSession):', json);
      
      if (json && json.responseStatus === 'OK') {
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

  document.getElementById('verifyToken')?.addEventListener('click', async () => {
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

  document.getElementById('save')?.addEventListener('click', async () => {
    const token = document.getElementById('token').value.trim();
    const interval = document.getElementById('interval').value;
    const notificationStyle = document.getElementById('notificationStyle').value; 
    const updateChannel = document.getElementById('updateChannel') ? document.getElementById('updateChannel').value : 'stable';
    
    if (!token) {
       showBtnFeedback('save', 'הזן טוקן!', 'error');
       return;
    }

    chrome.storage.local.set({ 
      token: token, 
      interval: interval, 
      notificationStyle: notificationStyle,
      updateChannel: updateChannel,
      checkBetaUpdates: updateChannel === 'beta'
    }, async () => {
       showBtnFeedback('save', 'נשמר בהצלחה!', 'success');
       
       const isValid = await fetchAndSavePhoneNumber(token);
       if (isValid) {
         chrome.runtime.sendMessage ? chrome.runtime.sendMessage({ action: 'check-now' }) : null;
       }
    });
  });

  document.getElementById('resendNow')?.addEventListener('click', () => {
     chrome.runtime.sendMessage ? chrome.runtime.sendMessage({ action: 'resend-latest-sms' }) : null;
     showBtnFeedback('resendNow', 'נשלח בהצלחה!', 'success');
  });

  document.getElementById('copyEmail')?.addEventListener('click', (e) => {
     navigator.clipboard.writeText(e.target.innerText);
     const originalText = e.target.innerText;
     e.target.innerText = "הועתק ללוח!";
     setTimeout(() => e.target.innerText = originalText, 1500);
  });
});
