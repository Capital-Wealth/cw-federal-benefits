/**
 * SRIntakeService — REST endpoint for the pre-Strategic-Review client intake survey (Vercel app).
 *
 * Mirrors Meeting1IntakeService. The "token" is the SR_Intake__c record Id itself —
 * the record is created in Salesforce first (by SRIntakeLauncher from the SR Meeting),
 * the link is sent to the client, and the client fills it out before the meeting.
 *
 * Uses Apex SOQL/DML directly so it bypasses the jsforce REST schema cache —
 * newly added custom fields are always visible.
 *
 *   GET  /services/apexrest/sr-intake?id=<recordId>
 *   POST /services/apexrest/sr-intake   body: { id, action, fields:{} }
 */
@RestResource(urlMapping='/sr-intake/*')
global without sharing class SRIntakeService {

    // ---------- GET: load the intake for prefill / resume ----------
    @HttpGet
    global static void getSession() {
        RestResponse res = RestContext.response;
        Map<String, Object> out = new Map<String, Object>();
        String recId = RestContext.request.params.get('id');

        if (String.isBlank(recId)) {
            res.statusCode = 400;
            writeJson(new Map<String, Object>{ 'error' => 'id required' });
            return;
        }

        List<String> intakeFields = customFieldNames('SR_Intake__c');
        String soql = 'SELECT Id, Name, Account__r.Name, ' + String.join(intakeFields, ', ')
                    + ' FROM SR_Intake__c WHERE Id = :recId LIMIT 1';

        List<SR_Intake__c> recs;
        try {
            recs = Database.query(soql);
        } catch (Exception e) {
            res.statusCode = 500;
            writeJson(new Map<String, Object>{ 'error' => e.getMessage() });
            return;
        }
        if (recs.isEmpty()) {
            res.statusCode = 404;
            writeJson(new Map<String, Object>{ 'error' => 'Intake not found' });
            return;
        }

        SR_Intake__c r = recs[0];
        Map<String, Object> fmap = new Map<String, Object>();
        for (String f : intakeFields) fmap.put(f, r.get(f));

        out.put('valid', true);
        out.put('intakeId', r.Id);
        out.put('intakeName', r.Name);
        out.put('accountName', r.Account__r != null ? r.Account__r.Name : null);
        out.put('record', fmap);
        writeJson(out);
    }

    // ---------- POST: save section data / mark complete ----------
    @HttpPost
    global static void handleAction() {
        RestResponse res = RestContext.response;

        Map<String, Object> body;
        try {
            body = (Map<String, Object>) JSON.deserializeUntyped(RestContext.request.requestBody.toString());
        } catch (Exception e) {
            res.statusCode = 400;
            writeJson(new Map<String, Object>{ 'error' => 'Invalid JSON body' });
            return;
        }

        String recId = (String) body.get('id');
        String action = (String) body.get('action');
        if (String.isBlank(recId)) {
            res.statusCode = 400;
            writeJson(new Map<String, Object>{ 'error' => 'id required' });
            return;
        }

        List<SR_Intake__c> recs = [
            SELECT Id, Account__c FROM SR_Intake__c WHERE Id = :recId LIMIT 1
        ];
        if (recs.isEmpty()) {
            res.statusCode = 404;
            writeJson(new Map<String, Object>{ 'error' => 'Intake not found' });
            return;
        }
        SR_Intake__c parent = recs[0];
        Boolean isComplete = (action == 'complete');

        Object fieldsObj = body.get('fields');
        if (fieldsObj instanceof Map<String, Object>) {
            Map<String, Object> fields = (Map<String, Object>) fieldsObj;
            Map<String, Schema.SObjectField> fmap =
                Schema.SObjectType.SR_Intake__c.fields.getMap();
            SR_Intake__c upd = new SR_Intake__c(Id = recId);
            for (String k : fields.keySet()) {
                Schema.SObjectField sf = fmap.get(k.toLowerCase());
                if (sf == null) continue;
                Schema.DescribeFieldResult d = sf.getDescribe();
                if (!d.isUpdateable() || !d.getName().endsWith('__c')) continue;
                try {
                    upd.put(d.getName(), coerce(d, fields.get(k)));
                } catch (Exception e) { /* skip un-coercible value */ }
            }
            upd.Status__c = isComplete ? 'Completed' : 'In Progress';
            if (isComplete) upd.Submitted_Date__c = System.now();
            try {
                update upd;
            } catch (Exception e) {
                res.statusCode = 500;
                writeJson(new Map<String, Object>{ 'error' => e.getMessage() });
                return;
            }
        }

        Map<String, Object> out = new Map<String, Object>{ 'success' => true };
        if (isComplete) {
            notifyOwner(recId, parent.Account__c);
            out.put('message', 'Survey submitted');
        } else {
            out.put('message', 'Saved');
        }
        writeJson(out);
    }

    // ---------- helpers ----------

    private static void writeJson(Object payload) {
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json');
        res.responseBody = Blob.valueOf(JSON.serialize(payload));
    }

    private static List<String> customFieldNames(String objApi) {
        List<String> names = new List<String>();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return names;
        for (Schema.SObjectField f : t.getDescribe().fields.getMap().values()) {
            String n = f.getDescribe().getName();
            if (n.endsWith('__c')) names.add(n);
        }
        return names;
    }

    private static Object coerce(Schema.DescribeFieldResult d, Object val) {
        if (val == null) return null;
        Schema.DisplayType t = d.getType();
        if (t == Schema.DisplayType.Boolean) {
            if (val instanceof Boolean) return val;
            return String.valueOf(val).equalsIgnoreCase('true');
        }
        String s = String.valueOf(val).trim();
        if (String.isBlank(s)) return null;
        if (t == Schema.DisplayType.Date) {
            return Date.valueOf(s.length() > 10 ? s.substring(0, 10) : s);
        }
        if (t == Schema.DisplayType.DateTime) return Datetime.valueOf(s.replace('T', ' '));
        if (t == Schema.DisplayType.Currency || t == Schema.DisplayType.Double
            || t == Schema.DisplayType.Percent) {
            return Decimal.valueOf(s.replaceAll('[\\$,%\\s]', ''));
        }
        if (t == Schema.DisplayType.Integer) {
            return Integer.valueOf(s.replaceAll('[,\\s]', ''));
        }
        return s; // String, Picklist, TextArea, Reference, etc.
    }

    /** High-priority follow-up Task for the household owner when a survey is submitted. */
    private static void notifyOwner(Id intakeId, Id accountId) {
        if (accountId == null) return;
        try {
            Account a = [SELECT OwnerId FROM Account WHERE Id = :accountId LIMIT 1];
            insert new Task(
                OwnerId = a.OwnerId,
                WhatId = accountId,
                Subject = 'Review Pre-SR Intake Survey',
                Priority = 'High',
                Status = 'Not Started',
                ActivityDate = Date.today(),
                Description = 'A client submitted their pre-Strategic-Review survey. Review it to tailor the meeting. Intake record: ' + intakeId
            );
        } catch (Exception e) { /* notification is best-effort */ }
    }
}
