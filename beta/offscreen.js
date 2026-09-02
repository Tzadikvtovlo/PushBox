chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'copy-to-clipboard') {
    try {
      const textarea = document.createElement('textarea');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.value = request.text;
      
      document.body.appendChild(textarea);
      textarea.select();
      
      // ביצוע ההעתקה ללוח
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);

      sendResponse({ success: successful });
    } catch (err) {
      console.error('Failed to copy via offscreen execCommand:', err);
      sendResponse({ success: false });
    }
    
    // שומר על הערוץ פתוח לתשובה
    return true; 
  }
});
