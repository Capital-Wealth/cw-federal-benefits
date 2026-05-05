/**
 * FederalBenefitsController — All advisor actions, pure Apex.
 *
 * No external API calls. No auth tokens. No Connected App.
 * Everything runs inside Salesforce using the logged-in user's session.
 *
 * Flow:
 * 1. Rep clicks "Invite to Upload" on Contact → creates FBI record, sends email
 * 2. Client uploads docs via portal → FileUploadService handles this
 * 3. Rep clicks "Read Documents" → (future: triggers AI parsing)
 * 4. Rep reviews populated fields
 * 5. Rep clicks "Generate Report" → marks complete for Vision
 */
public with sharing class FederalBenefitsController {

    // Test-injectable site URL
    @TestVisible private static String testSiteUrl;

    private static String getSiteUrl() {
        if (testSiteUrl != null) return testSiteUrl;
        // Read from custom metadata if available
        List<Federal_Benefits_Setting__mdt> settings = [
            SELECT API_Base_URL__c FROM Federal_Benefits_Setting__mdt
            WHERE DeveloperName = 'Default' LIMIT 1
        ];
        if (!settings.isEmpty() && settings[0].API_Base_URL__c != null) {
            return settings[0].API_Base_URL__c;
        }
        // Fallback: construct from org domain
        return 'https://benefits.capitalwealth.com';
    }

    // Fallback constant — used only if the Live_Plan_Config__c custom setting
    // has no Active row (e.g. fresh org). Rotation happens via DML on the
    // setting; no metadata deploy needed.
    private static final String LIVE_PLAN_SECRET_FALLBACK =
        'bcec9e65a5d08639277e62bbcc0df4fdfc87b58dcec200f98b67efeb19f48be8';

    @TestVisible private static String testLivePlanSecret;
    private static String getLivePlanSecret() {
        if (testLivePlanSecret != null) return testLivePlanSecret;
        List<Live_Plan_Config__c> active = [
            SELECT Secret__c FROM Live_Plan_Config__c
            WHERE Active__c = true ORDER BY LastModifiedDate DESC LIMIT 1
        ];
        if (!active.isEmpty() && String.isNotBlank(active[0].Secret__c)) {
            return active[0].Secret__c;
        }
        return LIVE_PLAN_SECRET_FALLBACK;
    }

    /**
     * Mint a short-lived signed URL the advisor can open to launch the Live
     * Plan web app. Token format: base64url(payload) + "." + hex(HMAC-SHA256).
     * Payload contains intakeId, the running user's Id, and a 60-min expiry.
     */
    @AuraEnabled
    public static Map<String, String> openLivePlan(Id intakeId) {
        // Verify the user has access to the FBI record
        Federal_Benefits_Intake__c fbi = [
            SELECT Id, Name FROM Federal_Benefits_Intake__c WHERE Id = :intakeId LIMIT 1
        ];

        Long expEpoch = (Datetime.now().addMinutes(60).getTime()) / 1000;
        String payloadJson = JSON.serialize(new Map<String, Object>{
            'intakeId' => fbi.Id,
            'userId' => UserInfo.getUserId(),
            'userName' => UserInfo.getName(),
            'orgId' => UserInfo.getOrganizationId(),
            'exp' => expEpoch
        });
        String payloadB64 = base64UrlEncode(Blob.valueOf(payloadJson));

        Blob secret = Blob.valueOf(getLivePlanSecret());
        Blob sig = Crypto.generateMac('HmacSHA256', Blob.valueOf(payloadB64), secret);
        String sigHex = EncodingUtil.convertToHex(sig);

        String token = payloadB64 + '.' + sigHex;
        String url = getSiteUrl() + '/plan/' + fbi.Id + '?session=' + EncodingUtil.urlEncode(token, 'UTF-8');

        return new Map<String, String>{
            'url' => url,
            'intakeName' => fbi.Name,
            'expiresAt' => String.valueOf(expEpoch)
        };
    }

    /** Apex doesn't expose base64url natively; convert standard base64 to url-safe. */
    private static String base64UrlEncode(Blob input) {
        return EncodingUtil.base64Encode(input)
            .replace('+', '-').replace('/', '_').replace('=', '');
    }

    /**
     * STEP 1: Create intake and send upload invitation.
     * Called from Contact or Lead record page.
     */
    @AuraEnabled
    public static Map<String, String> inviteToUpload(Id recordId, String objectType) {
        String clientName;
        String clientEmail;
        Id contactIdForIntake;

        if (recordId.getSObjectType() == Account.SObjectType) {
            // Household Account = case design at household level, email goes to Primary Contact.
            // Person Account = fallback (legacy support) — uses PersonEmail / PersonContactId.
            Account a = [
                SELECT Name, PersonEmail, PersonContactId, IsPersonAccount,
                       RecordType.DeveloperName,
                       FinServ__PrimaryContact__c,
                       FinServ__PrimaryContact__r.Name,
                       FinServ__PrimaryContact__r.Email
                FROM Account WHERE Id = :recordId LIMIT 1
            ];
            if (a.RecordType.DeveloperName == 'IndustriesHousehold') {
                if (a.FinServ__PrimaryContact__c == null) {
                    throw new AuraHandledException('This Household has no Primary Contact set. Add a Primary Contact before sending a Capital Wealth Vault invite.');
                }
                clientName = a.FinServ__PrimaryContact__r.Name;
                clientEmail = a.FinServ__PrimaryContact__r.Email;
                contactIdForIntake = a.FinServ__PrimaryContact__c;
            } else {
                clientName = a.Name;
                clientEmail = a.PersonEmail;
                contactIdForIntake = a.PersonContactId;
            }
        } else if (recordId.getSObjectType() == Contact.SObjectType) {
            Contact c = [SELECT Name, Email FROM Contact WHERE Id = :recordId LIMIT 1];
            clientName = c.Name;
            clientEmail = c.Email;
            contactIdForIntake = recordId;
        } else {
            Lead l = [SELECT Name, Email FROM Lead WHERE Id = :recordId LIMIT 1];
            clientName = l.Name;
            clientEmail = l.Email;
        }

        if (String.isBlank(clientEmail)) {
            throw new AuraHandledException('This record must have an email address before sending a Capital Wealth Vault invite.');
        }

        // Generate upload token
        String token = generateUUID();
        String portalUrl = getSiteUrl() + '/portal/' + token;

        // Create FBI record
        Federal_Benefits_Intake__c fbi = new Federal_Benefits_Intake__c();
        fbi.Status__c = 'Link Sent';
        fbi.Intake_Date__c = Date.today();
        fbi.Supabase_Folder_ID__c = token;
        fbi.Document_Upload_URL__c = portalUrl;

        if (contactIdForIntake != null) {
            fbi.Contact__c = contactIdForIntake;
        } else if (recordId.getSObjectType() == Lead.SObjectType) {
            fbi.Lead__c = recordId;
        }

        insert fbi;

        // Reload to get auto-number name
        fbi = [SELECT Name FROM Federal_Benefits_Intake__c WHERE Id = :fbi.Id];

        // Send email to client
        sendUploadInvitation(clientName, clientEmail, portalUrl);

        return new Map<String, String>{
            'intakeId' => fbi.Id,
            'intakeName' => fbi.Name,
            'portalUrl' => portalUrl,
            'emailSent' => 'true'
        };
    }

    /**
     * STEP 1b: Direct upload — advisor already has the documents and uploads
     * them inside Salesforce (skips the email link). Creates a Federal_Benefits_Intake__c
     * record bound to the same Contact/Lead as inviteToUpload, but does NOT send
     * an email and does NOT generate a portal token. Files attached to the
     * returned intakeId by lightning-file-upload land in the same place as
     * email-flow uploads, so /api/parse picks them up identically.
     */
    @AuraEnabled
    public static Map<String, String> startDirectUpload(Id recordId, String objectType) {
        Id contactIdForIntake;
        Id leadIdForIntake;

        if (recordId.getSObjectType() == Account.SObjectType) {
            Account a = [
                SELECT IsPersonAccount, PersonContactId,
                       RecordType.DeveloperName,
                       FinServ__PrimaryContact__c
                FROM Account WHERE Id = :recordId LIMIT 1
            ];
            if (a.RecordType.DeveloperName == 'IndustriesHousehold') {
                if (a.FinServ__PrimaryContact__c == null) {
                    throw new AuraHandledException('This Household has no Primary Contact set. Add a Primary Contact before uploading documents.');
                }
                contactIdForIntake = a.FinServ__PrimaryContact__c;
            } else if (a.PersonContactId != null) {
                contactIdForIntake = a.PersonContactId;
            } else {
                List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :recordId LIMIT 1];
                if (!contacts.isEmpty()) contactIdForIntake = contacts[0].Id;
            }
        } else if (recordId.getSObjectType() == Contact.SObjectType) {
            contactIdForIntake = recordId;
        } else if (recordId.getSObjectType() == Lead.SObjectType) {
            leadIdForIntake = recordId;
        }

        if (contactIdForIntake == null && leadIdForIntake == null) {
            throw new AuraHandledException('Could not find a Contact or Lead to attach the intake to.');
        }

        Federal_Benefits_Intake__c fbi = new Federal_Benefits_Intake__c();
        fbi.Status__c = 'Draft';
        fbi.Intake_Date__c = Date.today();
        // Token is required to satisfy any uniqueness/expiration logic shared with the email flow,
        // but it's never exposed to the client because no email is sent.
        fbi.Supabase_Folder_ID__c = generateUUID();
        if (contactIdForIntake != null) fbi.Contact__c = contactIdForIntake;
        if (leadIdForIntake != null) fbi.Lead__c = leadIdForIntake;

        insert fbi;
        fbi = [SELECT Name FROM Federal_Benefits_Intake__c WHERE Id = :fbi.Id];

        return new Map<String, String>{
            'intakeId' => fbi.Id,
            'intakeName' => fbi.Name
        };
    }

    /**
     * STEP 2b: Trigger AI parsing on documents already attached to an FBI record.
     * Mirrors what /api/upload does after a client-side upload — flips Status
     * to "Docs Uploaded" and fires /api/parse asynchronously so the user
     * doesn't wait on the AI roundtrip.
     */
    @AuraEnabled
    public static void parseUploadedDocuments(Id intakeId) {
        update new Federal_Benefits_Intake__c(
            Id = intakeId,
            Status__c = 'Docs Uploaded'
        );
        fireParseCallout(String.valueOf(intakeId));
    }

    @future(callout=true)
    private static void fireParseCallout(String intakeId) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(getSiteUrl() + '/api/parse');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(120000);
        req.setBody(JSON.serialize(new Map<String, String>{
            'intakeId' => intakeId,
            'intakeObject' => 'Federal_Benefits_Intake__c'
        }));
        try {
            new Http().send(req);
        } catch (Exception e) {
            System.debug('Parse callout failed: ' + e.getMessage());
        }
    }

    /**
     * STEP 3: Get upload status — what documents has the client uploaded?
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getUploadStatus(Id intakeId) {
        Federal_Benefits_Intake__c fbi = [
            SELECT Id, Name, Status__c, Document_Upload_URL__c,
                   AI_Parse_Confidence__c, AI_Parsed_Date__c,
                   Fields_Needing_Review__c, FedRetire_Report_Generated__c
            FROM Federal_Benefits_Intake__c
            WHERE Id = :intakeId LIMIT 1
        ];

        // Count linked documents
        List<ContentDocumentLink> docs = [
            SELECT ContentDocument.Title, ContentDocument.Description,
                   ContentDocument.FileType, ContentDocument.ContentSize,
                   ContentDocument.CreatedDate
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :intakeId
            AND ContentDocument.Description LIKE '%Document type:%'
        ];

        List<Map<String, String>> documentList = new List<Map<String, String>>();
        for (ContentDocumentLink cdl : docs) {
            Map<String, String> doc = new Map<String, String>();
            doc.put('title', cdl.ContentDocument.Title);
            doc.put('fileType', cdl.ContentDocument.FileType);
            doc.put('size', String.valueOf(cdl.ContentDocument.ContentSize));
            doc.put('createdDate', String.valueOf(cdl.ContentDocument.CreatedDate));

            // Extract document type from description
            String docDescription = cdl.ContentDocument.Description;
            if (docDescription != null && docDescription.contains('Document type: ')) {
                String docType = docDescription.substringAfter('Document type: ').substringBefore('.');
                doc.put('documentType', docType);
            }
            documentList.add(doc);
        }

        Map<String, Object> result = new Map<String, Object>();
        result.put('status', fbi.Status__c);
        result.put('confidence', fbi.AI_Parse_Confidence__c);
        result.put('parsedDate', fbi.AI_Parsed_Date__c);
        result.put('fieldsNeedingReview', fbi.Fields_Needing_Review__c);
        result.put('reportGenerated', fbi.FedRetire_Report_Generated__c);
        result.put('documents', documentList);
        result.put('documentCount', documentList.size());
        return result;
    }

    /**
     * STEP 5: Mark intake as complete and ready for report generation.
     */
    @AuraEnabled
    public static void markComplete(Id intakeId) {
        Federal_Benefits_Intake__c fbi = new Federal_Benefits_Intake__c(
            Id = intakeId,
            Status__c = 'Complete'
        );
        update fbi;
    }

    /**
     * STEP 6: Generate the Retirement Money Map Report.
     * Calls GullStack Report Builder API with the intake record ID.
     * The report builder reads the data via our /api/records proxy
     * and generates a 50-page PDF retirement analysis.
     */
    @AuraEnabled
    public static Map<String, Object> generateReport(Id intakeId) {
        Map<String, Object> result = new Map<String, Object>();
        String reportBuilderUrl = 'https://cw-federal-report-builder.vercel.app';

        // Step 1: Run calculations
        HttpRequest calcReq = new HttpRequest();
        calcReq.setEndpoint(reportBuilderUrl + '/api/salesforce/generate');
        calcReq.setMethod('POST');
        calcReq.setHeader('Content-Type', 'application/json');
        calcReq.setTimeout(60000);
        calcReq.setBody(JSON.serialize(new Map<String, String>{ 'recordId' => intakeId }));

        Http http = new Http();
        HttpResponse calcRes = http.send(calcReq);

        if (calcRes.getStatusCode() != 200) {
            result.put('reportSuccess', false);
            result.put('reportError', 'Calculation failed: ' + calcRes.getBody().left(200));
            return result;
        }

        Map<String, Object> calcData = (Map<String, Object>) JSON.deserializeUntyped(calcRes.getBody());
        String employeeName = (String) calcData.get('employeeName');

        // Step 2: Generate PDF
        HttpRequest pdfReq = new HttpRequest();
        pdfReq.setEndpoint(reportBuilderUrl + '/api/report/pdf');
        pdfReq.setMethod('POST');
        pdfReq.setHeader('Content-Type', 'application/json');
        pdfReq.setTimeout(60000);
        pdfReq.setBody(JSON.serialize(new Map<String, Object>{
            'input' => calcData.get('input'),
            'result' => calcData.get('results')
        }));

        HttpResponse pdfRes = http.send(pdfReq);

        if (pdfRes.getStatusCode() != 200) {
            result.put('reportSuccess', false);
            result.put('reportError', 'PDF generation failed: ' + pdfRes.getStatusCode());
            return result;
        }

        // Step 3: Attach PDF to the FBI record as a file. Surface it on the
        // FBI, the parent Contact, AND the parent Account so it shows up in
        // every advisor's Files related list regardless of which page they
        // navigate from.
        Blob pdfBlob = pdfRes.getBodyAsBlob();
        String fileName = (employeeName != null ? employeeName : 'Federal_Employee')
                          + ' - Federal Benefits Gap Analysis';

        ContentVersion cv = new ContentVersion();
        cv.Title = fileName;
        cv.PathOnClient = fileName + '.pdf';
        cv.VersionData = pdfBlob;
        cv.Description = 'Federal Benefits Gap Analysis generated ' + Datetime.now().format();
        cv.FirstPublishLocationId = intakeId;
        insert cv;

        // Re-fetch to get the ContentDocumentId
        cv = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id];

        // Multi-target link: Contact + Person Account + Household + any
        // Account where this Contact is a member, so the file shows up on
        // every related page the advisor might navigate to.
        Federal_Benefits_Intake__c fbi = [SELECT Contact__c, Contact__r.AccountId FROM Federal_Benefits_Intake__c WHERE Id = :intakeId];
        List<ContentDocumentLink> extraLinks = new List<ContentDocumentLink>();
        Set<Id> linkedTargets = new Set<Id>();

        if (fbi.Contact__c != null) {
            linkedTargets.add(fbi.Contact__c);
        }
        if (fbi.Contact__c != null && fbi.Contact__r.AccountId != null) {
            linkedTargets.add(fbi.Contact__r.AccountId);
        }

        // FSC Household link via AccountContactRelation — the standard way
        // to find every Account a Contact is a member of (incl. Household).
        if (fbi.Contact__c != null) {
            for (AccountContactRelation acr : [
                SELECT AccountId
                FROM AccountContactRelation
                WHERE ContactId = :fbi.Contact__c
                  AND IsActive = true
            ]) {
                if (acr.AccountId != null) linkedTargets.add(acr.AccountId);
            }
            // Also catch Households where this Contact is the Primary Contact
            // (covers the case where the AccountContactRelation isn't yet active).
            for (Account a : [
                SELECT Id FROM Account
                WHERE FinServ__PrimaryContact__c = :fbi.Contact__c
            ]) {
                linkedTargets.add(a.Id);
            }
        }

        for (Id targetId : linkedTargets) {
            extraLinks.add(new ContentDocumentLink(
                ContentDocumentId = cv.ContentDocumentId,
                LinkedEntityId = targetId,
                ShareType = 'V',
                Visibility = 'AllUsers'
            ));
        }
        if (!extraLinks.isEmpty()) {
            // allOrNone=false so a duplicate-link failure on one record doesn't kill the whole thing
            Database.insert(extraLinks, false);
        }

        // Step 4: Mark complete
        update new Federal_Benefits_Intake__c(
            Id = intakeId,
            Status__c = 'Complete',
            FedRetire_Report_Generated__c = true,
            FedRetire_Report_Date__c = Datetime.now()
        );

        result.put('reportSuccess', true);
        result.put('employeeName', employeeName);
        result.put('contentDocumentId', cv.ContentDocumentId);
        result.put('message', 'Federal Benefits Gap Analysis generated and attached to the record, contact, and account.');
        return result;
    }

    /**
     * Backward-compatible wrapper — just marks complete without HTTP callout.
     * Used in tests that can't do callouts.
     */
    @AuraEnabled
    public static void markReportGenerated(Id intakeId) {
        update new Federal_Benefits_Intake__c(
            Id = intakeId,
            Status__c = 'Complete',
            FedRetire_Report_Generated__c = true,
            FedRetire_Report_Date__c = Datetime.now()
        );
    }

    /**
     * Get intake status for an Account — looks up FBI records linked to this Account's Contact.
     * Returns the most recent intake with its documents and parsed data summary.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getIntakeForAccount(Id accountId) {
        // Three scenarios:
        //  1. Household Account (FSC): use FinServ__PrimaryContact__c — the intake was created
        //     against the Primary Contact whose AccountId points to the member Person Account,
        //     NOT the Household. A Contact WHERE AccountId = HouseholdId query returns nothing.
        //  2. Person Account: use PersonContactId.
        //  3. Business Account: first related Contact.
        Account acct = [
            SELECT PersonContactId, FinServ__PrimaryContact__c, RecordType.DeveloperName
            FROM Account WHERE Id = :accountId LIMIT 1
        ];

        Id contactId;
        if (acct.RecordType.DeveloperName == 'IndustriesHousehold' && acct.FinServ__PrimaryContact__c != null) {
            contactId = acct.FinServ__PrimaryContact__c;
        } else if (acct.PersonContactId != null) {
            contactId = acct.PersonContactId;
        } else {
            List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :accountId LIMIT 1];
            if (!contacts.isEmpty()) contactId = contacts[0].Id;
        }
        if (contactId == null) return null;

        return getIntakeForContact(contactId);
    }

    @TestVisible
    private static Map<String, Object> getIntakeForContact(Id contactId) {

        List<Federal_Benefits_Intake__c> intakes = [
            SELECT Id, Name, Status__c, AI_Parse_Confidence__c,
                   FedRetire_Report_Generated__c, Document_Upload_URL__c,
                   Retirement_System__c, Current_Annual_Salary__c,
                   Service_Computation_Date__c, Desired_Retirement_Date__c,
                   Sick_Leave_Hours_To_Date__c, Expected_Salary_Increase__c,
                   Employee_Type__c, Employee_Category__c, Is_Postal_Employee__c,
                   FEGLI_Basic__c, FEGLI_Option_A__c, FEGLI_Option_B__c,
                   FEGLI_Option_B_Multiplier__c, FEGLI_Option_C__c,
                   FEGLI_Biweekly_Premium__c,
                   FEHB_Biweekly_Premium__c, FEHB_Annual_Increase__c,
                   Survivor_Benefit_FERS__c, Spouse_DOB__c,
                   TSP_Trad_G_Balance__c, TSP_Trad_F_Balance__c, TSP_Trad_C_Balance__c,
                   TSP_Trad_S_Balance__c, TSP_Trad_I_Balance__c, TSP_Trad_L_Balance__c,
                   TSP_Roth_G_Balance__c, TSP_Roth_F_Balance__c, TSP_Roth_C_Balance__c,
                   TSP_Roth_S_Balance__c, TSP_Roth_I_Balance__c, TSP_Roth_L_Balance__c,
                   TSP_Trad_Biweekly_Dollar__c, TSP_Roth_Biweekly_Dollar__c,
                   SS_FERS_Monthly_Benefit__c, SS_FERS_Start_Age__c,
                   Has_DD214__c, Military_Service_From__c, Military_Service_To__c,
                   LES_Federal_Tax__c, LES_State_Tax__c, LES_Retirement_Deduction__c,
                   LES_Medicare__c, LES_SS_OASDI__c, LES_Dental__c, LES_Vision__c,
                   LES_FSA__c, LES_Allotment__c
            FROM Federal_Benefits_Intake__c
            WHERE Contact__c = :contactId
            ORDER BY AI_Parse_Confidence__c DESC NULLS LAST, CreatedDate DESC
            LIMIT 1
        ];

        if (intakes.isEmpty()) return null;

        Federal_Benefits_Intake__c fbi = intakes[0];

        Integer docCount = [SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = :fbi.Id];

        // Get actual document list with names
        List<ContentDocumentLink> docLinks = [
            SELECT ContentDocument.Title, ContentDocument.FileType,
                   ContentDocument.ContentSize, ContentDocumentId
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :fbi.Id
            ORDER BY ContentDocument.CreatedDate DESC
        ];
        List<Map<String, String>> docList = new List<Map<String, String>>();
        for (ContentDocumentLink cdl : docLinks) {
            Map<String, String> doc = new Map<String, String>();
            doc.put('title', cdl.ContentDocument.Title);
            doc.put('fileType', cdl.ContentDocument.FileType);
            doc.put('size', String.valueOf(Math.round(cdl.ContentDocument.ContentSize / 1024.0)) + ' KB');
            doc.put('docId', cdl.ContentDocumentId);
            docList.add(doc);
        }

        // Calculate TSP totals
        Decimal tspTrad = (fbi.TSP_Trad_G_Balance__c != null ? fbi.TSP_Trad_G_Balance__c : 0) +
            (fbi.TSP_Trad_F_Balance__c != null ? fbi.TSP_Trad_F_Balance__c : 0) +
            (fbi.TSP_Trad_C_Balance__c != null ? fbi.TSP_Trad_C_Balance__c : 0) +
            (fbi.TSP_Trad_S_Balance__c != null ? fbi.TSP_Trad_S_Balance__c : 0) +
            (fbi.TSP_Trad_I_Balance__c != null ? fbi.TSP_Trad_I_Balance__c : 0) +
            (fbi.TSP_Trad_L_Balance__c != null ? fbi.TSP_Trad_L_Balance__c : 0);
        Decimal tspRoth = (fbi.TSP_Roth_G_Balance__c != null ? fbi.TSP_Roth_G_Balance__c : 0) +
            (fbi.TSP_Roth_F_Balance__c != null ? fbi.TSP_Roth_F_Balance__c : 0) +
            (fbi.TSP_Roth_C_Balance__c != null ? fbi.TSP_Roth_C_Balance__c : 0) +
            (fbi.TSP_Roth_S_Balance__c != null ? fbi.TSP_Roth_S_Balance__c : 0) +
            (fbi.TSP_Roth_I_Balance__c != null ? fbi.TSP_Roth_I_Balance__c : 0) +
            (fbi.TSP_Roth_L_Balance__c != null ? fbi.TSP_Roth_L_Balance__c : 0);

        Map<String, Object> result = new Map<String, Object>();
        result.put('intakeId', fbi.Id);
        result.put('intakeName', fbi.Name);
        result.put('status', fbi.Status__c);
        result.put('confidence', fbi.AI_Parse_Confidence__c);
        result.put('reportGenerated', fbi.FedRetire_Report_Generated__c);
        result.put('documentCount', docCount);
        result.put('documents', docList);

        // Employment
        result.put('retirementSystem', fbi.Retirement_System__c);
        result.put('salary', fbi.Current_Annual_Salary__c);
        result.put('scd', fbi.Service_Computation_Date__c);
        result.put('retirementDate', fbi.Desired_Retirement_Date__c);
        result.put('sickLeave', fbi.Sick_Leave_Hours_To_Date__c);
        result.put('employeeType', fbi.Employee_Type__c);
        result.put('employeeCategory', fbi.Employee_Category__c);

        // TSP
        result.put('tspTraditional', tspTrad);
        result.put('tspRoth', tspRoth);
        result.put('tspTotal', tspTrad + tspRoth);
        result.put('tspTradBiweekly', fbi.TSP_Trad_Biweekly_Dollar__c);
        result.put('tspRothBiweekly', fbi.TSP_Roth_Biweekly_Dollar__c);

        // Insurance
        result.put('fegliBasic', fbi.FEGLI_Basic__c);
        result.put('fegliOptionA', fbi.FEGLI_Option_A__c);
        result.put('fegliOptionB', fbi.FEGLI_Option_B__c);
        result.put('fegliMultiplier', fbi.FEGLI_Option_B_Multiplier__c);
        result.put('fehbPremium', fbi.FEHB_Biweekly_Premium__c);
        result.put('fegliPremium', fbi.FEGLI_Biweekly_Premium__c);

        // Social Security
        result.put('ssMonthly', fbi.SS_FERS_Monthly_Benefit__c);
        result.put('ssStartAge', fbi.SS_FERS_Start_Age__c);

        // Survivor
        result.put('survivorBenefit', fbi.Survivor_Benefit_FERS__c);

        // Military
        result.put('hasDd214', fbi.Has_DD214__c);
        result.put('militaryFrom', fbi.Military_Service_From__c);
        result.put('militaryTo', fbi.Military_Service_To__c);

        // LES Deductions
        result.put('lesFederalTax', fbi.LES_Federal_Tax__c);
        result.put('lesStateTax', fbi.LES_State_Tax__c);
        result.put('lesRetirement', fbi.LES_Retirement_Deduction__c);
        result.put('lesMedicare', fbi.LES_Medicare__c);
        result.put('lesOasdi', fbi.LES_SS_OASDI__c);

        return result;
    }

    // ============================================================
    // Helpers
    // ============================================================

    private static void sendUploadInvitation(String clientName, String clientEmail, String portalUrl) {
        Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
        // Send from VIP@capitalwealth.com per org policy (all SF emails from VIP).
        List<OrgWideEmailAddress> owa = [
            SELECT Id FROM OrgWideEmailAddress WHERE Address = 'vip@capitalwealth.com' LIMIT 1
        ];
        if (!owa.isEmpty()) email.setOrgWideEmailAddressId(owa[0].Id);
        email.setToAddresses(new List<String>{ clientEmail });
        email.setSubject('Your Capital Wealth Vault is Ready — Secure Document Upload');
        email.setHtmlBody(
            '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">' +
            '<tr><td align="center">' +
            '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">' +

            // Header — text wordmark (renders even with remote images blocked)
            '<tr><td style="background:#16253C;padding:28px 32px;text-align:center;border-bottom:3px solid #C7A356;">' +
            '<div style="color:#C7A356;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.2em;margin-bottom:6px;">CAPITAL WEALTH</div>' +
            '<div style="color:#ffffff;font-family:Georgia,\'Times New Roman\',serif;font-size:22px;font-weight:400;letter-spacing:0.08em;">THE VAULT</div>' +
            '</td></tr>' +

            // Body
            '<tr><td style="padding:32px;">' +
            '<h2 style="color:#1a3a5c;margin:0 0 16px 0;font-size:22px;">Your Capital Wealth Vault</h2>' +
            '<p style="color:#333;font-size:15px;line-height:1.6;">Dear ' + clientName + ',</p>' +
            '<p style="color:#333;font-size:15px;line-height:1.6;">Your advisor at Capital Wealth has opened your private <strong>Capital Wealth Vault</strong> — a secure space to upload your federal benefits documents so we can prepare your personalized Retirement Money Map&trade;.</p>' +

            // CTA Button
            '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center">' +
            '<a href="' + portalUrl + '" style="display:inline-block;background:#0d7a3e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">Open My Capital Wealth Vault</a>' +
            '</td></tr></table>' +

            // Document list
            '<p style="color:#333;font-size:15px;line-height:1.6;">Please upload any of the following documents you have available:</p>' +
            '<table style="margin:8px 0 16px 0;"><tbody>' +
            '<tr><td style="padding:4px 8px;color:#0d7a3e;font-size:14px;">&#10003;</td><td style="padding:4px 0;color:#333;font-size:14px;">Leave and Earnings Statement (LES)</td></tr>' +
            '<tr><td style="padding:4px 8px;color:#0d7a3e;font-size:14px;">&#10003;</td><td style="padding:4px 0;color:#333;font-size:14px;">SF-50 (Notification of Personnel Action)</td></tr>' +
            '<tr><td style="padding:4px 8px;color:#0d7a3e;font-size:14px;">&#10003;</td><td style="padding:4px 0;color:#333;font-size:14px;">TSP Statement (Thrift Savings Plan)</td></tr>' +
            '<tr><td style="padding:4px 8px;color:#0d7a3e;font-size:14px;">&#10003;</td><td style="padding:4px 0;color:#333;font-size:14px;">DD-214 (if applicable)</td></tr>' +
            '<tr><td style="padding:4px 8px;color:#0d7a3e;font-size:14px;">&#10003;</td><td style="padding:4px 0;color:#333;font-size:14px;">Social Security Statement</td></tr>' +
            '<tr><td style="padding:4px 8px;color:#0d7a3e;font-size:14px;">&#10003;</td><td style="padding:4px 0;color:#333;font-size:14px;">Personal Benefits Statement</td></tr>' +
            '</tbody></table>' +

            // Security note
            '<div style="background:#f0f7f3;border-left:4px solid #0d7a3e;padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0;">' +
            '<p style="color:#1a3a5c;font-size:13px;margin:0;"><strong>&#128274; Your documents are encrypted</strong> in transit and at rest. Only your assigned advisor can access them.</p>' +
            '</div>' +

            '<p style="color:#666;font-size:13px;line-height:1.5;">This link expires in 7 days. If you have any questions, please contact your advisor directly.</p>' +
            '</td></tr>' +

            // Footer
            '<tr><td style="background:#f8f8f8;padding:20px 32px;border-top:1px solid #e8e8e8;text-align:center;">' +
            '<p style="color:#999;font-size:12px;margin:0;">Capital Wealth</p>' +
            '<p style="color:#bbb;font-size:11px;margin:4px 0 0 0;">This is a secure communication. Do not forward this email.</p>' +
            '</td></tr>' +

            '</table></td></tr></table></body></html>'
        );
        email.setPlainTextBody(
            'Dear ' + clientName + ',\n\n' +
            'Your advisor at Capital Wealth has opened your Capital Wealth Vault — a secure space to upload your federal benefits documents.\n\n' +
            'Open your Vault: ' + portalUrl + '\n\n' +
            'This link expires in 7 days.\n\nCapital Wealth'
        );
        email.setSaveAsActivity(true);

        try {
            Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ email });
        } catch (Exception e) {
            System.debug('Email send failed: ' + e.getMessage());
        }
    }

    private static String generateUUID() {
        Blob b = Crypto.generateAesKey(128);
        String h = EncodingUtil.convertToHex(b);
        return h.substring(0, 8) + '-' + h.substring(8, 12) + '-4' +
               h.substring(13, 16) + '-' + h.substring(16, 20) + '-' +
               h.substring(20, 32);
    }
}