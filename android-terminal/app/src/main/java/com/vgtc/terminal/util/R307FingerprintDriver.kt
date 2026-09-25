package com.vgtc.terminal.util

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import kotlinx.coroutines.*
import java.io.IOException
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Driver for R307 / AS608 Optical Fingerprint Reader Module.
 * Connects to Android via USB-UART bridge (CP2102, CH340, FT232, PL2303) over OTG.
 *
 * Default baud: 57600 bps, 8-N-1.
 * Supports:
 * - Aura LED ring control (Blue, Green, Red, Breathe, Blink)
 * - Auto-search fingerprint matching in onboard flash memory (1:N matching)
 * - 2-step fingerprint enrollment into Flash Page/Slot ID
 * - Template deletion and database maintenance
 */
class R307FingerprintDriver private constructor() {

    companion object {
        private const val TAG = "R307Driver"
        private const val ACTION_USB_PERMISSION = "com.vgtc.terminal.USB_PERMISSION"

        // R307 Standard Packet Header
        private const val HEADER_HIGH: Byte = 0xEF.toByte()
        private const val HEADER_LOW: Byte = 0x01.toByte()
        private val CHIP_ADDRESS = byteArrayOf(0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte())

        // Packet Identifiers
        private const val PID_COMMAND: Byte = 0x01
        private const val PID_ACK: Byte = 0x07

        // Instructions
        private const val CMD_GEN_IMG: Byte = 0x01       // Detect finger & capture image
        private const val CMD_IMG_2_TZ: Byte = 0x02      // Generate character file from image
        private const val CMD_REG_MODEL: Byte = 0x03     // Combine character files 1 & 2 into template
        private const val CMD_SEARCH: Byte = 0x04        // Search flash library for match
        private const val CMD_STORE: Byte = 0x05         // Store template in flash page
        private const val CMD_DELETE: Byte = 0x0C        // Delete template
        private const val CMD_EMPTY: Byte = 0x0D         // Empty flash database
        private const val CMD_AURA_LED: Byte = 0x35      // R307 Aura LED ring control

        // Confirmation Codes
        const val CONFIRM_OK: Byte = 0x00
        const val CONFIRM_ERR_COMM: Byte = 0x01
        const val CONFIRM_NO_FINGER: Byte = 0x02
        const val CONFIRM_ENROLL_FAIL: Byte = 0x03
        const val CONFIRM_BAD_IMG: Byte = 0x06
        const val CONFIRM_IMG_TOO_SMALL: Byte = 0x07
        const val CONFIRM_NOT_FOUND: Byte = 0x09
        const val CONFIRM_MERGE_FAIL: Byte = 0x0A

        @Volatile
        private var instance: R307FingerprintDriver? = null

        fun getInstance(): R307FingerprintDriver {
            return instance ?: synchronized(this) {
                instance ?: R307FingerprintDriver().also { instance = it }
            }
        }
    }

    enum class LedMode(val code: Byte) {
        BREATH(0x01),
        FLASH(0x02),
        ALWAYS_ON(0x03),
        ALWAYS_OFF(0x04)
    }

    enum class LedColor(val code: Byte) {
        RED(0x01),
        BLUE(0x02),
        GREEN(0x03)
    }

    data class MatchResult(
        val matched: Boolean,
        val slotId: Int = -1,
        val score: Int = 0,
        val errorCode: Byte = 0x00,
        val message: String = ""
    )

    private var usbSerialPort: UsbSerialPort? = null
    private val lock = ReentrantLock()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    val isConnected: Boolean
        get() = usbSerialPort?.isOpen == true

    /**
     * Connect to R307 via USB-to-UART module (CP2102, CH340, etc.)
     */
    fun connect(context: Context, callback: (Boolean, String) -> Unit) {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager
        if (usbManager == null) {
            callback(false, "USB Manager unavailable")
            return
        }

        val availableDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)
        if (availableDrivers.isEmpty()) {
            callback(false, "No USB-UART adapter detected. Connect via OTG.")
            return
        }

        val driver = availableDrivers[0]
        val connection = usbManager.openDevice(driver.device)

        if (connection == null) {
            // Need permission
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
            val permissionIntent = PendingIntent.getBroadcast(
                context, 0, Intent(ACTION_USB_PERMISSION), flags
            )

            val filter = IntentFilter(ACTION_USB_PERMISSION)
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, intent: Intent?) {
                    if (ACTION_USB_PERMISSION == intent?.action) {
                        synchronized(this) {
                            val device: UsbDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                            } else {
                                @Suppress("DEPRECATION")
                                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                            }
                            if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                                device?.let { openPort(usbManager, driver, callback) }
                            } else {
                                callback(false, "USB permission denied by user")
                            }
                        }
                        try { context.unregisterReceiver(this) } catch (_: Exception) {}
                    }
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                context.registerReceiver(receiver, filter)
            }

            usbManager.requestPermission(driver.device, permissionIntent)
            return
        }

        openPort(usbManager, driver, callback)
    }

    private fun openPort(
        usbManager: UsbManager,
        driver: com.hoho.android.usbserial.driver.UsbSerialDriver,
        callback: (Boolean, String) -> Unit
    ) {
        scope.launch {
            try {
                lock.withLock {
                    val connection = usbManager.openDevice(driver.device)
                        ?: throw IOException("Failed to open USB device connection")

                    val port = driver.ports[0]
                    port.open(connection)
                    // R307 default baud rate is 57600
                    port.setParameters(57600, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
                    usbSerialPort = port
                }

                // Test communication via Aura LED
                setLed(LedMode.BREATH, LedColor.BLUE)

                withContext(Dispatchers.Main) {
                    callback(true, "R307 Optical Sensor Online (57600 bps)")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Port open error: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    callback(false, "Port error: ${e.message}")
                }
            }
        }
    }

    fun disconnect() {
        lock.withLock {
            try {
                setLed(LedMode.ALWAYS_OFF, LedColor.BLUE)
                usbSerialPort?.close()
            } catch (_: Exception) {}
            usbSerialPort = null
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Aura Ring LED Control (R307 special feature)
    // ─────────────────────────────────────────────────────────────
    fun setLed(mode: LedMode, color: LedColor, speed: Int = 100, times: Int = 0) {
        scope.launch {
            val content = byteArrayOf(
                CMD_AURA_LED,
                mode.code,
                speed.toByte(),
                color.code,
                times.toByte()
            )
            sendCommand(content)
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 1:N Search Fingerprint in Flash Library
    // ─────────────────────────────────────────────────────────────
    fun searchFingerprint(
        startSlot: Int = 0,
        maxSlots: Int = 300,
        callback: (MatchResult) -> Unit
    ) {
        scope.launch {
            if (!isConnected) {
                withContext(Dispatchers.Main) {
                    callback(MatchResult(false, message = "R307 Sensor Disconnected"))
                }
                return@launch
            }

            // 1. Check if finger is on sensor
            val genImgRes = sendCommand(byteArrayOf(CMD_GEN_IMG))
            if (genImgRes == null || genImgRes.isEmpty()) {
                withContext(Dispatchers.Main) {
                    callback(MatchResult(false, message = "No response from sensor"))
                }
                return@launch
            }

            val confirmCode = genImgRes[0]
            if (confirmCode == CONFIRM_NO_FINGER) {
                // No finger pressed right now
                withContext(Dispatchers.Main) {
                    callback(MatchResult(false, errorCode = CONFIRM_NO_FINGER, message = "No finger detected"))
                }
                return@launch
            }

            if (confirmCode != CONFIRM_OK) {
                withContext(Dispatchers.Main) {
                    callback(MatchResult(false, errorCode = confirmCode, message = "Bad image capture"))
                }
                return@launch
            }

            // 2. Convert captured image to Character Buffer 1
            val img2TzRes = sendCommand(byteArrayOf(CMD_IMG_2_TZ, 0x01))
            if (img2TzRes == null || img2TzRes.isEmpty() || img2TzRes[0] != CONFIRM_OK) {
                withContext(Dispatchers.Main) {
                    callback(MatchResult(false, message = "Failed to generate character file"))
                }
                return@launch
            }

            // 3. Search Flash Library for Buffer 1
            val startHigh = ((startSlot shr 8) and 0xFF).toByte()
            val startLow = (startSlot and 0xFF).toByte()
            val countHigh = ((maxSlots shr 8) and 0xFF).toByte()
            val countLow = (maxSlots and 0xFF).toByte()

            val searchCmd = byteArrayOf(CMD_SEARCH, 0x01, startHigh, startLow, countHigh, countLow)
            val searchRes = sendCommand(searchCmd)

            if (searchRes != null && searchRes.isNotEmpty() && searchRes[0] == CONFIRM_OK && searchRes.size >= 5) {
                val pageId = ((searchRes[1].toInt() and 0xFF) shl 8) or (searchRes[2].toInt() and 0xFF)
                val score = ((searchRes[3].toInt() and 0xFF) shl 8) or (searchRes[4].toInt() and 0xFF)

                // Flash LED green for success
                setLed(LedMode.FLASH, LedColor.GREEN, 80, 2)

                withContext(Dispatchers.Main) {
                    callback(MatchResult(true, slotId = pageId, score = score, message = "Match found at slot #$pageId"))
                }
            } else {
                // Flash LED red for not found
                setLed(LedMode.FLASH, LedColor.RED, 80, 2)
                withContext(Dispatchers.Main) {
                    callback(MatchResult(false, errorCode = CONFIRM_NOT_FOUND, message = "Fingerprint not recognized"))
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 2-Step Fingerprint Enrollment into Flash Slot ID
    // ─────────────────────────────────────────────────────────────
    fun enrollFingerprint(
        targetSlotId: Int,
        progressCallback: (String) -> Unit,
        completionCallback: (Boolean, String) -> Unit
    ) {
        scope.launch {
            if (!isConnected) {
                withContext(Dispatchers.Main) {
                    completionCallback(false, "R307 Sensor Disconnected")
                }
                return@launch
            }

            // Turn on Blue LED for enrollment
            setLed(LedMode.ALWAYS_ON, LedColor.BLUE)

            // Step 1: Wait for finger
            withContext(Dispatchers.Main) { progressCallback("Step 1/2: Place finger on sensor...") }
            var gotFirstImage = false
            for (attempt in 0..40) { // wait up to 8 seconds
                val res = sendCommand(byteArrayOf(CMD_GEN_IMG))
                if (res != null && res.isNotEmpty() && res[0] == CONFIRM_OK) {
                    gotFirstImage = true
                    break
                }
                delay(200)
            }

            if (!gotFirstImage) {
                setLed(LedMode.FLASH, LedColor.RED, 80, 2)
                withContext(Dispatchers.Main) { completionCallback(false, "Timeout: Finger not placed") }
                return@launch
            }

            // Generate character file in Buffer 1
            val img2Tz1 = sendCommand(byteArrayOf(CMD_IMG_2_TZ, 0x01))
            if (img2Tz1 == null || img2Tz1[0] != CONFIRM_OK) {
                setLed(LedMode.FLASH, LedColor.RED, 80, 2)
                withContext(Dispatchers.Main) { completionCallback(false, "Bad fingerprint capture, try again") }
                return@launch
            }

            // Step 2: Ask user to lift finger
            withContext(Dispatchers.Main) { progressCallback("Remove finger...") }
            delay(1200)

            // Wait for finger again
            withContext(Dispatchers.Main) { progressCallback("Step 2/2: Place the SAME finger again...") }
            var gotSecondImage = false
            for (attempt in 0..40) {
                val res = sendCommand(byteArrayOf(CMD_GEN_IMG))
                if (res != null && res.isNotEmpty() && res[0] == CONFIRM_OK) {
                    gotSecondImage = true
                    break
                }
                delay(200)
            }

            if (!gotSecondImage) {
                setLed(LedMode.FLASH, LedColor.RED, 80, 2)
                withContext(Dispatchers.Main) { completionCallback(false, "Timeout: Second touch missing") }
                return@launch
            }

            // Generate character file in Buffer 2
            val img2Tz2 = sendCommand(byteArrayOf(CMD_IMG_2_TZ, 0x02))
            if (img2Tz2 == null || img2Tz2[0] != CONFIRM_OK) {
                setLed(LedMode.FLASH, LedColor.RED, 80, 2)
                withContext(Dispatchers.Main) { completionCallback(false, "Second scan failed, try again") }
                return@launch
            }

            // Combine character files into template
            val regRes = sendCommand(byteArrayOf(CMD_REG_MODEL))
            if (regRes == null || regRes[0] != CONFIRM_OK) {
                setLed(LedMode.FLASH, LedColor.RED, 80, 2)
                withContext(Dispatchers.Main) { completionCallback(false, "Fingerprints did not match. Please re-enroll.") }
                return@launch
            }

            // Store into Flash slot ID
            val slotHigh = ((targetSlotId shr 8) and 0xFF).toByte()
            val slotLow = (targetSlotId and 0xFF).toByte()
            val storeRes = sendCommand(byteArrayOf(CMD_STORE, 0x01, slotHigh, slotLow))

            if (storeRes != null && storeRes[0] == CONFIRM_OK) {
                setLed(LedMode.FLASH, LedColor.GREEN, 60, 3)
                withContext(Dispatchers.Main) {
                    completionCallback(true, "Fingerprint saved successfully in R307 slot #$targetSlotId!")
                }
            } else {
                setLed(LedMode.FLASH, LedColor.RED, 80, 2)
                withContext(Dispatchers.Main) {
                    completionCallback(false, "Failed to write to R307 flash memory")
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Delete Fingerprint from Slot ID
    // ─────────────────────────────────────────────────────────────
    fun deleteFingerprint(slotId: Int, callback: (Boolean) -> Unit) {
        scope.launch {
            val slotHigh = ((slotId shr 8) and 0xFF).toByte()
            val slotLow = (slotId and 0xFF).toByte()
            val res = sendCommand(byteArrayOf(CMD_DELETE, slotHigh, slotLow, 0x00, 0x01))
            val success = res != null && res.isNotEmpty() && res[0] == CONFIRM_OK
            withContext(Dispatchers.Main) { callback(success) }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Low-Level Protocol Packet Builder & Parser
    // ─────────────────────────────────────────────────────────────
    private fun sendCommand(content: ByteArray): ByteArray? {
        val port = usbSerialPort ?: return null
        return lock.withLock {
            try {
                // Packet format: [Header 2B][Addr 4B][PID 1B][Length 2B][Content NB][Checksum 2B]
                val length = content.size + 2
                val lengthHigh = ((length shr 8) and 0xFF).toByte()
                val lengthLow = (length and 0xFF).toByte()

                var sum = (PID_COMMAND.toInt() and 0xFF) + (lengthHigh.toInt() and 0xFF) + (lengthLow.toInt() and 0xFF)
                for (b in content) {
                    sum += (b.toInt() and 0xFF)
                }
                val checkHigh = ((sum shr 8) and 0xFF).toByte()
                val checkLow = (sum and 0xFF).toByte()

                val packet = byteArrayOf(
                    HEADER_HIGH, HEADER_LOW,
                    CHIP_ADDRESS[0], CHIP_ADDRESS[1], CHIP_ADDRESS[2], CHIP_ADDRESS[3],
                    PID_COMMAND,
                    lengthHigh, lengthLow,
                    *content,
                    checkHigh, checkLow
                )

                port.write(packet, 500)

                // Read response
                val buffer = ByteArray(64)
                val readLen = port.read(buffer, 800)
                if (readLen < 9) return@withLock null

                // Look for Header 0xEF 0x01
                var headerIdx = -1
                for (i in 0 until readLen - 1) {
                    if (buffer[i] == HEADER_HIGH && buffer[i + 1] == HEADER_LOW) {
                        headerIdx = i
                        break
                    }
                }
                if (headerIdx == -1 || headerIdx + 9 > readLen) return@withLock null

                val ackPid = buffer[headerIdx + 6]
                if (ackPid != PID_ACK) return@withLock null

                val ackLen = ((buffer[headerIdx + 7].toInt() and 0xFF) shl 8) or (buffer[headerIdx + 8].toInt() and 0xFF)
                val contentLen = ackLen - 2
                if (contentLen <= 0 || headerIdx + 9 + contentLen > readLen) return@withLock null

                val result = ByteArray(contentLen)
                System.arraycopy(buffer, headerIdx + 9, result, 0, contentLen)
                result
            } catch (e: Exception) {
                Log.e(TAG, "Serial comm error: ${e.message}")
                null
            }
        }
    }
}
