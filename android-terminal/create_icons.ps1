Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile('b:\VGTC Managemet\client\public\icon-512.png')

$sizes = @{
    'mipmap-mdpi' = 48
    'mipmap-hdpi' = 72
    'mipmap-xhdpi' = 96
    'mipmap-xxhdpi' = 144
    'mipmap-xxxhdpi' = 192
}

$resDir = 'b:\VGTC Managemet\android-terminal\app\src\main\res'

foreach ($pair in $sizes.GetEnumerator()) {
    $dir = Join-Path $resDir $pair.Key
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    
    $sz = $pair.Value
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $sz, $sz)
    $g.Dispose()
    
    $launcherPath = Join-Path $dir 'ic_launcher.png'
    $launcherRoundPath = Join-Path $dir 'ic_launcher_round.png'
    
    $bmp.Save($launcherPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Save($launcherRoundPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created $launcherPath and $launcherRoundPath ($sz x $sz)"
}

# Also save vgtc_favicon.png into drawable
$drawableBmp = New-Object System.Drawing.Bitmap(192, 192)
$gDraw = [System.Drawing.Graphics]::FromImage($drawableBmp)
$gDraw.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gDraw.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gDraw.DrawImage($src, 0, 0, 192, 192)
$gDraw.Dispose()
$drawablePath = Join-Path $resDir 'drawable\vgtc_favicon.png'
$drawableBmp.Save($drawablePath, [System.Drawing.Imaging.ImageFormat]::Png)
$drawableBmp.Dispose()
Write-Host "Created $drawablePath"

$src.Dispose()
