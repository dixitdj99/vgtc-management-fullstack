const alertService = require('./services/alertService');
const { getEnvCol } = require('./utils/collectionUtils');
const envResult = require('dotenv').config();
console.log("Dotenv load result:", envResult);

async function trigger() {
    console.log("--- Manual Alert Trigger Start ---");
    console.log("SMTP_USER:", process.env.SMTP_USER);
    console.log("SMTP_PASS EXISTS:", !!process.env.SMTP_PASS);
    const col = getEnvCol('vehicles');
    console.log("Targeting collection:", col);
    const result = await alertService.sendDailyAlertReport(col);
    console.log("Result:", JSON.stringify(result, null, 2));
    console.log("--- Manual Alert Trigger End ---");
    process.exit(0);
}

trigger();
