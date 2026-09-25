@echo off
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
set "ANDROID_HOME=C:\Users\dixit\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"
"C:\Users\dixit\.gradle\wrapper\dists\gradle-8.14.3-all\10utluxaxniiv4wxiphsi49nj\gradle-8.14.3\bin\gradle.bat" assembleDebug --console=plain
