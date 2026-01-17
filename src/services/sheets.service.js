/**
 * Google Sheets Service
 * Handles logging payments, handoffs, and other data to Google Sheets for admin tracking
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('../config');

class SheetsService {
    constructor() {
        this.spreadsheetId = config.sheets.spreadsheetId;
        this.serviceAccountPath = config.sheets.serviceAccountPath;
        this.sheets = null;
        this.initialized = false;
        this.enabled = false;
    }

    /**
     * Initialize Google Sheets API connection
     */
    async initialize() {
        if (this.initialized) return this.enabled;

        try {
            // Check if spreadsheet ID is configured
            if (!this.spreadsheetId) {
                console.warn('⚠️ Google Sheets not configured: GOOGLE_SHEETS_ID not set');
                this.initialized = true;
                this.enabled = false;
                return false;
            }

            // Check if service account file exists
            const serviceAccountFullPath = path.isAbsolute(this.serviceAccountPath)
                ? this.serviceAccountPath
                : path.join(process.cwd(), this.serviceAccountPath);

            if (!fs.existsSync(serviceAccountFullPath)) {
                console.warn(`⚠️ Google Sheets not configured: Service account file not found at ${serviceAccountFullPath}`);
                this.initialized = true;
                this.enabled = false;
                return false;
            }

            // Initialize auth
            const auth = new google.auth.GoogleAuth({
                keyFile: serviceAccountFullPath,
                scopes: config.sheets.scopes
            });

            // Create sheets client
            this.sheets = google.sheets({ version: 'v4', auth });

            // Test connection by getting spreadsheet info
            await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            this.initialized = true;
            this.enabled = true;
            console.log('✅ Google Sheets service initialized');

            // Ensure sheets exist
            await this.ensureSheetsExist();

            return true;
        } catch (error) {
            console.error('❌ Google Sheets initialization failed:', error.message);
            this.initialized = true;
            this.enabled = false;
            return false;
        }
    }

    /**
     * Ensure required sheets exist in the spreadsheet
     */
    async ensureSheetsExist() {
        if (!this.enabled) return;

        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
            const requiredSheets = Object.values(config.sheets.sheetNames);
            const sheetsToCreate = requiredSheets.filter(name => !existingSheets.includes(name));

            if (sheetsToCreate.length > 0) {
                const requests = sheetsToCreate.map(title => ({
                    addSheet: {
                        properties: { title }
                    }
                }));

                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: { requests }
                });

                // Add headers to new sheets
                for (const sheetName of sheetsToCreate) {
                    await this.addHeaders(sheetName);
                }

                console.log(`📊 Created sheets: ${sheetsToCreate.join(', ')}`);
            }
        } catch (error) {
            console.error('Error ensuring sheets exist:', error.message);
        }
    }

    /**
     * Add headers to a sheet
     * @param {string} sheetName - Name of the sheet
     */
    async addHeaders(sheetName) {
        if (!this.enabled) return;

        const headers = this.getHeadersForSheet(sheetName);
        if (!headers) return;

        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [headers]
                }
            });
        } catch (error) {
            console.error(`Error adding headers to ${sheetName}:`, error.message);
        }
    }

    /**
     * Get headers for a specific sheet
     * @param {string} sheetName - Name of the sheet
     * @returns {string[]} - Array of header names
     */
    getHeadersForSheet(sheetName) {
        const headersMap = {
            [config.sheets.sheetNames.payments]: [
                'Date', 'Time', 'Payment ID', 'Phone', 'Amount', 'Method',
                'Service', 'Screenshot', 'Status', 'Approved By', 'Notes'
            ],
            [config.sheets.sheetNames.handoff]: [
                'Date', 'Time', 'Handoff ID', 'Phone', 'Customer Name',
                'Reason', 'Priority', 'Status', 'Assigned To', 'Resolution', 'Notes'
            ],
            [config.sheets.sheetNames.conversations]: [
                'Date', 'Chat ID', 'Phone', 'Customer Name', 'Status',
                'Total Messages', 'Created At', 'Last Message'
            ]
        };

        return headersMap[sheetName] || null;
    }

    /**
     * Log a payment record to Google Sheets
     * @param {Object} paymentData - Payment details
     */
    async logPayment(paymentData) {
        if (!this.enabled) {
            console.log('📊 [Sheets Disabled] Would log payment:', paymentData.paymentId);
            return { success: true, disabled: true };
        }

        try {
            const now = new Date();
            const row = [
                now.toLocaleDateString('en-PK'),
                now.toLocaleTimeString('en-PK'),
                paymentData.paymentId || paymentData.uuid || '',
                paymentData.phoneNumber || '',
                paymentData.amount || '',
                paymentData.paymentMethod || '',
                paymentData.serviceName || '',
                paymentData.screenshotUrl || '',
                paymentData.status || 'Pending',
                paymentData.approvedBy || '',
                paymentData.notes || ''
            ];

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `${config.sheets.sheetNames.payments}!A:K`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [row]
                }
            });

            console.log(`📊 Payment logged to Google Sheets: ${paymentData.paymentId}`);
            return { success: true };
        } catch (error) {
            console.error('Error logging payment to Sheets:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update payment status in Google Sheets
     * @param {string} paymentId - Payment ID to update
     * @param {string} status - New status
     * @param {string} approvedBy - Who approved/rejected
     * @param {string} notes - Additional notes
     */
    async updatePaymentStatus(paymentId, status, approvedBy = '', notes = '') {
        if (!this.enabled) {
            console.log(`📊 [Sheets Disabled] Would update payment ${paymentId} to ${status}`);
            return { success: true, disabled: true };
        }

        try {
            // Find the row with this payment ID
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${config.sheets.sheetNames.payments}!A:K`
            });

            const rows = response.data.values || [];
            let rowIndex = -1;

            for (let i = 0; i < rows.length; i++) {
                if (rows[i][2] === paymentId) {
                    rowIndex = i + 1; // Sheets rows are 1-indexed
                    break;
                }
            }

            if (rowIndex === -1) {
                console.warn(`Payment ${paymentId} not found in Sheets`);
                return { success: false, error: 'Payment not found' };
            }

            // Update the status, approved by, and notes columns
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${config.sheets.sheetNames.payments}!I${rowIndex}:K${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[status, approvedBy, notes]]
                }
            });

            console.log(`📊 Payment status updated in Sheets: ${paymentId} -> ${status}`);
            return { success: true };
        } catch (error) {
            console.error('Error updating payment in Sheets:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Log a human handoff request to Google Sheets
     * @param {Object} handoffData - Handoff details
     */
    async logHandoff(handoffData) {
        if (!this.enabled) {
            console.log('📊 [Sheets Disabled] Would log handoff:', handoffData.handoffId);
            return { success: true, disabled: true };
        }

        try {
            const now = new Date();
            const row = [
                now.toLocaleDateString('en-PK'),
                now.toLocaleTimeString('en-PK'),
                handoffData.handoffId || handoffData.uuid || '',
                handoffData.phoneNumber || '',
                handoffData.customerName || '',
                handoffData.reason || '',
                handoffData.priority || 'normal',
                handoffData.status || 'Pending',
                handoffData.assignedTo || '',
                handoffData.resolution || '',
                handoffData.notes || ''
            ];

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `${config.sheets.sheetNames.handoff}!A:K`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [row]
                }
            });

            console.log(`📊 Handoff logged to Google Sheets: ${handoffData.handoffId}`);
            return { success: true };
        } catch (error) {
            console.error('Error logging handoff to Sheets:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update handoff status in Google Sheets
     * @param {string} handoffId - Handoff ID to update
     * @param {string} status - New status
     * @param {string} assignedTo - Who it's assigned to
     * @param {string} resolution - Resolution notes
     */
    async updateHandoffStatus(handoffId, status, assignedTo = '', resolution = '') {
        if (!this.enabled) {
            console.log(`📊 [Sheets Disabled] Would update handoff ${handoffId} to ${status}`);
            return { success: true, disabled: true };
        }

        try {
            // Find the row with this handoff ID
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${config.sheets.sheetNames.handoff}!A:K`
            });

            const rows = response.data.values || [];
            let rowIndex = -1;

            for (let i = 0; i < rows.length; i++) {
                if (rows[i][2] === handoffId) {
                    rowIndex = i + 1;
                    break;
                }
            }

            if (rowIndex === -1) {
                console.warn(`Handoff ${handoffId} not found in Sheets`);
                return { success: false, error: 'Handoff not found' };
            }

            // Update status, assigned to, and resolution columns
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${config.sheets.sheetNames.handoff}!H${rowIndex}:J${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[status, assignedTo, resolution]]
                }
            });

            console.log(`📊 Handoff status updated in Sheets: ${handoffId} -> ${status}`);
            return { success: true };
        } catch (error) {
            console.error('Error updating handoff in Sheets:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all pending payments from Google Sheets
     * @returns {Promise<Array>} - Array of pending payment records
     */
    async getPendingPayments() {
        if (!this.enabled) {
            return { success: false, data: [], disabled: true };
        }

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${config.sheets.sheetNames.payments}!A:K`
            });

            const rows = response.data.values || [];
            const headers = rows[0] || [];
            const data = rows.slice(1)
                .filter(row => row[8]?.toLowerCase() === 'pending')
                .map(row => {
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header.toLowerCase().replace(/ /g, '_')] = row[index] || '';
                    });
                    return obj;
                });

            return { success: true, data };
        } catch (error) {
            console.error('Error getting pending payments from Sheets:', error.message);
            return { success: false, data: [], error: error.message };
        }
    }

    /**
     * Get all pending handoffs from Google Sheets
     * @returns {Promise<Array>} - Array of pending handoff records
     */
    async getPendingHandoffs() {
        if (!this.enabled) {
            return { success: false, data: [], disabled: true };
        }

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${config.sheets.sheetNames.handoff}!A:K`
            });

            const rows = response.data.values || [];
            const headers = rows[0] || [];
            const data = rows.slice(1)
                .filter(row => row[7]?.toLowerCase() === 'pending')
                .map(row => {
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header.toLowerCase().replace(/ /g, '_')] = row[index] || '';
                    });
                    return obj;
                });

            return { success: true, data };
        } catch (error) {
            console.error('Error getting pending handoffs from Sheets:', error.message);
            return { success: false, data: [], error: error.message };
        }
    }

    /**
     * Check if service is healthy and connected
     * @returns {Promise<Object>} - Health status
     */
    async checkHealth() {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.enabled) {
            return {
                healthy: false,
                enabled: false,
                message: 'Google Sheets not configured'
            };
        }

        try {
            await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            return {
                healthy: true,
                enabled: true,
                spreadsheetId: this.spreadsheetId
            };
        } catch (error) {
            return {
                healthy: false,
                enabled: true,
                error: error.message
            };
        }
    }
}

// Export singleton instance
module.exports = new SheetsService();
