:: %~dp0 is the directory containing this bat script and ends with a backslash.
:: Change HKCU to HKLM if you want to install globally.
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.shemanaev.memberry" /ve /t REG_SZ /d "%~dp0chrome_dev.json" /f
REG ADD "HKCU\Software\Mozilla\NativeMessagingHosts\com.shemanaev.memberry" /ve /t REG_SZ /d "%~dp0firefox_dev.json" /f

for %%i in ("%~dp0..") do set "path=%%~fi"

(echo {"name": "com.shemanaev.memberry",^

"description": "Memberry host binary for the Chrome extension",^

"path": "%path:\=\\%\\target\\debug\\memberry_host.exe",^

"type": "stdio",^

"allowed_origins": [^

"chrome-extension://%1/"^

]}) > chrome_dev.json

(echo {"name": "com.shemanaev.memberry",^

"description": "Memberry host binary for the Chrome extension",^

"path": "%path:\=\\%\\target\\debug\\memberry_host.exe",^

"type": "stdio",^

"allowed_extensions": ["memberry@shemanaev.com"]^

}) > firefox_dev.json
