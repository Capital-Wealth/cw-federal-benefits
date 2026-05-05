// Rotate the Live Plan HMAC secret.
//
// Usage:
//   1. Generate a new 64-char hex secret on the command line:
//        openssl rand -hex 32
//   2. Replace NEW_SECRET below with the value.
//   3. Run with:
//        sf apex run -o cw-vip -f salesforce/scripts/rotate_live_plan_secret.apex
//   4. Update the matching Vercel env var:
//        printf "%s" "<new-secret>" | vercel env add LIVE_PLAN_SECRET production
//        vercel deploy --prod --yes
//   5. Old tokens become invalid immediately. Advisors must re-open Live Plan
//      from Salesforce.

String NEW_SECRET = 'REPLACE_WITH_OPENSSL_RAND_HEX_32_OUTPUT';

if (NEW_SECRET == 'REPLACE_WITH_OPENSSL_RAND_HEX_32_OUTPUT') {
    throw new System.IllegalArgumentException('Edit the script: replace NEW_SECRET with a fresh hex value.');
}
if (NEW_SECRET.length() != 64) {
    throw new System.IllegalArgumentException('Secret must be 64 hex chars (32 bytes). Got: ' + NEW_SECRET.length());
}

// Deactivate all current rows
List<Live_Plan_Config__c> existing = [SELECT Id, Active__c FROM Live_Plan_Config__c WHERE Active__c = true];
for (Live_Plan_Config__c c : existing) c.Active__c = false;
if (!existing.isEmpty()) update existing;

// Insert the new active row
insert new Live_Plan_Config__c(
    Name = 'Rotated_' + Datetime.now().format('yyyyMMdd_HHmmss'),
    Secret__c = NEW_SECRET,
    Active__c = true
);

System.debug('Live Plan secret rotated. Update Vercel LIVE_PLAN_SECRET to match, then redeploy.');
