console.log("=== Yemot Background Worker Loaded Successfully ===");

const ALARM_NAME = 'checkYemotSmsAlarm';

chrome.runtime.onInstalled.addListener(() => {
  initAlarmAndStorage();
  checkForUpdates();
  checkForNewSms(true);
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarmExists();
  checkForUpdates();
  checkForNewSms(true);
});

updateBadgeAndTooltip();

function setHourglassBadge() {
  chrome.action.setBadgeText({ text: "⏳" });
  chrome.action.setBadgeBackgroundColor({ color: '#6b21a8' });
  chrome.action.setTitle({ title: "בודק נתונים..." });
}

function updateBadgeAndTooltip() {
  chrome.storage.local.get(['unreadCount', 'updateAvailable', 'connectionError', 'notificationStyle'], (data) => {
    const unreadCount = data.unreadCount || 0;
    const updateAvailable = data.updateAvailable || false;
    const connectionError = data.connectionError || "";
    const notificationStyle = data.notificationStyle || "both";

    let text = "";
    let bgColor = "#6b21a8";
    let title = "PushBox";

    if (unreadCount > 0 && (notificationStyle === 'both' || notificationStyle === 'badge')) {
      text = String(unreadCount);
      title = `${unreadCount} הודעות חדשות`;
    } else if (connectionError) {
      text = "X";
      title = connectionError;
    } else if (updateAvailable) {
      text = "!";
      title = "יש עדכון חדש";
    }

    chrome.action.setBadgeText({ text: text });
    if (text) {
      chrome.action.setBadgeBackgroundColor({ color: bgColor });
    }
    chrome.action.setTitle({ title: title });
  });
}

function initAlarmAndStorage() {
  chrome.storage.local.get(['interval', 'checkInterval'], (data) => {
    let interval = 1;
    if (data.interval !== undefined) interval = data.interval;
    else if (data.checkInterval !== undefined) interval = data.checkInterval;
    
    chrome.storage.local.set({ interval: interval }, () => {
      setupAlarm(interval);
    });
  });
}

function ensureAlarmExists() {
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.storage.local.get(['interval'], (data) => {
        const interval = data.interval !== undefined ? data.interval : 1;
        setupAlarm(interval);
      });
    }
  });
}

function setupAlarm(intervalMinutes) {
  chrome.alarms.clear(ALARM_NAME, () => {
    if (intervalMinutes > 0) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: Number(intervalMinutes) });
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.interval) {
      setupAlarm(changes.interval.newValue);
    }
    if (changes.unreadCount !== undefined || 
        changes.updateAvailable !== undefined || 
        changes.connectionError !== undefined ||
        changes.notificationStyle !== undefined) {
      updateBadgeAndTooltip();
    }
  }
});

// בדיקת כל הודעות ה-Snooze שזמנן פג והחזרתן למצב 'לא נקרא' עם התראת פוש
function checkAllExpiredSnoozes() {
  chrome.storage.local.get(['snoozedItems', 'unreadItems', 'unreadCount', 'notificationStyle'], (data) => {
    const snoozed = data.snoozedItems || {};
    let unreadItems = data.unreadItems || [];
    let unreadCount = data.unreadCount || 0;
    const notificationStyle = data.notificationStyle || "both";
    const now = Date.now();
    let changed = false;

    for (const msgId in snoozed) {
      const item = snoozed[msgId];
      const wakeTime = typeof item === 'object' && item !== null ? item.wakeTime : Number(item);

      if (wakeTime && now >= wakeTime) {
        delete snoozed[msgId];
        if (!unreadItems.includes(msgId)) {
          unreadItems.push(msgId);
          unreadCount += 1;
        }
        changed = true;

        // התראת פוש עבור ההודעה שחזרה
        if (notificationStyle === 'both' || notificationStyle === 'banner') {
          const sender = (typeof item === 'object' && item?.source) ? item.source : 'מערכת';
          const msgText = (typeof item === 'object' && item?.message) ? item.message : 'הודעה ששמרת לקריאה בהמשך';

          chrome.storage.local.set({ lastMessageText: msgText });

          chrome.notifications.create('snooze_alert_' + Date.now(), {
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
        updateBadgeAndTooltip();
      });
    }
  });
}

// טיפול בסיום טיימר ה-Snooze והחזרה ללא-נקרא מבוסס זמן מדויק
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkAllExpiredSnoozes();
    checkForNewSms(false);
  } else if (alarm.name.startsWith("snooze_")) {
    checkAllExpiredSnoozes();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'check-now' || request.action === 'update-interval') {
    checkAllExpiredSnoozes();
    checkForNewSms(true).then((hasToken) => {
      sendResponse({ success: hasToken });
    }).catch((err) => {
      console.error(err);
      sendResponse({ success: false });
    });
    return true;
  }

  if (request.action === 'check-snoozes') {
    checkAllExpiredSnoozes();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'send-sms') {
    const { phones, message, callerId, token } = request;
    sendSmsViaApi(phones, message, callerId, token).then((res) => {
      sendResponse(res);
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'resend-latest-sms') {
    resendLatestSmsNotification().then((success) => {
      sendResponse({ success: success });
    }).catch((err) => {
      console.error(err);
      sendResponse({ success: false });
    });
    return true;
  }
});

async function sendSmsViaApi(phones, message, callerId, token) {
  try {
    const params = new URLSearchParams({
      token: token || '',
      phones: phones || '',
      message: message || '',
      callerId: callerId || ''
    });

    const url = `https://www.call2all.co.il/ym/api/SendSms?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error sending SMS via API:', error);
    return { responseStatus: 'ERROR', message: error.message };
  }
}

function showSmsNotification(latestMsg) {
  const codeMatch = latestMsg.message.match(/\b\d{5,8}\b/);
  const codeText = codeMatch ? codeMatch[0] : null;
  const systemName = latestMsg.source || 'מערכת';

  let notifTitle = '';
  let notifMessage = '';

  if (codeText) {
    notifTitle = `התקבל קוד חדש מ ${systemName}`;
    notifMessage = `${latestMsg.message}\n \n \n code is ${codeText}`;
  } else {
    notifTitle = `התקבל SMS חדש מ ${systemName}`;
    notifMessage = latestMsg.message;
  }

  const notifId = 'yemot_sms_alert_' + Date.now();

  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: notifTitle,
    message: notifMessage,
    priority: 2,
    requireInteraction: false
  });

  setTimeout(() => {
    chrome.notifications.clear(notifId);
  }, 12000); 
}

async function checkForNewSms(skipNotification = false) {
  setHourglassBadge();
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['token', 'lastMessageId', 'unreadCount', 'smsFilters', 'notificationStyle'], async (data) => {
      if (!data.token) {
        chrome.storage.local.set({ connectionError: "חסר טוקן - הגדר כעת" });
        updateBadgeAndTooltip();
        resolve(false);
        return;
      }

      try {
        const url = `https://www.call2all.co.il/ym/api/GetIncomingSms?token=${encodeURIComponent(data.token)}&limit=50`;
        const res = await fetch(url);
        
        if (!res.ok) {
           throw new Error("Network error");
        }
        
        const result = await res.json();

        if (result && result.responseStatus === 'OK') {
          chrome.storage.local.set({ connectionError: "" });
          
          if (result.rows && result.rows.length > 0) {
            const latestMsg = result.rows[0];
            const newLastMessageId = `${latestMsg.receive_date}_${latestMsg.source}`;
            const notificationStyle = data.notificationStyle || "both";
            
            if (!data.lastMessageId) {
              chrome.storage.local.set({ 
                lastMessageId: newLastMessageId, 
                lastMessageText: latestMsg.message.replace(/(\r?\n){2,}/g, '\n') 
              });
              resolve(true);
              return;
            }

            if (newLastMessageId !== data.lastMessageId) {
              let newMessagesCount = 0;
              const filters = data.smsFilters || [];
              
              for (let i = 0; i < result.rows.length; i++) {
                let msg = result.rows[i];
                let msgId = `${msg.receive_date}_${msg.source}`;
                
                if (msgId === data.lastMessageId) {
                  break;
                }
                
                let isFiltered = false;
                for (let f of filters) {
                  if (f.type === 'sender' && msg.source === f.value) isFiltered = true;
                  if (f.type === 'contains' && msg.message.includes(f.value)) isFiltered = true;
                  if (f.type === 'not_contains' && !msg.message.includes(f.value)) isFiltered = true;
                }
                
                if (!isFiltered) {
                  newMessagesCount++;
                }
              }
              
              if (newMessagesCount > 0) {
                const totalUnread = (data.unreadCount || 0) + newMessagesCount;
                
                chrome.storage.local.set({ 
                  lastMessageId: newLastMessageId, 
                  lastMessageText: latestMsg.message.replace(/(\r?\n){2,}/g, '\n'),
                  unreadCount: totalUnread
                });
                
                latestMsg.message = latestMsg.message.replace(/(\r?\n){2,}/g, '\n');
                
                if (!skipNotification && (notificationStyle === 'both' || notificationStyle === 'push')) {
                  showSmsNotification(latestMsg);
                }
              } else {
                chrome.storage.local.set({ 
                  lastMessageId: newLastMessageId, 
                  lastMessageText: latestMsg.message.replace(/(\r?\n){2,}/g, '\n')
                });
              }
            }
          }
          resolve(true);
        } else {
          chrome.storage.local.set({ connectionError: "שגיאה מול השרת (טוקן שגוי?)" });
          resolve(false);
        }
      } catch (error) {
        console.error('Error during background SMS fetch:', error);
        chrome.storage.local.set({ connectionError: "שגיאת תקשורת/חיבור רשת" });
        resolve(false);
      } finally {
        updateBadgeAndTooltip(); 
      }
    });
  });
}

async function resendLatestSmsNotification() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['token'], async (data) => {
      if (!data.token) {
        chrome.storage.local.set({ connectionError: "חסר טוקן - הגדר כעת" });
        resolve(false);
        return;
      }

      try {
        const url = `https://www.call2all.co.il/ym/api/GetIncomingSms?token=${encodeURIComponent(data.token)}&limit=1`;
        const res = await fetch(url);
        
        if (!res.ok) throw new Error("Network error");
        
        const result = await res.json();

        if (result && result.responseStatus === 'OK') {
          chrome.storage.local.set({ connectionError: "" });
          if (result.rows && result.rows.length > 0) {
            const latestMsg = result.rows[0];
            latestMsg.message = latestMsg.message.replace(/(\r?\n){2,}/g, '\n');
            const msgId = `${latestMsg.receive_date}_${latestMsg.source}`;
            chrome.storage.local.set({ 
              lastMessageId: msgId, 
              lastMessageText: latestMsg.message 
            });

            showSmsNotification(latestMsg);
            resolve(true);
          } else {
            resolve(false);
          }
        } else {
          chrome.storage.local.set({ connectionError: "שגיאה מול השרת" });
          resolve(false);
        }
      } catch (error) {
        console.error('Error during resend SMS notification:', error);
        chrome.storage.local.set({ connectionError: "שגיאת תקשורת/חיבור רשת" });
        resolve(false);
      }
    });
  });
}

async function copyTextToClipboard(text) {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Copy verification code to clipboard from notification click'
      });
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'copy-to-clipboard',
        text: text
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError.message);
          resolve(false);
        } else {
          resolve(response && response.success);
        }
      });
    });
  } catch (err) {
    console.error('Error in copyTextToClipboard:', err);
    return false;
  }
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith('yemot_sms_alert')) {
    chrome.notifications.clear(notificationId);
    return;
  }

  chrome.notifications.clear(notificationId);

  chrome.storage.local.get(['lastMessageText'], async (data) => {
    if (data.lastMessageText) {
      const codeMatch = data.lastMessageText.match(/\b\d{5,8}\b/);
      if (codeMatch) {
        const code = codeMatch[0];
        const success = await copyTextToClipboard(code);

        if (success) {
          chrome.notifications.create('copy_success_' + Date.now(), {
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'הקוד הועתק בהצלחה!',
            message: `קוד האימות (${code}) נמצא כעת בלוח ההדבקה.`,
            priority: 2
          });
        } else {
          chrome.notifications.create('copy_error_' + Date.now(), {
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'שגיאה בהעתקת הקוד',
            message: 'לא ניתן היה לגשת ללוח ההדבקה אוטומטית.',
            priority: 1
          });
        }
      } else {
        chrome.notifications.create('no_code_' + Date.now(), {
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'לא נמצא קוד',
          message: 'לא נמצאה סדרת ספרות באורך 5-8 בהודעה האחרונה.',
          priority: 1
        });
      }
    }
  });
});

async function checkForUpdates() {
  setHourglassBadge();
  try {
    chrome.storage.local.get(['checkBetaUpdates'], async (settings) => {
      try {
        const checkBeta = settings.checkBetaUpdates === true;
        let remoteVersion = null;

        if (checkBeta) {
          // משיכת כל השחרורים כולל שחרורי Pre-release / Beta
          const response = await fetch('https://api.github.com/repos/Tzadikvtovlo/PushBox/releases');
          if (response.ok) {
            const releases = await response.json();
            if (Array.isArray(releases) && releases.length > 0) {
              remoteVersion = releases[0].tag_name ? releases[0].tag_name.replace(/^v/i, '').trim() : null;
            }
          }
        } else {
          // ברירת מחדל לכל המשתמשים: שחרורים רשמיים יציבים בלבד (GitHub מוציא שחרורי בטא מ-latest)
          const response = await fetch('https://api.github.com/repos/Tzadikvtovlo/PushBox/releases/latest');
          if (response.ok) {
            const data = await response.json();
            remoteVersion = data.tag_name ? data.tag_name.replace(/^v/i, '').trim() : null;
          }
        }
        
        const localVersion = chrome.runtime.getManifest().version;

        if (remoteVersion && isNewerVersion(localVersion, remoteVersion)) {
          chrome.storage.local.set({ updateAvailable: true });
        } else {
          chrome.storage.local.set({ updateAvailable: false });
        }
      } catch (error) {
        console.error("PushBox Update Fetch Error:", error);
      } finally {
        updateBadgeAndTooltip();
      }
    });
  } catch (error) {
    console.error("PushBox Update Check Error:", error);
    updateBadgeAndTooltip(); 
  }
}

function isNewerVersion(local, remote) {
  const localParts = local.split('.');
  const remoteParts = remote.split('.');
  for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
    const l = parseInt(localParts[i]) || 0;
    const r = parseInt(remoteParts[i]) || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}
