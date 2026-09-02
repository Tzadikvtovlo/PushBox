let currentSearchQuery = "";
let currentFilters = [];
let deletedMessages = [];
let isTrashView = false;
let allMessages = []; 
let isAllCollapsed = false;
let activeTab = "all"; // all, unread, snoozed, sent
let periodicCheckInterval = null;

// אייקונים וקטוריים אלגנטיים
const SVG_ICONS = {
  reply: `<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>`,
  snooze: `<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  mail: `<svg class="icon-svg" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`,
  copy: `<svg class="icon-svg" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
  trash: `<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  restore: `<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`,
  send: `<svg class="icon-svg" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`
};

document.addEventListener('DOMContentLoaded', () => {
  // איפוס מונה בלתי נקראים בעת פתיחה
  chrome.storage.local.set({ unreadCount: 0 });

  // בדיקת עדכונים לפי הגדרות המשתמש
  checkVersionUpdate();

  // טעינת מספר מערכת
  chrome.storage.local.get(['phoneNumber'], (data) => {
    if (data.phoneNumber && data.phoneNumber !== "לא אותר מספר אוטומטית" && data.phoneNumber !== "שגיאה בשליפת המספר") {
      const phoneContainer = document.getElementById('systemPhone');
      const phoneText = document.getElementById('systemPhoneText');
      if (phoneContainer && phoneText) {
        phoneText.textContent = data.phoneNumber;
        phoneContainer.style.display = 'inline-flex';
      }
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

  // כפתור הגדרות
  document.getElementById('optionsBtn')?.addEventListener('click', () => {
    if (chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('options.html', '_blank');
    }
  });

  // פתיחת / סגירת ממשק שליחת SMS
  const openSendSmsBtn = document.getElementById('openSendSmsBtn');
  const closeSendSmsBtn = document.getElementById('closeSendSmsBtn');
  const cancelSendBtn = document.getElementById('cancelSendBtn');
  const clearSmsTextBtn = document.getElementById('clearSmsText');

  openSendSmsBtn?.addEventListener('click', () => toggleSendSmsView(true));
  closeSendSmsBtn?.addEventListener('click', () => toggleSendSmsView(false));
  cancelSendBtn?.addEventListener('click', () => toggleSendSmsView(false));
  clearSmsTextBtn?.addEventListener('click', () => {
    const txt = document.getElementById('smsMessageText');
    if (txt) {
      txt.value = '';
      updateCharCounter('', document.getElementById('smsCharCounter'));
    }
  });

  // ספירת תווים בטופס שליחת SMS
  const smsMessageInput = document.getElementById('smsMessageText');
  const charCounterEl = document.getElementById('smsCharCounter');
  if (smsMessageInput && charCounterEl) {
    smsMessageInput.addEventListener('input', () => {
      updateCharCounter(smsMessageInput.value, charCounterEl);
    });
  }

  // הגשת טופס שליחת SMS
  document.getElementById('sendSmsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendSmsSubmit();
  });

  // סרגל חיפוש
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.trim().toLowerCase();
      if (clearSearchBtn) clearSearchBtn.style.display = currentSearchQuery ? 'flex' : 'none';
      renderMessages();
    });
  }
  clearSearchBtn?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      currentSearchQuery = '';
      clearSearchBtn.style.display = 'none';
      renderMessages();
    }
  });

  // לשוניות סינון
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      activeTab = tab;
      
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // יציאה ממצב סל מחזור
      if (isTrashView) {
        isTrashView = false;
        const trashHeader = document.getElementById('trashHeader');
        if (trashHeader) trashHeader.style.display = 'none';
        const trashBtn = document.getElementById('trashBtn');
        if (trashBtn) trashBtn.classList.remove('active');
      }

      // סגירת פאנל שליחת SMS אם היה פתוח
      toggleSendSmsView(false);

      renderMessages();
    });
  });

  // כפתור סל מחזור
  const trashBtn = document.getElementById('trashBtn');
  trashBtn?.addEventListener('click', () => {
    isTrashView = !isTrashView;
    const trashHeader = document.getElementById('trashHeader');
    if (trashHeader) trashHeader.style.display = isTrashView ? 'flex' : 'none';
    trashBtn.classList.toggle('active', isTrashView);

    if (isTrashView) {
      tabButtons.forEach(b => b.classList.remove('active'));
    } else {
      const currentTabEl = document.querySelector(`.tab-btn[data-tab="${activeTab}"]`);
      if (currentTabEl) currentTabEl.classList.add('active');
    }

    renderMessages();
  });

  // ריקון סל מחזור
  document.getElementById('emptyTrashBtn')?.addEventListener('click', () => {
    if (confirm('האם לרוקן את סל המחזור לחלוטין?')) {
      chrome.storage.local.get(['deletedMessages'], (data) => {
        chrome.storage.local.set({ deletedMessages: [] }, () => {
          deletedMessages = [];
          renderMessages();
        });
      });
    }
  });

  // צמצום / הרחבת הכל
  const toggleAllBtn = document.getElementById('toggleAllBtn');
  toggleAllBtn?.addEventListener('click', () => {
    isAllCollapsed = !isAllCollapsed;
    const bodies = document.querySelectorAll('.card-body');
    bodies.forEach(b => {
      b.style.display = isAllCollapsed ? 'none' : 'block';
    });
  });

  // בדיקת פקיעת זמני לקריאה בהמשך (Snooze) וטעינת נתונים
  checkExpiredSnoozes(() => {
    chrome.storage.local.get(['smsFilters', 'deletedMessages'], (data) => {
      currentFilters = data.smsFilters || [];
      deletedMessages = data.deletedMessages || [];
      loadMessages();
    });
  });

  // בדיקה מחזורית קלה של תוקף Snooze בזמן שהפופאפ פתוח
  periodicCheckInterval = setInterval(() => {
    checkExpiredSnoozes(() => {
      renderMessages();
    });
  }, 4000);
});

// סגירת תפריטי דרופדאון בלחיצה בחוץ
document.addEventListener('click', (e) => {
  if (!e.target.closest('.card-actions')) {
    document.querySelectorAll('.snooze-dropdown').forEach(d => d.style.display = 'none');
  }
});

// בדיקת עדכון לפי ערוץ מוגדר
function checkVersionUpdate() {
  chrome.storage.local.get(['updateChannel', 'checkBetaUpdates'], (data) => {
    const channel = data.updateChannel || (data.checkBetaUpdates ? 'beta' : 'stable');
    if (channel === 'none') return;

    const alertBox = document.getElementById('updateAlertBox');
    if (!alertBox) return;

    const currentVersion = chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '4.9';

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
          alertBox.textContent = `עדכון זמין! מותקן: v${currentVersion} | זמין להורדה: v${latestVersion}`;
          alertBox.onclick = () => window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank');
        }
      })
      .catch(() => {});
  });
}

// פתיחה או סגירה של ממשק שליחת SMS
function toggleSendSmsView(show, prefillPhone = '') {
  const panel = document.getElementById('sendSmsPanel');
  const list = document.getElementById('messagesList');
  const recipientInput = document.getElementById('smsRecipient');
  const callerIdInput = document.getElementById('smsCallerId');
  const statusBanner = document.getElementById('sendSmsStatus');

  if (!panel) return;

  if (show) {
    panel.style.display = 'flex';
    if (list) list.style.display = 'none';

    if (statusBanner) {
      statusBanner.style.display = 'none';
      statusBanner.className = 'status-msg';
    }

    if (prefillPhone && recipientInput) {
      recipientInput.value = prefillPhone;
    }

    chrome.storage.local.get(['phoneNumber'], (data) => {
      if (callerIdInput && data.phoneNumber && !callerIdInput.value) {
        callerIdInput.value = data.phoneNumber;
      }
    });

    if (recipientInput) {
      setTimeout(() => recipientInput.focus(), 50);
    }
  } else {
    panel.style.display = 'none';
    if (list) list.style.display = 'flex';
  }
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

// שליחת הודעת SMS מול השרת
function handleSendSmsSubmit() {
  const recipientInput = document.getElementById('smsRecipient');
  const callerIdInput = document.getElementById('smsCallerId');
  const messageInput = document.getElementById('smsMessageText');
  const statusEl = document.getElementById('sendSmsStatus');
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
        showSmsStatus('הודעת SMS נשלחה בהצלחה!', 'success');

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
          chrome.storage.local.set({ sentMessages: list.slice(0, 100) });
        });

        if (messageInput) messageInput.value = '';
        updateCharCounter('', document.getElementById('smsCharCounter'));

        setTimeout(() => {
          toggleSendSmsView(false);
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

function showSmsStatus(msg, type) {
  const statusEl = document.getElementById('sendSmsStatus');
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = `status-msg ${type}`;
  statusEl.style.display = 'block';
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

// טעינת הודעות ישירות משרתי ימות המשיח
async function loadMessages() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], async (data) => {
      const container = document.getElementById('messagesList');
      if (!data.token) {
        if (container) {
          container.innerHTML = `
            <div class="empty-state">
              <span>לא הוגדר טוקן במערכת.</span>
              <button id="goToOptionsBtn" class="btn-send-sms" style="margin-top: 8px;">פתח הגדרות</button>
            </div>
          `;
          document.getElementById('goToOptionsBtn')?.addEventListener('click', () => {
            if (chrome.runtime && chrome.runtime.openOptionsPage) {
              chrome.runtime.openOptionsPage();
            } else {
              window.open('options.html', '_blank');
            }
          });
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
            container.innerHTML = `
              <div class="empty-state">
                <span>שגיאה במשיכת נתונים או טוקן שגוי.</span>
              </div>
            `;
          }
        }
      } catch (e) {
        if (container) {
          container.innerHTML = `
            <div class="empty-state">
              <span>שגיאת תקשורת מול השרת: ${e.message}</span>
            </div>
          `;
        }
      }
      resolve();
    });
  });
}

// רינדור רשימת הודעות
function renderMessages() {
  const container = document.getElementById('messagesList');
  if (!container) return;

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
    if (unreadBadge) unreadBadge.textContent = totalUnread;

    const snoozedBadge = document.getElementById('snoozedCountBadge');
    if (snoozedBadge) snoozedBadge.textContent = totalSnoozed;

    let filtered = allMessages.filter(msg => {
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
      filtered = filtered.filter(msg => 
        msg.message.toLowerCase().includes(currentSearchQuery) || 
        msg.source.toLowerCase().includes(currentSearchQuery)
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span>${isTrashView ? 'סל המחזור ריק' : 'אין הודעות להצגה'}</span>
        </div>
      `;
      return;
    }

    filtered.forEach(msg => {
      const msgId = `${msg.receive_date}_${msg.source}`;
      const isUnread = unreadItems.includes(msgId);
      const isSnoozed = !!snoozedItems[msgId];

      const card = document.createElement('div');
      card.className = `msg-card ${isUnread ? 'is-unread' : ''} ${isSnoozed ? 'is-snoozed' : ''}`;

      let remainingMinutes = 0;
      if (isSnoozed) {
        const item = snoozedItems[msgId];
        const wakeTime = typeof item === 'object' && item !== null ? item.wakeTime : Number(item);
        remainingMinutes = Math.max(1, Math.round((wakeTime - Date.now()) / (60 * 1000)));
      }

      card.innerHTML = `
        <div class="card-header">
          <div class="sender-info">
            <span class="unread-indicator" title="לא נקרא"></span>
            <span class="sender-name">${escapeHtml(msg.source || 'ללא שולח')}</span>
            <span class="msg-date">${escapeHtml(msg.receive_date || '')}</span>
          </div>
          <div class="card-actions">
            ${!isTrashView ? `
              <button class="action-btn reply-btn" title="השב להודעה">
                ${SVG_ICONS.reply}
              </button>
              <button class="action-btn snooze-btn ${isSnoozed ? 'active' : ''}" title="לקריאה בהמשך">
                ${SVG_ICONS.snooze}
              </button>
              <button class="action-btn toggle-read-btn ${isUnread ? 'active' : ''}" title="${isUnread ? 'סמן כנקרא' : 'סמן כלא נקרא'}">
                ${SVG_ICONS.mail}
              </button>
              <button class="action-btn copy-btn" title="העתק תוכן">
                ${SVG_ICONS.copy}
              </button>
              <button class="action-btn delete-btn danger" title="מחק">
                ${SVG_ICONS.trash}
              </button>
            ` : `
              <button class="action-btn restore-btn" title="שחזר הודעה">
                ${SVG_ICONS.restore}
              </button>
            `}
          </div>
        </div>

        ${isSnoozed ? `
          <div class="snooze-info-badge">
            <span>לקריאה בהמשך בעוד כ-${remainingMinutes} דקות</span>
            <button class="snooze-wake-btn" data-msg-id="${msgId}">בטל והחזר כעת</button>
          </div>
        ` : ''}

        <div class="card-body" style="display: ${isAllCollapsed ? 'none' : 'block'};">
          ${escapeHtml(msg.message)}
        </div>

        <div class="snooze-dropdown">
          <button class="snooze-option" data-mins="10">בעוד 10 דקות</button>
          <button class="snooze-option" data-mins="30">בעוד 30 דקות</button>
          <button class="snooze-option" data-mins="60">בעוד שעה</button>
          <button class="snooze-option" data-mins="120">בעוד שעתיים</button>
          <button class="snooze-option" data-mins="240">בעוד 4 שעות</button>
          <button class="snooze-option" data-mins="tomorrow">מחר בבוקר (09:00)</button>
        </div>
      `;

      // אירועי פעולות
      const replyBtn = card.querySelector('.reply-btn');
      replyBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSendSmsView(true, msg.source);
      });

      const toggleReadBtn = card.querySelector('.toggle-read-btn');
      toggleReadBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReadStatus(msgId);
      });

      const copyBtn = card.querySelector('.copy-btn');
      copyBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(msg.message);
        copyBtn.style.color = 'var(--primary)';
        setTimeout(() => copyBtn.style.color = '', 1000);
      });

      const deleteBtn = card.querySelector('.delete-btn');
      deleteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMessage(msgId);
      });

      const restoreBtn = card.querySelector('.restore-btn');
      restoreBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        restoreMessage(msgId);
      });

      // דרופדאון נודניק
      const snoozeBtn = card.querySelector('.snooze-btn');
      const snoozeDropdown = card.querySelector('.snooze-dropdown');
      snoozeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.snooze-dropdown').forEach(d => {
          if (d !== snoozeDropdown) d.style.display = 'none';
        });
        snoozeDropdown.style.display = snoozeDropdown.style.display === 'flex' ? 'none' : 'flex';
      });

      const snoozeOptions = card.querySelectorAll('.snooze-option');
      snoozeOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const minsVal = opt.getAttribute('data-mins');
          applySnooze(msgId, msg, minsVal);
          snoozeDropdown.style.display = 'none';
        });
      });

      const wakeBtn = card.querySelector('.snooze-wake-btn');
      wakeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        wakeSnoozedMessage(msgId);
      });

      container.appendChild(card);
    });
  });
}

// רינדור הודעות שנשלחו
function renderSentMessages(container) {
  container.innerHTML = '';
  chrome.storage.local.get(['sentMessages'], (data) => {
    const list = data.sentMessages || [];
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span>טרם נשלחו הודעות SMS מהתוסף</span>
        </div>
      `;
      return;
    }

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'msg-card is-sent';
      card.innerHTML = `
        <div class="card-header">
          <div class="sender-info">
            <span class="sender-name">אל: ${escapeHtml(item.phones || '')}</span>
            <span class="msg-date">${escapeHtml(item.date || '')}</span>
          </div>
          <span style="font-size: 11px; font-weight: 600; color: var(--sent-text);">${escapeHtml(item.status || 'נשלח')}</span>
        </div>
        <div class="card-body">
          ${escapeHtml(item.message || '')}
        </div>
      `;
      container.appendChild(card);
    });
  });
}

// שינוי מצב נקרא / לא נקרא
function toggleReadStatus(msgId) {
  chrome.storage.local.get(['unreadItems', 'unreadCount'], (data) => {
    let unread = data.unreadItems || [];
    let count = data.unreadCount || 0;

    if (unread.includes(msgId)) {
      unread = unread.filter(id => id !== msgId);
      count = Math.max(0, count - 1);
    } else {
      unread.push(msgId);
      count += 1;
    }

    chrome.storage.local.set({ unreadItems: unread, unreadCount: count }, () => {
      renderMessages();
    });
  });
}

// מחיקת הודעה (העברה לסל מחזור)
function deleteMessage(msgId) {
  chrome.storage.local.get(['deletedMessages', 'unreadItems', 'unreadCount', 'snoozedItems'], (data) => {
    let del = data.deletedMessages || [];
    let unread = data.unreadItems || [];
    let count = data.unreadCount || 0;
    let snoozed = data.snoozedItems || {};

    if (!del.includes(msgId)) del.push(msgId);
    if (unread.includes(msgId)) {
      unread = unread.filter(id => id !== msgId);
      count = Math.max(0, count - 1);
    }
    delete snoozed[msgId];

    chrome.storage.local.set({
      deletedMessages: del,
      unreadItems: unread,
      unreadCount: count,
      snoozedItems: snoozed
    }, () => {
      deletedMessages = del;
      renderMessages();
    });
  });
}

// שחזור הודעה מסל מחזור
function restoreMessage(msgId) {
  chrome.storage.local.get(['deletedMessages'], (data) => {
    let del = (data.deletedMessages || []).filter(id => id !== msgId);
    chrome.storage.local.set({ deletedMessages: del }, () => {
      deletedMessages = del;
      renderMessages();
    });
  });
}

// החלת נודניק
function applySnooze(msgId, msgObj, minsVal) {
  let wakeTime = Date.now();
  if (minsVal === 'tomorrow') {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    tmrw.setHours(9, 0, 0, 0);
    wakeTime = tmrw.getTime();
  } else {
    wakeTime += parseInt(minsVal, 10) * 60 * 1000;
  }

  chrome.storage.local.get(['snoozedItems', 'unreadItems', 'unreadCount'], (data) => {
    let snoozed = data.snoozedItems || {};
    let unread = data.unreadItems || [];
    let count = data.unreadCount || 0;

    snoozed[msgId] = {
      wakeTime: wakeTime,
      source: msgObj.source,
      message: msgObj.message
    };

    if (unread.includes(msgId)) {
      unread = unread.filter(id => id !== msgId);
      count = Math.max(0, count - 1);
    }

    chrome.storage.local.set({
      snoozedItems: snoozed,
      unreadItems: unread,
      unreadCount: count
    }, () => {
      // רישום אזעקה ב-Chrome Alarm
      if (chrome.alarms && chrome.alarms.create) {
        chrome.alarms.create(`snooze_${msgId}`, { when: wakeTime });
      }
      renderMessages();
    });
  });
}

// ביטול נודניק והחזרה מיידית
function wakeSnoozedMessage(msgId) {
  chrome.storage.local.get(['snoozedItems', 'unreadItems', 'unreadCount'], (data) => {
    let snoozed = data.snoozedItems || {};
    let unread = data.unreadItems || [];
    let count = data.unreadCount || 0;

    delete snoozed[msgId];
    if (!unread.includes(msgId)) {
      unread.push(msgId);
      count += 1;
    }

    chrome.storage.local.set({
      snoozedItems: snoozed,
      unreadItems: unread,
      unreadCount: count
    }, () => {
      if (chrome.alarms && chrome.alarms.clear) {
        chrome.alarms.clear(`snooze_${msgId}`);
      }
      renderMessages();
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
