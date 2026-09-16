param(
  [string]$BaseUrl = "http://127.0.0.1:9058/api",
  [int]$FamilyId = 0
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

function Invoke-Api {
  param([string]$Path)
  Invoke-RestMethod -Uri "$BaseUrl$Path" -Method Get
}

function Assert-Ok {
  param(
    [bool]$Condition,
    [string]$Message
  )
  if (-not $Condition) {
    throw $Message
  }
  Write-Host "OK  $Message"
}

Write-Host "Acceptance smoke test: $BaseUrl"

$families = Invoke-Api "/families"
Assert-Ok (($families.families | Measure-Object).Count -gt 0) "families endpoint returns at least one family"

if ($FamilyId -le 0) {
  $FamilyId = [int]$families.families[0].id
}
Write-Host "Using familyId=$FamilyId"

$search = Invoke-Api "/persons/search?familyId=$FamilyId&limit=5"
Assert-Ok (($search.results | Measure-Object).Count -gt 0) "person search returns results"

$person = $search.results[0]
$personId = [int]$person.id
$detail = Invoke-Api "/persons/$personId"
Assert-Ok ($detail.person.id -eq $personId) "person detail returns selected person"

$graph = Invoke-Api "/graph/person/${personId}?familyId=$FamilyId"
Assert-Ok (($graph.nodes | Measure-Object).Count -gt 0) "local graph returns nodes"

$anomalies = Invoke-Api "/validation/anomalies?familyId=$FamilyId"
Assert-Ok ($null -ne $anomalies.anomalies) "anomalies endpoint returns a list"

$exportResponse = Invoke-WebRequest -Uri "$BaseUrl/families/$FamilyId/export" -Method Get -UseBasicParsing
Assert-Ok ($exportResponse.StatusCode -eq 200) "family export returns HTTP 200"
$exportPayload = $exportResponse.Content | ConvertFrom-Json
Assert-Ok ($exportPayload.family.id -eq $FamilyId) "family export contains selected family"
Assert-Ok (($exportPayload.people | Measure-Object).Count -gt 0) "family export contains people"
Assert-Ok ($null -ne $exportPayload.relations) "family export contains relations"

$firstRelation = $detail.relations | Select-Object -First 1
if ($firstRelation) {
  $otherId = if ([int]$firstRelation.from_person_id -eq $personId) { [int]$firstRelation.to_person_id } else { [int]$firstRelation.from_person_id }
  $path = Invoke-Api "/graph/relationship-path?familyId=$FamilyId&fromId=$personId&toId=$otherId"
  Assert-Ok ($path.found -eq $true) "relationship path returns a connected direct relation"
  Assert-Ok (($path.pathNodeIds | Measure-Object).Count -ge 2) "relationship path contains at least two nodes"
} else {
  Write-Host "SKIP relationship path: selected person has no direct relation"
}

Write-Host "Smoke test completed."
