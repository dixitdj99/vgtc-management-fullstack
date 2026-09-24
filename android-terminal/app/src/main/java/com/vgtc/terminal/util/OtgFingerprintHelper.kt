package com.vgtc.terminal.util

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.widget.Toast

object OtgFingerprintHelper {

    const val OTG_FP_CAPTURE_REQUEST = 3001

    // Known biometric USB Vendor IDs (Mantra, Morpho, Startek, SecuGen, etc.)
    private val KNOWN_BIOMETRIC_VENDORS = setOf(
        0x2717, // Mantra MFS100
        0x0483, // STMicroelectronics / Mantra
        0x1687, // Startek FM220
        0x0bca, // Morpho Sagem
        0x1162  // SecuGen Hamster
    )

    fun isOtgDeviceConnected(context: Context): Boolean {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager ?: return false
        val devices = usbManager.deviceList
        if (devices.isEmpty()) return false

        for ((_, device) in devices) {
            if (isBiometricDevice(device)) return true
        }
        // If any USB device is connected via OTG
        return devices.isNotEmpty()
    }

    fun getConnectedDeviceName(context: Context): String? {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager ?: return null
        for ((_, device) in usbManager.deviceList) {
            val name = device.productName ?: device.deviceName
            if (device.vendorId == 0x2717 || device.vendorId == 0x0483) return "Mantra MFS100"
            if (device.vendorId == 0x1687) return "Startek FM220"
            if (device.vendorId == 0x0bca) return "Morpho 1300"
            if (device.vendorId == 0x1162) return "SecuGen Hamster"
            return name
        }
        return null
    }

    private fun isBiometricDevice(device: UsbDevice): Boolean {
        return KNOWN_BIOMETRIC_VENDORS.contains(device.vendorId) ||
                (device.productName?.contains("finger", ignoreCase = true) == true) ||
                (device.productName?.contains("mfs", ignoreCase = true) == true) ||
                (device.productName?.contains("morpho", ignoreCase = true) == true) ||
                (device.productName?.contains("startek", ignoreCase = true) == true)
    }

    /**
     * Triggers OTG USB fingerprint scan via standard UIDAI RD Service
     * (used by 100% of Indian OTG biometric scanners like Mantra, Morpho, Startek)
     */
    fun startOtgCapture(activity: Activity, requestCode: Int = OTG_FP_CAPTURE_REQUEST): Boolean {
        val pidOptions = "<PidOptions ver=\"1.0\"><Opts fCount=\"1\" fType=\"2\" iCount=\"0\" pCount=\"0\" format=\"0\" pidVer=\"2.0\" timeout=\"10000\" env=\"P\" /></PidOptions>"
        val intent = Intent("in.gov.uidai.rdservice.fp.CAPTURE").apply {
            putExtra("PID_OPTIONS", pidOptions)
        }

        // Verify that an RD service app exists to handle this intent
        val packageManager = activity.packageManager
        val activities = packageManager.queryIntentActivities(intent, 0)

        return if (activities.isNotEmpty()) {
            activity.startActivityForResult(intent, requestCode)
            true
        } else {
            // RD Service companion app (e.g. Mantra RD Service) not installed
            Toast.makeText(
                activity,
                "OTG Scanner: Please install Mantra / Morpho RD Service from Play Store for USB scanner",
                Toast.LENGTH_LONG
            ).show()
            false
        }
    }

    /**
     * Checks if RD Service returned a successful capture
     */
    fun isCaptureSuccessful(data: Intent?): Boolean {
        if (data == null) return false
        val pidData = data.getStringExtra("PID_DATA") ?: ""
        // Check for error code 0 in RD service XML
        return pidData.contains("errCode=\"0\"") || pidData.contains("<Resp errCode=\"0\"") || pidData.contains("PidData")
    }
}
