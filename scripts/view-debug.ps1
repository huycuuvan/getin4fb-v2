# Script để xem debug info nhanh chóng

Write-Host "=== Facebook Scraper Debug Viewer ===" -ForegroundColor Cyan
Write-Host ""

# Kiểm tra thư mục debug
$debugDir = "d:\getlinkfb-v2\debug_screenshots"
if (Test-Path $debugDir) {
    Write-Host "✅ Debug directory exists: $debugDir" -ForegroundColor Green
    
    # Đếm số file
    $screenshots = Get-ChildItem $debugDir -Filter "*.png" | Sort-Object LastWriteTime -Descending
    $htmlFiles = Get-ChildItem $debugDir -Filter "*.html" | Sort-Object LastWriteTime -Descending
    
    Write-Host "📊 Total screenshots: $($screenshots.Count)" -ForegroundColor Yellow
    Write-Host "📄 Total HTML files: $($htmlFiles.Count)" -ForegroundColor Yellow
    Write-Host ""
    
    # Hiển thị 10 file mới nhất
    Write-Host "📸 Latest 10 screenshots:" -ForegroundColor Cyan
    $screenshots | Select-Object -First 10 | ForEach-Object {
        $age = (Get-Date) - $_.LastWriteTime
        $ageStr = if ($age.TotalMinutes -lt 60) {
            "$([math]::Round($age.TotalMinutes)) minutes ago"
        } elseif ($age.TotalHours -lt 24) {
            "$([math]::Round($age.TotalHours)) hours ago"
        } else {
            "$([math]::Round($age.TotalDays)) days ago"
        }
        
        $color = if ($_.Name -like "*ERROR*") { "Red" } else { "White" }
        Write-Host "  - $($_.Name) ($ageStr)" -ForegroundColor $color
    }
    
    Write-Host ""
    
    # Đếm số lỗi
    $errorScreenshots = $screenshots | Where-Object { $_.Name -like "*ERROR*" }
    if ($errorScreenshots.Count -gt 0) {
        Write-Host "⚠️  Found $($errorScreenshots.Count) ERROR screenshots!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Recent errors:" -ForegroundColor Red
        $errorScreenshots | Select-Object -First 5 | ForEach-Object {
            Write-Host "  - $($_.Name)" -ForegroundColor Red
        }
    } else {
        Write-Host "✅ No error screenshots found" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "=== Actions ===" -ForegroundColor Cyan
    Write-Host "1. Open debug folder: explorer $debugDir"
    Write-Host "2. View latest screenshot: ii `"$($screenshots[0].FullName)`""
    Write-Host "3. View latest HTML: ii `"$($htmlFiles[0].FullName)`""
    Write-Host "4. Clean old files (7+ days): Get-ChildItem $debugDir | Where-Object {`$_.LastWriteTime -lt (Get-Date).AddDays(-7)} | Remove-Item"
    Write-Host ""
    
    # Hỏi user muốn làm gì
    Write-Host "What would you like to do?" -ForegroundColor Yellow
    Write-Host "[1] Open debug folder"
    Write-Host "[2] View latest screenshot"
    Write-Host "[3] View latest HTML"
    Write-Host "[4] View latest error screenshot (if any)"
    Write-Host "[5] Clean old files (7+ days)"
    Write-Host "[Q] Quit"
    Write-Host ""
    
    $choice = Read-Host "Enter your choice"
    
    switch ($choice) {
        "1" {
            explorer $debugDir
            Write-Host "✅ Opened debug folder" -ForegroundColor Green
        }
        "2" {
            if ($screenshots.Count -gt 0) {
                ii $screenshots[0].FullName
                Write-Host "✅ Opened latest screenshot: $($screenshots[0].Name)" -ForegroundColor Green
            } else {
                Write-Host "❌ No screenshots found" -ForegroundColor Red
            }
        }
        "3" {
            if ($htmlFiles.Count -gt 0) {
                ii $htmlFiles[0].FullName
                Write-Host "✅ Opened latest HTML: $($htmlFiles[0].Name)" -ForegroundColor Green
            } else {
                Write-Host "❌ No HTML files found" -ForegroundColor Red
            }
        }
        "4" {
            if ($errorScreenshots.Count -gt 0) {
                ii $errorScreenshots[0].FullName
                Write-Host "✅ Opened latest error screenshot: $($errorScreenshots[0].Name)" -ForegroundColor Green
            } else {
                Write-Host "❌ No error screenshots found" -ForegroundColor Red
            }
        }
        "5" {
            $oldFiles = Get-ChildItem $debugDir | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-7)}
            if ($oldFiles.Count -gt 0) {
                Write-Host "Found $($oldFiles.Count) old files. Delete them? (Y/N)" -ForegroundColor Yellow
                $confirm = Read-Host
                if ($confirm -eq "Y" -or $confirm -eq "y") {
                    $oldFiles | Remove-Item -Force
                    Write-Host "✅ Deleted $($oldFiles.Count) old files" -ForegroundColor Green
                } else {
                    Write-Host "❌ Cancelled" -ForegroundColor Red
                }
            } else {
                Write-Host "✅ No old files to clean" -ForegroundColor Green
            }
        }
        "Q" {
            Write-Host "Bye! 👋" -ForegroundColor Cyan
        }
        default {
            Write-Host "❌ Invalid choice" -ForegroundColor Red
        }
    }
    
} else {
    Write-Host "❌ Debug directory not found: $debugDir" -ForegroundColor Red
    Write-Host "The directory will be created automatically when the scraper runs." -ForegroundColor Yellow
}
