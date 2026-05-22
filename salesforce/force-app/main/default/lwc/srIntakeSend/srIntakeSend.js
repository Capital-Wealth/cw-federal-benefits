import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CloseActionScreenEvent } from 'lightning/actions';
import createAndSend from '@salesforce/apex/SRIntakeLauncher.createAndSend';

export default class SrIntakeSend extends LightningElement {
    @api recordId;
    loading = false;
    result;
    error;

    get sentTo() { return this.result ? this.result.sentTo : ''; }
    get url() { return this.result ? this.result.url : ''; }

    async handleSend() {
        this.loading = true;
        this.error = undefined;
        try {
            this.result = await createAndSend({ meetingId: this.recordId });
            this.dispatchEvent(new ShowToastEvent({
                title: 'Survey sent',
                message: `Pre-Strategic-Review survey emailed to ${this.result.sentTo}.`,
                variant: 'success'
            }));
        } catch (e) {
            this.error = (e && e.body && e.body.message) || (e && e.message) || 'Could not send the survey.';
            this.dispatchEvent(new ShowToastEvent({ title: 'Could not send', message: this.error, variant: 'error' }));
        } finally {
            this.loading = false;
        }
    }

    handleClose() {
        this.dispatchEvent(new CloseActionScreenEvent());
    }
}
