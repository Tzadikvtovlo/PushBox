let currentSearchQuery = "";
let currentFilters = [];
let deletedMessages = [];
let isTrashView = false;
let allMessages = [];
let isAllCollapsed = false;
let activeTab = "all"; // all, unread, snoozed, sent
let periodicCheckInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // איפוס מונה בלתי נקראים בעת פתיחה
  chrome.storage.local.set({ unreadCount: 0 });

  // טיפול בבאנר של התרעה על עדכון זמין
  checkVersionUpdate();

  // משיכת מספר מערכת
  chrome.storage.local.get(['phoneNumber'], (data) => {
    if (data.phoneNumber && data.phoneNumber !== "לא אותר מספר אוטומטית" && data.phoneNumber !== "שגיאה בשליפת המספר") {
      const phoneEl = document.getElementById('systemPhone');
      if (phoneEl) phoneEl.textContent = data.phoneNumber;
    }
  });

  // כפתור רענון
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const icon = document.getElementById('refreshIcon');
      if (icon) icon.classList.add('spinning');
      loadMessages().finally(() => {
        setTimeout(() => { if (icon) icon.classList.remove('spinning'); }, 500);
      });
    });
  }

  // פתיחת חלונית שליחת SMS
  document.getElementById('openSendSmsBtn')?.addEventListener('click', () => {
    openSendSmsModal();
  });
  document.getElementById('closeSendSmsModal')?.addEventListener('click', () => {
    closeSendSmsModal();
  });
  document.getElementById('cancelSendSmsBtn')?.addEventListener('click', () => {
    closeSendSmsModal();
  });
  document.getElementById('clearSmsTextBtn')?.addEventListener('click', () => {
    const txt = document.getElementById('smsMessageText');
    if (txt) {
      txt.value = '';
      updateCharCounter('', document.getElementById('smsCharCounter'));
    }
  });

  // ספירת תווים בחלונית SMS
  const smsText = document.getElementById('smsMessageText');
  const charCounter = document.getElementById('smsCharCounter');
  if (smsText && charCounter) {
    smsText.addEventListener('input', () => {
      updateCharCounter(smsText.value, charCounter);
    });
  }

  // הגשת שליחת SMS
  document.getElementById('submitSendSmsBtn')?.addEventListener('click', () => {
    handleSendSmsSubmit();
  });

  // חיפוש הודעות
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase().trim();
      renderMessages();
    });
  }

  // צמצום והרחבת כל ההודעות
  document.getElementById('toggleAllBtn')?.addEventListener('click', () => {
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

  // סל מחזור
  document.getElementById('trashBtn')?.addEventListener('click', () => {
    isTrashView = !isTrashView;
    const trashHeader = document.getElementById('trashHeader');
    if (trashHeader) trashHeader.style.display = isTrashView ? 'flex' : 'none';

    const tBtn = document.getElementById('trashBtn');
    if (tBtn) {
      tBtn.style.background = isTrashView ? '#f3e8ff' : '#ffffff';
      tBtn.style.borderColor = isTrashView ? '#d8b4fe' : 'var(--border)';
      tBtn.style.color = isTrashView ? 'var(--primary)' : 'var(--text-muted)';
    }

    // אם נכנסים לסל מחזור, מבטלים הדגשת לשונית
    const chips = document.querySelectorAll('.tab-chip');
    if (isTrashView) {
      chips.forEach(c => c.classList.remove('active'));
    } else {
      const activeChip = document.querySelector(`.tab-chip[data-tab="${activeTab}"]`);
      if (activeChip) activeChip.classList.add('active');
    }

    renderMessages();
  });

  // ריקון סל מחזור
  document.getElementById('emptyTrashBtn')?.addEventListener('click', () => {
    if (confirm('האם לרוקן את סל המחזור לחלוטין?')) {
      chrome.storage.local.set({ deletedMessages: [] }, () => {
        deletedMessages = [];
        renderMessages();
      });
    }
  });

  // לשוניות סינון (הכל / לא נקראו / בהמשך / נשלחו)
  const tabChips = document.querySelectorAll('.tab-chip');
  tabChips.forEach(chip => {
    chip.addEventListener('click', () => {
      activeTab = chip.getAttribute('data-tab');
      tabChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      if (isTrashView) {
        isTrashView = false;
        const trashHeader = document.getElementById('trashHeader');
        if (trashHeader) trashHeader.style.display = 'none';
        const tBtn = document.getElementById('trashBtn');
        if (tBtn) {
          tBtn.style.background = '#ffffff';
          tBtn.style.borderColor = 'var(--border)';
          tBtn.style.color = 'var(--text-muted)';
        }
      }

      renderMessages();
    });
  });

  // סגירת פופאובר Snooze בלחיצה מחוץ לתפריט
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.snooze-popover') && !e.target.closest('.snooze-btn')) {
      document.querySelectorAll('.snooze-popover').forEach(p => p.remove());
    }
  });

  // בדיקת תוקף Snooze וטעינת נתונים ראשונית
  checkExpiredSnoozes(() => {
    chrome.storage.local.get(['smsFilters', 'deletedMessages'], (data) => {
      currentFilters = data.smsFilters || [];
      deletedMessages = data.deletedMessages || [];
      loadMessages();
    });
  });

  // בדיקה מחזורית קלה של תוקף Snooze
  periodicCheckInterval = setInterval(() => {
    checkExpiredSnoozes(() => {
      renderMessages();
    });
  }, 4000);
});

// בדיקת עדכון זמין לפי ערוץ (בטא או רגיל)
function checkVersionUpdate() {
  chrome.storage.local.get(['updateChannel', 'updateAvailable'], (data) => {
    const alertBox = document.getElementById('updateAlertBox');
    if (!alertBox) return;

    const manifest = chrome.runtime.getManifest ? chrome.runtime.getManifest() : { version: '4.91' };
    const currentVersion = manifest.version || '4.91';

    const channel = data.updateChannel || 'beta';
    if (channel === 'none') return;

    let targetUrl = 'https://api.github.com/repos/Tzadikvtovlo/PushBox/releases/latest';
    if (channel === 'beta') {
      targetUrl = 'https://api.github.com/repos/Tzadikvtovlo/PushBox/releases';
    }

    fetch(targetUrl)
      .then(res => res.json())
      .then(releaseData => {
        let release = Array.isArray(releaseData) ? releaseData[0] : releaseData;
        if (!release || !release.tag_name) return;

        const latestVersion = release.tag_name.replace(/^v/i, '').trim();
        const lParts = latestVersion.split('.').map(Number);
        const cParts = currentVersion.split('.').map(Number);
        const isNewer = lParts.some((l, i) => l > (cParts[i] || 0));

        if (isNewer) {
          alertBox.style.display = 'block';
          alertBox.textContent = `יש עדכון! מותקן: v${currentVersion} | זמין: v${latestVersion}`;
          alertBox.title = "לחץ כאן להורדה";
          alertBox.onclick = () => window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank');
        }
      })
      .catch(() => {
        if (data.updateAvailable) {
          alertBox.style.display = 'block';
          alertBox.textContent = "עדכון גרסה זמין! לחץ כאן להורדה";
          alertBox.onclick = () => window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank');
        }
      });
  });
}

// טעינת הודעות ישירות משרתי ימות המשיח
async function loadMessages() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], async (data) => {
      const container = document.getElementById('messagesList');
      if (!data.token) {
        if (container) {
          container.innerHTML = '<div class="error">לא הוגדר טוקן במערכת. לחץ על הגדרות.</div>';
        }
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
          if (container) {
            container.innerHTML = '<div class="error">שגיאה במשיכת נתונים או טוקן שגוי.</div>';
          }
        }
      } catch (e) {
        if (container) {
          container.innerHTML = '<div class="error">שגיאת תקשורת מול השרת.</div>';
        }
      }
      resolve();
    });
  });
}

// חישוב תווים וחלקים
function updateCharCounter(text, labelEl) {
  if (!labelEl) return;
  const len = text.length;
  if (len === 0) {
    labelEl.textContent = '0 תווים | חלק 1 (עברית)';
    return;
  }
  const isHebrewOrUnicode = /[^\u0000-\u00ff]/.test(text);
  const maxSingle = isHebrewOrUnicode ? 70 : 160;
  const partSize = isHebrewOrUnicode ? 67 : 153;
  const parts = len <= maxSingle ? 1 : Math.ceil(len / partSize);
  const langName = isHebrewOrUnicode ? 'עברית' : 'אנגלית';
  labelEl.textContent = `${len} תווים | חלק ${parts} (${langName})`;
}

// פתיחת וסגירת מודאל שליחת SMS
function openSendSmsModal(prefillPhone = '') {
  const modal = document.getElementById('sendSmsModal');
  const recipientInput = document.getElementById('smsRecipient');
  const callerIdInput = document.getElementById('smsCallerId');
  const statusEl = document.getElementById('sendSmsStatus');

  if (statusEl) statusEl.style.display = 'none';

  if (prefillPhone && recipientInput) {
    recipientInput.value = prefillPhone;
  }

  chrome.storage.local.get(['phoneNumber'], (data) => {
    if (callerIdInput && data.phoneNumber && !callerIdInput.value) {
      callerIdInput.value = data.phoneNumber;
    }
  });

  if (modal) modal.style.display = 'flex';
  if (recipientInput) setTimeout(() => recipientInput.focus(), 80);
}

function closeSendSmsModal() {
  const modal = document.getElementById('sendSmsModal');
  if (modal) modal.style.display = 'none';
}

function showSmsStatus(msg, type) {
  const statusEl = document.getElementById('sendSmsStatus');
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = `status-alert ${type}`;
  statusEl.style.display = 'block';
}

// ביצוע שליחת ה-SMS
function handleSendSmsSubmit() {
  const recipientInput = document.getElementById('smsRecipient');
  const callerIdInput = document.getElementById('smsCallerId');
  const messageInput = document.getElementById('smsMessageText');
  const submitBtn = document.getElementById('submitSendSmsBtn');

  const phones = recipientInput ? recipientInput.value.trim() : '';
  const callerId = callerIdInput ? callerIdInput.value.trim() : '';
  const message = messageInput ? messageInput.value.trim() : '';

  if (!phones || !message) {
    showSmsStatus('נא למלא מספר נמען ותוכן הודעה', 'error');
    return;
  }

  showSmsStatus('שולח הודעה דרך ימות המשיח...', 'info');
  if (submitBtn) submitBtn.disabled = true;

  chrome.storage.local.get(['token', 'phoneNumber'], async (data) => {
    if (!data.token) {
      showSmsStatus('חסר טוקן - הגדר בהגדרות התוסף', 'error');
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    try {
      const sendUrl = 'https://www.call2all.co.il/ym/api/SendSms';
      const payload = {
        token: data.token,
        phones: phones,
        message: message,
        callerId: callerId || data.phoneNumber || ''
      };

      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (result && (result.responseStatus === 'OK' || result.status === 'success')) {
        showSmsStatus('הודעת ה-SMS נשלחה בהצלחה!', 'success');

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        const sentRecord = {
          id: 'sent_' + Date.now(),
          date: dateStr,
          phones: phones,
          callerId: callerId || data.phoneNumber || '',
          message: message,
          status: 'נשלח בהצלחה'
        };

        chrome.storage.local.get(['sentMessages'], (sentData) => {
          const list = sentData.sentMessages || [];
          list.unshift(sentRecord);
          chrome.storage.local.set({ sentMessages: list.slice(0, 100) }, () => {
            if (activeTab === 'sent') renderMessages();
          });
        });

        if (messageInput) messageInput.value = '';
        updateCharCounter('', document.getElementById('smsCharCounter'));

        setTimeout(() => {
          closeSendSmsModal();
          if (submitBtn) submitBtn.disabled = false;
        }, 1200);
      } else {
        const err = result?.message || result?.error || 'שגיאה בשליחת ה-SMS';
        showSmsStatus(err, 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    } catch (err) {
      showSmsStatus('שגיאת תקשורת: ' + err.message, 'error');
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// בדיקת Snooze שפג תוקפו
function checkExpiredSnoozes(callback) {
  chrome.storage.local.get(['snoozedItems', 'unreadItems', 'unreadCount'], (data) => {
    let snoozed = data.snoozedItems || {};
    let unreadItems = data.unreadItems || [];
    let unreadCount = data.unreadCount || 0;
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

// רינדור רשימת הודעות בעיצוב 4.6 המקורי
function renderMessages() {
  const container = document.getElementById('messagesList');
  if (!container) return;

  // אם בלשונית הודעות שנשלחו
  if (activeTab === 'sent') {
    renderSentMessages(container);
    return;
  }

  container.innerHTML = '';

  chrome.storage.local.get(['unreadItems', 'snoozedItems'], (storageData) => {
    const unreadItems = storageData.unreadItems || [];
    const snoozedItems = storageData.snoozedItems || {};

    let totalUnread = 0;
    let totalSnoozed = 0;

    allMessages.forEach(msg => {
      const msgId = `${msg.receive_date}_${msg.source}`;
      if (!deletedMessages.includes(msgId)) {
        if (unreadItems.includes(msgId)) totalUnread++;
        if (snoozedItems[msgId]) totalSnoozed++;
      }
    });

    const unreadBadge = document.getElementById('unreadCountBadge');
    if (unreadBadge) {
      unreadBadge.textContent = totalUnread;
      unreadBadge.classList.toggle('visible', totalUnread > 0);
    }

    const snoozedBadge = document.getElementById('snoozedCountBadge');
    if (snoozedBadge) {
      snoozedBadge.textContent = totalSnoozed;
      snoozedBadge.classList.toggle('visible', totalSnoozed > 0);
    }

    let filteredMessages = allMessages.filter(msg => {
      const msgId = `${msg.receive_date}_${msg.source}`;
      const isDeleted = deletedMessages.includes(msgId);

      if (isTrashView) {
        return isDeleted;
      } else {
        if (isDeleted) return false;

        if (activeTab === 'unread' && !unreadItems.includes(msgId)) return false;
        if (activeTab === 'snoozed' && !snoozedItems[msgId]) return false;

        for (let f of currentFilters) {
          if (f.type === 'sender' && msg.source === f.value) return false;
          if (f.type === 'contains' && msg.message.includes(f.value)) return false;
          if (f.type === 'not_contains' && !msg.message.includes(f.value)) return false;
        }
        return true;
      }
    });

    if (currentSearchQuery) {
      filteredMessages = filteredMessages.filter(msg => 
        (msg.message && msg.message.toLowerCase().includes(currentSearchQuery)) || 
        (msg.source && msg.source.toLowerCase().includes(currentSearchQuery))
      );
    }

    if (filteredMessages.length === 0) {
      if (isTrashView) {
        container.innerHTML = '<div class="empty">סל המחזור ריק.</div>';
      } else if (activeTab === 'unread') {
        container.innerHTML = '<div class="empty">אין הודעות שלא נקראו.</div>';
      } else if (activeTab === 'snoozed') {
        container.innerHTML = '<div class="empty">אין הודעות הממתינות לקריאה בהמשך.</div>';
      } else {
        container.innerHTML = '<div class="empty">אין הודעות המותאמות לסינון/לחיפוש.</div>';
      }
      return;
    }

    filteredMessages.slice(0, 30).forEach(msg => {
      const card = document.createElement('div');
      const msgId = `${msg.receive_date}_${msg.source}`;
      const isUnread = unreadItems.includes(msgId);
      const isSnoozed = !!snoozedItems[msgId];

      card.className = `msg-card ${isUnread ? 'is-unread' : ''}`;

      // זיהוי קוד אימות ספרתי
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

      // הפיכת קישורים לחיצים
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
        `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>` : 
        `<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

      let remainingMinutes = 0;
      if (isSnoozed) {
        const item = snoozedItems[msgId];
        const wakeTime = typeof item === 'object' && item !== null ? item.wakeTime : Number(item);
        remainingMinutes = Math.max(1, Math.round((wakeTime - Date.now()) / (60 * 1000)));
      }

      const bodyClass = isAllCollapsed ? "msg-body collapsed" : "msg-body";
      const rotateStyle = isAllCollapsed ? "transform: rotate(180deg);" : "";

      card.innerHTML = `
        <div class="msg-header">
          <div class="msg-source-wrapper">
            <span class="msg-source">${msg.source}</span>
            ${isUnread ? `<span class="unread-dot" title="הודעה שלא נקראה"></span>` : ''}
            ${isSnoozed ? `<span class="snooze-tag" title="תזכורת פעילה">🕒 ${remainingMinutes}ד'</span>` : ''}
          </div>
          <div class="msg-controls">
            ${!isTrashView ? `
              <button class="ctrl-btn reply-btn" title="השב להודעה זו ב-SMS">
                <svg class="svg-icon" viewBox="0 0 24 24"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
              </button>
              <button class="ctrl-btn snooze-btn ${isSnoozed ? 'active' : ''}" title="הזכר לי מאוחר יותר (Snooze)">
                <svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              </button>
              <button class="ctrl-btn toggle-unread-btn ${isUnread ? 'active' : ''}" title="${isUnread ? 'סמן כנקרא' : 'סמן כלא נקרא'}">
                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              </button>
              <button class="ctrl-btn filter-sender-btn" title="סנן שולח זה">
                <svg class="svg-icon" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
              </button>
            ` : ''}
            <button class="ctrl-btn collapse-btn" title="צמצם/הרחב">
              <svg class="svg-icon" viewBox="0 0 24 24" style="${rotateStyle}"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <button class="ctrl-btn delete-btn" title="${isTrashView ? 'שחזר הודעה' : 'מחק הודעה'}">
              ${deleteRestoreIcon}
            </button>
          </div>
          <div class="msg-date-wrapper"><span class="msg-date">${msg.receive_date}</span></div>
        </div>
        <div class="${bodyClass}">${displayMsg}</div>
        ${copyBtnHtml}
      `;

      // השב ב-SMS
      card.querySelector('.reply-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openSendSmsModal(msg.source);
      });

      // תפריט Snooze
      card.querySelector('.snooze-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSnoozePopover(card, msgId, isSnoozed);
      });

      // שינוי מצב נקרא / לא נקרא
      card.querySelector('.toggle-unread-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReadStatus(msgId);
      });

      // מסנן שולח
      card.querySelector('.filter-sender-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: `filters.html?sender=${encodeURIComponent(msg.source)}` });
        } else {
          window.open(`filters.html?sender=${encodeURIComponent(msg.source)}`, '_blank');
        }
      });

      // צמצום והרחבה
      card.querySelector('.collapse-btn')?.addEventListener('click', () => {
        const body = card.querySelector('.msg-body');
        const svg = card.querySelector('.collapse-btn svg');
        const isCollapsed = body.classList.toggle('collapsed');
        svg.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
      });

      // מחיקה או שחזור
      card.querySelector('.delete-btn')?.addEventListener('click', () => {
        if (isTrashView) {
          deletedMessages = deletedMessages.filter(id => id !== msgId);
        } else {
          if (!deletedMessages.includes(msgId)) {
            deletedMessages.push(msgId);
          }
        }
        chrome.storage.local.set({ deletedMessages: deletedMessages }, () => {
          renderMessages();
        });
      });

      // כפתור העתקה
      card.querySelector('.btn-copy')?.addEventListener('click', (e) => {
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

// הצגת הודעות שנשלחו בעיצוב 4.6
function renderSentMessages(container) {
  container.innerHTML = '';

  chrome.storage.local.get(['sentMessages'], (data) => {
    const list = data.sentMessages || [];

    if (list.length === 0) {
      container.innerHTML = '<div class="empty">לא נמצאו הודעות SMS שנשלחו מהתוסף.</div>';
      return;
    }

    list.slice(0, 30).forEach(item => {
      const card = document.createElement('div');
      card.className = 'msg-card';

      let text = escapeHtml(item.message || '');
      const displayMsg = text.replace(/\n/g, '<br>');

      card.innerHTML = `
        <div class="msg-header">
          <div class="msg-source-wrapper">
            <span class="msg-source" style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;">אל: ${escapeHtml(item.phones)}</span>
          </div>
          <div class="msg-controls">
            <button class="ctrl-btn resend-sms-btn" title="שלח שוב לנמען זה">
              <svg class="svg-icon" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </div>
          <div class="msg-date-wrapper"><span class="msg-date">${escapeHtml(item.date || '')}</span></div>
        </div>
        <div class="msg-body">${displayMsg}</div>
        <button class="btn-copy">
          <span class="copy-inner">
            <svg class="svg-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            העתק תוכן הודעה
          </span>
        </button>
      `;

      card.querySelector('.resend-sms-btn')?.addEventListener('click', () => {
        openSendSmsModal(item.phones);
        const txt = document.getElementById('smsMessageText');
        if (txt) {
          txt.value = item.message || '';
          updateCharCounter(txt.value, document.getElementById('smsCharCounter'));
        }
      });

      card.querySelector('.btn-copy')?.addEventListener('click', (e) => {
        navigator.clipboard.writeText(item.message);
        const copyInner = e.currentTarget.querySelector('.copy-inner');
        const originalHtml = copyInner.innerHTML;
        copyInner.innerHTML = 'הועתק בהצלחה!';
        setTimeout(() => copyInner.innerHTML = originalHtml, 1500);
      });

      container.appendChild(card);
    });
  });
}

// פופאובר Snooze
function toggleSnoozePopover(card, msgId, isAlreadySnoozed) {
  // סגירת קיימים
  document.querySelectorAll('.snooze-popover').forEach(p => p.remove());

  const popover = document.createElement('div');
  popover.className = 'snooze-popover';

  let html = `
    <button data-mins="10">בעוד 10 דקות</button>
    <button data-mins="30">בעוד 30 דקות</button>
    <button data-mins="60">בעוד שעה</button>
    <button data-mins="180">בעוד 3 שעות</button>
    <button data-mins="tomorrow">מחר בבוקר (09:00)</button>
  `;

  if (isAlreadySnoozed) {
    html += `<button data-mins="cancel" class="danger">בטל תזכורת כעת</button>`;
  }

  popover.innerHTML = html;

  popover.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-mins');
      handleSnoozeSelection(msgId, action);
      popover.remove();
    });
  });

  card.appendChild(popover);
}

// שמירת בחירת Snooze
function handleSnoozeSelection(msgId, action) {
  chrome.storage.local.get(['snoozedItems', 'unreadItems'], (data) => {
    let snoozed = data.snoozedItems || {};
    let unreadItems = data.unreadItems || [];

    if (action === 'cancel') {
      delete snoozed[msgId];
      if (!unreadItems.includes(msgId)) unreadItems.push(msgId);
    } else {
      let wakeTime;
      const now = new Date();

      if (action === 'tomorrow') {
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
        wakeTime = tomorrow.getTime();
      } else {
        const mins = parseInt(action, 10) || 60;
        wakeTime = Date.now() + (mins * 60 * 1000);
      }

      snoozed[msgId] = {
        wakeTime: wakeTime,
        created: Date.now()
      };

      unreadItems = unreadItems.filter(id => id !== msgId);
    }

    chrome.storage.local.set({ snoozedItems: snoozed, unreadItems: unreadItems }, () => {
      renderMessages();
    });
  });
}

// סימון כנקרא / לא נקרא
function toggleReadStatus(msgId) {
  chrome.storage.local.get(['unreadItems'], (data) => {
    let unreadItems = data.unreadItems || [];
    if (unreadItems.includes(msgId)) {
      unreadItems = unreadItems.filter(id => id !== msgId);
    } else {
      unreadItems.push(msgId);
    }
    chrome.storage.local.set({ unreadItems: unreadItems }, () => {
      renderMessages();
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
