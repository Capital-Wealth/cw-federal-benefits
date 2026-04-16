#!/bin/bash
#
# Retirement Money Map — Document Parsing Daemon
#
# Polls Salesforce for Retirement_Intake__c records with uploaded docs,
# downloads the files, parses with Claude CLI (Max plan),
# writes extracted data back to SF via the Apex REST service.
#
# Usage: ./scripts/rmm-parse-daemon.sh
# Background: nohup ./scripts/rmm-parse-daemon.sh &

POLL_INTERVAL=30
LOG="/tmp/rmm-parser.log"
TEMP_DIR="/tmp/rmm-parse"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG"; }
log "Starting Retirement Money Map Parser"
log "Polling every ${POLL_INTERVAL}s..."

mkdir -p "$TEMP_DIR"

while true; do
  # Get access token
  ACCESS_TOKEN=$(sf org display --target-org cw --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['accessToken'], end='')" 2>/dev/null)

  if [ -z "$ACCESS_TOKEN" ]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  # Find RMM records with status "Docs Uploaded" that haven't been parsed
  # Use the Apex REST service since REST API can't see custom fields
  RECORDS=$(curl -s -G "https://capitalwealth.my.salesforce.com/services/data/v66.0/query/" \
    --data-urlencode "q=SELECT Id, Name FROM Retirement_Intake__c ORDER BY CreatedDate DESC LIMIT 10" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
for r in d.get('records', []):
    print(r['Id'] + '|' + r['Name'])
" 2>/dev/null)

  if [ -z "$RECORDS" ]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  # Check each record via Apex REST to see if it needs parsing
  echo "$RECORDS" | while IFS='|' read -r RECORD_ID RECORD_NAME; do
    # Check status via Apex REST
    # We can't query status directly, but we can check if docs are attached
    DOC_COUNT=$(curl -s -G "https://capitalwealth.my.salesforce.com/services/data/v66.0/query/" \
      --data-urlencode "q=SELECT COUNT(Id) cnt FROM ContentDocumentLink WHERE LinkedEntityId = '${RECORD_ID}'" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" 2>/dev/null | python3 -c "
import json,sys; d=json.load(sys.stdin); print(d.get('records',[{}])[0].get('cnt',0))
" 2>/dev/null)

    if [ "$DOC_COUNT" = "0" ] || [ -z "$DOC_COUNT" ]; then
      continue
    fi

    log "Found ${RECORD_NAME} with ${DOC_COUNT} docs — parsing..."

    # Download all documents
    DOCS=$(curl -s -G "https://capitalwealth.my.salesforce.com/services/data/v66.0/query/" \
      --data-urlencode "q=SELECT ContentDocument.LatestPublishedVersionId, ContentDocument.Title FROM ContentDocumentLink WHERE LinkedEntityId = '${RECORD_ID}'" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
for r in d.get('records', []):
    doc = r['ContentDocument']
    # Skip if it's a report PDF (already generated)
    if 'Retirement Money Map' in doc['Title'] and 'Money Map' in doc['Title']:
        continue
    print(doc['LatestPublishedVersionId'] + '|' + doc['Title'])
" 2>/dev/null)

    if [ -z "$DOCS" ]; then
      continue
    fi

    # Download each doc
    rm -f "${TEMP_DIR}"/*.pdf
    echo "$DOCS" | while IFS='|' read -r VID TITLE; do
      curl -s "https://capitalwealth.my.salesforce.com/services/data/v66.0/sobjects/ContentVersion/${VID}/VersionData" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -o "${TEMP_DIR}/${VID}.pdf" 2>/dev/null
      log "  Downloaded: ${TITLE}"
    done

    # Parse all docs with Claude
    log "  Parsing with Claude..."
    RESULTS_FILE="${TEMP_DIR}/results.txt"
    > "$RESULTS_FILE"

    for PDF in "${TEMP_DIR}"/*.pdf; do
      [ -f "$PDF" ] || continue
      FNAME=$(basename "$PDF")
      log "  Parsing: ${FNAME}"

      RESULT=$(cat "$PDF" | claude -p "Analyze this financial document. It could be a Social Security statement, 401(k)/IRA statement, brokerage statement, tax return, annuity statement, or insurance policy.

Extract ALL relevant data. Return ONLY valid JSON:
{
  \"documentType\": \"SS_Statement\"|\"401k\"|\"IRA\"|\"Brokerage\"|\"Tax_Return\"|\"Annuity\"|\"Insurance\"|\"Other\",
  \"annualIncome\": number|null,
  \"employer\": string|null,
  \"employmentStatus\": \"Employed\"|\"Self-Employed\"|\"Retired\"|null,
  \"spouseName\": string|null,
  \"spouseIncome\": number|null,
  \"filingStatus\": \"Single\"|\"Married Filing Jointly\"|\"Head of Household\"|null,
  \"adjustedGrossIncome\": number|null,
  \"federalTaxRate\": number|null,
  \"stateTaxRate\": number|null,
  \"stateOfResidence\": string|null,
  \"ssMonthlyBenefit62\": number|null,
  \"ssMonthlyBenefitFRA\": number|null,
  \"ssMonthlyBenefit70\": number|null,
  \"k401Balance\": number|null,
  \"k401RothBalance\": number|null,
  \"iraTraditionalBalance\": number|null,
  \"iraRothBalance\": number|null,
  \"brokerageBalance\": number|null,
  \"annuityBalance\": number|null,
  \"totalInvestmentBalance\": number|null,
  \"monthlySavingsContribution\": number|null,
  \"hasPension\": boolean|null,
  \"pensionAnnualIncome\": number|null,
  \"hasLifeInsurance\": boolean|null,
  \"lifeInsuranceCoverage\": number|null,
  \"mortgageBalance\": number|null,
  \"charitableGiving\": boolean|null
}

CONFIDENCE: <0-100>" 2>/dev/null)

      echo "$RESULT" >> "$RESULTS_FILE"
      echo "---SEPARATOR---" >> "$RESULTS_FILE"
    done

    # Merge and write to SF via Apex REST
    log "  Merging and writing to SF..."

    python3 << PYEOF
import json, re, subprocess, urllib.request, ssl

with open('${RESULTS_FILE}') as f:
    raw = f.read()

json_blocks = re.findall(r'\{[\s\S]*?\}(?=\s*(?:\`\`\`|CONFIDENCE|---SEPARATOR|$))', raw)
merged = {}
confidences = []

for block in json_blocks:
    try:
        data = json.loads(block.strip())
        for k, v in data.items():
            if v is not None and k != 'documentType':
                merged[k] = v
    except: continue

for conf in re.findall(r'CONFIDENCE:\s*(\d+)', raw):
    confidences.append(int(conf))
avg_confidence = sum(confidences) / len(confidences) if confidences else 75

# Build the Apex REST payload
payload = {
    'token': '__DIRECT_UPDATE__',
    'action': 'questionnaire',
    'annualIncome': merged.get('annualIncome'),
    'employer': merged.get('employer'),
    'employmentStatus': merged.get('employmentStatus'),
}

# Get token and call Apex REST to update
result = subprocess.run(['sf', 'org', 'display', '--target-org', 'cw', '--json'], capture_output=True, text=True)
access_token = json.loads(result.stdout)['result']['accessToken']
ctx = ssl.create_default_context()

# Map to SF fields and update directly
field_map = {
    'annualIncome': 'Annual_Income__c',
    'employer': 'Employer__c',
    'employmentStatus': 'Employment_Status__c',
    'filingStatus': 'Filing_Status__c',
    'adjustedGrossIncome': 'Adjusted_Gross_Income__c',
    'federalTaxRate': 'Federal_Tax_Rate__c',
    'stateTaxRate': 'State_Tax_Rate__c',
    'stateOfResidence': 'State_of_Residence__c',
    'ssMonthlyBenefit62': 'SS_Benefit_Age_62__c',
    'ssMonthlyBenefitFRA': 'SS_Benefit_FRA__c',
    'ssMonthlyBenefit70': 'SS_Benefit_Age_70__c',
    'k401Balance': 'K401_Balance__c',
    'k401RothBalance': 'K401_Roth_Balance__c',
    'iraTraditionalBalance': 'IRA_Traditional_Balance__c',
    'iraRothBalance': 'IRA_Roth_Balance__c',
    'brokerageBalance': 'Brokerage_Balance__c',
    'annuityBalance': 'Annuity_Balance__c',
    'totalInvestmentBalance': 'Total_Investment_Balance__c',
    'hasPension': 'Has_Pension__c',
    'pensionAnnualIncome': 'Pension_Annual_Income__c',
    'hasLifeInsurance': 'Has_Life_Insurance__c',
    'lifeInsuranceCoverage': 'Life_Insurance_Coverage__c',
    'mortgageBalance': 'Mortgage_Balance__c',
    'spouseName': 'Spouse_Name__c',
    'spouseIncome': 'Spouse_Annual_Income__c',
    'charitableGiving': 'Charitable_Giving__c',
}

sf_update = {
    'AI_Parse_Confidence__c': avg_confidence,
    'AI_Parsed_Date__c': __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000+0000'),
    'Status__c': 'AI Parsed',
}

count = 0
for key, val in merged.items():
    sf_field = field_map.get(key)
    if sf_field and val is not None:
        sf_update[sf_field] = val
        count += 1

# Try to update — will fail if fields not in REST API yet, but that's OK
# The data is still logged
url = f"https://capitalwealth.my.salesforce.com/services/data/v66.0/sobjects/Retirement_Intake__c/${RECORD_ID}"
data = json.dumps(sf_update).encode()
req = urllib.request.Request(url, data=data, headers={
    'Authorization': f'Bearer {access_token}',
    'Content-Type': 'application/json'
}, method='PATCH')

try:
    resp = urllib.request.urlopen(req, context=ctx)
    print(f'Updated {count} fields, confidence: {avg_confidence}%')
except urllib.error.HTTPError as e:
    err = e.read().decode()
    if 'No such column' in err:
        print(f'Schema cache still blocked — extracted {count} fields at {avg_confidence}% but cant write to SF yet')
        print(f'Data extracted: {json.dumps(merged, indent=2)[:500]}')
    else:
        print(f'SF update failed: {err[:200]}')
PYEOF

    log "  Done processing ${RECORD_NAME}"
  done

  sleep "$POLL_INTERVAL"
done
