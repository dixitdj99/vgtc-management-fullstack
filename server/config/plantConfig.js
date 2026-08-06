/**
 * Plant Configuration for Invoice Generation
 * Contains VGTC company details and plant-specific data for Tax Invoices.
 */

const VGTC_INFO = {
    company: 'VIKAS GOODS TRANSPORT CO.',
    address: 'H.O. :Near Rao Gopal Dev Chowk, Narnaul Road Rewari',
    email: 'vikasgoodstransport1234@gmail.com',
    contact: '9416319445',
    gstin: '06ARIPK9021C2Z2',
    pan: 'ARIPK9021C',
    sacCode: '996511 GTA Services',
    transportMode: 'Road',
    rstForwardCharge: 'Yes',
};

const PLANT_CONFIGS = {
    jksuper_jharli: {
        label: 'JK Super — Jharli',
        consignor: 'J.K. CEMENT WORKS, JHARLI',
        consignorGSTIN: '06AABCJ0355R1ZB',
        sapCode: '500000505',
        plantCode: '1022',
        stateCode: '06',
        stateName: 'Haryana',
        status: 'Propriter',
        gstRate: 9,     // CGST 9% + SGST 9% = 18%
        igstRate: 18,
    },
    jklakshmi_jharli: {
        label: 'JK Lakshmi — Jharli',
        consignor: 'J.K. LAKSHMI CEMENT LTD, JHARLI',
        consignorGSTIN: 'TBD',
        sapCode: 'TBD',
        plantCode: 'TBD',
        stateCode: '06',
        stateName: 'Haryana',
        status: 'Propriter',
        gstRate: 6,
        igstRate: 12,
    },
    kosli_dump: {
        label: 'Kosli Dump',
        consignor: 'J.K. SUPER CEMENT, KOSLI',
        consignorGSTIN: 'TBD',
        sapCode: 'TBD',
        plantCode: 'TBD',
        stateCode: '06',
        stateName: 'Haryana',
        status: 'Propriter',
        gstRate: 6,
        igstRate: 12,
    },
    jhajjar_dump: {
        label: 'Jhajjar Dump',
        consignor: 'J.K. SUPER CEMENT, JHAJJAR',
        consignorGSTIN: 'TBD',
        sapCode: 'TBD',
        plantCode: 'TBD',
        stateCode: '06',
        stateName: 'Haryana',
        status: 'Propriter',
        gstRate: 6,
        igstRate: 12,
    },
};

module.exports = { VGTC_INFO, PLANT_CONFIGS };
