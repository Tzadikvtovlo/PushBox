let currentSearchQuery = "";
let currentFilters = [];
let deletedMessages = [];
let isTrashView = false;
let allMessages = []; 
let isAllCollapsed = false;
let activeTab = 'all'; // 'all', 'unread', 'snoozed', 'sent'
let systemPhoneNumber = '';
let periodicCheckInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // בדיקת עדכוני גרסה
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
             alertBox.title = "לחץ כאן להורדה";
          }).catch(() => {
             alertBox.textContent = "עדכון גרסה זמין! לחץ כאן להורדה";
          });

        alertBox.addEventListener('click', () => {
          window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank');
        });
      }
    }
  });

  // שליפת מספר טלפון מזוהה מהמערכת
  chrome.storage.local.get(['phoneNumber'], (data) => {
    if (data.phoneNumber && data.phoneNumber !== "לא אותר מספר אוטומטית" && data.phoneNumber !== "שגיאה בשליפת המספר") {
      systemPhoneNumber = data.phoneNumber;
      const phoneEl = document.getElementById('systemPhone');
      if (phoneEl) phoneEl.textContent = data.phoneNumber;
      
      const callerIdInput = document.getElementById('smsCallerId');
      if (callerIdInput && !callerIdInput.value) {
        callerIdInput.placeholder = data.phoneNumber;
      }
    }
  });

  // כפתור רענון
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const icon = document.getElementById('refreshIcon');
      if (icon) icon.classList.add('spinning');
      loadMessages().finally(() => setTimeout(() => { if(icon) icon.classList.remove('spinning'); }, 500));
    });
  }

  // פתיחת/סגירת ממשק שליחת SMS
  const openSendSmsBtn = document.getElementById('openSendSmsBtn');
  const closeSendSmsBtn = document.getElementById('closeSendSmsBtn');
  const sendSmsSection = document.getElementById('sendSmsSection');

  if (openSendSmsBtn && sendSmsSection) {
    openSendSmsBtn.addEventListener('click', () => {
      toggleSendSmsView(true);
    });
  }

  if (closeSendSmsBtn && sendSmsSection) {
    closeSendSmsBtn.addEventListener('click', () => {
      toggleSendSmsView(false);
    });
  }

  // שורת לשוניות / פילטרים (הכל / לא נקראו / לקריאה בהמשך / נשלחו)
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const filterType = pill.getAttribute('data-filter');
      activeTab = filterType;
      
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      // אם עוברים ללשונית מסוימת, נסגור את טופס השליחה אם הוא פתוח
      if (sendSmsSection && sendSmsSection.style.display !== 'none') {
        sendSmsSection.style.display = 'none';
        const messagesList = document.getElementById('messagesList');
        if (messagesList) messagesList.style.display = 'block';
      }

      // נבטל מצב סל מחזור בלחיצה על לשונית רגילה
      if (isTrashView) {
        isTrashView = false;
        const trashHeader = document.getElementById('trashHeader');
        if (trashHeader) trashHeader.style.display = 'none';
        const trashBtn = document.getElementById('trashBtn');
        if (trashBtn) {
          trashBtn.style.background = '#ffffff';
          trashBtn.style.borderColor = 'var(--border)';
          trashBtn.style.color = 'var(--text-muted)';
        }
      }

      renderMessages();
    });
  });

  // סל מחזור
  const trashBtn = document.getElementById('trashBtn');
  if (trashBtn) {
    trashBtn.addEventListener('click', () => {
      isTrashView = !isTrashView;
      const trashHeader = document.getElementById('trashHeader');
      if (trashHeader) trashHeader.style.display = isTrashView ? 'flex' : 'none';
      
      trashBtn.style.background = isTrashView ? '#f3e8ff' : '#ffffff';
      trashBtn.style.borderColor = isTrashView ? '#d8b4fe' : 'var(--border)';
      trashBtn.style.color = isTrashView ? 'var(--primary)' : 'var(--text-muted)';

      if (isTrashView) {
        filterPills.forEach(p => p.classList.remove('active'));
      } else {
        const defaultPill = document.querySelector(`.filter-pill[data-filter="${activeTab}"]`);
        if (defaultPill) defaultPill.classList.add('active');
      }
      
      renderMessages();
    });
  }

  // צמצום / הרחבת הכל
  const toggleAllBtn = document.getElementById('toggleAllBtn');
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => {
      isAllCollapsed = !isAllCollapsed;
      const bodies = document.querySelectorAll('.msg-body');
      const svgs = document.querySelectorAll('.collapse-btn svg');
      
      bodies.forEach(body => {
        if (isAllCollapsed) {
          body.classList.add('collapsed');
        } else {
          body.classList.remove('collapsed');
        }
      });
      
      svgs.forEach(svg => {
        svg.style.transform = isAllCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
      });
    });
  }

  // חיפוש
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase();
      renderMessages();
    });
  }

  // ספירת תווים וחלקים להודעת SMS
  const smsMessageText = document.getElementById('smsMessageText');
  const charCountLabel = document.getElementById('charCountLabel');
  if (smsMessageText && charCountLabel) {
    smsMessageText.addEventListener('input', () => {
      updateCharCounter(smsMessageText.value, charCountLabel);
    });
  }

  // תבניות מהירות להודעת SMS
  const templateChips = document.querySelectorAll('.template-chip');
  templateChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-text');
      if (smsMessageText && text) {
        if (smsMessageText.value.trim().length > 0) {
          smsMessageText.value += ' ' + text;
        } else {
          smsMessageText.value = text;
        }
        smsMessageText.focus();
        if (charCountLabel) updateCharCounter(smsMessageText.value, charCountLabel);
      }
    });
  });

  // שליחת טופס SMS
  const sendSmsForm = document.getElementById('sendSmsForm');
  if (sendSmsForm) {
    sendSmsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSendSmsSubmit();
    });
  }

  // בדיקת זמני Snooze מיד בפתיחה כדי לוודא דיוק מיידי אם פג הזמן
  checkExpiredSnoozes(() => {
    chrome.storage.local.get(['smsFilters', 'deletedMessages'], (data) => {
      currentFilters = data.smsFilters || [];
      deletedMessages = data.deletedMessages || [];
      loadMessages();
    });
  });

  // בדיקה מחזורית של טיימרים שפגו כל 3 שניות בזמן שהפופאפ פתוח
  periodicCheckInterval = setInterval(() => {
    checkExpiredSnoozes(() => {
      renderMessages();
    });
  }, 3000);
});

// ספירת תווים לפי תקן SMS עברית (70/67) ואנגלית (160/153)
function updateCharCounter(text, labelEl) {
  const len = text.length;
  if (len === 0) {
    labelEl.textContent = `0 תווים (חלק 1)`;
    return;
  }
  const isHebrewOrUnicode = /[^\u0000-\u00ff]/.test(text);
  const maxSingle = isHebrewOrUnicode ? 70 : 160;
  const partSize = isHebrewOrUnicode ? 67 : 153;
  const parts = len <= maxSingle ? 1 : Math.ceil(len / partSize);
  const langName = isHebrewOrUnicode ? 'עברית' : 'אנגלית';
  labelEl.textContent = `${len} תווים | חלק ${parts} (${langName})`;
}

// פתיחה או סגירה של ממשק שליחת SMS
function toggleSendSmsView(show, prefillPhone = '') {
  const sendSmsSection = document.getElementById('sendSmsSection');
  const messagesList = document.getElementById('messagesList');
  const recipientInput = document.getElementById('smsRecipient');
  const callerIdInput = document.getElementById('smsCallerId');
  const messageInput = document.getElementById('smsMessageText');
  const statusBanner = document.getElementById('sendSmsStatus');

  if (!sendSmsSection) return;

  if (show) {
    sendSmsSection.style.display = 'flex';
    if (messagesList) messagesList.style.display = 'none';

    if (statusBanner) {
      statusBanner.style.display = 'none';
      statusBanner.className = 'sms-status-banner';
      statusBanner.textContent = '';
    }

    if (prefillPhone && recipientInput) {
      recipientInput.value = prefillPhone;
      if (messageInput) messageInput.focus();
    } else if (recipientInput) {
      recipientInput.focus();
    }

    if (callerIdInput && !callerIdInput.value && systemPhoneNumber) {
      callerIdInput.value = systemPhoneNumber;
    }
  } else {
    sendSmsSection.style.display = 'none';
    if (messagesList) messagesList.style.display = 'block';
  }
}

// טיפול בשליחת הודעת SMS
function handleSendSmsSubmit() {
  const recipientInput = document.getElementById('smsRecipient');
  const callerIdInput = document.getElementById('smsCallerId');
  const messageInput = document.getElementById('smsMessageText');
  const statusBanner = document.getElementById('sendSmsStatus');
  const submitBtn = document.getElementById('submitSendSmsBtn');

  if (!recipientInput || !messageInput) return;

  const phones = recipientInput.value.trim().replace(/[^\d+]/g, '');
  const message = messageInput.value.trim();
  const callerId = (callerIdInput && callerIdInput.value.trim()) || systemPhoneNumber || '077-5551234';

  if (!phones) {
    showSmsStatus('נא להזין מספר טלפון תקין לנמען', 'error');
    return;
  }
  if (!message) {
    showSmsStatus('נא להקליד תוכן להודעת ה-SMS', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ שולח הודעה...</span>';
  }

  chrome.storage.local.get(['token'], async (data) => {
    const token = data.token || 'demo-token';

    try {
      const params = new URLSearchParams({
        token: token,
        phones: phones,
        message: message,
        callerId: callerId
      });

      const apiUrl = `https://www.call2all.co.il/ym/api/SendSms?${params.toString()}`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
      const result = await res.json();

      if (result && (result.responseStatus === 'OK' || result.status === 'success')) {
        showSmsStatus(`✅ הודעת ה-SMS נשלחה בהצלחה לנמען ${phones}!`, 'success');

        // שמירת ההודעה בהיסטוריית ההודעות שנשלחו
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        const sentRecord = {
          id: 'sent_' + Date.now(),
          date: dateStr,
          phones: phones,
          callerId: callerId,
          message: message,
          status: 'נשלח בהצלחה'
        };

        chrome.storage.local.get(['sentMessages'], (sentData) => {
          const sentList = sentData.sentMessages || [];
          sentList.unshift(sentRecord);
          chrome.storage.local.set({ sentMessages: sentList.slice(0, 100) });
        });

        messageInput.value = '';
        const charLabel = document.getElementById('charCountLabel');
        if (charLabel) updateCharCounter('', charLabel);

        setTimeout(() => {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>🚀 שלח הודעת SMS</span>';
          }
        }, 1200);
      } else {
        const errorMsg = result?.message || result?.error || 'שגיאה בשליחת ה-SMS בימות המשיח';
        showSmsStatus(`❌ ${errorMsg}`, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>🚀 שלח הודעת SMS</span>';
        }
      }
    } catch (err) {
      console.error('Error sending SMS:', err);
      showSmsStatus(`❌ שגיאת תקשורת: ${err.message}`, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🚀 שלח הודעת SMS</span>';
      }
    }
  });
}

function showSmsStatus(msg, type) {
  const statusBanner = document.getElementById('sendSmsStatus');
  if (!statusBanner) return;
  statusBanner.textContent = msg;
  statusBanner.className = `sms-status-banner ${type}`;
  statusBanner.style.display = 'block';
}

// בדיקת כל הודעות ה-Snooze שזמנן פג והחזרתן למצב 'לא נקרא'
function checkExpiredSnoozes(callback) {
  chrome.storage.local.get(['snoozedItems', 'unreadItems', 'unreadCount', 'notificationStyle'], (data) => {
    let snoozed = data.snoozedItems || {};
    let unreadItems = data.unreadItems || [];
    let unreadCount = data.unreadCount || 0;
    const notificationStyle = data.notificationStyle || "both";
    let changed = false;
    const now = Date.now();

    for (let msgId in snoozed) {
      const item = snoozed[msgId];
      const wakeTime = typeof item === 'object' && item !== null ? item.wakeTime : Number(item);

      if (wakeTime && now >= wakeTime) {
        delete snoozed[msgId];
        if (!unreadItems.includes(msgId)) {
          unreadItems.push(msgId);
          unreadCount += 1;
        }
        changed = true;

        // התראת פוש אם מוגדר
        if (notificationStyle === 'both' || notificationStyle === 'banner') {
          const sender = (typeof item === 'object' && item?.source) ? item.source : 'מערכת';
          const msgText = (typeof item === 'object' && item?.message) ? item.message : 'הודעה ששמרת לקריאה בהמשך';

          chrome.notifications?.create?.('snooze_alert_' + Date.now(), {
            type: 'basic',
            iconUrl: 'icon128.png',
            title: `⏰ לקריאה בהמשך: הודעה מ-${sender}`,
            message: msgText,
            priority: 2
          });
        }
      }
    }

    if (changed) {
      chrome.storage.local.set({
        snoozedItems: snoozed,
        unreadItems: unreadItems,
        unreadCount: unreadCount
      }, () => {
        if (callback) callback();
      });
    } else {
      if (callback) callback();
    }
  });
}

// טעינת הודעות משרת ימות המשיח
async function loadMessages() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], async (data) => {
      const container = document.getElementById('messagesList');
      if (!data.token) {
         if (container) container.innerHTML = '<div class="error">לא הוגדר טוקן במערכת. לחץ על הגדרות.</div>';
         resolve();
         return;
      }
      try {
        const url = `https://www.call2all.co.il/ym/api/GetIncomingSms?token=${encodeURIComponent(data.token)}&limit=50`;
        const res = await fetch(url);
        const result = await res.json();
        
        if (result && result.responseStatus === 'OK') {
           allMessages = result.rows || [];
           renderMessages();
        } else {
           if (container) container.innerHTML = '<div class="error">שגיאה במשיכת נתונים או טוקן שגוי.</div>';
        }
      } catch (e) {
        if (container) container.innerHTML = '<div class="error">שגיאת תקשורת מול השרת.</div>';
      }
      resolve();
    });
  });
}

// רינדור רשימת ההודעות
function renderMessages() {
  const container = document.getElementById('messagesList');
  if (!container) return;

  // אם הלשונית הפעילה היא "נשלחו"
  if (activeTab === 'sent') {
    renderSentMessages(container);
    return;
  }

  container.innerHTML = '';

  chrome.storage.local.get(['unreadItems', 'snoozedItems', 'notificationStyle'], (storageData) => {
    const unreadItems = storageData.unreadItems || [];
    const snoozedItems = storageData.snoozedItems || {};

    // חישוב מונים עבור הלשוניות
    let totalUnread = 0;
    let totalSnoozed = 0;

    allMessages.forEach(msg => {
      const msgId = `${msg.receive_date}_${msg.source}`;
      if (!deletedMessages.includes(msgId)) {
        if (unreadItems.includes(msgId)) totalUnread++;
        if (snoozedItems[msgId]) totalSnoozed++;
      }
    });

    const unreadPillCount = document.getElementById('unreadPillCount');
    if (unreadPillCount) unreadPillCount.textContent = totalUnread;

    const snoozedPillCount = document.getElementById('snoozedPillCount');
    if (snoozedPillCount) snoozedPillCount.textContent = totalSnoozed;

    // סינון הודעות
    let filteredMessages = allMessages.filter(msg => {
      const msgId = `${msg.receive_date}_${msg.source}`;
      const isDeleted = deletedMessages.includes(msgId);

      if (isTrashView) {
        if (!isDeleted) return false;
      } else {
        if (isDeleted) return false;

        // פילטר לפי לשונית
        if (activeTab === 'unread' && !unreadItems.includes(msgId)) return false;
        if (activeTab === 'snoozed' && !snoozedItems[msgId]) return false;
        
        // פילטרים מוגדרים אישית
        for (let f of currentFilters) {
          if (f.type === 'sender' && msg.source === f.value) return false;
          if (f.type === 'contains' && msg.message.includes(f.value)) return false;
          if (f.type === 'not_contains' && !msg.message.includes(f.value)) return false;
        }
      }
      return true;
    });

    if (currentSearchQuery) {
      filteredMessages = filteredMessages.filter(msg => 
        msg.message.toLowerCase().includes(currentSearchQuery) || 
        msg.source.toLowerCase().includes(currentSearchQuery)
      );
    }

    if (filteredMessages.length === 0) {
      if (isTrashView) {
        container.innerHTML = '<div class="empty">סל המחזור ריק.</div>';
      } else if (activeTab === 'unread') {
        container.innerHTML = '<div class="empty">אין כרגע הודעות שלא נקראו 🎉</div>';
      } else if (activeTab === 'snoozed') {
        container.innerHTML = '<div class="empty">אין הודעות הממתינות לקריאה בהמשך.</div>';
      } else {
        container.innerHTML = '<div class="empty">אין הודעות המותאמות לסינון/לחיפוש.</div>';
      }
      return;
    }

    filteredMessages.slice(0, 30).forEach(msg => {
      const card = document.createElement('div');
      card.className = 'msg-card';
      const msgId = `${msg.receive_date}_${msg.source}`;
      
      const isUnread = unreadItems.includes(msgId);
      const isSnoozed = !!snoozedItems[msgId];

      if (isUnread) {
        card.style.borderRight = '6px solid #7e22ce';
      }

      // מראה "אפרפר חלבי" לפי דרישת המשתמש עבור לקריאה בהמשך
      if (isSnoozed) {
        card.classList.add('snoozed');
      }

      // אייקון מעטפה עם צבע סגול מובהק במצב לא נקרא
      const envelopeSvg = isUnread 
        ? `<svg class="svg-icon" viewBox="0 0 24 24" style="stroke: #581c87; fill: #d8b4fe; width: 17px; height: 17px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6" style="fill:none; stroke:#581c87; stroke-width:3.5;"></polyline></svg>`
        : `<svg class="svg-icon" viewBox="0 0 24 24" style="stroke: var(--text-muted); fill: none; width: 16px; height: 16px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
      
      const codeMatch = msg.message.match(/\b\d{5,8}\b/);
      
      let copyBtnHtml = '';
      if (codeMatch) {
         copyBtnHtml = `
         <button class="btn-copy">
           <span class="copy-inner">
             <svg class="svg-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
             העתק קוד: <span class="code-highlight">${codeMatch[0]}</span>
           </span>
         </button>`;
      } else {
         copyBtnHtml = `
         <button class="btn-copy">
           <span class="copy-inner">
             <svg class="svg-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
             העתק הודעה מלאה
           </span>
         </button>`;
      }

      let text = escapeHtml(msg.message || '');
      text = text.replace(/[\r\n]+/g, '\n').trim();

      const urlRegex = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{2,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;
      const links = [];
      text = text.replace(urlRegex, (url) => {
        links.push(url);
        return `__URL_${links.length - 1}__`;
      });

      text = text.replace(/__URL_(\d+)__/g, (match, index) => {
        const url = links[index];
        let cleanUrl = url.replace(/&amp;/g, '&');
        let href = cleanUrl;
        if (!href.match(/^https?:\/\//i)) {
          href = 'https://' + href;
        }
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline; font-weight: bold; direction: ltr; display: inline-block;">${url}</a>`;
      });

      const displayMsg = text.replace(/\n/g, '<br>');

      const deleteRestoreIcon = isTrashView ? 
        `<svg class="svg-icon" viewBox="0 0 24 24" title="שחזר הודעה"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>` : 
        `<svg class="svg-icon" viewBox="0 0 24 24" title="מחק הודעה"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

      const bodyClass = isAllCollapsed ? "msg-body collapsed" : "msg-body";
      const rotateStyle = isAllCollapsed ? "transform: rotate(180deg);" : "";

      // באנר עבור הודעות לקריאה בהמשך (כולל זמן סיום וכפתור החזרה מיידית)
      let snoozeBannerHtml = '';
      if (isSnoozed) {
        const snoozeItem = snoozedItems[msgId];
        const wakeTime = typeof snoozeItem === 'object' && snoozeItem !== null ? snoozeItem.wakeTime : Number(snoozeItem);
        const diffMs = wakeTime ? Math.max(0, wakeTime - Date.now()) : 0;
        const diffMins = Math.ceil(diffMs / (60 * 1000));
        const wakeDate = new Date(wakeTime || Date.now());
        const timeStr = `${String(wakeDate.getHours()).padStart(2, '0')}:${String(wakeDate.getMinutes()).padStart(2, '0')}`;

        snoozeBannerHtml = `
          <div class="snooze-banner">
            <span>⏰ לקריאה בהמשך: עד ${timeStr} (בעוד כ-${diffMins} דק')</span>
            <button class="btn-wake-now" title="החזר כעת לסטטוס לא נקרא">⚡ החזר ל'לא נקרא'</button>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="msg-header">
          <div class="msg-source-wrapper">
            <span class="msg-source">${msg.source}</span>
          </div>
          <div class="msg-controls" style="position: relative;">
            <button class="ctrl-btn envelope-toggle-btn" title="${isUnread ? 'סומן כלא נקרא (לחץ לסימון כנקרא)' : 'סמן כלא נקרא'}">
              ${envelopeSvg}
            </button>

            <!-- כפתור לקריאה בהמשך עם תפריט זמנים -->
            <button class="ctrl-btn snooze-menu-trigger" title="לקריאה בהמשך (Snooze)">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke: #64748b;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </button>

            <div class="custom-dropdown-menu" style="display:none; position:absolute; left:0; top:24px; background:#fff; border:1px solid var(--border); border-radius:8px; box-shadow:0 6px 16px rgba(0,0,0,0.12); z-index:100; min-width:160px; font-size:12px; text-align:right;">
              <div class="dropdown-item action-unread" style="padding:7px 12px; cursor:pointer; border-bottom:1px solid #f3f4f6; color:var(--text); font-weight:700;">✉️ ${isUnread ? 'סמן כנקרא' : 'סמן כלא נקרא'}</div>
              <div class="dropdown-item action-s5" style="padding:6px 12px; cursor:pointer; color:var(--text);">⏰ 5 דקות</div>
              <div class="dropdown-item action-s15" style="padding:6px 12px; cursor:pointer; color:var(--text);">⏰ 15 דקות</div>
              <div class="dropdown-item action-s30" style="padding:6px 12px; cursor:pointer; color:var(--text);">⏰ 30 דקות</div>
              <div class="dropdown-item action-s60" style="padding:6px 12px; cursor:pointer; color:var(--text);">⏰ שעה אחת (60 דק')</div>
              <div class="dropdown-item action-s120" style="padding:6px 12px; cursor:pointer; color:var(--text);">⏰ שעתיים (120 דק')</div>
              <div class="dropdown-item action-s1440" style="padding:6px 12px; cursor:pointer; color:var(--text);">⏰ מחר (24 שעות)</div>
              <div class="dropdown-item action-scustom" style="padding:6px 12px; cursor:pointer; color:var(--primary); font-weight:700; border-top:1px solid #f3f4f6;">⏱️ זמן מותאם אישית...</div>
            </div>

            <!-- כפתור השב ב-SMS -->
            <button class="ctrl-btn reply-sms-btn" title="השב בהודעת SMS לשולח זה">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke: #6b21a8;"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
            </button>

            <button class="ctrl-btn filter-sender-btn" title="סנן שולח זה">
              <svg class="svg-icon" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            </button>
            <button class="ctrl-btn collapse-btn" title="צמצם/הרחב">
              <svg class="svg-icon" viewBox="0 0 24 24" style="${rotateStyle}"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <button class="ctrl-btn delete-btn">
              ${deleteRestoreIcon}
            </button>
          </div>
          <div class="msg-date-wrapper"><span class="msg-date">${msg.receive_date}</span></div>
        </div>
        ${snoozeBannerHtml}
        <div class="${bodyClass}">${displayMsg}</div>
        ${copyBtnHtml}
      `;

      const envelopeBtn = card.querySelector('.envelope-toggle-btn');
      const snoozeMenuTrigger = card.querySelector('.snooze-menu-trigger');
      const dropdownMenu = card.querySelector('.custom-dropdown-menu');

      // לחיצה מהירה ישירה על המעטפה - הפיכה ישירה בין 'לא נקרא' ל-'נקרא'
      envelopeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleUnreadStatus(msgId);
      });

      // לחיצה על כפתור טיימר השעון לפתיחת תפריט "לקריאה בהמשך"
      snoozeMenuTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-dropdown-menu').forEach(m => {
          if (m !== dropdownMenu) m.style.display = 'none';
        });
        dropdownMenu.style.display = dropdownMenu.style.display === 'block' ? 'none' : 'block';
      });

      document.addEventListener('click', () => {
        if (dropdownMenu) dropdownMenu.style.display = 'none';
      });

      // פעולת סימון כלא נקרא מהתפריט
      card.querySelector('.action-unread').addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.style.display = 'none';
        toggleUnreadStatus(msgId);
      });

      // זמני Snooze
      card.querySelector('.action-s5').addEventListener('click', () => handleSnooze(5, msg));
      card.querySelector('.action-s15').addEventListener('click', () => handleSnooze(15, msg));
      card.querySelector('.action-s30').addEventListener('click', () => handleSnooze(30, msg));
      card.querySelector('.action-s60').addEventListener('click', () => handleSnooze(60, msg));
      card.querySelector('.action-s120').addEventListener('click', () => handleSnooze(120, msg));
      card.querySelector('.action-s1440').addEventListener('click', () => handleSnooze(1440, msg));
      
      card.querySelector('.action-scustom').addEventListener('click', () => {
        dropdownMenu.style.display = 'none';
        const customMins = prompt('הזן תוך כמה דקות להחזיר את ההודעה לקריאה:', '45');
        const num = parseInt(customMins, 10);
        if (num && num > 0) {
          handleSnooze(num, msg);
        }
      });

      // החזרה מיידית למצב 'לא נקרא' מכרטיס לקריאה בהמשך
      const wakeBtn = card.querySelector('.btn-wake-now');
      if (wakeBtn) {
        wakeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          wakeUpSnoozedMessage(msgId);
        });
      }

      // כפתור השב ב-SMS
      card.querySelector('.reply-sms-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSendSmsView(true, msg.source);
      });

      // סינון שולח
      card.querySelector('.filter-sender-btn').addEventListener('click', () => {
        currentFilters.push({ type: 'sender', value: msg.source });
        chrome.storage.local.set({ smsFilters: currentFilters }, () => {
          renderMessages();
        });
      });

      // צמצום / הרחבה
      card.querySelector('.collapse-btn').addEventListener('click', (e) => {
        const body = card.querySelector('.msg-body');
        const svg = e.currentTarget.querySelector('svg');
        const isCollapsed = body.classList.toggle('collapsed');
        svg.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
      });

      // מחיקה / שחזור
      card.querySelector('.delete-btn').addEventListener('click', () => {
        if (isTrashView) {
          const index = deletedMessages.indexOf(msgId);
          if (index > -1) deletedMessages.splice(index, 1);
        } else {
          deletedMessages.push(msgId);
        }
        chrome.storage.local.set({ deletedMessages: deletedMessages }, () => {
          renderMessages();
        });
      });

      // העתקת תוכן / קוד
      card.querySelector('.btn-copy').addEventListener('click', (e) => {
         const textToCopy = codeMatch ? codeMatch[0] : msg.message;
         navigator.clipboard.writeText(textToCopy);
         const copyInner = e.currentTarget.querySelector('.copy-inner');
         const originalHtml = copyInner.innerHTML;
         copyInner.innerHTML = 'הועתק בהצלחה!';
         setTimeout(() => copyInner.innerHTML = originalHtml, 1500);
      });
      
      container.appendChild(card);
    });
  });
}

// רינדור רשימת הודעות שנשלחו
function renderSentMessages(container) {
  container.innerHTML = '';

  chrome.storage.local.get(['sentMessages'], (data) => {
    const sentList = data.sentMessages || [];

    if (sentList.length === 0) {
      container.innerHTML = `
        <div class="empty">
          לא נשלחו עדיין הודעות SMS דרך התוסף.<br>
          <button id="emptySendSmsBtn" class="icon-btn btn-send-sms" style="margin-top: 10px; width: auto; padding: 6px 14px;">
            📤 שלח SMS עכשיו
          </button>
        </div>
      `;
      const btn = document.getElementById('emptySendSmsBtn');
      if (btn) {
        btn.addEventListener('click', () => toggleSendSmsView(true));
      }
      return;
    }

    sentList.slice(0, 30).forEach(msg => {
      const card = document.createElement('div');
      card.className = 'msg-card';
      card.style.borderRight = '6px solid #16a34a';

      card.innerHTML = `
        <div class="msg-header">
          <div class="msg-source-wrapper">
            <span class="msg-source" style="background:#dcfce7; color:#166534;">נמען: ${msg.phones}</span>
          </div>
          <div class="msg-controls">
            <button class="ctrl-btn resend-sent-btn" title="שלח שוב לנמען זה">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke: #166534;"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
            </button>
          </div>
          <div class="msg-date-wrapper"><span class="msg-date">${msg.date}</span></div>
        </div>
        <div class="msg-body">${escapeHtml(msg.message)}</div>
        <button class="btn-copy">
          <span class="copy-inner">
            <svg class="svg-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            העתק תוכן שנשלח
          </span>
        </button>
      `;

      card.querySelector('.resend-sent-btn').addEventListener('click', () => {
        toggleSendSmsView(true, msg.phones);
        const msgInput = document.getElementById('smsMessageText');
        if (msgInput) {
          msgInput.value = msg.message;
          const charLabel = document.getElementById('charCountLabel');
          if (charLabel) updateCharCounter(msg.message, charLabel);
        }
      });

      card.querySelector('.btn-copy').addEventListener('click', (e) => {
        navigator.clipboard.writeText(msg.message);
        const copyInner = e.currentTarget.querySelector('.copy-inner');
        const originalHtml = copyInner.innerHTML;
        copyInner.innerHTML = 'הועתק בהצלחה!';
        setTimeout(() => copyInner.innerHTML = originalHtml, 1500);
      });

      container.appendChild(card);
    });
  });
}

// מעבר בין מצב לא נקרא לנקרא בלחיצה אחת
function toggleUnreadStatus(msgId) {
  chrome.storage.local.get(['unreadItems', 'unreadCount', 'snoozedItems'], (data) => {
    let list = data.unreadItems || [];
    let count = data.unreadCount || 0;
    let snoozed = data.snoozedItems || {};

    const index = list.indexOf(msgId);
    if (index > -1) {
      list.splice(index, 1);
      count = Math.max(0, count - 1);
    } else {
      list.push(msgId);
      count += 1;
      // אם היה ב-snooze, מסירים אותו משם
      if (snoozed[msgId]) {
        delete snoozed[msgId];
        chrome.alarms?.clear?.(`snooze_${msgId}`);
      }
    }

    chrome.storage.local.set({ 
      unreadItems: list, 
      unreadCount: count,
      snoozedItems: snoozed 
    }, () => {
      renderMessages();
      chrome.runtime.sendMessage({ action: 'check-now' });
    });
  });
}

// החזרה מיידית של הודעת לקריאה בהמשך למצב לא נקרא
function wakeUpSnoozedMessage(msgId) {
  chrome.storage.local.get(['snoozedItems', 'unreadItems', 'unreadCount'], (data) => {
    let snoozed = data.snoozedItems || {};
    let unreadItems = data.unreadItems || [];
    let unreadCount = data.unreadCount || 0;

    delete snoozed[msgId];
    chrome.alarms?.clear?.(`snooze_${msgId}`);

    if (!unreadItems.includes(msgId)) {
      unreadItems.push(msgId);
      unreadCount += 1;
    }

    chrome.storage.local.set({
      snoozedItems: snoozed,
      unreadItems: unreadItems,
      unreadCount: unreadCount
    }, () => {
      renderMessages();
      chrome.runtime.sendMessage({ action: 'check-now' });
    });
  });
}

// שמירת הודעה לקריאה בהמשך (Snooze)
function handleSnooze(mins, msg) {
  const msgId = `${msg.receive_date}_${msg.source}`;
  const targetTimestamp = Date.now() + (mins * 60 * 1000);
  
  chrome.alarms.create(`snooze_${msgId}`, { 
    when: targetTimestamp,
    delayInMinutes: mins 
  });
  
  chrome.storage.local.get(['snoozedItems', 'unreadItems', 'unreadCount'], (data) => {
    let snoozed = data.snoozedItems || {};
    let unreadItems = data.unreadItems || [];
    let unreadCount = data.unreadCount || 0;

    // שמירת אובייקט מלא לטובת שחזור קל והתראת פוש עשירה בסיום הטיימר
    snoozed[msgId] = {
      wakeTime: targetTimestamp,
      source: msg.source,
      message: msg.message,
      receive_date: msg.receive_date
    };

    // הסרה מ'לא נקרא' למשך תקופת ה-Snooze
    const index = unreadItems.indexOf(msgId);
    if (index > -1) {
      unreadItems.splice(index, 1);
      unreadCount = Math.max(0, unreadCount - 1);
    }

    chrome.storage.local.set({ 
      snoozedItems: snoozed, 
      unreadItems: unreadItems, 
      unreadCount: unreadCount 
    }, () => {
      renderMessages();
      chrome.runtime.sendMessage({ action: 'check-now' });
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
