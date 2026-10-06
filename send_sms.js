
        showFeedback("לא נמצא טוקן מחובר. היכנס להגדרות התוסף.", false);
        sendBtn.innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> שלח הודעה';
        sendBtn.style.pointerEvents = 'auto';
        return;
      }

      try {
        const url = `https://www.call2all.co.il/ym/api/SendSms?token=${encodeURIComponent(data.token)}&phones=${encodeURIComponent(to)}&message=${encodeURIComponent(body)}`;
        const res = await fetch(url);
        const json = await res.json();
        
        if (json && json.responseStatus === 'OK') {
          showFeedback("ההודעה נשלחה בהצלחה!", true);
          smsToInput.value = '';
          smsBodyInput.value = '';
          chrome.storage.local.set({ draftSmsTo: '', draftSmsBody: '' });
        } else {
          showFeedback("שגיאה בשליחת ההודעה מול השרת.", false);
        }
      } catch (err) {
        showFeedback("שגיאת רשת בעת שליחת הודעה.", false);
      } finally {
        sendBtn.innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> שלח הודעה';
        sendBtn.style.pointerEvents = 'auto';
      }
    });
  });
});
