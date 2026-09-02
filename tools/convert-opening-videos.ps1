param(
  [string]$Ffmpeg = 'ffmpeg'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

$jobs = @(
  @{ Input = 'public/assets/chapter1/op2/can01.hevc.mp4'; Output = 'public/assets/chapter1/op2/can01.web.mp4' },
  @{ Input = 'public/assets/chapter1/op2/can02.hevc.mp4'; Output = 'public/assets/chapter1/op2/can02.web.mp4' },
  @{ Input = 'public/assets/chapter1/op2/pth1.hevc.mp4'; Output = 'public/assets/chapter1/op2/pth1.web.mp4' },
  @{ Input = 'public/assets/chapter1/op2/pth2.hevc.mp4'; Output = 'public/assets/chapter1/op2/pth2.web.mp4' },
  @{ Input = 'public/assets/chapter1/op/eng01.mp4'; Output = 'public/assets/chapter1/op/eng01.web.mp4' },
  @{ Input = 'public/assets/chapter1/op/eng02.mp4'; Output = 'public/assets/chapter1/op/eng02.web.mp4' }
)

foreach ($job in $jobs) {
  $inputPath = Join-Path $projectRoot $job.Input
  $outputPath = Join-Path $projectRoot $job.Output
  if (-not (Test-Path -LiteralPath $inputPath)) {
    Write-Warning "Skipping missing source: $inputPath"
    continue
  }

  Write-Host "Converting $($job.Input) -> $($job.Output)"
  & $Ffmpeg -y -i $inputPath `
    -map '0:v:0' -map '0:a?' `
    -c:v libx264 -profile:v high -level 4.1 -preset medium -crf 20 `
    -pix_fmt yuv420p -movflags '+faststart' `
    -c:a aac -b:a 160k `
    $outputPath

  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg failed while converting $inputPath"
  }
}

Write-Host 'Opening-video conversion complete.'
