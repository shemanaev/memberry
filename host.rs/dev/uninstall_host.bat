:: Deletes the entry created by install_host.bat
REG DELETE "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.shemanaev.memberry" /f
REG DELETE "HKCU\Software\Mozilla\NativeMessagingHosts\com.shemanaev.memberry" /f

:: Deletes temporary manifest file
del chrome_dev.json
del firefox_dev.json
