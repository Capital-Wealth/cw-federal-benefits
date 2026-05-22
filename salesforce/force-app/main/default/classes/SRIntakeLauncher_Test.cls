@isTest
private class SRIntakeLauncher_Test {

    private static Account makeClient(String email) {
        Id rt = [SELECT Id FROM RecordType WHERE SobjectType='Account' AND IsPersonType=true LIMIT 1].Id;
        Account a = new Account(RecordTypeId=rt, FirstName='Pat', LastName='Client', PersonEmail=email);
        insert a;
        return a;
    }

    private static Meeting__c makeMeeting(Id acctId) {
        Meeting__c m = new Meeting__c(
            Meeting_Date__c = Date.today().addDays(7),
            Meeting_Type__c = 'Strategic Review Meeting 1'
        );
        if (acctId != null) m.Account__c = acctId;
        insert m;
        return m;
    }

    @isTest static void testCreateForMeeting() {
        Account a = makeClient('pat.client@example.com');
        Meeting__c m = makeMeeting(a.Id);

        Test.startTest();
        Id intakeId = SRIntakeLauncher.createForMeeting(m.Id);
        Test.stopTest();

        SR_Intake__c i = [SELECT Account__c, Strategic_Review_Meeting__c, Advisor__c, Status__c FROM SR_Intake__c WHERE Id=:intakeId];
        System.assertEquals(a.Id, i.Account__c);
        System.assertEquals(m.Id, i.Strategic_Review_Meeting__c);
        System.assertEquals(UserInfo.getUserId(), i.Advisor__c);
        System.assertEquals('Sent', i.Status__c);
    }

    @isTest static void testCreateAndSend() {
        Account a = makeClient('pat.client@example.com');
        Meeting__c m = makeMeeting(a.Id);

        Test.startTest();
        Map<String,Object> res = SRIntakeLauncher.createAndSend(m.Id);
        Test.stopTest();

        System.assertEquals('pat.client@example.com', res.get('sentTo'));
        System.assert(((String) res.get('url')).contains('/sr-intake/'), res.get('url'));
        System.assertNotEquals(null, res.get('intakeId'));
    }

    @isTest static void testSendNoEmail() {
        Account a = makeClient(null); // no PersonEmail
        Meeting__c m = makeMeeting(a.Id);
        Boolean threw = false;
        Test.startTest();
        try { SRIntakeLauncher.createAndSend(m.Id); }
        catch (Exception e) { threw = true; }
        Test.stopTest();
        System.assert(threw, 'expected exception when client has no email');
    }

    @isTest static void testNullMeeting() {
        Boolean threw = false;
        try { SRIntakeLauncher.createForMeeting(null); }
        catch (Exception e) { threw = true; }
        System.assert(threw, 'expected exception for null meeting');
    }

    @isTest static void testMeetingNoAccount() {
        Meeting__c m = makeMeeting(null);
        Boolean threw = false;
        try { SRIntakeLauncher.createForMeeting(m.Id); }
        catch (Exception e) { threw = true; }
        System.assert(threw, 'expected exception for meeting without account');
    }
}
