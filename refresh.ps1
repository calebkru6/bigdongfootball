# Refresh the league site data: pull the latest Sleeper seasons, then rebuild site/public/data.
# Run from anywhere:  powershell -File site/refresh.ps1
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
python -I "$here/tools/fetch_sleeper.py" 1319022882948403200
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
python -I "$here/tools/fetch_logos.py"
python -I "$here/tools/build_site_data.py"
