const axios = require('axios');
require('dotenv').config();

// NIC / GSP Portal Base URLs
const NIC_SANDBOX_URL = 'https://ewb.asp.gsp.gstsnippet.com/ewayapi/v1.03';
const NIC_PROD_URL = 'https://ewaybillgst.gov.in/ewayapi/v1.03';

class NicEwayService {
  constructor() {
    this.gstin = process.env.EWAY_GSTIN || '';
    this.username = process.env.EWAY_USERNAME || '';
    this.password = process.env.EWAY_PASSWORD || '';
    this.clientId = process.env.EWAY_CLIENT_ID || '';
    this.clientSecret = process.env.EWAY_CLIENT_SECRET || '';
    this.env = process.env.EWAY_ENV || 'sandbox'; // 'sandbox' | 'production'
    this.authToken = null;
    this.tokenExpiry = null;
  }

  getBaseUrl() {
    return this.env === 'production' ? NIC_PROD_URL : NIC_SANDBOX_URL;
  }

  // Authenticate with NIC / GSP Portal
  async authenticate() {
    if (this.authToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.authToken;
    }

    if (!this.gstin || !this.username || !this.password) {
      console.warn('[NIC E-Way API] Credentials not configured in .env. Running in Sandbox / Fallback mode.');
      return 'SANDBOX_MOCK_TOKEN';
    }

    try {
      const res = await axios.post(`${this.getBaseUrl()}/user/authenticate`, {
        action: 'ACCESSTOKEN',
        username: this.username,
        password: this.password,
        gstin: this.gstin
      }, {
        headers: {
          'client-id': this.clientId,
          'client-secret': this.clientSecret,
          'Gstin': this.gstin
        },
        timeout: 10000
      });

      if (res.data && res.data.authtoken) {
        this.authToken = res.data.authtoken;
        // Token valid for 6 hours
        this.tokenExpiry = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        return this.authToken;
      } else {
        throw new Error(res.data?.error?.message || 'Authentication failed on Govt E-Way portal');
      }
    } catch (err) {
      console.error('[NIC E-Way API Auth Error]:', err.message);
      throw new Error('Govt E-Way Portal Authentication failed: ' + (err.response?.data?.message || err.message));
    }
  }

  // Fetch Live E-Way Bill details directly from Govt Portal
  async getLiveEwayBill(ewbNo) {
    if (!this.gstin || !this.username) {
      // Mock live response for testing/sandbox
      return {
        isMock: true,
        ewayBillNo: ewbNo,
        status: 'ACT',
        validUpto: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        genGstin: this.gstin || '06AAAAA0000A1Z5',
        fromPlace: 'Jharli, Jhajjar',
        toPlace: 'Delhi',
        totalValue: 250000,
        vehicleNo: 'HR16A1234'
      };
    }

    const token = await this.authenticate();
    try {
      const res = await axios.get(`${this.getBaseUrl()}/ewaybill/getewb`, {
        params: { ewbNo },
        headers: {
          'authtoken': token,
          'Gstin': this.gstin,
          'client-id': this.clientId
        },
        timeout: 10000
      });
      return res.data;
    } catch (err) {
      throw new Error('Govt E-Way Portal lookup failed: ' + (err.response?.data?.message || err.message));
    }
  }

  // Generate new E-Way Bill on Govt Portal
  async generateGovtEwayBill(payload) {
    if (!this.gstin || !this.username) {
      // Return realistic mock Government ACK response
      const ewbNo = `${Math.floor(100000000000 + Math.random() * 900000000000)}`;
      return {
        isMock: true,
        ewayBillNo: ewbNo,
        ewayBillDate: new Date().toISOString(),
        validUpto: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'ACT',
        msg: 'E-Way Bill generated successfully on Sandbox Portal'
      };
    }

    const token = await this.authenticate();
    try {
      const res = await axios.post(`${this.getBaseUrl()}/ewaybill/generate`, payload, {
        headers: {
          'authtoken': token,
          'Gstin': this.gstin,
          'client-id': this.clientId
        },
        timeout: 15000
      });
      return res.data;
    } catch (err) {
      throw new Error('Govt Portal Generation failed: ' + (err.response?.data?.message || err.message));
    }
  }

  // Extend / Re-issue Validity on Govt Portal
  async extendGovtEwayBillValidity(ewbNo, vehicleNo, fromPincode, reasonCode = '2', remark = 'Vehicle not loaded before expiry') {
    if (!this.gstin || !this.username) {
      // Mock extension ACK response
      const newEwbNo = `${Math.floor(100000000000 + Math.random() * 900000000000)}`;
      return {
        isMock: true,
        oldEwayBillNo: ewbNo,
        newEwayBillNo: newEwbNo,
        validUpto: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'ACT',
        msg: 'Validity extended & re-issued successfully on Sandbox Portal'
      };
    }

    const token = await this.authenticate();
    try {
      const res = await axios.post(`${this.getBaseUrl()}/ewaybill/extendValidity`, {
        ewbNo: parseInt(ewbNo),
        vehicleNo,
        fromPincode: parseInt(fromPincode || '124106'),
        remainingDistance: 150,
        extnRsnCode: parseInt(reasonCode),
        extnRemark: remark
      }, {
        headers: {
          'authtoken': token,
          'Gstin': this.gstin,
          'client-id': this.clientId
        },
        timeout: 15000
      });
      return res.data;
    } catch (err) {
      throw new Error('Govt Extension failed: ' + (err.response?.data?.message || err.message));
    }
  }
}

module.exports = new NicEwayService();
