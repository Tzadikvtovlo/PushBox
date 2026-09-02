/**
 * PushBox Chrome Extension API Polyfill
 * Emulates chrome.runtime, chrome.storage, chrome.action, chrome.alarms,
 * chrome.notifications, chrome.tabs, and chrome.offscreen for web execution.
 */

(function () {
  const STORAGE_KEY = 'pushbox_storage_data';
  const CHANNEL_NAME = 'pushbox_extension_bus';

  // Broadcast channel for multi-view communication (popup <-> options <-> background)
  let broadcastChannel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    }
  } catch (e) {
    console.warn('BroadcastChannel not supported:', e);
  }

  // Local storage helpers
  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to load storage:', e);
    }
    // Initial defaults for PushBox
    return {
      token: 'demo',
      phoneNumber: '077-5551234',
      interval: 1,
      notificationStyle: 'both',
      unreadCount: 2,
      unreadItems: ['2026-09-02 11:20:15_Google'],
      deletedMessages: [],
      smsFilters: [],
      snoozedItems: {},
      lastMessageId: '2026-09-02 11:20:15_Google',
      lastMessageText: 'קוד האימות שלך הוא 582914. הקוד בתוקף ל-10 דקות.'
    };
  }

  function saveStorage(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save storage:', e);
    }
  }

  let memoryStorage = loadStorage();

  // Event listeners collections
  const storageListeners = [];
  const messageListeners = [];
  const alarmListeners = [];
  const notificationClickListeners = [];
  const installedListeners = [];
  const startupListeners = [];
  const activeAlarms = new Map();

  // Window/Channel message routing
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'STORAGE_CHANGED') {
        memoryStorage = loadStorage();
        storageListeners.forEach((fn) => {
          try { fn(data.changes, 'local'); } catch (err) { console.error(err); }
        });
      } else if (data.type === 'ALARM_FIRED') {
        alarmListeners.forEach((fn) => {
          try { fn(data.alarm); } catch (err) { console.error(err); }
        });
      } else if (data.type === 'NOTIFICATION_CLICKED') {
        notificationClickListeners.forEach((fn) => {
          try { fn(data.notificationId); } catch (err) { console.error(err); }
        });
      } else if (data.type === 'RUNTIME_MESSAGE') {
        dispatchMessage(data.message, data.sender, (res) => {
          if (data.replyId && broadcastChannel) {
            broadcastChannel.postMessage({ type: 'RUNTIME_REPLY', replyId: data.replyId, response: res });
          }
        });
      }
    };
  }

  function dispatchMessage(msg, sender, sendResponse) {
    let isAsync = false;
    messageListeners.forEach((fn) => {
      try {
        const result = fn(msg, sender || { id: 'pushbox-ext' }, sendResponse);
        if (result === true) {
          isAsync = true;
        }
      } catch (e) {
        console.error('Error in onMessage listener:', e);
      }
    });
    return isAsync;
  }

  // Intercept fetch to proxy Yemot HaMashiach API calls without CORS issues
  if (typeof window !== 'undefined' && window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function (resource, init) {
      if (typeof resource === 'string') {
        if (resource.includes('www.call2all.co.il/ym/api/')) {
          resource = resource.replace('https://www.call2all.co.il/ym/api/', '/proxy-ym/api/');
        }
      } else if (resource && resource.url && resource.url.includes('www.call2all.co.il/ym/api/')) {
        const newUrl = resource.url.replace('https://www.call2all.co.il/ym/api/', '/proxy-ym/api/');
        resource = new Request(newUrl, resource);
      }
      return originalFetch.call(this, resource, init);
    };
  }

  // Clipboard write fallback
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    const origWriteText = navigator.clipboard.writeText?.bind(navigator.clipboard);
    navigator.clipboard.writeText = async function (text) {
      try {
        if (origWriteText) {
          await origWriteText(text);
          return;
        }
      } catch (e) {
        // fallback to execCommand
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    };
  }

  // Initialize window.chrome
  window.chrome = window.chrome || {};

  // chrome.runtime
  window.chrome.runtime = window.chrome.runtime || {};
  window.chrome.runtime.lastError = null;

  window.chrome.runtime.getManifest = function () {
    return {
      manifest_version: 3,
      name: 'PushBox',
      version: '4.6',
      version_name: '4.6 Beta',
      description: 'פושבוקס (גרסת בטא 4.6) - קבלת, שליחת וניהול SMS ממערכת ימות המשיח ישירות לדפדפן ולהתראות שולחן העבודה.'
    };
  };

  window.chrome.runtime.onMessage = {
    addListener: function (callback) {
      if (typeof callback === 'function' && !messageListeners.includes(callback)) {
        messageListeners.push(callback);
      }
    },
    removeListener: function (callback) {
      const idx = messageListeners.indexOf(callback);
      if (idx > -1) messageListeners.splice(idx, 1);
    }
  };

  window.chrome.runtime.sendMessage = function (msg, callback) {
    return new Promise((resolve) => {
      let resolved = false;
      const sendResponse = (res) => {
        if (resolved) return;
        resolved = true;
        if (callback) callback(res);
        resolve(res);
      };

      const hasAsync = dispatchMessage(msg, { id: 'pushbox' }, sendResponse);
      if (!hasAsync && !resolved) {
        setTimeout(() => sendResponse({}), 10);
      }

      // Also forward across views via broadcastChannel
      if (broadcastChannel) {
        broadcastChannel.postMessage({
          type: 'RUNTIME_MESSAGE',
          message: msg,
          sender: { id: 'pushbox' }
        });
      }
    });
  };

  window.chrome.runtime.onInstalled = {
    addListener: function (callback) {
      installedListeners.push(callback);
      setTimeout(() => {
        try { callback({ reason: 'install' }); } catch (e) { console.error(e); }
      }, 50);
    }
  };

  window.chrome.runtime.onStartup = {
    addListener: function (callback) {
      startupListeners.push(callback);
      setTimeout(() => {
        try { callback(); } catch (e) { console.error(e); }
      }, 50);
    }
  };

  window.chrome.runtime.getContexts = async function () {
    return [{ contextType: 'OFFSCREEN_DOCUMENT' }];
  };

  // chrome.storage
  window.chrome.storage = window.chrome.storage || {};
  window.chrome.storage.local = {
    get: function (keys, callback) {
      memoryStorage = loadStorage();
      let result = {};

      if (keys === null || keys === undefined) {
        result = { ...memoryStorage };
      } else if (typeof keys === 'string') {
        result[keys] = memoryStorage[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach((k) => {
          result[k] = memoryStorage[k];
        });
      } else if (typeof keys === 'object') {
        Object.keys(keys).forEach((k) => {
          result[k] = memoryStorage[k] !== undefined ? memoryStorage[k] : keys[k];
        });
      }

      if (callback) {
        setTimeout(() => callback(result), 0);
      }
      return Promise.resolve(result);
    },

    set: function (items, callback) {
      memoryStorage = loadStorage();
      const changes = {};

      Object.keys(items).forEach((k) => {
        const oldVal = memoryStorage[k];
        const newVal = items[k];
        if (oldVal !== newVal) {
          changes[k] = { oldValue: oldVal, newValue: newVal };
        }
        memoryStorage[k] = newVal;
      });

      saveStorage(memoryStorage);

      if (Object.keys(changes).length > 0) {
        storageListeners.forEach((fn) => {
          try { fn(changes, 'local'); } catch (err) { console.error(err); }
        });

        if (broadcastChannel) {
          broadcastChannel.postMessage({ type: 'STORAGE_CHANGED', changes });
        }
      }

      if (callback) {
        setTimeout(() => callback(), 0);
      }
      return Promise.resolve();
    },

    remove: function (keys, callback) {
      memoryStorage = loadStorage();
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((k) => delete memoryStorage[k]);
      saveStorage(memoryStorage);
      if (callback) callback();
      return Promise.resolve();
    },

    clear: function (callback) {
      memoryStorage = {};
      saveStorage(memoryStorage);
      if (callback) callback();
      return Promise.resolve();
    }
  };

  window.chrome.storage.onChanged = {
    addListener: function (callback) {
      if (typeof callback === 'function' && !storageListeners.includes(callback)) {
        storageListeners.push(callback);
      }
    }
  };

  // chrome.action
  window.chrome.action = {
    setBadgeText: function ({ text }) {
      window.dispatchEvent(new CustomEvent('pushbox-badge-text', { detail: { text } }));
      if (broadcastChannel) broadcastChannel.postMessage({ type: 'BADGE_TEXT', text });
    },
    setBadgeBackgroundColor: function ({ color }) {
      window.dispatchEvent(new CustomEvent('pushbox-badge-color', { detail: { color } }));
      if (broadcastChannel) broadcastChannel.postMessage({ type: 'BADGE_COLOR', color });
    },
    setTitle: function ({ title }) {
      window.dispatchEvent(new CustomEvent('pushbox-badge-title', { detail: { title } }));
      if (broadcastChannel) broadcastChannel.postMessage({ type: 'BADGE_TITLE', title });
    }
  };

  // chrome.alarms
  window.chrome.alarms = {
    create: function (name, alarmInfo) {
      this.clear(name);
      let ms = 5000;
      if (alarmInfo.when) {
        ms = Math.max(alarmInfo.when - Date.now(), 500);
      } else {
        const periodMinutes = alarmInfo.periodInMinutes || alarmInfo.delayInMinutes;
        const delayMinutes = alarmInfo.delayInMinutes || periodMinutes || 1;
        ms = Math.max(delayMinutes * 60 * 1000, 5000);
      }

      const timerId = setTimeout(() => {
        const alarm = { name, scheduledTime: Date.now() };
        alarmListeners.forEach((fn) => {
          try { fn(alarm); } catch (e) { console.error(e); }
        });
        if (broadcastChannel) broadcastChannel.postMessage({ type: 'ALARM_FIRED', alarm });

        if (alarmInfo.periodInMinutes) {
          const intervalId = setInterval(() => {
            const repeatingAlarm = { name, scheduledTime: Date.now() };
            alarmListeners.forEach((fn) => {
              try { fn(repeatingAlarm); } catch (e) { console.error(e); }
            });
            if (broadcastChannel) broadcastChannel.postMessage({ type: 'ALARM_FIRED', alarm: repeatingAlarm });
          }, Math.max(alarmInfo.periodInMinutes * 60 * 1000, 5000));
          activeAlarms.set(name, intervalId);
        }
      }, ms);

      activeAlarms.set(name, timerId);
    },

    clear: function (name, callback) {
      if (activeAlarms.has(name)) {
        clearTimeout(activeAlarms.get(name));
        clearInterval(activeAlarms.get(name));
        activeAlarms.delete(name);
      }
      if (callback) callback(true);
      return Promise.resolve(true);
    },

    get: function (name, callback) {
      const exists = activeAlarms.has(name);
      const result = exists ? { name } : null;
      if (callback) callback(result);
      return Promise.resolve(result);
    },

    onAlarm: {
      addListener: function (callback) {
        if (typeof callback === 'function' && !alarmListeners.includes(callback)) {
          alarmListeners.push(callback);
        }
      }
    }
  };

  // chrome.notifications
  window.chrome.notifications = {
    create: function (id, options, callback) {
      const notifId = id || 'notif_' + Date.now();
      window.dispatchEvent(new CustomEvent('pushbox-notification-created', {
        detail: { id: notifId, options }
      }));

      // In-page toast dispatch across all windows
      if (typeof window.showPushBoxToast === 'function') {
        window.showPushBoxToast(notifId, options);
      } else if (broadcastChannel) {
        broadcastChannel.postMessage({
          type: 'SHOW_TOAST',
          notificationId: notifId,
          options
        });
      }

      if (callback) callback(notifId);
      return Promise.resolve(notifId);
    },

    clear: function (id, callback) {
      window.dispatchEvent(new CustomEvent('pushbox-notification-cleared', {
        detail: { id }
      }));
      if (callback) callback(true);
      return Promise.resolve(true);
    },

    onClicked: {
      addListener: function (callback) {
        if (typeof callback === 'function' && !notificationClickListeners.includes(callback)) {
          notificationClickListeners.push(callback);
        }
      }
    }
  };

  // chrome.tabs
  window.chrome.tabs = {
    create: function (options, callback) {
      const url = options.url;
      window.dispatchEvent(new CustomEvent('pushbox-open-tab', { detail: { url } }));
      if (broadcastChannel) {
        broadcastChannel.postMessage({ type: 'OPEN_TAB', url });
      }
      // If we are standalone or user clicked, navigate or open
      if (window.parent === window) {
        if (url && (url.startsWith('filters.html') || url.startsWith('options.html') || url.startsWith('popup.html'))) {
          window.location.href = url;
        } else if (url) {
          window.open(url, '_blank');
        }
      }
      if (callback) callback({ url });
      return Promise.resolve({ url });
    }
  };

  // chrome.offscreen
  window.chrome.offscreen = {
    createDocument: async function () {
      return true;
    }
  };

  console.log('✅ PushBox Chrome API Polyfill initialized successfully');
})();
