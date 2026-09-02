console.log("=== PushBox 4.91 (Beta) Background Service Worker Loaded ===");

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

function setCheckingBadge() {
  chrome.action.setBadgeText({ text: "..." });
  chrome.action.setBadgeBackgroundColor({ color: '#1e3a8a' });
  chrome.action.setTitle({ title: "בודק הודעות חדשות..." });
}

function updateBadgeAndTooltip() {
  chrome.storage.local.get(['unreadCount', 'updateAvailable', 'connectionError', 'notificationStyle'], (data) => {
    const unreadCount = data.unreadCount || 0;
    const updateAvailable = data.updateAvailable || false;
    const connectionError = data.connectionError || "";
    const notificationStyle = data.notificationStyle || "both";

    let text = "";
    let bgColor = "#1e3a8a";
    let title = "PushBox 4.91 בטא";

    if (unreadCount > 0 && (notificationStyle === 'both' || notificationStyle === 'badge')) {
      text = String(unreadCount);
      title = `${unreadCount} הודעות חדשות`;
    } else if (connectionError) {
      text = "X";
      bgColor = "#ef4444";
      title = connectionError;
    } else if (updateAvailable) {
      text = "!";
      bgColor = "#f59e0b";
      title = "יש עדכון גרסה חדש זמין להורדה";
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

// טיפול בסיום טיימר ה-Snooze והחזרה ללא-נקרא
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkForNewSms(false);
  } else if (alarm.name.startsWith("snooze_")) {
    const msgId = alarm.name.replace("snooze_", "");
    chrome.storage.local.get(['unreadItems', 'unreadCount', 'snoozedItems'], (data) => {
      let unreadItems = data.unreadItems || [];
      let unreadCount = data.unreadCount || 0;
      let snoozed = data.snoozedItems || {};

      const snoozedItem = snoozed[msgId];
      delete snoozed[msgId];

      if (!unreadItems.includes(msgId)) {
        unreadItems.push(msgId);
        unreadCount += 1;
      }

      chrome.storage.local.set({ 
        unreadItems: unreadItems, 
        unreadCount: unreadCount,
        snoozedItems: snoozed 
      }, () => {
        updateBadgeAndTooltip();
        
        playNotificationSound();

        const senderName = (snoozedItem && snoozedItem.source) ? snoozedItem.source : 'SMS';
        const msgText = (snoozedItem && snoozedItem.message) ? snoozedItem.message : 'הודעה שנדחתה חזרה כעת לטיפולך';

        chrome.notifications.create('snooze_alert_' + Date.now(), {
          type: 'basic',
          iconUrl: 'icon128.png',
          title: `תזכורת: הודעה מ-${senderName}`,
          message: msgText,
          priority: 2
        });
      });
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'check-now' || request.action === 'update-interval') {
    checkForNewSms(true).then((hasToken) => {
      sendResponse({ success: hasToken });
    }).catch((err) => {
      console.error(err);
      sendResponse({ success: false });
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

function showSmsNotification(latestMsg) {
  const codeMatch = latestMsg.message.match(/\b\d{5,8}\b/);
  const codeText = codeMatch ? codeMatch[0] : null;
  const systemName = latestMsg.source || 'מערכת';

  let notifTitle = '';
  let notifMessage = '';

  if (codeText) {
    notifTitle = `התקבל קוד חדש מ-${systemName}`;
    notifMessage = `${latestMsg.message}\n\nהקוד לזיהוי: ${codeText}`;
  } else {
    notifTitle = `התקבל SMS חדש מ-${systemName}`;
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
  setCheckingBadge();
  return new Promise((resolve) => {
    chrome.storage.local.get(['token', 'lastMessageId', 'unreadCount', 'unreadItems', 'smsFilters', 'notificationStyle'], async (data) => {
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
                lastMessageText: latestMsg.message,
                unreadCount: 0,
                unreadItems: []
              });
            } else if (data.lastMessageId !== newLastMessageId) {
              const filters = data.smsFilters || [];
              let shouldFilterOut = false;

              for (let f of filters) {
                if (f.type === 'sender' && latestMsg.source === f.value) {
                  shouldFilterOut = true;
                  break;
                }
                if (f.type === 'contains' && latestMsg.message.includes(f.value)) {
                  shouldFilterOut = true;
                  break;
                }
                if (f.type === 'not_contains' && !latestMsg.message.includes(f.value)) {
                  shouldFilterOut = true;
                  break;
                }
              }

              if (!shouldFilterOut) {
                const unreadList = data.unreadItems || [];
                if (!unreadList.includes(newLastMessageId)) {
                  unreadList.push(newLastMessageId);
                }

                chrome.storage.local.set({
                  lastMessageId: newLastMessageId,
                  lastMessageText: latestMsg.message,
                  unreadCount: (data.unreadCount || 0) + 1,
                  unreadItems: unreadList
                });

                if (!skipNotification && notificationStyle !== 'none' && notificationStyle !== 'badge') {
                  showSmsNotification(latestMsg);
                  playNotificationSound();
                }
              } else {
                chrome.storage.local.set({
                  lastMessageId: newLastMessageId,
                  lastMessageText: latestMsg.message
                });
              }
            }
          }
        } else {
          chrome.storage.local.set({ connectionError: "טוקן שגוי או פג תוקף" });
        }
      } catch (err) {
        console.error("Fetch error:", err);
        chrome.storage.local.set({ connectionError: "שגיאת רשת מול השרת" });
      } finally {
        updateBadgeAndTooltip();
        resolve(true);
      }
    });
  });
}

async function resendLatestSmsNotification() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token', 'notificationStyle'], async (data) => {
      if (!data.token) {
        resolve(false);
        return;
      }

      try {
        const url = `https://www.call2all.co.il/ym/api/GetIncomingSms?token=${encodeURIComponent(data.token)}&limit=1`;
        const res = await fetch(url);
        if (!res.ok) return resolve(false);
        
        const result = await res.json();
        if (result && result.responseStatus === 'OK' && result.rows && result.rows.length > 0) {
          showSmsNotification(result.rows[0]);
          playNotificationSound();
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (e) {
        console.error("Resend error:", e);
        resolve(false);
      }
    });
  });
}

async function playNotificationSound() {
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (!hasDoc) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Notification chime'
      });
    }

    chrome.runtime.sendMessage({
      action: 'play-sound'
    }, () => {
      if (chrome.runtime.lastError) {
        // Safe to ignore if offscreen closed
      }
    });
  } catch (err) {
    console.warn('Audio playback not supported:', err);
  }
}

async function copyTextToClipboard(text) {
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (!hasDoc) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Copy OTP code to clipboard'
      });
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'copy-to-clipboard',
        text: text
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
        } else {
          resolve(response && response.success);
        }
      });
    });
  } catch (err) {
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
        }
      }
    }
  });
});

// בדיקת עדכונים לפי ערוץ (stable, beta, none)
async function checkForUpdates() {
  chrome.storage.local.get(['updateChannel', 'checkBetaUpdates'], async (data) => {
    const channel = data.updateChannel || (data.checkBetaUpdates ? 'beta' : 'stable');
    
    if (channel === 'none') {
      chrome.storage.local.set({ updateAvailable: false });
      updateBadgeAndTooltip();
      return;
    }

    setCheckingBadge();
    try {
      let targetUrl = 'https://api.github.com/repos/Tzadikvtovlo/PushBox/releases/latest';
      if (channel === 'beta') {
        targetUrl = 'https://api.github.com/repos/Tzadikvtovlo/PushBox/releases';
      }

      const response = await fetch(targetUrl);
      if (!response.ok) return;
      const releaseData = await response.json();
      
      const release = Array.isArray(releaseData) ? releaseData[0] : releaseData;
      if (!release || !release.tag_name) return;

      const localVersion = chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '4.9';
      const remoteVersion = release.tag_name.replace(/^v/i, '').trim();

      if (isNewerVersion(localVersion, remoteVersion)) {
        chrome.storage.local.set({ 
          updateAvailable: true, 
          latestVersionName: remoteVersion,
          isBetaUpdate: !!release.prerelease
        });
      } else {
        chrome.storage.local.set({ updateAvailable: false });
      }
    } catch (error) {
      console.error("PushBox Update Check Error:", error);
    } finally {
      updateBadgeAndTooltip(); 
    }
  });
}

function isNewerVersion(local, remote) {
  const localParts = local.split('.').map(Number);
  const remoteParts = remote.split('.').map(Number);
  const len = Math.max(localParts.length, remoteParts.length);
  for (let i = 0; i < len; i++) {
    const l = localParts[i] || 0;
    const r = remoteParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}
