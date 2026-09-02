@echo off
chcp 65001 >nul
title PushBox - יצירת ZIP של גרסת הבטא בהורדות
echo =========================================================
echo       PushBox - יצירת קובץ ZIP לגרסת בטא (Beta)
echo =========================================================
echo.

set SCRIPT_DIR=%~dp0
set BETA_DIR=%SCRIPT_DIR%beta
set DEST_DIR=%USERPROFILE%\Downloads
set ZIP_NAME=PushBox-v4.91-Beta.zip
set DEST_FILE=%DEST_DIR%\%ZIP_NAME%

if not exist "%BETA_DIR%" (
    echo [שגיאה] תיקיית beta לא נמצאה בנתיב: %BETA_DIR%
    echo יש לוודא שהקובץ מופעל מתוך תיקיית הפרויקט הראשית.
    pause
    exit /b 1
)

echo [1/2] מאתר את קבצי גרסת הבטא...
echo מקור: %BETA_DIR%
echo יעד:  %DEST_FILE%
echo.

if exist "%DEST_FILE%" (
    echo מוחק קובץ ZIP ישן בתיקיית ההורדות...
    del /f /q "%DEST_FILE%"
)

echo [2/2] דוחס את קבצי הבטא לקובץ ZIP בתיקיית ההורדות...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%BETA_DIR%\*' -DestinationPath '%DEST_FILE%' -Force"

if %ERRORLEVEL% equ 0 (
    echo.
    echo =========================================================
    echo  [הצלחה!] קובץ ה-ZIP של גרסת הבטא נוצר בהצלחה:
    echo  %DEST_FILE%
    echo =========================================================
    echo.
    echo כעת ניתן לגרור את הקובץ או לחלץ אותו ולהתקין ב-chrome://extensions
) else (
    echo.
    echo [שגיאה] ארעה שגיאה בעת יצירת קובץ ה-ZIP.
)

echo.
pause
