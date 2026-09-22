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

  // כפתורי ניווט
  document.getElementById('navOptions').addEventListener('click', () => { window.location.href = 'options.html'; });
  document.getElementById('navContacts').addEventListener('click', () => { window.location.href = 'contacts.html'; });
  document.getElementById('navFilters').addEventListener('click', () => { window.location.href = 'filters.html'; });

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