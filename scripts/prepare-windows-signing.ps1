$ErrorActionPreference = 'Stop'

$certificate = Get-Item "Cert:\CurrentUser\My\$env:WINDOWS_CERT_SHA1"

$manifestPath = (Resolve-Path build/AppxManifest.xml).Path
[xml]$manifest = Get-Content $manifestPath -Raw
$manifest.Package.Identity.SetAttribute('Publisher', $certificate.Subject)
$manifest.Save($manifestPath)
