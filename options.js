document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['token', 'phoneNumber', 'interval', 'notificationStyle', 'updateNotificationStyle'], (data) => {
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
      alertBox.addEventListener('click', () => { window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank'); });
    }
  });

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

  document.getElementById('navContacts').addEventListener('click', () => { window.location.href = 'contacts.html'; });
  document.getElementById('navFilters').addEventListener('click', () => { window.location.href = 'filters.html'; });
  document.getElementById('navSendSms').addEventListener('click', () => { window.location.href = 'send_sms.html'; });

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
    if (!token) return showBtnFeedback('verifyToken', 'הזן טוקן!', 'error');
    showBtnFeedback('verifyToken', 'מאמת...', 'success');
    
    const isValid = await fetchAndSavePhoneNumber(token);
    if (isValid) showBtnFeedback('verifyToken', 'אומת בהצלחה!', 'success');
    else showBtnFeedback('verifyToken', 'טוקן שגוי!', 'error');
  });

  document.getElementById('save').addEventListener('click', async () => {
    const token = document.getElementById('token').value.trim();
    const interval = document.getElementById('interval').value;
    const notificationStyle = document.getElementById('notificationStyle').value; 
    const updateNotificationStyle = document.getElementById('updateNotificationStyle').value; 
    
    if (!token) return showBtnFeedback('save', 'הזן טוקן!', 'error');

    chrome.storage.local.set({ 
      token: token, interval: interval, notificationStyle: notificationStyle, updateNotificationStyle: updateNotificationStyle
    }, async () => {
       showBtnFeedback('save', 'נשמר בהצלחה!', 'success');
       const isValid = await fetchAndSavePhoneNumber(token);
       if (isValid) chrome.runtime.sendMessage({ action: 'check-now' });
    });
  });

  document.getElementById('copyEmail').addEventListener('click', (e) => {
     navigator.clipboard.writeText(e.target.innerText);
     const originalText = e.target.innerText;
     e.target.innerText = "הועתק!";
     setTimeout(() => e.target.innerText = originalText, 1500);
  });
});
