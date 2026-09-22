const port = chrome.runtime.connect({ name: "popup" });

let currentSearchQuery = "";
let currentFilters = [];
let deletedMessages = [];
let snoozedMessages = {};
let collapsedMessages = [];
let isTrashView = false;
let isComposeView = false;
let allMessages = []; 
let isAllCollapsed = false;
let contactsMap = {};

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.set({ unreadCount: 0 });

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
           alertBox.title = "לחץ כאן להורדה";
        }).catch(() => {
           alertBox.textContent = "עדכון גרסה זמין! לחץ כאן להורדה";
        });
      alertBox.addEventListener('click', () => { window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank'); });
    }
  });

  chrome.storage.local.get(['phoneNumber'], (data) => {
    if (data.phoneNumber && data.phoneNumber !== "לא אותר מספר אוטומטית" && data.phoneNumber !== "שגיאה בשליפת המספר") {
      document.getElementById('systemPhone').textContent = data.phoneNumber;
    }
  });

  const composeBtn = document.getElementById('composeBtn');
  const composePanel = document.getElementById('composePanel');
  const cancelComposeBtn = document.getElementById('cancelComposeBtn');
  const sendSmsActionBtn = document.getElementById('sendSmsActionBtn');
  const messagesList = document.getElementById('messagesList');
  const searchInput = document.getElementById('searchInput');
  const smsToInput = document.getElementById('smsTo');
  const smsBodyInput = document.getElementById('smsBody');
  const trashHeader = document.getElementById('trashHeader');
  const openDedicatedSmsBtn = document.getElementById('openDedicatedSmsBtn');

  chrome.storage.local.get(['draftSmsTo', 'draftSmsBody'], (data) => {
    if (data.draftSmsTo) smsToInput.value = data.draftSmsTo;
    if (data.draftSmsBody) smsBodyInput.value = data.draftSmsBody;
  });

  smsToInput.addEventListener('input', () => chrome.storage.local.set({ draftSmsTo: smsToInput.value }));
  smsBodyInput.addEventListener('input', () => chrome.storage.local.set({ draftSmsBody: smsBodyInput.value }));

  function toggleComposeView(prefillTo = '') {
    if (prefillTo && typeof prefillTo === 'string') {
      smsToInput.value = prefillTo;
      chrome.storage.local.set({ draftSmsTo: prefillTo });
      isComposeView = false;
    }
    
    isComposeView = !isComposeView;
    if (isComposeView) {
      composePanel.style.display = 'flex';
      messagesList.style.display = 'none';
      trashHeader.style.display = 'none';
      composeBtn.classList.add('active');
      populateContactsDatalist();
    } else {
      composePanel.style.display = 'none';
      messagesList.style.display = 'block';
      if (isTrashView) trashHeader.style.display = 'flex';
      composeBtn.classList.remove('active');
    }
  }

  composeBtn.addEventListener('click', toggleComposeView);
  cancelComposeBtn.addEventListener('click', toggleComposeView);

  openDedicatedSmsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'send_sms.html' });
  });

  sendSmsActionBtn.addEventListener('click', async () => {
    let to = smsToInput.value.trim();
    const body = smsBodyInput.value.trim();
    if (!to || !body) return alert("אנא הזן מספר נמען ותוכן הודעה.");
    
    if (to.includes(' - ')) {
      to = to.split(' - ')[1].trim();
    }
    
    sendSmsActionBtn.textContent = "שולח...";
    sendSmsActionBtn.style.pointerEvents = "none";
    
    chrome.storage.local.get(['token'], async (data) => {
      try {
        const url = `https://www.call2all.co.il/ym/api/SendSms?token=${encodeURIComponent(data.token)}&phones=${encodeURIComponent(to)}&message=${encodeURIComponent(body)}`;
        const res = await fetch(url);
        const json = await res.json();
        
        if (json && json.responseStatus === 'OK') {
          sendSmsActionBtn.textContent = "נשלח בהצלחה!";
          chrome.storage.local.set({ draftSmsTo: '', draftSmsBody: '' });
          setTimeout(() => {
            toggleComposeView();
            smsToInput.value = '';
            smsBodyInput.value = '';
            sendSmsActionBtn.textContent = "שלח הודעה";
            sendSmsActionBtn.style.pointerEvents = "auto";
          }, 1500);
        } else {
          alert("שגיאה בשליחה מול השרת");
          sendSmsActionBtn.textContent = "שלח הודעה";
          sendSmsActionBtn.style.pointerEvents = "auto";
        }
      } catch (err) {
        alert("שגיאת רשת בעת שליחת הודעה");
        sendSmsActionBtn.textContent = "שלח הודעה";
        sendSmsActionBtn.style.pointerEvents = "auto";
      }
    });
  });

  function populateContactsDatalist() {
    chrome.storage.local.get(['contacts'], (data) => {
      const datalist = document.getElementById('contactsDataList');
      datalist.innerHTML = '';
      const contacts = data.contacts || [];
      contacts.forEach(c => {
        const option = document.createElement('option');
        option.value = `${c.name} - ${c.phone}`;
        datalist.appendChild(option);
      });
    });
  }

  document.getElementById('refreshBtn').addEventListener('click', () => {
    const icon = document.getElementById('refreshIcon');
    icon.classList.add('spinning');
    loadMessages().finally(() => setTimeout(() => icon.classList.remove('spinning'), 500));
  });

  document.getElementById('resendBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'resend-latest-sms' });
  });

  document.getElementById('trashBtn').addEventListener('click', () => {
     if (isComposeView) toggleComposeView();
     isTrashView = !isTrashView;
     trashHeader.style.display = isTrashView ? 'flex' : 'none';
     
     const tBtn = document.getElementById('trashBtn');
     tBtn.style.background = isTrashView ? '#f3e8ff' : '#ffffff';
     tBtn.style.borderColor = isTrashView ? '#d8b4fe' : 'var(--border)';
     tBtn.style.color = isTrashView ? 'var(--primary)' : 'var(--text-muted)';
     
     renderMessages();
  });

  document.getElementById('toggleAllBtn').addEventListener('click', () => {
    isAllCollapsed = !isAllCollapsed;
    document.querySelectorAll('.msg-card').forEach(card => {
      const body = card.querySelector('.msg-body');
      const svg = card.querySelector('.collapse-btn svg');
      const msgId = card.dataset.msgId;
      
      if (isAllCollapsed) {
        body.classList.add('collapsed');
        svg.style.transform = 'rotate(180deg)';
        if (!collapsedMessages.includes(msgId)) collapsedMessages.push(msgId);
      } else {
        body.classList.remove('collapsed');
        svg.style.transform = 'rotate(0deg)';
        collapsedMessages = collapsedMessages.filter(id => id !== msgId);
      }
    });
    chrome.storage.local.set({ collapsedMessages });
  });

  searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.toLowerCase();
    renderMessages();
  });

  chrome.storage.local.get(['smsFilters', 'deletedMessages', 'snoozedMessages', 'collapsedMessages', 'contacts'], (data) => {
    currentFilters = data.smsFilters || [];
    deletedMessages = data.deletedMessages || [];
    snoozedMessages = data.snoozedMessages || {};
    collapsedMessages = data.collapsedMessages || [];
    
    contactsMap = {};
    if (data.contacts) {
      data.contacts.forEach(c => contactsMap[c.phone] = c.name);
    }
    
    loadMessages();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'refresh-messages') loadMessages();
  });
});

async function loadMessages() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], async (data) => {
      if (!data.token) {
         document.getElementById('messagesList').innerHTML = '<div class="error">לא הוגדר טוקן במערכת. לחץ על הגדרות.</div>';
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
           document.getElementById('messagesList').innerHTML = '<div class="error">שגיאה במשיכת נתונים או טוקן שגוי.</div>';
        }
      } catch (e) {
        document.getElementById('messagesList').innerHTML = '<div class="error">שגיאת תקשורת מול השרת.</div>';
      }
      resolve();
    });
  });
}

function renderMessages() {
  const container = document.getElementById('messagesList');
  container.innerHTML = '';

  let filteredMessages = allMessages.filter(msg => {
    const msgId = `${msg.receive_date}_${msg.source}`;
    const isDeleted = deletedMessages.includes(msgId);

    if (isTrashView) {
      if (!isDeleted) return false;
    } else {
      if (isDeleted) return false;
      for (let f of currentFilters) {
        if (f.type === 'sender' && msg.source === f.value) return false;
        if (f.type === 'contains' && msg.message.includes(f.value)) return false;
        if (f.type === 'not_contains' && !msg.message.includes(f.value)) return false;
      }
    }
    return true;
  });

  if (currentSearchQuery) {
    filteredMessages = filteredMessages.filter(msg => {
      const displaySource = contactsMap[msg.source] || msg.source;
      return msg.message.toLowerCase().includes(currentSearchQuery) || 
             displaySource.toLowerCase().includes(currentSearchQuery) ||
             msg.source.toLowerCase().includes(currentSearchQuery);
    });
  }

  if (filteredMessages.length === 0) {
    if (isTrashView) {
      container.innerHTML = '<div class="empty">סל המחזור ריק.</div>';
    } else {
      container.innerHTML = '<div class="empty">אין הודעות המותאמות לסינון/לחיפוש.</div>';
    }
    return;
  }

  filteredMessages.slice(0, 20).forEach(msg => {
    const card = document.createElement('div');
    const msgId = `${msg.receive_date}_${msg.source}`;
    card.className = 'msg-card';
    card.dataset.msgId = msgId;
    
    const isSnoozed = snoozedMessages.hasOwnProperty(msgId);
    if (isSnoozed) card.classList.add('snoozed');

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
           העתק הודעה
         </span>
       </button>`;
    }

    let text = escapeHtml(msg.message || '');
    text = text.replace(/[\r\n]+/g, '\n').trim();
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{2,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;
    const links = [];
    text = text.replace(urlRegex, (url) => { links.push(url); return `__URL_${links.length - 1}__`; });
    text = text.replace(/__URL_(\d+)__/g, (match, index) => {
      let href = links[index].replace(/&amp;/g, '&');
      if (!href.match(/^https?:\/\//i)) href = 'https://' + href;
      return `<a href="${href}" target="_blank" style="color: var(--primary); text-decoration: underline; font-weight: bold; direction: ltr; display: inline-block;">${links[index]}</a>`;
    });
    const displayMsg = text.replace(/\n/g, '<br>');

    const deleteRestoreIcon = isTrashView ? 
      `<svg class="svg-icon" viewBox="0 0 24 24" title="שחזר הודעה"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>` : 
      `<svg class="svg-icon" viewBox="0 0 24 24" title="מחק הודעה"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    const isCardCollapsed = collapsedMessages.includes(msgId);
    const bodyClass = isCardCollapsed ? "msg-body collapsed" : "msg-body";
    const rotateStyle = isCardCollapsed ? "transform: rotate(180deg);" : "";
    const displayName = contactsMap[msg.source] || msg.source;

    // הרכבת כפתורי ה-Snooze - תלוי אם כבר מסומן או לא
    let snoozeActionsHtml = '';
    if (isSnoozed) {
      snoozeActionsHtml = `
        <button class="snooze-btn cancel-snooze-btn">ביטול (סומן כטופל)</button>
        <button class="snooze-btn custom-snooze-trigger">מותאם אישית</button>
      `;
    } else {
      snoozeActionsHtml = `
        <button class="snooze-btn unread-snooze-btn">לא נקרא</button>
        <button class="snooze-btn hour-snooze-btn">עוד שעה</button>
        <button class="snooze-btn custom-snooze-trigger">מותאם אישית</button>
      `;
    }

    card.innerHTML = `
      <div class="msg-header">
        <div class="msg-source-wrapper"><span class="msg-source" title="${msg.source}">${displayName}</span></div>
        <div class="msg-controls">
          <button class="ctrl-btn reply-msg-btn" title="השב (שלח SMS)">
            <svg class="svg-icon" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
          <button class="ctrl-btn filter-msg-btn" title="סנן שולח זה">
            <svg class="svg-icon" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
          </button>
          <button class="ctrl-btn snooze-action-btn" title="טפל בהמשך / לא נקרא">
            <svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
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
      
      <div class="snooze-overlay" style="display:none;">
        <div class="snooze-actions">
          ${snoozeActionsHtml}
        </div>
        <div class="custom-snooze-picker" style="display:none; width:100%; gap:4px; align-items:center;">
           <input type="datetime-local" class="snooze-custom-time" style="flex:1; border:1px solid #d8b4fe; border-radius:6px; font-size:12px; padding:6px; outline:none; color:var(--purple-main); background:#faf5ff;">
           <button class="snooze-btn confirm-custom" style="flex:0 0 35px; padding:6px;">✔</button>
           <button class="snooze-btn cancel-custom" style="flex:0 0 35px; padding:6px; color:#9f1239; background:#fff; border-color:#fbcfe8;">✖</button>
        </div>
      </div>

      <div class="${bodyClass}">${displayMsg}</div>
      ${copyBtnHtml}
    `;

    card.querySelector('.collapse-btn').addEventListener('click', () => {
      const body = card.querySelector('.msg-body');
      const svg = card.querySelector('.collapse-btn svg');
      const isCollapsed = body.classList.toggle('collapsed');
      svg.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
      if (isCollapsed) {
        if (!collapsedMessages.includes(msgId)) collapsedMessages.push(msgId);
      } else {
        collapsedMessages = collapsedMessages.filter(id => id !== msgId);
      }
      chrome.storage.local.set({ collapsedMessages });
    });

    card.querySelector('.filter-msg-btn').addEventListener('click', () => {
      chrome.tabs.create({ url: `filters.html?sender=${encodeURIComponent(msg.source)}` });
    });

    card.querySelector('.reply-msg-btn').addEventListener('click', () => {
      const replyTo = contactsMap[msg.source] ? `${contactsMap[msg.source]} - ${msg.source}` : msg.source;
      const smsToInput = document.getElementById('smsTo');
      smsToInput.value = replyTo;
      chrome.storage.local.set({ draftSmsTo: replyTo });
      if (!isComposeView) {
        document.getElementById('composeBtn').click();
      }
    });

    const snoozeOverlay = card.querySelector('.snooze-overlay');
    const snoozeTrigger = card.querySelector('.snooze-action-btn');
    const snoozeActions = card.querySelector('.snooze-actions');
    const customTrigger = card.querySelector('.custom-snooze-trigger');
    const customPicker = card.querySelector('.custom-snooze-picker');
    const customInput = card.querySelector('.snooze-custom-time');
    const confirmCustom = card.querySelector('.confirm-custom');
    const cancelCustom = card.querySelector('.cancel-custom');

    snoozeTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      snoozeOverlay.style.display = snoozeOverlay.style.display === 'flex' ? 'none' : 'flex';
      customPicker.style.display = 'none';
      snoozeActions.style.display = 'flex';
    });

    if (customTrigger) {
      customTrigger.addEventListener('click', () => {
        snoozeActions.style.display = 'none';
        customPicker.style.display = 'flex';
        const tzoffset = (new Date()).getTimezoneOffset() * 60000;
        customInput.value = (new Date(Date.now() + 3600000 - tzoffset)).toISOString().slice(0, 16);
      });
    }

    if (cancelCustom) {
      cancelCustom.addEventListener('click', () => {
        customPicker.style.display = 'none';
        snoozeActions.style.display = 'flex';
      });
    }

    if (confirmCustom) {
      confirmCustom.addEventListener('click', () => {
        if (!customInput.value) return;
        const alertAt = new Date(customInput.value).getTime();
        if (alertAt > Date.now()) {
          snoozedMessages[msgId] = { alertAt, message: msg.message, source: msg.source };
          chrome.storage.local.set({ snoozedMessages }, renderMessages);
        }
      });
    }

    const unreadBtn = card.querySelector('.unread-snooze-btn');
    if (unreadBtn) {
      unreadBtn.addEventListener('click', () => {
        snoozeOverlay.style.display = 'none';
        chrome.storage.local.get(['unreadCount'], (data) => {
          chrome.storage.local.set({ unreadCount: (data.unreadCount || 0) + 1 }, () => {
            card.style.border = '2px solid #c084fc';
            setTimeout(() => { card.style.border = ''; }, 1000);
          });
        });
      });
    }

    const hourBtn = card.querySelector('.hour-snooze-btn');
    if (hourBtn) {
      hourBtn.addEventListener('click', () => {
        const alertAt = Date.now() + (60 * 60 * 1000);
        snoozedMessages[msgId] = { alertAt, message: msg.message, source: msg.source };
        chrome.storage.local.set({ snoozedMessages }, renderMessages);
      });
    }

    const cancelSnoozeBtn = card.querySelector('.cancel-snooze-btn');
    if (cancelSnoozeBtn) {
      cancelSnoozeBtn.addEventListener('click', () => {
        delete snoozedMessages[msgId];
        chrome.storage.local.set({ snoozedMessages }, renderMessages);
      });
    }

    card.querySelector('.delete-btn').addEventListener('click', () => {
      if (isTrashView) {
        deletedMessages = deletedMessages.filter(id => id !== msgId);
      } else {
        if (!deletedMessages.includes(msgId)) deletedMessages.push(msgId);
      }
      chrome.storage.local.set({ deletedMessages: deletedMessages }, renderMessages);
    });

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
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
