$ErrorActionPreference = 'Stop'

$outputDirectory = Join-Path $PSScriptRoot '..\report_assets\real'
$outputDirectory = [System.IO.Path]::GetFullPath($outputDirectory)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$taxa = @(
    @{ Slug = 'neopomacentrus_bankieri'; Name = 'Neopomacentrus bankieri' },
    @{ Slug = 'lutjanus_russellii'; Name = 'Lutjanus russellii' },
    @{ Slug = 'epinephelus_akaara'; Name = 'Epinephelus akaara' },
    @{ Slug = 'bathygobius_fuscus'; Name = 'Bathygobius fuscus' },
    @{ Slug = 'holothuria_leucospilota'; Name = 'Holothuria leucospilota' },
    @{ Slug = 'tube_sponge_reference'; Name = 'Aplysina archeri' }
)

$allowedLicenses = @('cc0', 'cc-by', 'cc-by-sa')
$records = foreach ($taxon in $taxa) {
    if ($taxon.Slug -eq 'neopomacentrus_bankieri') {
        $downloadUrl = 'https://inaturalist-open-data.s3.amazonaws.com/photos/432210025/large.jpeg'
        $outputPath = Join-Path $outputDirectory 'neopomacentrus_bankieri.jpeg'
        Invoke-WebRequest -Uri $downloadUrl -OutFile $outputPath -Headers @{ 'User-Agent' = 'OceanEducationMaterialReview/1.0' }
        [pscustomobject]@{
            slug = $taxon.Slug
            scientificName = $taxon.Name
            localPath = $outputPath
            observationUrl = 'https://commons.wikimedia.org/wiki/File:Neopomacentrus_bankieri,_Lamma_Island,_HK_imported_from_iNaturalist_photo_432210025.jpg'
            observedOn = ''
            place = 'Lamma Island, Hong Kong'
            photoId = 432210025
            photoUrl = $downloadUrl
            attribution = '(c) Schrodiskitten'
            license = 'CC BY 4.0'
            source = 'iNaturalist open-data copy mirrored on Wikimedia Commons'
        }
        continue
    }
    $name = [uri]::EscapeDataString($taxon.Name)
    $apiUrl = "https://api.inaturalist.org/v1/observations?taxon_name=$name&photos=true&quality_grade=research&per_page=50&order_by=votes&order=desc"
    $response = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = 'OceanEducationMaterialReview/1.0' }

    $selection = $null
    foreach ($observation in $response.results) {
        foreach ($photo in $observation.photos) {
            if ($allowedLicenses -contains $photo.license_code) {
                $selection = [pscustomobject]@{ Observation = $observation; Photo = $photo }
                break
            }
        }
        if ($null -ne $selection) { break }
    }
    if ($null -eq $selection) {
        throw "No openly licensed research-grade image found for $($taxon.Name)"
    }

    $photo = $selection.Photo
    $observation = $selection.Observation
    $downloadUrl = $photo.url.Replace('/square.', '/large.')
    $extension = [System.IO.Path]::GetExtension(([uri]$downloadUrl).AbsolutePath)
    if ([string]::IsNullOrWhiteSpace($extension)) { $extension = '.jpeg' }
    $outputPath = Join-Path $outputDirectory ($taxon.Slug + $extension)
    Invoke-WebRequest -Uri $downloadUrl -OutFile $outputPath -Headers @{ 'User-Agent' = 'OceanEducationMaterialReview/1.0' }

    [pscustomobject]@{
        slug = $taxon.Slug
        scientificName = $taxon.Name
        localPath = $outputPath
        observationUrl = $observation.uri
        observedOn = $observation.observed_on
        place = $observation.place_guess
        photoId = $photo.id
        photoUrl = $downloadUrl
        attribution = $photo.attribution
        license = $photo.license_code
        source = 'iNaturalist research-grade observation'
    }
}

$metadataPath = Join-Path $outputDirectory 'photo_metadata.json'
$records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $metadataPath -Encoding UTF8
$records | Format-Table slug, license, attribution, localPath -Wrap
Write-Output "Metadata: $metadataPath"
