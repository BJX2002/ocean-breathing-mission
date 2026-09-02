param([string]$InputPath = '')

$ErrorActionPreference = 'Stop'

$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$docxPath = if ([string]::IsNullOrWhiteSpace($InputPath)) {
    (Get-ChildItem -LiteralPath $workspaceRoot -Filter '*.docx' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
else {
    [System.IO.Path]::GetFullPath($InputPath)
}
if ([string]::IsNullOrWhiteSpace($docxPath)) { throw 'No DOCX file found to render.' }
$outputDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\report_assets\rendered'))
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$pdfPath = Join-Path $outputDirectory 'material-review.pdf'
$workingDocxPath = Join-Path $outputDirectory 'material-review.docx'
Copy-Item -LiteralPath $docxPath -Destination $workingDocxPath -Force

$word = $null
$document = $null
try {
    Write-Output 'Starting Word automation...'
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.AutomationSecurity = 3
    Write-Output 'Opening temporary DOCX...'
    $document = $word.Documents.Open($workingDocxPath, $false, $true, $false)
    Write-Output 'DOCX opened; exporting PDF...'
    $document.SaveAs2($pdfPath, 17)
    Write-Output 'PDF export completed.'
}
finally {
    if ($null -ne $document) { $document.Close($false) }
    if ($null -ne $word) { $word.Quit() }
    if ($null -ne $document) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
    if ($null -ne $word) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$pdftoppm = 'C:\Users\PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe'
& $pdftoppm -png -r 135 $pdfPath (Join-Path $outputDirectory 'page')
if ($LASTEXITCODE -ne 0) { throw "pdftoppm failed with exit code $LASTEXITCODE" }
Get-ChildItem -LiteralPath $outputDirectory -Filter 'page-*.png' | Sort-Object Name | Select-Object Name, Length
