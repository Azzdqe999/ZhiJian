$ErrorActionPreference = "Continue"
$sdk = "E:\NovelReader\.android-sdk"
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$sdk\platform-tools;$sdk\emulator;" + $env:PATH
$adb = "$sdk\platform-tools\adb.exe"

"no" | & "$sdk\cmdline-tools\latest\bin\avdmanager.bat" create avd -n paper -k "system-images;android-35;google_apis;x86_64" -d pixel_6 --force 2>&1 | Select-Object -Last 3

$em = "$sdk\emulator\emulator.exe"
$p = Start-Process -FilePath $em -ArgumentList "-avd","paper","-no-window","-no-audio","-no-boot-anim","-no-snapshot","-gpu","swiftshader_indirect" -PassThru
Write-Output ("emulator pid=" + $p.Id)

& $adb wait-for-device
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 2
  $b = (& $adb shell getprop sys.boot_completed 2>$null)
  if ($b -and $b.Trim() -eq "1") { $ok = $true; break }
}
Write-Output ("booted=" + $ok + " loops=" + $i)

& $adb install -r "E:\NovelReader\build\纸间-android-debug.apk" 2>&1 | Select-Object -Last 3
& $adb shell monkey -p com.paperbetween.reader -c android.intent.category.LAUNCHER 1 2>&1 | Select-Object -Last 2
Start-Sleep -Seconds 12
& $adb shell screencap -p /sdcard/paper.png
& $adb pull /sdcard/paper.png "E:\NovelReader\build\android-1.png" 2>&1 | Select-Object -Last 2
& $adb logcat -d 2>$null | Select-String -Pattern "chromium|Capacitor|Console|ERROR" | Select-Object -Last 80 | Out-File "E:\NovelReader\build\android-log.txt" -Encoding utf8
Write-Output ("screenshot: " + (Test-Path "E:\NovelReader\build\android-1.png"))
