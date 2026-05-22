/**
 * SRIntakeLauncher — creates a pre-Strategic-Review intake survey record from an
 * SR Meeting, builds the client survey URL, and (optionally) emails the link to
 * the client from the VIP org-wide address.
 *
 * Advisor-initiated (manual quick action) — there is NO org-wide auto-fire, so the
 * send stays gated until an advisor chooses to send it.
 *
 *   benefits.capitalwealth.com/sr-intake/<intakeId> — the client survey
 *   /services/apexrest/sr-intake (SRIntakeService) — read/write
 */
public with sharing class SRIntakeLauncher {

    @TestVisible private static final String SURVEY_BASE = 'https://benefits.capitalwealth.com/sr-intake/';
    @TestVisible private static final String VIP_ADDRESS = 'vip@capitalwealth.com';

    /** Create the intake record only (no email). Returns its Id. */
    @AuraEnabled
    public static Id createForMeeting(Id meetingId) {
        return buildAndInsert(meetingId).Id;
    }

    /**
     * Create the intake AND email the survey link to the client.
     * Returns { intakeId, url, sentTo, clientName }.
     */
    @AuraEnabled
    public static Map<String, Object> createAndSend(Id meetingId) {
        SR_Intake__c intake = buildAndInsert(meetingId);
        String url = SURVEY_BASE + intake.Id;

        String clientEmail;
        String clientFirst;
        try {
            Account a = [
                SELECT FirstName, PersonEmail FROM Account WHERE Id = :intake.Account__c LIMIT 1
            ];
            clientEmail = a.PersonEmail;
            clientFirst = a.FirstName;
        } catch (Exception e) {
            throw new AuraHandledException('Could not read the client record: ' + e.getMessage());
        }

        if (String.isBlank(clientEmail)) {
            throw new AuraHandledException('The client has no email address on file, so the survey could not be sent. The link is ready: ' + url);
        }

        sendSurveyEmail(clientEmail, clientFirst, url);

        return new Map<String, Object>{
            'intakeId'   => intake.Id,
            'url'        => url,
            'sentTo'     => clientEmail,
            'clientName' => clientFirst
        };
    }

    // ---------- internal ----------

    private static SR_Intake__c buildAndInsert(Id meetingId) {
        if (meetingId == null) {
            throw new AuraHandledException('Meeting Id is required.');
        }
        List<Meeting__c> mtgs = [SELECT Account__c FROM Meeting__c WHERE Id = :meetingId LIMIT 1];
        if (mtgs.isEmpty() || mtgs[0].Account__c == null) {
            throw new AuraHandledException('The Meeting has no Account, so a survey cannot be created.');
        }
        SR_Intake__c m = new SR_Intake__c(
            Account__c = mtgs[0].Account__c,
            Strategic_Review_Meeting__c = meetingId,
            Advisor__c = UserInfo.getUserId(),
            Status__c = 'Sent'
        );
        insert m;
        return m;
    }

    private static void sendSurveyEmail(String toAddress, String firstName, String url) {
        Messaging.SingleEmailMessage msg = new Messaging.SingleEmailMessage();
        msg.setToAddresses(new List<String>{ toAddress });
        msg.setSubject('A quick way to prep for your upcoming review');
        msg.setSaveAsActivity(false);

        // Send from the VIP org-wide address (Capital Wealth standard).
        for (OrgWideEmailAddress owa : [
            SELECT Id FROM OrgWideEmailAddress WHERE Address = :VIP_ADDRESS LIMIT 1
        ]) {
            msg.setOrgWideEmailAddressId(owa.Id);
        }

        String hi = String.isBlank(firstName) ? 'Hi there,' : 'Hi ' + firstName + ',';
        String html =
            '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;line-height:1.55;">'
          + '<p>' + hi + '</p>'
          + '<p>Before we sit down for your Strategic Review, we want the time to be entirely about you. '
          + 'If you have about five minutes, this short, optional survey lets your advisor walk in already '
          + 'focused on what matters most to you &mdash; no surprises, and no time wasted on things you have already handled.</p>'
          + '<p style="margin:26px 0;">'
          + '<a href="' + url + '" style="background:#0b3d2e;color:#ffffff;text-decoration:none;'
          + 'padding:13px 26px;border-radius:6px;font-weight:bold;display:inline-block;">Start the survey</a>'
          + '</p>'
          + '<p>There are no wrong answers, and anything you would rather talk through in person, you can simply skip.</p>'
          + '<p>We are looking forward to seeing you.</p>'
          + '<p style="margin-top:22px;">Warmly,<br/>Capital Wealth</p>'
          + '<p style="font-size:12px;color:#888;margin-top:24px;">If the button does not work, copy and paste this link:<br/>' + url + '</p>'
          + '</div>';
        msg.setHtmlBody(html);

        Messaging.SendEmailResult[] results = Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ msg });
        if (results != null && !results.isEmpty() && !results[0].isSuccess()) {
            String err = results[0].getErrors().isEmpty() ? 'Unknown error' : results[0].getErrors()[0].getMessage();
            throw new AuraHandledException('The survey email could not be sent: ' + err + '. The link is ready: ' + url);
        }
    }
}
