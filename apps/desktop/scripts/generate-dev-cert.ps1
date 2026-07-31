#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$Subject = "UNICEF",
  [string]$Password = "adt-dev",
  [int]$Years = 3,
  [string]$OutDir = (Join-Path $PSScriptRoot ".." | Resolve-Path).Path
)

$ErrorActionPreference = "Stop"

$pfxPath = Join-Path $OutDir "adt-dev.pfx"
$cerPath = Join-Path $OutDir "adt-dev.cer"

Write-Host "Generating self-signed code-signing certificate..."
Write-Host "  Subject : CN=$Subject"
Write-Host "  Valid   : $Years year(s)"

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=$Subject" `
  -KeyUsage DigitalSignature `
  -FriendlyName "ADT Studio Dev Signing" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears($Years) `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")

$securePwd = ConvertTo-SecureString -String $Password -Force -AsPlainText

Export-PfxCertificate -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" -FilePath $pfxPath -Password $securePwd | Out-Null
Export-Certificate  -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" -FilePath $cerPath | Out-Null

Write-Host ""
Write-Host "Done."
Write-Host "  Thumbprint : $($cert.Thumbprint)"
Write-Host "  PFX (sign) : $pfxPath   (password: $Password)"
Write-Host "  CER (root) : $cerPath"
Write-Host ""
Write-Host "To trust it on THIS machine (needed for auto-update signature check to pass):"
Write-Host "  Import-Certificate -FilePath `"$cerPath`" -CertStoreLocation Cert:\LocalMachine\Root"
