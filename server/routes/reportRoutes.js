/**
 * reportRoutes.js
 *
 * Routes for generating and sending vehicle history reports via WhatsApp.
 *
 *  POST /api/reports/send-whatsapp
 *       Body: { truckNo, month?, year?, format: "pdf"|"excel", phone? }
 *       Generates the report and sends it as a document via WhatsApp to the vehicle owner.
 *
 *  GET  /api/reports/download
 *       Query: truckNo, month?, year?, format: "pdf"|"excel"
 *       Returns the report file as a direct download.
 */

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { tenancyMiddleware } = require("../middleware/tenancyMiddleware");
const { generateVehicleMonthlyPdf, generateVehicleMonthlyExcel } = require("../services/reportService");
const { sendWhatsAppDocument, lookupVehiclePhone, getWhatsAppConfig } = require("../utils/whatsappService");

router.use(requireAuth, tenancyMiddleware);

// ─── POST /api/reports/send-whatsapp ─────────────────────────────────────────
router.post("/send-whatsapp", async (req, res, next) => {
    try {
        const { truckNo, month, year, format = "pdf", phone } = req.body;
        if (!truckNo) return res.status(400).json({ error: "truckNo is required" });

        const recipientPhone = phone || (await lookupVehiclePhone(truckNo, req));
        if (!recipientPhone) {
            return res.status(400).json({ error: "No phone number found for this vehicle. Please provide phone." });
        }

        const waCfg = await getWhatsAppConfig(req);
        if (!waCfg.enabled) {
            return res.status(400).json({ error: "WhatsApp is disabled in system settings." });
        }

        const monthName = month ? new Date(2000, month - 1, 1).toLocaleString("en-IN", { month: "long" }) : null;
        const periodLabel = (month && year) ? `${monthName} ${year}` : (year ? `Year ${year}` : "Full History");

        let fileBuffer, filename, mimeType, caption;

        if (format === "excel" || format === "xlsx") {
            fileBuffer = await generateVehicleMonthlyExcel(truckNo, month || null, year || null, req);
            filename = `VGTC_${String(truckNo).toUpperCase()}_${(year || "")}_${(monthName || "Report")}.xlsx`;
            mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            caption = `📊 *Vehicle Statement — ${String(truckNo).toUpperCase()}*\n*Period:* ${periodLabel}\n_Sent by VGTC Management System._`;
        } else {
            fileBuffer = await generateVehicleMonthlyPdf(truckNo, month || null, year || null, req);
            filename = `VGTC_${String(truckNo).toUpperCase()}_${(year || "")}_${(monthName || "Report")}.pdf`;
            mimeType = "application/pdf";
            caption = `📄 *Vehicle Statement — ${String(truckNo).toUpperCase()}*\n*Period:* ${periodLabel}\n_Sent by VGTC Management System._`;
        }

        await sendWhatsAppDocument(recipientPhone, fileBuffer, filename, mimeType, caption, req);
        console.log(`[Report] ${format.toUpperCase()} statement for ${truckNo} (${periodLabel}) sent to ${recipientPhone}`);

        res.json({ ok: true, truckNo, phone: recipientPhone, format, period: periodLabel, filename });
    } catch (err) {
        console.error("[Report] send-whatsapp FAILED:", err.message);
        next(err);
    }
});

// ─── GET /api/reports/download ────────────────────────────────────────────────
router.get("/download", async (req, res, next) => {
    try {
        const { truckNo, month, year, format = "pdf" } = req.query;
        if (!truckNo) return res.status(400).json({ error: "truckNo is required" });

        const monthName = month ? new Date(2000, month - 1, 1).toLocaleString("en-IN", { month: "long" }) : null;
        const periodLabel = (month && year) ? `${monthName}_${year}` : (year ? `Year_${year}` : "Full_History");

        if (format === "excel" || format === "xlsx") {
            const fileBuffer = await generateVehicleMonthlyExcel(truckNo, month || null, year || null, req);
            const filename = `VGTC_${String(truckNo).toUpperCase()}_${periodLabel}.xlsx`;
            res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.set("Content-Disposition", `attachment; filename="${filename}"`);
            return res.send(fileBuffer);
        } else {
            const fileBuffer = await generateVehicleMonthlyPdf(truckNo, month || null, year || null, req);
            const filename = `VGTC_${String(truckNo).toUpperCase()}_${periodLabel}.pdf`;
            res.set("Content-Type", "application/pdf");
            res.set("Content-Disposition", `attachment; filename="${filename}"`);
            return res.send(fileBuffer);
        }
    } catch (err) {
        console.error("[Report] download FAILED:", err.message);
        next(err);
    }
});

module.exports = router;
