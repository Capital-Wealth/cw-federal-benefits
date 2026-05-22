@isTest
private class SRIntakeService_Test {

    private static SR_Intake__c makeIntake() {
        Id rt = [SELECT Id FROM RecordType WHERE SobjectType='Account' AND IsPersonType=true LIMIT 1].Id;
        Account a = new Account(RecordTypeId=rt, FirstName='Test', LastName='Client', PersonEmail='sr.test@example.com');
        insert a;
        SR_Intake__c i = new SR_Intake__c(Account__c=a.Id, Status__c='Sent');
        insert i;
        return i;
    }

    @isTest static void testGetSession() {
        SR_Intake__c i = makeIntake();
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/sr-intake';
        req.httpMethod = 'GET';
        req.addParameter('id', i.Id);
        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        SRIntakeService.getSession();
        Test.stopTest();

        // success path leaves statusCode unset (platform default 200) — assert on body
        String body = RestContext.response.responseBody.toString();
        System.assert(body.contains('"valid":true'), body);
        System.assert(body.contains('Test Client'), 'expected account name in: ' + body);
    }

    @isTest static void testGetSessionMissingId() {
        RestRequest req = new RestRequest();
        req.httpMethod = 'GET';
        RestContext.request = req;
        RestContext.response = new RestResponse();
        SRIntakeService.getSession();
        System.assertEquals(400, RestContext.response.statusCode);
    }

    @isTest static void testSaveThenComplete() {
        SR_Intake__c i = makeIntake();

        // save
        RestRequest req = new RestRequest();
        req.httpMethod = 'POST';
        req.requestURI = '/services/apexrest/sr-intake';
        req.requestBody = Blob.valueOf(JSON.serialize(new Map<String,Object>{
            'id' => i.Id,
            'action' => 'save',
            'fields' => new Map<String,Object>{
                'Top_Concern__c' => 'Worried about the markets',
                'Concern_Market_Volatility__c' => true,
                'Retirement_Timing__c' => 'In 1-3 years',
                'Submitted_Date__c' => '2026-05-22T10:00:00'
            }
        }));
        RestContext.request = req;
        RestContext.response = new RestResponse();
        SRIntakeService.handleAction();
        System.assert(RestContext.response.responseBody.toString().contains('"success":true'),
            RestContext.response.responseBody.toString());

        SR_Intake__c afterSave = [SELECT Status__c, Top_Concern__c, Concern_Market_Volatility__c FROM SR_Intake__c WHERE Id=:i.Id];
        System.assertEquals('In Progress', afterSave.Status__c);
        System.assertEquals('Worried about the markets', afterSave.Top_Concern__c);
        System.assertEquals(true, afterSave.Concern_Market_Volatility__c);

        // complete
        RestRequest req2 = new RestRequest();
        req2.httpMethod = 'POST';
        req2.requestBody = Blob.valueOf(JSON.serialize(new Map<String,Object>{
            'id' => i.Id, 'action' => 'complete',
            'fields' => new Map<String,Object>{ 'Income_Plan_Confidence__c' => 'Somewhat confident' }
        }));
        RestContext.request = req2;
        RestContext.response = new RestResponse();

        Test.startTest();
        SRIntakeService.handleAction();
        Test.stopTest();

        System.assert(RestContext.response.responseBody.toString().contains('Survey submitted'),
            RestContext.response.responseBody.toString());
        SR_Intake__c done = [SELECT Status__c, Submitted_Date__c FROM SR_Intake__c WHERE Id=:i.Id];
        System.assertEquals('Completed', done.Status__c);
        System.assertNotEquals(null, done.Submitted_Date__c);
        // review Task created for owner
        System.assertEquals(1, [SELECT COUNT() FROM Task WHERE Subject='Review Pre-SR Intake Survey']);
    }

    @isTest static void testActionMissingId() {
        RestRequest req = new RestRequest();
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(JSON.serialize(new Map<String,Object>{ 'action' => 'save' }));
        RestContext.request = req;
        RestContext.response = new RestResponse();
        SRIntakeService.handleAction();
        System.assertEquals(400, RestContext.response.statusCode);
    }

    @isTest static void testActionBadJson() {
        RestRequest req = new RestRequest();
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf('not json');
        RestContext.request = req;
        RestContext.response = new RestResponse();
        SRIntakeService.handleAction();
        System.assertEquals(400, RestContext.response.statusCode);
    }
}
