# Generate PNG icons from SVG using System.Drawing
$ErrorActionPreference = 'Stop'

$svgPath = Join-Path $PSScriptRoot '..\icons\icon.svg'
$iconDir = Join-Path $PSScriptRoot '..\icons'

if (-not (Test-Path $svgPath)) {
    Write-Error "SVG not found: $svgPath"
    exit 1
}

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$svgContent = Get-Content $svgPath -Raw

# Use Chromium Edge to render SVG to PNG
$sizes = @(16, 32, 48, 128)

foreach ($size in $sizes) {
    $outPath = Join-Path $iconDir "icon-$size.png"
    Write-Host "Generating icon-$size.png..."

    # Create HTML wrapper
    $html = @"
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { margin: 0; padding: 0; width: ${size}px; height: ${size}px; overflow: hidden; }
        svg { width: ${size}px; height: ${size}px; }
    </style>
</head>
<body>
$svgContent
</body>
</html>
"@

    $tempHtml = [System.IO.Path]::GetTempFileName() + ".html"
    [System.IO.File]::WriteAllText($tempHtml, $html, [System.Text.Encoding]::UTF8)

    try {
        # Use headless Chrome/Edge to capture
        $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
        if (-not (Test-Path $edge)) {
            Write-Warning "Edge not found, trying Chrome..."
            $edge = "C:\Program Files\Google\Chrome\Application\chrome.exe"
        }

        if (Test-Path $edge) {
            $uri = "file:///$($tempHtml -replace '\\', '/')"
            & $edge --headless --disable-gpu --screenshot="$outPath" --window-size=$size,$size --hide-scrollbars --default-background-color=00000000 $uri
            Start-Sleep -Milliseconds 500
            Write-Host "  Generated: $outPath"
        } else {
            Write-Warning "Neither Edge nor Chrome found. Cannot generate PNG."
        }
    } finally {
        Remove-Item $tempHtml -ErrorAction SilentlyContinue
    }
}

Write-Host "Icon generation complete!" -ForegroundColor Green
