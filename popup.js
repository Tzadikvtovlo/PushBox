let currentSearchQuery = "";
let currentFilters = [];
let deletedMessages = [];
let isTrashView = false;
let allMessages = []; 
let isAllCollapsed = false;

document.addEventListener('DOMContentLoaded', () => {
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

  chrome.storage.local.get(['phoneNumber'], (data) => {
    if (data.phoneNumber && data.phoneNumber !== "לא אותר מספר אוטומטית" && data.phoneNumber !== "שגיאה בשליפת המספר") {
      const phoneEl = document.getElementById('systemPhone');
      if (phoneEl) phoneEl.textContent = data.phoneNumber;
    }
  });

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const icon = document.getElementById('refreshIcon');
      if (icon) icon.classList.add('spinning');
      loadMessages().finally(() => setTimeout(() => { if(icon) icon.classList.remove('spinning'); }, 500));
    });
  }

  const resendBtn = document.getElementById('resendBtn');
  if (resendBtn) {
    resendBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'resend-latest-sms' });
    });
  }

  const trashBtn = document.getElementById('trashBtn');
  if (trashBtn) {
    trashBtn.addEventListener('click', () => {
       isTrashView = !isTrashView;
       const trashHeader = document.getElementById('trashHeader');
       if (trashHeader) trashHeader.style.display = isTrashView ? 'flex' : 'none';
       
       trashBtn.style.background = isTrashView ? '#f3e8ff' : '#ffffff';
       trashBtn.style.borderColor = isTrashView ? '#d8b4fe' : 'var(--border)';
       trashBtn.style.color = isTrashView ? 'var(--primary)' : 'var(--text-muted)';
       
       renderMessages();
    });
  }

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

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase();
      renderMessages();
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
});

function checkExpiredSnoozes(callback) {
  chrome.storage.local.get(['snoozedItems', 'unreadItems', 'unreadCount'], (data) => {
    let snoozed = data.snoozedItems || {};
    let unreadItems = data.unreadItems || [];
    let unreadCount = data.unreadCount || 0;
    let changed = false;
    const now = Date.now();

    for (let msgId in snoozed) {
      if (snoozed[msgId] && now >= snoozed[msgId]) {
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

function renderMessages() {
  const container = document.getElementById('messagesList');
  if (!container) return;
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
    filteredMessages = filteredMessages.filter(msg => 
      msg.message.toLowerCase().includes(currentSearchQuery) || 
      msg.source.toLowerCase().includes(currentSearchQuery)
    );
  }

  if (filteredMessages.length === 0) {
    if (isTrashView) {
      container.innerHTML = '<div class="empty">סל המחזור ריק.</div>';
    } else {
      container.innerHTML = '<div class="empty">אין הודעות המותאמות לסינון/לחיפוש.</div>';
    }
    return;
  }

  chrome.storage.local.get(['unreadItems', 'snoozedItems'], (storageData) => {
    const unreadItems = storageData.unreadItems || [];
    const snoozedItems = storageData.snoozedItems || {};

    filteredMessages.slice(0, 20).forEach(msg => {
      const card = document.createElement('div');
      card.className = 'msg-card';
      const msgId = `${msg.receive_date}_${msg.source}`;
      
      const isUnread = unreadItems.includes(msgId);
      if (isUnread) {
        card.style.borderRight = '6px solid #7e22ce';
      }

      if (snoozedItems[msgId]) {
        card.style.opacity = '0.5';
      }

      // מעטפה בעיצוב סגול חזק ובולט מאוד במצב לא נקרא (תואם בדיוק לבקשה ולצבע המסגרת)
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

      card.innerHTML = `
        <div class="msg-header">
          <div class="msg-source-wrapper"><span class="msg-source">${msg.source}</span></div>
          <div class="msg-controls" style="position: relative;">
            <button class="ctrl-btn envelope-toggle-btn" title="סימון כלא נקרא או טיפול בהמשך" style="background:none; border:none; cursor:pointer; padding:0; display:flex; align-items:center;">
              ${envelopeSvg}
            </button>
            <div class="custom-dropdown-menu" style="display:none; position:absolute; left:0; top:22px; background:#fff; border:1px solid var(--border); border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.1); z-index:100; min-width:145px; font-size:12px; text-align:right;">
              <div class="dropdown-item action-unread" style="padding:6px 10px; cursor:pointer; border-bottom:1px solid #f3f4f6; color:var(--text);">✉️ סמן כלא נקרא / נקרא</div>
              <div class="dropdown-item action-s30" style="padding:6px 10px; cursor:pointer; color:var(--text);">⏳ טיפול בהמשך: 30 דק'</div>
              <div class="dropdown-item action-s60" style="padding:6px 10px; cursor:pointer; color:var(--text);">⏳ טיפול בהמשך: שעה</div>
              <div class="dropdown-item action-s1440" style="padding:6px 10px; cursor:pointer; color:var(--text);">⏳ טיפול בהמשך: מחר</div>
              <div class="dropdown-item action-scustom" style="padding:6px 10px; cursor:pointer; color:var(--text);">⏳ תאריך מותאם...</div>
            </div>
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
        <div class="${bodyClass}">${displayMsg}</div>
        ${copyBtnHtml}
      `;

      const envelopeBtn = card.querySelector('.envelope-toggle-btn');
      const dropdownMenu = card.querySelector('.custom-dropdown-menu');

      envelopeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-dropdown-menu').forEach(m => {
          if (m !== dropdownMenu) m.style.display = 'none';
        });
        dropdownMenu.style.display = dropdownMenu.style.display === 'block' ? 'none' : 'block';
      });

      document.addEventListener('click', () => {
        dropdownMenu.style.display = 'none';
      });

      card.querySelector('.action-unread').addEventListener('click', () => {
        dropdownMenu.style.display = 'none';
        chrome.storage.local.get(['unreadItems', 'unreadCount'], (data) => {
          let list = data.unreadItems || [];
          let count = data.unreadCount || 0;
          const index = list.indexOf(msgId);

          if (index > -1) {
            list.splice(index, 1);
            count = Math.max(0, count - 1);
          } else {
            list.push(msgId);
            count += 1;
          }

          chrome.storage.local.set({ unreadItems: list, unreadCount: count }, () => {
            renderMessages();
            chrome.runtime.sendMessage({ action: 'check-now' });
          });
        });
      });

      card.querySelector('.action-s30').addEventListener('click', () => handleSnooze(30, msgId));
      card.querySelector('.action-s60').addEventListener('click', () => handleSnooze(60, msgId));
      card.querySelector('.action-s1440').addEventListener('click', () => handleSnooze(1440, msgId));
      card.querySelector('.action-scustom').addEventListener('click', () => {
        dropdownMenu.style.display = 'none';
        const input = prompt("הכנס מספר דקות לטיפול בהמשך (למשל 120 לשעתיים):", "60");
        const mins = parseInt(input);
        if (!isNaN(mins) && mins > 0) {
          handleSnooze(mins, msgId);
        }
      });

      card.querySelector('.filter-sender-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: `filters.html?sender=${encodeURIComponent(msg.source)}` });
      });

      card.querySelector('.collapse-btn').addEventListener('click', () => {
        const body = card.querySelector('.msg-body');
        const svg = card.querySelector('.collapse-btn svg');
        const isCollapsed = body.classList.toggle('collapsed');
        svg.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
      });

      card.querySelector('.delete-btn').addEventListener('click', () => {
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

function handleSnooze(mins, msgId) {
  const targetTimestamp = Date.now() + (mins * 60 * 1000);
  chrome.alarms.create(`snooze_${msgId}`, { delayInMinutes: mins });
  
  chrome.storage.local.get(['snoozedItems', 'unreadItems', 'unreadCount'], (data) => {
    let snoozed = data.snoozedItems || {};
    let unreadItems = data.unreadItems || [];
    let unreadCount = data.unreadCount || 0;

    snoozed[msgId] = targetTimestamp; // שומר את זמן היעד המדויק לבדיקה מיידית בפתיחה

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