#!/bin/bash
#
# Federal Benefits Document Parsing Daemon
#
# Polls Salesforce for FBI records with status "Docs Uploaded",
# downloads the attached documents, parses them with Claude CLI
# (using the Max plan OAuth — no API key needed), and writes
# the extracted data back to the SF record.
#
# Runs on this Mac. Uses existing SF CLI auth and Claude CLI auth.
#
# Usage: ./scripts/parse-daemon.sh
# Or as a background service: nohup ./scripts/parse-daemon.sh &

POLL_INTERVAL=30  # seconds between checks
LOG="/tmp/federal-benefits-parser.log"
TEMP_DIR="/tmp/federal-benefits-parse"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG"
}

log "Starting Federal Benefits Document Parser"
log "Polling every ${POLL_INTERVAL}s for new documents..."

mkdir -p "$TEMP_DIR"

while true; do
  # Find FBI records with status "Docs Uploaded" that haven't been parsed
  RECORDS=$(sf data query \
    --query "SELECT Id, Name FROM Federal_Benefits_Intake__c WHERE Status__c = 'Docs Uploaded' AND AI_Parse_Confidence__c = null" \
    --target-org cw --json 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
records = d.get('result', {}).get('records', [])
for r in records:
    print(r['Id'] + '|' + r['Name'])
" 2>/dev/null)

  if [ -z "$RECORDS" ]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  # Process each record
  echo "$RECORDS" | while IFS='|' read -r RECORD_ID RECORD_NAME; do
    log "Processing ${RECORD_NAME} (${RECORD_ID})..."

    # Get the access token
    ACCESS_TOKEN=$(sf org display --target-org cw --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['accessToken'], end='')")

    # Get all attached documents
    DOCS=$(curl -s -G "https://capitalwealth.my.salesforce.com/services/data/v66.0/query/" \
      --data-urlencode "q=SELECT ContentDocument.LatestPublishedVersionId, ContentDocument.Title, ContentDocument.LatestPublishedVersion.FileType FROM ContentDocumentLink WHERE LinkedEntityId = '${RECORD_ID}'" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
for r in d.get('records', []):
    doc = r['ContentDocument']
    ver = doc.get('LatestPublishedVersion') or {}
    print(doc['LatestPublishedVersionId'] + '|' + doc['Title'] + '|' + (ver.get('FileType') or 'PDF'))
" 2>/dev/null)

    if [ -z "$DOCS" ]; then
      log "  No documents found for ${RECORD_NAME}"
      continue
    fi

    ALL_PARSED=""
    DOC_COUNT=0
    TOTAL_CONFIDENCE=0

    echo "$DOCS" | while IFS='|' read -r VERSION_ID DOC_TITLE FILE_TYPE; do
      log "  Parsing: ${DOC_TITLE}"
      DOC_COUNT=$((DOC_COUNT + 1))

      # Download the document
      DOC_PATH="${TEMP_DIR}/${VERSION_ID}.pdf"
      curl -s "https://capitalwealth.my.salesforce.com/services/data/v66.0/sobjects/ContentVersion/${VERSION_ID}/VersionData" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -o "$DOC_PATH" 2>/dev/null

      # Parse with Claude CLI
      PARSE_RESULT=$(claude -p "You are analyzing a federal employee document. This could be an LES (Leave and Earnings Statement), SF-50 (Personnel Action), TSP Statement, DD-214 (Military Discharge), Social Security Statement, or Personal Benefits Statement.

First, identify what type of document this is. Then extract ALL relevant fields.

Return ONLY a JSON object with these fields (use null for any not found):
{
  \"documentType\": \"LES\" | \"SF50\" | \"TSP_Statement\" | \"DD214\" | \"SS_Statement\" | \"PSB\",
  \"retirementSystem\": \"FERS\" | \"CSRS\" | \"xFERS\",
  \"currentAnnualSalary\": number,
  \"serviceComputationDate\": \"YYYY-MM-DD\",
  \"desiredRetirementDate\": \"YYYY-MM-DD\",
  \"sickLeaveHoursToDate\": number,
  \"expectedSalaryIncrease\": number,
  \"employeeType\": \"Regular\" | \"Other\",
  \"employeeCategory\": \"None\" | \"Firefighter\" | \"Law Enforcement\" | \"Air Traffic Controller\",
  \"isPostalEmployee\": boolean,
  \"lesRetirementDeduction\": number,
  \"lesSsOasdi\": number,
  \"lesFederalTax\": number,
  \"lesStateTax\": number,
  \"lesDental\": number,
  \"lesVision\": number,
  \"lesFsa\": number,
  \"lesMedicare\": number,
  \"lesAllotment\": number,
  \"fegliBiweeklyPremium\": number,
  \"fehbBiweeklyPremium\": number,
  \"fegliBasic\": boolean,
  \"fegliOptionA\": boolean,
  \"fegliOptionB\": boolean,
  \"fegliOptionBMultiplier\": \"1x\"|\"2x\"|\"3x\"|\"4x\"|\"5x\",
  \"fegliOptionC\": boolean,
  \"fehbPlanName\": string,
  \"fehbEnrollmentType\": \"Self Only\"|\"Self Plus One\"|\"Self and Family\",
  \"fehbAnnualIncrease\": number,
  \"tspTradGBalance\": number, \"tspTradFBalance\": number, \"tspTradCBalance\": number,
  \"tspTradSBalance\": number, \"tspTradIBalance\": number, \"tspTradLBalance\": number,
  \"tspRothGBalance\": number, \"tspRothFBalance\": number, \"tspRothCBalance\": number,
  \"tspRothSBalance\": number, \"tspRothIBalance\": number, \"tspRothLBalance\": number,
  \"tspTradBiweeklyDollar\": number, \"tspRothBiweeklyDollar\": number,
  \"tspTradLFund\": string, \"tspRothLFund\": string,
  \"militaryServiceFrom\": \"YYYY-MM-DD\", \"militaryServiceTo\": \"YYYY-MM-DD\",
  \"hasDd214\": boolean,
  \"ssFersMonthlyBenefit\": number, \"ssFersStartAge\": number,
  \"survivorBenefitFers\": \"0%\"|\"25%\"|\"50%\",
  \"spouseDob\": \"YYYY-MM-DD\",
  \"maritalStatus\": string
}

After the JSON, output:
CONFIDENCE: <0-100>

Return ONLY valid JSON, no markdown fencing." < "$DOC_PATH" 2>/dev/null)

      # Clean up temp file
      rm -f "$DOC_PATH"

      if [ -n "$PARSE_RESULT" ]; then
        ALL_PARSED="${ALL_PARSED}${PARSE_RESULT}\n---\n"
      fi
    done

    # Now merge all parsed results and update SF
    log "  Merging parsed data and updating SF..."

    python3 << PYEOF
import json, sys, subprocess, re

# Get fresh token
result = subprocess.run(['sf', 'org', 'display', '--target-org', 'cw', '--json'], capture_output=True, text=True)
access_token = json.loads(result.stdout)['result']['accessToken']

# Parse all results
all_text = """$(echo -e "$ALL_PARSED")"""

# Extract all JSON objects
jsons = re.findall(r'\{[\s\S]*?\}', all_text)
merged = {}
confidences = []

for j_str in jsons:
    try:
        data = json.loads(j_str)
        for k, v in data.items():
            if v is not None and k != 'documentType':
                merged[k] = v
    except:
        pass

# Extract confidence scores
for conf in re.findall(r'CONFIDENCE:\s*(\d+)', all_text):
    confidences.append(int(conf))

avg_confidence = sum(confidences) / len(confidences) if confidences else 0

# Map to SF field names
field_map = {
    'retirementSystem': 'Retirement_System__c',
    'currentAnnualSalary': 'Current_Annual_Salary__c',
    'serviceComputationDate': 'Service_Computation_Date__c',
    'sickLeaveHoursToDate': 'Sick_Leave_Hours_To_Date__c',
    'expectedSalaryIncrease': 'Expected_Salary_Increase__c',
    'employeeType': 'Employee_Type__c',
    'employeeCategory': 'Employee_Category__c',
    'isPostalEmployee': 'Is_Postal_Employee__c',
    'lesRetirementDeduction': 'LES_Retirement_Deduction__c',
    'lesSsOasdi': 'LES_SS_OASDI__c',
    'lesFederalTax': 'LES_Federal_Tax__c',
    'lesStateTax': 'LES_State_Tax__c',
    'lesDental': 'LES_Dental__c',
    'lesVision': 'LES_Vision__c',
    'lesFsa': 'LES_FSA__c',
    'lesMedicare': 'LES_Medicare__c',
    'lesAllotment': 'LES_Allotment__c',
    'fegliBiweeklyPremium': 'FEGLI_Biweekly_Premium__c',
    'fehbBiweeklyPremium': 'FEHB_Biweekly_Premium__c',
    'fegliBasic': 'FEGLI_Basic__c',
    'fegliOptionA': 'FEGLI_Option_A__c',
    'fegliOptionB': 'FEGLI_Option_B__c',
    'fegliOptionBMultiplier': 'FEGLI_Option_B_Multiplier__c',
    'fegliOptionC': 'FEGLI_Option_C__c',
    'fehbPlanName': 'FEHB_Plan_Name__c',
    'fehbEnrollmentType': 'FEHB_Enrollment_Type__c',
    'fehbAnnualIncrease': 'FEHB_Annual_Increase__c',
    'tspTradGBalance': 'TSP_Trad_G_Balance__c',
    'tspTradFBalance': 'TSP_Trad_F_Balance__c',
    'tspTradCBalance': 'TSP_Trad_C_Balance__c',
    'tspTradSBalance': 'TSP_Trad_S_Balance__c',
    'tspTradIBalance': 'TSP_Trad_I_Balance__c',
    'tspTradLBalance': 'TSP_Trad_L_Balance__c',
    'tspRothGBalance': 'TSP_Roth_G_Balance__c',
    'tspRothFBalance': 'TSP_Roth_F_Balance__c',
    'tspRothCBalance': 'TSP_Roth_C_Balance__c',
    'tspRothSBalance': 'TSP_Roth_S_Balance__c',
    'tspRothIBalance': 'TSP_Roth_I_Balance__c',
    'tspRothLBalance': 'TSP_Roth_L_Balance__c',
    'tspTradBiweeklyDollar': 'TSP_Trad_Biweekly_Dollar__c',
    'tspRothBiweeklyDollar': 'TSP_Roth_Biweekly_Dollar__c',
    'tspTradLFund': 'TSP_Trad_L_Fund__c',
    'tspRothLFund': 'TSP_Roth_L_Fund__c',
    'militaryServiceFrom': 'Military_Service_From__c',
    'militaryServiceTo': 'Military_Service_To__c',
    'hasDd214': 'Has_DD214__c',
    'ssFersMonthlyBenefit': 'SS_FERS_Monthly_Benefit__c',
    'ssFersStartAge': 'SS_FERS_Start_Age__c',
    'survivorBenefitFers': 'Survivor_Benefit_FERS__c',
    'spouseDob': 'Spouse_DOB__c',
    'maritalStatus': 'Marital_Status__c',
}

sf_update = {
    'Status__c': 'AI Parsed',
    'AI_Parse_Confidence__c': avg_confidence,
    'AI_Parsed_Date__c': __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000+0000'),
}

for key, val in merged.items():
    sf_field = field_map.get(key)
    if sf_field and val is not None:
        sf_update[sf_field] = val

# Update SF
import urllib.request, ssl
ctx = ssl.create_default_context()
url = f"https://capitalwealth.my.salesforce.com/services/data/v66.0/sobjects/Federal_Benefits_Intake__c/${RECORD_ID}"
data = json.dumps(sf_update).encode()
req = urllib.request.Request(url, data=data, headers={
    'Authorization': f'Bearer {access_token}',
    'Content-Type': 'application/json'
}, method='PATCH')

try:
    resp = urllib.request.urlopen(req, context=ctx)
    print(f'Updated {len(sf_update)} fields, confidence: {avg_confidence}%')
except urllib.error.HTTPError as e:
    print(f'SF update failed: {e.read().decode()[:200]}')
PYEOF

    log "  Done processing ${RECORD_NAME}"
  done

  sleep "$POLL_INTERVAL"
done
