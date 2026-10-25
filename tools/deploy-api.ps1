# Deploy the Kicktro API (server/) to the talebindery VPS.
#   pwsh tools/deploy-api.ps1            deploys the current HEAD (the tree must be clean)
#   pwsh tools/deploy-api.ps1 -Rev <sha> deploys that commit (the way back)
# Pushes the commit to the bare repo on the server, then runs server/deploy.sh AS IT IS IN
# THAT COMMIT (read from the bare repo, not the checkout). The static site still deploys
# through GitHub Pages; this touches only api.kicktro.com.
param([string]$Rev)
$ErrorActionPreference = 'Stop'
$server = 'deploy@136.148.210.49'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $Rev) {
    $dirty = git status --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read the working tree status.' }
    if ($dirty) { throw 'The working tree is not clean; commit first.' }
    $Rev = git rev-parse --verify 'HEAD^{commit}'
} else {
    $Rev = git rev-parse --verify "$Rev^{commit}"
}
if ($LASTEXITCODE -ne 0 -or $Rev -cnotmatch '\A[0-9a-f]{40}\z') { throw "Cannot resolve the commit." }

git push "ssh://${server}/srv/kicktro.git" "${Rev}:refs/heads/main" --force
if ($LASTEXITCODE -ne 0) { throw 'git push failed; nothing was deployed.' }

ssh -o ServerAliveInterval=30 $server "git --git-dir=/srv/kicktro.git show ${Rev}:server/deploy.sh | bash -s ${Rev}"
if ($LASTEXITCODE -ne 0) { throw "deploy.sh failed (exit $LASTEXITCODE); see the lines above." }

$health = Invoke-RestMethod -Uri 'https://api.kicktro.com/api/health' -TimeoutSec 20
if (-not $health.ok -or $health.rev -ne $Rev) { throw "api.kicktro.com answers rev '$($health.rev)', expected $Rev" }
Write-Host "api.kicktro.com is on $Rev"
