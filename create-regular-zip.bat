@echo off
chcp 65001 >nul
title PushBox - יצירת ZIP של הגרסה הרגילה בהורדות
echo =========================================================
echo       PushBox - יצירת קובץ ZIP לגרסה רגילה (יציבה)
echo =========================================================
echo.

set SCRIPT_DIR=%~dp0
set DEST_DIR=%USERPROFILE%\Downloads
set ZIP_NAME=PushBox-v4.6.zip
set DEST_FILE=%DEST_DIR%\%ZIP_NAME%

echo [1/2] מאתר את קבצי הגרסה הרגילה...
echo יעד:  %DEST_FILE%
echo.

if exist "%DEST_FILE%" (
    echo מוחק קובץ ZIP ישן בתיקיית ההורדות...
    del /f /q "%DEST_FILE%"
)

echo [2/2] דוחס את קבצי התוסף לקובץ ZIP בתיקיית ההורדות...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$files = Get-ChildItem -Path '%SCRIPT_DIR%' -File | Where-Object { $_.Name -match '\.(html|js|json|png|md|txt)$' -and $_.Name -notmatch 'server\.js|chrome-polyfill\.js' } | Select-Object -ExpandProperty FullName; Compress-Archive -Path $files -DestinationPath '%DEST_FILE%' -Force"

if %ERRORLEVEL% equ 0 (
    echo.
    echo =========================================================
    echo  [הצלחה!] קובץ ה-ZIP של הגרסה הרגילה נוצר בהצלחה:
    echo  %DEST_FILE%
    echo =========================================================
) else (
    echo.
    echo [שגיאה] ארעה שגיאה בעת יצירת קובץ ה-ZIP.
)

echo.
pause
