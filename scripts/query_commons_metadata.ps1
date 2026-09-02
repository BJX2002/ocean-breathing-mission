$ErrorActionPreference = 'Stop'

$titles = @(
    'File:Neopomacentrus bankieri, The Keppels QLD 4700, Australia imported from iNaturalist photo 167871431.jpg',
    'File:Lutjanus russellii 136 (cropped).jpg',
    'File:Epinephelus akaara by OpenCage.jpg',
    'File:Bathygobius fuscus Mariho.jpg',
    'File:Holothuria leucospilota (18332189).jpg',
    'File:Aplysina archeri (Stove-pipe Sponge-pink variation).jpg'
)

$records = foreach ($title in $titles) {
    $query = [uri]::EscapeDataString($title)
    $apiUrl = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata&titles=$query"
    $response = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = 'OceanEducationMaterialReview/1.0' }
    $page = $response.query.pages.PSObject.Properties.Value | Select-Object -First 1
    $info = $page.imageinfo[0]
    [pscustomobject]@{
        title = $title
        sourcePage = $info.descriptionurl
        sourceImage = $info.url
        artist = $info.extmetadata.Artist.value
        credit = $info.extmetadata.Credit.value
        license = $info.extmetadata.LicenseShortName.value
        licenseUrl = $info.extmetadata.LicenseUrl.value
        attributionRequired = $info.extmetadata.AttributionRequired.value
        source = $info.extmetadata.Source.value
    }
}

$outputDirectory = Join-Path $PSScriptRoot '..\report_assets\real'
$outputDirectory = [System.IO.Path]::GetFullPath($outputDirectory)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$outputPath = Join-Path $outputDirectory 'commons_metadata.json'
$records | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $outputPath -Encoding UTF8
$records | Format-List
Write-Output "Metadata: $outputPath"
