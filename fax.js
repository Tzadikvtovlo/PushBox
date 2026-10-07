// --- הגדרות Cache באמצעות IndexedDB ---
const DB_NAME = 'PushBoxFaxDB';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';

const SPINNER_SVG = `<svg class="svg-icon spinning" viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: 'filename' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePdfToCache(filename, blob) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put({ filename: filename, blob: blob, timestamp: Date.now() });
  } catch (err) {
    console.warn("Failed to cache PDF:", err);
  }
}

async function getPdfFromCache(filename) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(filename);
      request.onsuccess = () => {
        if (request.result) {
          const thirtyDays = 30 * 24 * 60 * 60 * 1000;
          if (Date.now() - request.result.timestamp < thirtyDays) {
            resolve(request.result.blob);
            return;
          } else {
            deletePdfFromCache(filename);
          }
        }
        resolve(null);
      };
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

async function deletePdfFromCache(filename) {
  try {
    const db = await openDB();
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(filename);
  } catch (err) {}
}

async function cleanupOldPdfs() {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (now - cursor.value.timestamp >= thirtyDays) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch (err) {}
}

// --- לוגיקת האפליקציה ---
let allFaxes = [];
let deletedFaxes = [];
let contactsMap = {};
let isTrashView = false;
let currentSearchQuery = "";
let systemToken = "";
let currentFaxPath = "ivr2:/FaxIn"; 

document.addEventListener('DOMContentLoaded', () => {
  cleanupOldPdfs();
  
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
        alertBox.addEventListener('click', () => { window.open('https://github.com/Tzadikvtovlo/PushBox/releases/latest/download/PushBox.zip', '_blank'); });
      }
    }
  });

  document.getElementById('navHome')?.addEventListener('click', () => { window.location.href = 'messages.html'; });
  document.getElementById('navSendSms')?.addEventListener('click', () => { window.location.href = 'send_sms.html'; });
  document.getElementById('navFax')?.addEventListener('click', () => { window.location.href = 'fax.html'; });
  document.getElementById('navOptions')?.addEventListener('click', () => { window.location.href = 'options.html'; });
  document.getElementById('navContacts')?.addEventListener('click', () => { window.location.href = 'contacts.html'; });
  document.getElementById('navFilters')?.addEventListener('click', () => { window.location.href = 'filters.html'; });
  
  // לוגיקת הכפתור השביעי
  const toggleViewBtn = document.getElementById('navToggleView');
  if (toggleViewBtn) {
    if (window.innerWidth < 800) {
      toggleViewBtn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
      toggleViewBtn.title = "פתח במסך מלא";
      toggleViewBtn.addEventListener('click', () => { 
        const currentPage = window.location.pathname.split('/').pop() || 'fax.html';
        chrome.tabs.create({ url: currentPage + window.location.search }); 
      });
    } else {
      toggleViewBtn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>`;
      toggleViewBtn.title = "פתח בחלונית צד";
      toggleViewBtn.addEventListener('click', () => {
        const currentPage = window.location.pathname.split('/').pop() || 'fax.html';
        chrome.storage.local.set({ targetSidePanelPage: currentPage + window.location.search }, () => {
          chrome.windows.getCurrent({ populate: true }, (window) => {
            chrome.runtime.sendMessage({ action: 'open-side-panel', windowId: window.id });
          });
        });
      });
    }
  }

  // הפניה מהירה להגדרות פקס
  document.getElementById('faxSettingsBtn')?.addEventListener('click', () => {
    window.location.href = 'options.html#faxFolderGroup';
  });

  document.querySelectorAll('.email-copy').forEach(el => {
    el.addEventListener('click', (e) => {
      navigator.clipboard.writeText(e.target.innerText);
      const originalText = e.target.innerText;
      e.target.innerText = "הועתק!";
      setTimeout(() => e.target.innerText = originalText, 1500);
    });
  });

  // טעינת הגדרות
  chrome.storage.local.get(['token', 'contacts', 'deletedFaxes', 'faxFolderPath'], (data) => {
    if (!data.token) {
      document.getElementById('faxList').innerHTML = '<div class="loading-main" style="color:#9f1239;">לא הוגדר טוקן. יש להתחבר דרך דף ההגדרות.</div>';
      return;
    }
    systemToken = data.token;
    deletedFaxes = data.deletedFaxes || [];
    currentFaxPath = data.faxFolderPath || "ivr2:/FaxIn";
    
    if (data.contacts) {
      data.contacts.forEach(c => contactsMap[c.phone] = c.name);
    }
    
    fetchFaxes();
  });

  // חיפוש
  document.getElementById('searchInput').addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.toLowerCase();
    renderFaxes();
  });

  // רענון
  document.getElementById('refreshBtn').addEventListener('click', () => {
    const icon = document.getElementById('refreshIcon');
    icon.classList.add('spinning');
    fetchFaxes().finally(() => setTimeout(() => icon.classList.remove('spinning'), 500));
  });

  // סל מחזור
  document.getElementById('trashBtn').addEventListener('click', () => {
    isTrashView = !isTrashView;
    document.getElementById('trashHeader').style.display = isTrashView ? 'flex' : 'none';
    const tBtn = document.getElementById('trashBtn');
    tBtn.style.background = isTrashView ? '#f3e8ff' : '#ffffff';
    tBtn.style.borderColor = isTrashView ? '#d8b4fe' : 'var(--border)';
    tBtn.style.color = isTrashView ? 'var(--primary)' : 'var(--text-muted)';
    renderFaxes();
  });

  // סגירת מודאל
  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('pdfModal').classList.remove('show');
    document.getElementById('modalPdfFrame').src = '';
  });

  // סגירת מודאל בלחיצה על הרקע הכהה
  document.getElementById('pdfModal').addEventListener('click', (e) => {
    if (e.target.id === 'pdfModal') {
      document.getElementById('pdfModal').classList.remove('show');
      document.getElementById('modalPdfFrame').src = '';
    }
  });
});

async function fetchFaxes() {
  const listContainer = document.getElementById('faxList');
  listContainer.innerHTML = `<div class="loading-main">טוען פקסים מהמערכת... ${SPINNER_SVG}</div>`;
  
  try {
    let url = `https://www.call2all.co.il/ym/api/GetIVR2Dir?token=${encodeURIComponent(systemToken)}&path=${encodeURIComponent(currentFaxPath)}`;
    let res = await fetch(url);
    let json = await res.json();
    
    // ניסיון לנתיב חלופי רק אם המשתמש נשאר עם הברירת מחדל
    if (json.responseStatus !== 'OK' && currentFaxPath === "ivr2:/FaxIn") {
      currentFaxPath = "ivr2:/FAXIN";
      url = `https://www.call2all.co.il/ym/api/GetIVR2Dir?token=${encodeURIComponent(systemToken)}&path=${encodeURIComponent(currentFaxPath)}`;
      res = await fetch(url);
      json = await res.json();
    }
    
    if (json.responseStatus === 'OK' && json.files) {
      allFaxes = json.files.filter(f => f.name && f.name.toLowerCase().endsWith('.pdf'));
      
      if(allFaxes.length === 0) {
         listContainer.innerHTML = '<div class="empty-main">התיקייה קיימת, אך לא נמצאו בה קבצי PDF.</div>';
         return;
      }

      allFaxes.sort((a, b) => b.name.localeCompare(a.name));
      renderFaxes();
    } else {
      listContainer.innerHTML = `<div class="loading-main" style="color:#9f1239;">לא הצלחנו לאתר את התיקייה (${currentFaxPath}) במערכת. באפשרותך לשנות את הנתיב בהגדרות.</div>`;
    }
  } catch (err) {
    listContainer.innerHTML = '<div class="loading-main" style="color:#9f1239;">שגיאת תקשורת מול השרת.</div>';
  }
}

function parseFaxFilename(filename) {
  const regex = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2}).*?From-(.*?)-To-(.*?)\.pdf$/i;
  const match = filename.match(regex);
  
  if (match) {
    const year = match[1];
    const month = match[2];
    const day = match[3];
    const hour = match[4];
    const min = match[5];
    const sender = match[6];
    
    const formattedDate = `${day}/${month}/${year} בשעה ${hour}:${min}`;
    return { sender, date: formattedDate, raw: filename };
  }
  
  return { sender: 'לא ידוע', date: 'תאריך לא ידוע', raw: filename };
}

function renderFaxes() {
  const container = document.getElementById('faxList');
  container.innerHTML = '';

  let filtered = allFaxes.filter(fax => {
    const isDeleted = deletedFaxes.includes(fax.name);
    if (isTrashView && !isDeleted) return false;
    if (!isTrashView && isDeleted) return false;
    return true;
  });

  if (currentSearchQuery) {
    filtered = filtered.filter(fax => {
      const parsed = parseFaxFilename(fax.name);
      const contactName = contactsMap[parsed.sender] || "";
      return parsed.sender.includes(currentSearchQuery) || 
             contactName.toLowerCase().includes(currentSearchQuery) || 
             fax.name.toLowerCase().includes(currentSearchQuery);
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-main">${isTrashView ? 'סל המחזור ריק.' : 'לא נמצאו פקסים לסינון זה.'}</div>`;
    return;
  }

  filtered.slice(0, 30).forEach(fax => {
    const parsed = parseFaxFilename(fax.name);
    const displayName = contactsMap[parsed.sender] ? `${contactsMap[parsed.sender]} (${parsed.sender})` : parsed.sender;
    
    const card = document.createElement('div');
    card.className = 'fax-card';
    
    const deleteIcon = isTrashView 
      ? `<svg class="svg-icon" viewBox="0 0 24 24" title="שחזר פקס"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>` 
      : `<svg class="svg-icon" viewBox="0 0 24 24" title="מחק פקס"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    card.innerHTML = `
      <div class="fax-header">
        <div class="fax-info" title="לחץ לפתיחה/סגירה של הפקס">
          <span class="fax-sender">מאת: ${displayName}</span>
          <span class="fax-date">התקבל ב: ${parsed.date}</span>
        </div>
        <div class="fax-controls">
          <button class="ctrl-btn expand-btn" title="פתח/סגור פקס">
            <svg class="svg-icon expand-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <button class="ctrl-btn delete-btn">
            ${deleteIcon}
          </button>
        </div>
      </div>
      <div class="fax-preview-container">
        <div class="loading-pdf">טוען מסמך... ${SPINNER_SVG}</div>
      </div>
    `;

    const infoArea = card.querySelector('.fax-info');
    const expandBtn = card.querySelector('.expand-btn');
    const expandIcon = card.querySelector('.expand-icon');
    const previewContainer = card.querySelector('.fax-preview-container');
    const deleteBtn = card.querySelector('.delete-btn');

    const toggleExpand = async () => {
      const isOpen = previewContainer.classList.toggle('open');
      expandIcon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';

      if (isOpen && !card.dataset.loadedPdf) {
        try {
          let blob = await getPdfFromCache(fax.name);
          
          if (!blob) {
            const downloadUrl = `https://www.call2all.co.il/ym/api/DownloadFile?token=${encodeURIComponent(systemToken)}&path=${encodeURIComponent(currentFaxPath + '/' + fax.name)}`;
            const response = await fetch(downloadUrl);
            
            if (!response.ok) throw new Error("Failed to download");
            
            const buffer = await response.arrayBuffer();
            blob = new Blob([buffer], { type: 'application/pdf' }); 
            
            await savePdfToCache(fax.name, blob);
          }
          
          const blobUrl = URL.createObjectURL(blob);
          
          card.currentBlobUrl = blobUrl;
          
          previewContainer.innerHTML = `
            <div class="pdf-wrapper">
              <div class="pdf-toolbar">
                <button class="tool-btn btn-enlarge" title="הצג במסך מלא">
                  <svg class="svg-icon" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                </button>
                <button class="tool-btn btn-rotate" title="סובב ימינה">
                  <svg class="svg-icon" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                </button>
                <button class="tool-btn btn-print" title="הדפס">
                  <svg class="svg-icon" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                </button>
                <button class="tool-btn btn-download" title="הורד מסמך">
                  <svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
              </div>
              <iframe src="${card.currentBlobUrl}#navpanes=0&toolbar=0&view=FitH" class="pdf-frame"></iframe>
            </div>
          `;
          card.dataset.loadedPdf = "true";

          const iframe = previewContainer.querySelector('.pdf-frame');
          
          const enlargeAction = () => {
            document.getElementById('modalTitle').textContent = `פקס מאת: ${displayName}`;
            document.getElementById('modalPdfFrame').src = card.currentBlobUrl;
            document.getElementById('pdfModal').classList.add('show');
          };

          previewContainer.querySelector('.btn-enlarge').addEventListener('click', enlargeAction);
          previewContainer.querySelector('.pdf-wrapper').addEventListener('dblclick', enlargeAction);

          let rotationDegree = 0;
          previewContainer.querySelector('.btn-rotate').addEventListener('click', async () => {
            rotationDegree = (rotationDegree + 90) % 360;
            
            if (card.currentBlobUrl !== blobUrl) {
              URL.revokeObjectURL(card.currentBlobUrl);
            }

            if (rotationDegree === 0) {
              card.currentBlobUrl = blobUrl;
              iframe.src = card.currentBlobUrl + '#navpanes=0&toolbar=0&view=FitH';
              return;
            }

            const btn = previewContainer.querySelector('.btn-rotate');
            const originalSvg = btn.innerHTML;
            btn.innerHTML = SPINNER_SVG;

            try {
              const buffer = await blob.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let pdfString = "";
              const chunkSize = 65536;
              for (let i = 0; i < bytes.length; i += chunkSize) {
                pdfString += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
              }

              pdfString = pdfString.replace(/\/Type\s*\/Page\b/g, `/Type /Page /Rotate ${rotationDegree} `);

              const newBytes = new Uint8Array(pdfString.length);
              for (let i = 0; i < pdfString.length; i++) {
                newBytes[i] = pdfString.charCodeAt(i);
              }

              const rotatedBlob = new Blob([newBytes], { type: 'application/pdf' });
              card.currentBlobUrl = URL.createObjectURL(rotatedBlob);
              iframe.src = card.currentBlobUrl + '#navpanes=0&toolbar=0&view=FitH';
            } catch (err) {
              console.error("שגיאה בסיבוב המסמך נטיבית", err);
            }
            
            btn.innerHTML = originalSvg;
          });

          previewContainer.querySelector('.btn-print').addEventListener('click', () => {
            const printIframe = document.createElement('iframe');
            printIframe.style.display = 'none';
            printIframe.src = card.currentBlobUrl;
            document.body.appendChild(printIframe);
            printIframe.onload = function() {
              setTimeout(() => {
                printIframe.contentWindow.focus();
                printIframe.contentWindow.print();
              }, 500);
            };
          });

          previewContainer.querySelector('.btn-download').addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = card.currentBlobUrl;
            a.download = fax.name;
            a.click();
          });

        } catch (err) {
          previewContainer.innerHTML = '<div class="loading-pdf" style="color:#9f1239;">שגיאה בטעינת המסמך מהמערכת.</div>';
        }
      }
    };

    infoArea.addEventListener('click', toggleExpand);
    expandBtn.addEventListener('click', toggleExpand);

    deleteBtn.addEventListener('click', () => {
      if (isTrashView) {
        deletedFaxes = deletedFaxes.filter(f => f !== fax.name);
      } else {
        if (!deletedFaxes.includes(fax.name)) deletedFaxes.push(fax.name);
      }
      chrome.storage.local.set({ deletedFaxes: deletedFaxes }, renderFaxes);
    });

    container.appendChild(card);
  });
}