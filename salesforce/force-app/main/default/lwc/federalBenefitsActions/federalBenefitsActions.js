import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import CwVaultConfirm from 'c/cwVaultConfirm';
import inviteToUpload from '@salesforce/apex/FederalBenefitsController.inviteToUpload';
import getUploadStatus from '@salesforce/apex/FederalBenefitsController.getUploadStatus';
import getIntakeForAccount from '@salesforce/apex/FederalBenefitsController.getIntakeForAccount';
import markComplete from '@salesforce/apex/FederalBenefitsController.markComplete';
import generateReport from '@salesforce/apex/FederalBenefitsController.generateReport';
import startDirectUpload from '@salesforce/apex/FederalBenefitsController.startDirectUpload';
import parseUploadedDocuments from '@salesforce/apex/FederalBenefitsController.parseUploadedDocuments';
import openLivePlan from '@salesforce/apex/FederalBenefitsController.openLivePlan';
import getDiscoveryForAccount from '@salesforce/apex/CaseVaultMeetings.getDiscoveryForAccount';

import STATUS_FIELD from '@salesforce/schema/Federal_Benefits_Intake__c.Status__c';
import CONFIDENCE_FIELD from '@salesforce/schema/Federal_Benefits_Intake__c.AI_Parse_Confidence__c';
import REVIEW_FIELD from '@salesforce/schema/Federal_Benefits_Intake__c.Fields_Needing_Review__c';
import REPORT_FIELD from '@salesforce/schema/Federal_Benefits_Intake__c.FedRetire_Report_Generated__c';

import ACCT_RT_FIELD from '@salesforce/schema/Account.RecordType.DeveloperName';
import ACCT_IS_PERSON_FIELD from '@salesforce/schema/Account.IsPersonAccount';
import ACCT_PRIMARY_CONTACT_FIELD from '@salesforce/schema/Account.FinServ__PrimaryContact__c';

const FBI_FIELDS = [STATUS_FIELD, CONFIDENCE_FIELD, REVIEW_FIELD, REPORT_FIELD];
const ACCT_FIELDS = [ACCT_RT_FIELD, ACCT_IS_PERSON_FIELD, ACCT_PRIMARY_CONTACT_FIELD];

export default class FederalBenefitsActions extends LightningElement {
    @api recordId;
    @api objectApiName;

    @track portalUrl;
    @track documents = [];
    @track isLoading = false;
    @track error;

    // Direct in-Salesforce upload (no email). Set after createIntake/use existing.
    @track directUploadIntakeId;

    // Account-level intake data
    @track accountIntake = null;

    get isAccount() { return this.objectApiName === 'Account'; }
    get isContactOrLead() {
        return this.objectApiName === 'Contact' || this.objectApiName === 'Lead';
    }
    get isFBIRecord() { return this.objectApiName === 'Federal_Benefits_Intake__c'; }

    // Wire FBI record data when on FBI page
    @wire(getRecord, { recordId: '$recordId', fields: FBI_FIELDS })
    fbiRecord;

    // Wire Account metadata (RecordType + IsPersonAccount) for household detection
    @wire(getRecord, { recordId: '$accountRecordId', fields: ACCT_FIELDS })
    accountRecord;

    // Wire intake lookup when on Account page
    @wire(getIntakeForAccount, { accountId: '$accountRecordId' })
    wiredAccountIntake({ data, error }) {
        if (data) this.accountIntake = data;
        if (error) this.accountIntake = null;
    }

    // Wire Discovery Meeting context
    @track discovery = null;
    @wire(getDiscoveryForAccount, { accountId: '$accountRecordId' })
    wiredDiscovery({ data, error }) {
        if (data) this.discovery = data;
        if (error) this.discovery = null;
    }

    get accountRecordId() {
        return this.isAccount ? this.recordId : null;
    }

    get isHousehold() {
        return this.isAccount && getFieldValue(this.accountRecord?.data, ACCT_RT_FIELD) === 'IndustriesHousehold';
    }
    get isPersonAccountView() {
        return this.isAccount && getFieldValue(this.accountRecord?.data, ACCT_IS_PERSON_FIELD) === true;
    }
    get hasPrimaryContact() {
        return this.isHousehold && getFieldValue(this.accountRecord?.data, ACCT_PRIMARY_CONTACT_FIELD) != null;
    }

    // FBI record field getters
    get status() {
        if (this.isFBIRecord) return this.fbiRecord?.data ? getFieldValue(this.fbiRecord.data, STATUS_FIELD) : null;
        return this.accountIntake?.status || null;
    }
    get confidence() {
        if (this.isFBIRecord) return this.fbiRecord?.data ? getFieldValue(this.fbiRecord.data, CONFIDENCE_FIELD) : null;
        return this.accountIntake?.confidence || null;
    }
    get fieldsNeedingReview() {
        return this.fbiRecord?.data ? getFieldValue(this.fbiRecord.data, REVIEW_FIELD) : null;
    }
    get reportGenerated() {
        if (this.isFBIRecord) return this.fbiRecord?.data ? getFieldValue(this.fbiRecord.data, REPORT_FIELD) : false;
        return this.accountIntake?.reportGenerated || false;
    }

    // What to show
    get hasIntake() { return this.isAccount && this.accountIntake != null; }
    // Invite button only on Household Account (case design is household-level) or Contact/Lead.
    // Person Account view is read-only — shows intake status but no invite button.
    get showInvite() { return (this.isHousehold || this.isContactOrLead) && !this.hasIntake; }
    get showInviteAgain() { return this.isHousehold && this.hasIntake; }
    get showIntakeStatus() { return this.hasIntake; }
    get missingPrimaryContactWarning() {
        return this.isHousehold && !this.hasPrimaryContact && !this.hasIntake;
    }

    // Discovery Meeting getters
    get hasDiscovery() { return this.discovery?.hasDiscovery === true; }
    get discoveryMeetingName() { return this.discovery?.meetingName; }
    get discoveryOwner() { return this.discovery?.ownerName || this.discovery?.hostName; }
    get discoverySummary() { return this.discovery?.summary; }
    get hasDiscoverySummary() { return this.discovery?.hasSummary === true; }
    get hasDiscoveryTranscript() { return this.discovery?.hasTranscript === true; }
    get transcriptCharCountLabel() {
        const n = this.discovery?.transcriptLength || 0;
        return n > 1000 ? `(${Math.round(n/1000)}k chars — too long to show inline)` : `(${n} chars)`;
    }
    get discoveryMeetingDate() {
        const d = this.discovery?.meetingDate;
        if (!d) return '';
        try { return new Date(d).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }); }
        catch { return d; }
    }
    handleOpenDiscoveryMeeting() {
        const mid = this.discovery?.meetingId;
        if (mid) window.open(`/lightning/r/Meeting__c/${mid}/view`, '_blank');
    }

    get showCheckUploads() { return this.isFBIRecord && ['Link Sent', 'Docs Uploaded'].includes(this.status); }
    get showMarkComplete() { return this.isFBIRecord && ['AI Parsed', 'Docs Uploaded'].includes(this.status); }
    get showGenerateReport() { return this.isFBIRecord && this.status === 'Complete' && !this.reportGenerated; }
    get showReviewFields() { return this.isFBIRecord && this.fieldsNeedingReview; }

    // Account-level action buttons
    get showAccountMarkComplete() { return this.hasIntake && ['AI Parsed', 'Docs Uploaded'].includes(this.status) && !this.reportGenerated; }
    get showAccountGenerateReport() { return this.hasIntake && this.status === 'Complete' && !this.reportGenerated; }

    // Account intake getters
    get intakeName() { return this.accountIntake?.intakeName; }
    get intakeId() { return this.accountIntake?.intakeId; }
    get documentCount() { return this.accountIntake?.documentCount || 0; }
    get intakeStatusLabel() {
        const map = {
            'Draft': 'Draft',
            'Link Sent': 'Invite Sent',
            'Docs Uploaded': 'Documents Received',
            'AI Parsed': 'Data Extracted',
            'Advisor Review': 'Under Review',
            'Complete': 'Complete'
        };
        return map[this.status] || this.status;
    }
    get intakeStatusClass() {
        const map = {
            'Draft': 'slds-badge',
            'Link Sent': 'slds-badge slds-badge_inverse',
            'Docs Uploaded': 'slds-badge',
            'AI Parsed': 'slds-badge',
            'Complete': 'slds-badge'
        };
        return map[this.status] || 'slds-badge';
    }
    fmt(v) { return v != null ? '$' + Number(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--'; }

    get intakeSalary() { return this.accountIntake?.salary ? '$' + Number(this.accountIntake.salary).toLocaleString() : null; }
    get intakeRetirement() { return this.accountIntake?.retirementSystem; }
    get intakeSCD() { return this.accountIntake?.scd; }
    get intakeSickLeave() { const h = this.accountIntake?.sickLeave; return h ? h + ' hrs' : null; }
    get intakeEmployeeType() { return this.accountIntake?.employeeType; }

    // TSP
    get tspTraditional() { return this.accountIntake?.tspTraditional ? '$' + Number(this.accountIntake.tspTraditional).toLocaleString() : '--'; }
    get tspRoth() { return this.accountIntake?.tspRoth ? '$' + Number(this.accountIntake.tspRoth).toLocaleString() : '--'; }
    get tspTotal() { return this.accountIntake?.tspTotal ? '$' + Number(this.accountIntake.tspTotal).toLocaleString() : '--'; }
    get hasTSP() { return this.accountIntake?.tspTotal > 0; }

    // Insurance
    get fegliSummary() {
        if (!this.accountIntake) return null;
        const parts = [];
        if (this.accountIntake.fegliBasic) parts.push('Basic');
        if (this.accountIntake.fegliOptionA) parts.push('Opt A');
        if (this.accountIntake.fegliOptionB) parts.push('Opt B (' + (this.accountIntake.fegliMultiplier || '') + ')');
        return parts.length > 0 ? parts.join(' + ') : 'None';
    }
    get fehbPremium() { return this.accountIntake?.fehbPremium ? '$' + Number(this.accountIntake.fehbPremium).toFixed(2) + '/pp' : '--'; }

    // Social Security
    get ssMonthly() { return this.accountIntake?.ssMonthly ? '$' + Number(this.accountIntake.ssMonthly).toLocaleString() + '/mo' : '--'; }
    get ssStartAge() { return this.accountIntake?.ssStartAge || '--'; }

    // Survivor
    get survivorBenefit() { return this.accountIntake?.survivorBenefit || '--'; }

    // Military
    get hasMilitary() { return this.accountIntake?.hasDd214 === true; }
    get militaryDates() {
        if (!this.accountIntake?.militaryFrom) return null;
        return this.accountIntake.militaryFrom + ' to ' + (this.accountIntake.militaryTo || 'present');
    }

    // LES
    get lesFedTax() { return this.accountIntake?.lesFederalTax ? '$' + Number(this.accountIntake.lesFederalTax).toFixed(2) : '--'; }
    get lesStateTax() { return this.accountIntake?.lesStateTax ? '$' + Number(this.accountIntake.lesStateTax).toFixed(2) : '--'; }
    get lesRetirement() { return this.accountIntake?.lesRetirement ? '$' + Number(this.accountIntake.lesRetirement).toFixed(2) : '--'; }
    get hasExtractedData() { return this.accountIntake?.salary != null; }

    // Documents
    get accountDocs() {
        return (this.accountIntake?.documents || []).map(d => ({
            ...d,
            viewUrl: `/lightning/r/ContentDocument/${d.docId}/view`
        }));
    }
    get hasAccountDocs() { return this.accountDocs.length > 0; }

    // Handlers
    async handleInvite() {
        const confirmed = await CwVaultConfirm.open({
            size: 'small',
            label: 'Send Capital Wealth Vault Invite?',
            message: 'This will create a new Capital Wealth Vault intake and email the secure upload link to the Primary Contact on this Household. Continue?',
            confirmLabel: 'Send Invite'
        });
        if (!confirmed) return;

        this.isLoading = true;
        this.error = null;
        try {
            const result = await inviteToUpload({ recordId: this.recordId, objectType: this.objectApiName });
            this.portalUrl = result.portalUrl;
            this.dispatchEvent(new ShowToastEvent({
                title: 'Upload Invitation Sent',
                message: `Intake ${result.intakeName} created. Email sent to client.`,
                variant: 'success'
            }));
            // Refresh to show the intake status
            window.location.reload();
        } catch (e) {
            this.error = e.body?.message || e.message;
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: this.error, variant: 'error' }));
        } finally {
            this.isLoading = false;
        }
    }

    async handleCheckUploads() {
        this.isLoading = true;
        this.error = null;
        try {
            const result = await getUploadStatus({ intakeId: this.recordId });
            this.documents = result.documents || [];
            this.dispatchEvent(new ShowToastEvent({
                title: result.documentCount + ' Document(s)',
                message: result.documentCount > 0 ? 'Documents uploaded by client.' : 'No documents uploaded yet.',
                variant: result.documentCount > 0 ? 'success' : 'info'
            }));
        } catch (e) { this.error = e.body?.message || e.message; }
        finally { this.isLoading = false; }
    }

    async handleMarkComplete() {
        this.isLoading = true;
        try {
            const id = this.isFBIRecord ? this.recordId : this.intakeId;
            await markComplete({ intakeId: id });
            this.dispatchEvent(new ShowToastEvent({ title: 'Marked Complete', message: 'Ready for report generation.', variant: 'success' }));
            window.location.reload();
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: e.body?.message || e.message, variant: 'error' }));
        } finally { this.isLoading = false; }
    }

    async handleGenerateReport() {
        this.isLoading = true;
        try {
            const id = this.isFBIRecord ? this.recordId : this.intakeId;
            const result = await generateReport({ intakeId: id });
            if (result.reportSuccess) {
                const assumptions = Array.isArray(result.assumptionsApplied) ? result.assumptionsApplied : [];
                const baseMsg = result.employeeName ? `Report ready for ${result.employeeName}.` : 'Report generated.';
                const assumptionMsg = assumptions.length
                    ? ` ${assumptions.length} assumption(s) applied: ${assumptions.join(' • ')}`
                    : '';
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Federal Benefits Gap Analysis Generated',
                    message: baseMsg + assumptionMsg,
                    variant: 'success',
                    mode: assumptions.length ? 'sticky' : 'dismissible'
                }));
                window.location.reload();
            } else {
                const missing = Array.isArray(result.missingFields) ? result.missingFields : [];
                const detail = missing.length
                    ? missing.join(' • ')
                    : (result.reportError || 'Report could not be generated.');
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Report not generated',
                    message: detail,
                    variant: 'error',
                    mode: 'sticky'
                }));
                this.error = detail;
            }
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: e.body?.message || e.message, variant: 'error', mode: 'sticky' }));
        } finally { this.isLoading = false; }
    }

    // ============================================================
    // Direct upload — advisor uploads docs they already have, skipping email.
    // Same FBI record + same /api/parse pipeline as the email flow.
    // ============================================================

    get acceptedFileFormats() {
        return ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.doc', '.docx'];
    }

    get showDirectUploader() { return !!this.directUploadIntakeId; }

    get showStartDirectUpload() {
        if (this.directUploadIntakeId) return false;
        if (this.isFBIRecord) return true;
        if (this.hasIntake) return true;                          // attach more docs to existing intake
        if (this.isHousehold && this.hasPrimaryContact) return true;
        if (this.isPersonAccountView) return true;
        if (this.isContactOrLead) return true;
        return false;
    }

    async handleStartDirectUpload() {
        // On an FBI record page, the recordId IS the intake.
        if (this.isFBIRecord) {
            this.directUploadIntakeId = this.recordId;
            return;
        }
        // If an intake already exists on this Account, reuse it; otherwise create one.
        if (this.hasIntake) {
            this.directUploadIntakeId = this.intakeId;
            return;
        }
        this.isLoading = true;
        this.error = null;
        try {
            const result = await startDirectUpload({ recordId: this.recordId, objectType: this.objectApiName });
            this.directUploadIntakeId = result.intakeId;
            this.dispatchEvent(new ShowToastEvent({
                title: 'Vault Created',
                message: `Intake ${result.intakeName} created. Drop your documents below.`,
                variant: 'success'
            }));
        } catch (e) {
            this.error = e.body?.message || e.message;
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: this.error, variant: 'error' }));
        } finally {
            this.isLoading = false;
        }
    }

    async handleUploadFinished(event) {
        const uploaded = event.detail?.files || [];
        if (uploaded.length === 0) return;

        // Track running batch count so the user knows progress when they
        // upload more than 10 files (the platform-imposed per-batch cap).
        this.totalUploaded = (this.totalUploaded || 0) + uploaded.length;

        this.dispatchEvent(new ShowToastEvent({
            title: `${uploaded.length} document(s) uploaded — ${this.totalUploaded} total`,
            message:
                'Drop another batch (up to 10 at a time) or click "Done — Parse & Generate" when finished.',
            variant: 'success',
        }));
        // NOTE: do NOT reload here. Reloading immediately would prevent the
        // advisor from adding more docs in another batch (Salesforce caps
        // lightning-file-upload at 10 files per drop).
    }

    async handleFinishUploading() {
        if (!this.directUploadIntakeId) return;
        this.isLoading = true;
        try {
            await parseUploadedDocuments({ intakeId: this.directUploadIntakeId });
            this.dispatchEvent(new ShowToastEvent({
                title: `Parsing ${this.totalUploaded || 'all'} document(s)…`,
                message: 'AI is reading your documents. This page will refresh shortly.',
                variant: 'success',
                mode: 'sticky',
            }));
            setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
            this.error = e.body?.message || e.message;
            this.dispatchEvent(new ShowToastEvent({ title: 'Parse trigger failed', message: this.error, variant: 'error' }));
        } finally {
            this.isLoading = false;
        }
    }

    handleCopyUrl() {
        navigator.clipboard.writeText(this.portalUrl);
        this.dispatchEvent(new ShowToastEvent({ title: 'Copied', message: 'Portal URL copied to clipboard', variant: 'success' }));
    }

    /**
     * Open the Live Plan web app in a new tab. Apex mints a short-lived
     * signed URL bound to this advisor + this intake.
     */
    async handleOpenLivePlan() {
        const id = this.isFBIRecord ? this.recordId : this.intakeId;
        if (!id) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No intake on this record',
                message: 'Send a Vault invite or upload documents first.',
                variant: 'warning'
            }));
            return;
        }
        this.isLoading = true;
        try {
            const { url } = await openLivePlan({ intakeId: id });
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (e) {
            this.error = e.body?.message || e.message;
            this.dispatchEvent(new ShowToastEvent({ title: 'Could not open Live Plan', message: this.error, variant: 'error' }));
        } finally {
            this.isLoading = false;
        }
    }

    get showOpenLivePlan() {
        return this.hasIntake || this.isFBIRecord;
    }

    handleOpenIntake() {
        window.open(`/lightning/r/Federal_Benefits_Intake__c/${this.intakeId}/view`, '_blank');
    }
}