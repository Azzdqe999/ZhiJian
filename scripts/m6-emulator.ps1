$sdk = "E:\NovelReader\.android-sdk"
$env:ANDROID_HOME = $sdk
$env:PATH = "$sdk\platform-tools;$sdk\emulator;" + $env:PATH
$em = "$sdk\emulator\emulator.exe"
$p = Start-Process -FilePath $em -ArgumentList "-avd","paper","-no-window","-no-audio","-no-boot-anim","-no-snapshot","-gpu","swiftshader_indirect" -PassThru
Write-Output ("emulator pid=" + $p.Id)
$adb = "$sdk\platform-tools\adb.exe"
& $adb wait-for-device
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 2
  $b = (& $adb shell getprop sys.boot_completed 2>$null)
  if ($b -and $b.Trim() -eq "1") { Write-Output ("booted at " + $i); break }
}
& $adb install -r "E:\NovelReader\build\paper-debug.apk" 2>&1 | Select-Object -Last 1
& $adb shell monkey -p com.paperbetween.reader -c android.intent.category.LAUNCHER 1 2>&1 | Select-Object -Last 1
Start-Sleep -Seconds 8
& $adb shell screencap -p /sdcard/m6a.png
& $adb pull /sdcard/m6a.png "E:\NovelReader\build\m6-android-1.png" 2>&1 | Select-Object -Last 1
