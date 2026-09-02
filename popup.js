let currentSearchQuery = "";
let currentFilters = [];
let deletedMessages = [];
let isTrashView = false;
let allMessages = []; 
let isAllCollapsed = false;

document.addEventListener('DOMContentLoaded', () => {
  // 7. בכל מקרה של פתיחת הפופ-אפ, נאפס את מספר ההודעות שלא נקראו
  chrome.storage.local.set({ unreadCount: 0 });

  // 1. טיפול בבאנר של התרעה על עדכון זמין (עם כיתוב חכם לפי גרסאות)
  chrome.storage.local.get(['updateAvailable'], (data) => {
    if (data.updateAvailable) {
      const alertBox = document.getElementById('updateAlertBox');
      alertBox.style.display = 'block';
      
      const currentVersion = chrome.runtime.getManifest().version;
      
      // משיכת הגרסה המעודכנת בזמן אמת והצגת הנתונים
      fetch('https://api.github.com/repos/Tzadikvtovlo/PushBox/releases/latest')
        .then(res => res.json())
        .then(releaseData => {
           const latestVersion = releaseData.tag_name ? releaseData.tag_name.replace(/^v/i, '').trim() : currentVersion;
           alertBox.textContent = `יש עדכון! מותקן: v${currentVersion} | זמין: v${latestVersion}`;
           alertBox.title = "לחץ כאן להורדה";
        }).catch(() => {
           // גיבוי במקרה של שגיאת רשת
           alertBox.textContent = "עדכון גרסה זמין! לחץ כאן להורדה";
        });

      alertBox.addEventListener('click', () => {
        window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank');
      });
    }
  });

  chrome.storage.local.get(['phoneNumber'], (data) => {
    if (data.phoneNumber && data.phoneNumber !== "לא אותר מספר אוטומטית" && data.phoneNumber !== "שגיאה בשליפת המספר") {
      document.getElementById('systemPhone').textContent = data.phoneNumber;
    }
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    const icon = document.getElementById('refreshIcon');
    icon.classList.add('spinning');
    loadMessages().finally(() => setTimeout(() => icon.classList.remove('spinning'), 500));
  });

  document.getElementById('resendBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'resend-latest-sms' });
  });

  document.getElementById('trashBtn').addEventListener('click', () => {
     isTrashView = !isTrashView;
     const trashHeader = document.getElementById('trashHeader');
     trashHeader.style.display = isTrashView ? 'flex' : 'none';
     
     const tBtn = document.getElementById('trashBtn');
     tBtn.style.background = isTrashView ? '#f3e8ff' : '#ffffff';
     tBtn.style.borderColor = isTrashView ? '#d8b4fe' : 'var(--border)';
     tBtn.style.color = isTrashView ? 'var(--primary)' : 'var(--text-muted)';
     
     renderMessages();
  });

  document.getElementById('toggleAllBtn').addEventListener('click', () => {
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

  document.getElementById('searchInput').addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.toLowerCase();
    renderMessages();
  });

  chrome.storage.local.get(['smsFilters', 'deletedMessages'], (data) => {
    currentFilters = data.smsFilters || [];
    deletedMessages = data.deletedMessages || [];
    loadMessages();
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

    // סינון מחזור
    if (isTrashView) {
      if (!isDeleted) return false;
    } else {
      if (isDeleted) return false;
      
      // סינון לפי הגדרות המסננים
      for (let f of currentFilters) {
        if (f.type === 'sender' && msg.source === f.value) return false;
        if (f.type === 'contains' && msg.message.includes(f.value)) return false;
        if (f.type === 'not_contains' && !msg.message.includes(f.value)) return false;
      }
    }
    return true;
  });

  // סינון לפי חיפוש מלל חופשי
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

  filteredMessages.slice(0, 20).forEach(msg => {
    const card = document.createElement('div');
    card.className = 'msg-card';
    const msgId = `${msg.receive_date}_${msg.source}`;
    
    const codeMatch = msg.message.match(/\b\d{5,8}\b/);
    
    // החלטה איזה טקסט יועתק (קוד או הודעה מלאה)
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
        <div class="msg-controls">
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
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
