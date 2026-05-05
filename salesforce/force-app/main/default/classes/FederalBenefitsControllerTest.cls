@isTest
private class FederalBenefitsControllerTest {

    @TestSetup
    static void setupData() {
        Contact c = new Contact(FirstName = 'Test', LastName = 'Federal', Email = 'test@gsa.gov');
        insert c;

        Lead l = new Lead(FirstName = 'Test', LastName = 'Lead', Email = 'lead@gsa.gov', Company = 'Test Lead');
        insert l;

        Federal_Benefits_Intake__c fbi = new Federal_Benefits_Intake__c(
            Status__c = 'Docs Uploaded', Retirement_System__c = 'FERS',
            Current_Annual_Salary__c = 95000, Supabase_Folder_ID__c = 'test-token-123',
            Contact__c = [SELECT Id FROM Contact LIMIT 1].Id
        );
        insert fbi;
    }

    @isTest
    static void testInviteToUploadContact() {
        FederalBenefitsController.testSiteUrl = 'https://test.example.com';
        Contact c = [SELECT Id FROM Contact LIMIT 1];

        Test.startTest();
        Map<String, String> result = FederalBenefitsController.inviteToUpload(c.Id, 'Contact');
        Test.stopTest();

        System.assertNotEquals(null, result.get('intakeId'));
        System.assert(result.get('portalUrl').contains('https://test.example.com/portal/'));
        System.assertEquals('true', result.get('emailSent'));

        Federal_Benefits_Intake__c fbi = [SELECT Status__c, Contact__c FROM Federal_Benefits_Intake__c WHERE Id = :result.get('intakeId')];
        System.assertEquals('Link Sent', fbi.Status__c);
        System.assertEquals(c.Id, fbi.Contact__c);
    }

    @isTest
    static void testInviteToUploadLead() {
        FederalBenefitsController.testSiteUrl = 'https://test.example.com';
        Lead l = [SELECT Id FROM Lead LIMIT 1];

        Test.startTest();
        Map<String, String> result = FederalBenefitsController.inviteToUpload(l.Id, 'Lead');
        Test.stopTest();

        System.assertNotEquals(null, result.get('intakeId'));
    }

    @isTest
    static void testInviteNoEmail() {
        FederalBenefitsController.testSiteUrl = 'https://test.example.com';
        Contact noEmail = new Contact(FirstName = 'No', LastName = 'Email');
        insert noEmail;

        Test.startTest();
        Boolean threw = false;
        try {
            FederalBenefitsController.inviteToUpload(noEmail.Id, 'Contact');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'Should throw for missing email');
    }

    @isTest
    static void testGetUploadStatus() {
        Federal_Benefits_Intake__c fbi = [SELECT Id FROM Federal_Benefits_Intake__c LIMIT 1];

        Test.startTest();
        Map<String, Object> result = FederalBenefitsController.getUploadStatus(fbi.Id);
        Test.stopTest();

        System.assertEquals('Docs Uploaded', result.get('status'));
    }

    @isTest
    static void testMarkComplete() {
        Federal_Benefits_Intake__c fbi = [SELECT Id FROM Federal_Benefits_Intake__c LIMIT 1];

        Test.startTest();
        FederalBenefitsController.markComplete(fbi.Id);
        Test.stopTest();

        fbi = [SELECT Status__c FROM Federal_Benefits_Intake__c WHERE Id = :fbi.Id];
        System.assertEquals('Complete', fbi.Status__c);
    }

    @isTest
    static void testMarkReportGenerated() {
        Federal_Benefits_Intake__c fbi = [SELECT Id FROM Federal_Benefits_Intake__c LIMIT 1];

        Test.startTest();
        FederalBenefitsController.markReportGenerated(fbi.Id);
        Test.stopTest();

        fbi = [SELECT FedRetire_Report_Generated__c FROM Federal_Benefits_Intake__c WHERE Id = :fbi.Id];
        System.assertEquals(true, fbi.FedRetire_Report_Generated__c);
    }

    @isTest
    static void testFileUploadService() {
        Federal_Benefits_Intake__c fbi = [SELECT Id FROM Federal_Benefits_Intake__c WHERE Supabase_Folder_ID__c = 'test-token-123' LIMIT 1];

        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/upload';
        req.httpMethod = 'POST';
        req.params.put('token', 'test-token-123');
        req.params.put('fileName', 'test-les.pdf');
        req.params.put('documentType', 'LES');
        req.requestBody = Blob.valueOf('test file content');
        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        FileUploadService.UploadResponse result = FileUploadService.uploadDocument();
        Test.stopTest();

        System.assertEquals(true, result.success);

        // Verify file was linked to FBI record
        List<ContentDocumentLink> links = [
            SELECT Id FROM ContentDocumentLink WHERE LinkedEntityId = :fbi.Id
        ];
        System.assert(links.size() > 0, 'File should be linked to FBI record');

        // Verify status was updated
        fbi = [SELECT Status__c FROM Federal_Benefits_Intake__c WHERE Id = :fbi.Id];
        System.assertEquals('Docs Uploaded', fbi.Status__c);
    }

    @isTest
    static void testFileUploadMultipleDocs() {
        Federal_Benefits_Intake__c fbi = [SELECT Id FROM Federal_Benefits_Intake__c WHERE Supabase_Folder_ID__c = 'test-token-123' LIMIT 1];

        // Upload 3 documents
        for (String docName : new List<String>{'sf50.pdf', 'tsp.pdf', 'dd214.pdf'}) {
            RestRequest req = new RestRequest();
            req.requestURI = '/services/apexrest/upload';
            req.httpMethod = 'POST';
            req.params.put('token', 'test-token-123');
            req.params.put('fileName', docName);
            req.params.put('documentType', 'Other');
            req.requestBody = Blob.valueOf('test content for ' + docName);
            RestContext.request = req;
            RestContext.response = new RestResponse();

            FileUploadService.UploadResponse result = FileUploadService.uploadDocument();
            System.assertEquals(true, result.success, 'Upload should succeed for ' + docName);
        }

        // Verify all 3 linked
        List<ContentDocumentLink> links = [
            SELECT Id FROM ContentDocumentLink WHERE LinkedEntityId = :fbi.Id
        ];
        System.assert(links.size() >= 3, 'All 3 files should be linked');
    }

    @isTest
    static void testFileUploadGetSession() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/upload';
        req.httpMethod = 'GET';
        req.params.put('token', 'test-token-123');
        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        FileUploadService.SessionResponse result = FileUploadService.getSession();
        Test.stopTest();

        System.assertEquals(true, result.valid);
        System.assert(result.documentCount >= 0);
    }

    @isTest
    static void testFileUploadMissingParams() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/upload';
        req.httpMethod = 'POST';
        req.params.put('token', '');
        req.params.put('fileName', '');
        req.requestBody = null;
        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        FileUploadService.UploadResponse result = FileUploadService.uploadDocument();
        Test.stopTest();

        System.assertEquals(false, result.success);
    }

    @isTest
    static void testFileUploadInvalidToken() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/upload';
        req.httpMethod = 'POST';
        req.params.put('token', 'invalid-token');
        req.params.put('fileName', 'test.pdf');
        req.requestBody = Blob.valueOf('test');
        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        FileUploadService.UploadResponse result = FileUploadService.uploadDocument();
        Test.stopTest();

        System.assertEquals(false, result.success);
    }

    @isTest
    static void testGetSession() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/upload';
        req.httpMethod = 'GET';
        req.params.put('token', 'test-token-123');
        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        FileUploadService.SessionResponse result = FileUploadService.getSession();
        Test.stopTest();

        System.assertEquals(true, result.valid);
    }

    @isTest
    static void testGetIntakeForAccountNull() {
        Account a = new Account(Name = 'Test Corp');
        insert a;

        Test.startTest();
        Map<String, Object> result = FederalBenefitsController.getIntakeForAccount(a.Id);
        Test.stopTest();

        System.assertEquals(null, result);
    }

    @isTest
    static void testInviteToUploadFromAccountLike() {
        // Test inviting from a Contact (covers the Contact branch)
        FederalBenefitsController.testSiteUrl = 'https://test.example.com';
        Contact c = [SELECT Id FROM Contact WHERE Email = 'test@gsa.gov' LIMIT 1];

        Test.startTest();
        Map<String, String> result = FederalBenefitsController.inviteToUpload(c.Id, 'Contact');
        Test.stopTest();

        System.assertNotEquals(null, result.get('intakeId'));
        
        // Verify the FBI record was created with correct Contact link
        Federal_Benefits_Intake__c fbi = [
            SELECT Contact__c, Status__c, Supabase_Folder_ID__c, Document_Upload_URL__c
            FROM Federal_Benefits_Intake__c 
            WHERE Id = :result.get('intakeId')
        ];
        System.assertEquals('Link Sent', fbi.Status__c);
        System.assertNotEquals(null, fbi.Supabase_Folder_ID__c);
        System.assertNotEquals(null, fbi.Document_Upload_URL__c);
    }

    @isTest
    static void testGetUploadStatusWithDocs() {
        Federal_Benefits_Intake__c fbi = [SELECT Id FROM Federal_Benefits_Intake__c WHERE Supabase_Folder_ID__c = 'test-token-123' LIMIT 1];
        
        // Upload a doc first
        ContentVersion cv = new ContentVersion(
            Title = 'Test Doc', PathOnClient = 'test.pdf',
            VersionData = Blob.valueOf('test'), Description = 'Document type: LES. Test.'
        );
        insert cv;
        cv = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id];
        insert new ContentDocumentLink(
            ContentDocumentId = cv.ContentDocumentId, LinkedEntityId = fbi.Id,
            ShareType = 'V', Visibility = 'AllUsers'
        );
        
        Test.startTest();
        Map<String, Object> result = FederalBenefitsController.getUploadStatus(fbi.Id);
        Test.stopTest();
        
        System.assertEquals(1, result.get('documentCount'));
        List<Object> docs = (List<Object>) result.get('documents');
        System.assertEquals(1, docs.size());
    }


    @isTest
    static void testMarkCompleteFromAccount() {
        Federal_Benefits_Intake__c fbi = [SELECT Id FROM Federal_Benefits_Intake__c WHERE Supabase_Folder_ID__c = 'test-token-123' LIMIT 1];
        
        Test.startTest();
        FederalBenefitsController.markComplete(fbi.Id);
        FederalBenefitsController.markReportGenerated(fbi.Id);
        Test.stopTest();
        
        fbi = [SELECT Status__c, FedRetire_Report_Generated__c FROM Federal_Benefits_Intake__c WHERE Id = :fbi.Id];
        System.assertEquals('Complete', fbi.Status__c);
        System.assertEquals(true, fbi.FedRetire_Report_Generated__c);
    }

    @isTest
    static void testInviteFromLead() {
        FederalBenefitsController.testSiteUrl = 'https://test.example.com';
        Lead l = [SELECT Id FROM Lead LIMIT 1];
        
        Test.startTest();
        Map<String, String> result = FederalBenefitsController.inviteToUpload(l.Id, 'Lead');
        Test.stopTest();
        
        System.assertNotEquals(null, result.get('intakeId'));
        Federal_Benefits_Intake__c fbi = [SELECT Lead__c FROM Federal_Benefits_Intake__c WHERE Id = :result.get('intakeId')];
        System.assertEquals(l.Id, fbi.Lead__c);
    }

    @isTest
    static void testGetSessionExpired() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/upload';
        req.httpMethod = 'GET';
        req.params.put('token', 'nonexistent-token');
        RestContext.request = req;
        RestContext.response = new RestResponse();
        
        Test.startTest();
        FileUploadService.SessionResponse result = FileUploadService.getSession();
        Test.stopTest();
        
        System.assertEquals(false, result.valid);
    }

    @isTest
    static void testGetSessionNoToken() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/upload';
        req.httpMethod = 'GET';
        req.params.put('token', '');
        RestContext.request = req;
        RestContext.response = new RestResponse();
        
        Test.startTest();
        FileUploadService.SessionResponse result = FileUploadService.getSession();
        Test.stopTest();
        
        System.assertEquals(false, result.valid);
    }


    @isTest
    static void testGetIntakeForContactDirect() {
        Contact c = [SELECT Id FROM Contact WHERE Email = 'test@gsa.gov' LIMIT 1];
        
        Test.startTest();
        Map<String, Object> result = FederalBenefitsController.getIntakeForContact(c.Id);
        Test.stopTest();
        
        System.assertNotEquals(null, result);
        System.assertNotEquals(null, result.get('intakeId'));
        System.assertEquals('Docs Uploaded', result.get('status'));
        System.assertNotEquals(null, result.get('documentCount'));
    }


    @isTest
    static void testGenerateReportWithMock() {
        Federal_Benefits_Intake__c fbi = [SELECT Id FROM Federal_Benefits_Intake__c WHERE Supabase_Folder_ID__c = 'test-token-123' LIMIT 1];

        // Mock both the calculation and PDF callouts
        Test.setMock(HttpCalloutMock.class, new ReportMock());

        Test.startTest();
        Map<String, Object> result = FederalBenefitsController.generateReport(fbi.Id);
        Test.stopTest();

        System.assertNotEquals(null, result);
        // Check if report was marked as generated
        fbi = [SELECT FedRetire_Report_Generated__c, Status__c FROM Federal_Benefits_Intake__c WHERE Id = :fbi.Id];
        System.assertEquals(true, fbi.FedRetire_Report_Generated__c);
    }

    @isTest
    static void testStartDirectUploadContact() {
        Contact c = [SELECT Id FROM Contact LIMIT 1];

        Test.startTest();
        Map<String, String> result = FederalBenefitsController.startDirectUpload(c.Id, 'Contact');
        Test.stopTest();

        System.assertNotEquals(null, result.get('intakeId'));
        System.assertNotEquals(null, result.get('intakeName'));

        Federal_Benefits_Intake__c fbi = [
            SELECT Status__c, Contact__c, Supabase_Folder_ID__c
            FROM Federal_Benefits_Intake__c WHERE Id = :result.get('intakeId')
        ];
        System.assertEquals('Draft', fbi.Status__c);
        System.assertEquals(c.Id, fbi.Contact__c);
        System.assertNotEquals(null, fbi.Supabase_Folder_ID__c);
    }

    @isTest
    static void testStartDirectUploadLead() {
        Lead l = [SELECT Id FROM Lead LIMIT 1];

        Test.startTest();
        Map<String, String> result = FederalBenefitsController.startDirectUpload(l.Id, 'Lead');
        Test.stopTest();

        Federal_Benefits_Intake__c fbi = [
            SELECT Status__c, Lead__c FROM Federal_Benefits_Intake__c WHERE Id = :result.get('intakeId')
        ];
        System.assertEquals('Draft', fbi.Status__c);
        System.assertEquals(l.Id, fbi.Lead__c);
    }

    @isTest
    static void testParseUploadedDocuments() {
        Federal_Benefits_Intake__c fbi = [SELECT Id FROM Federal_Benefits_Intake__c LIMIT 1];
        Test.setMock(HttpCalloutMock.class, new ParseMock());

        Test.startTest();
        FederalBenefitsController.parseUploadedDocuments(fbi.Id);
        Test.stopTest();

        fbi = [SELECT Status__c FROM Federal_Benefits_Intake__c WHERE Id = :fbi.Id];
        System.assertEquals('Docs Uploaded', fbi.Status__c);
    }

    private class ParseMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"success":true}');
            return res;
        }
    }

    private class ReportMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            if (req.getEndpoint().contains('/api/report/pdf')) {
                res.setBodyAsBlob(Blob.valueOf('%PDF-1.4 test pdf content'));
                res.setHeader('Content-Type', 'application/pdf');
            } else {
                res.setBody('{"success":true,"employeeName":"Test Employee","input":{"personal":{"fullName":"Test"}},"results":{"annuity":{"annualAnnuity":25000}}}');
                res.setHeader('Content-Type', 'application/json');
            }
            return res;
        }
    }

}