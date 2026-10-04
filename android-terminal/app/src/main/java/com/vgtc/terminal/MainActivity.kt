package com.vgtc.terminal

import android.Manifest
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.Size
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.bumptech.glide.Glide
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.vgtc.terminal.api.ApiClient
import com.vgtc.terminal.databinding.ActivityMainBinding
import com.vgtc.terminal.databinding.DialogAttendanceOverrideBinding
import com.vgtc.terminal.model.AttendanceRecord
import com.vgtc.terminal.model.DutyRecord
import com.vgtc.terminal.model.Profile
import com.vgtc.terminal.util.Prefs
import com.vgtc.terminal.util.R307FingerprintDriver
import com.vgtc.terminal.util.RealFaceRecognitionEngine
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.widget.ArrayAdapter
import android.widget.AdapterView
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs
    private lateinit var apiClient: ApiClient
    private lateinit var cameraExecutor: ExecutorService

    // Real Face Recognition (MobileFaceNet TFLite)
    private lateinit var realFaceEngine: RealFaceRecognitionEngine

    // Real R307 Optical Fingerprint Driver (AS608 UART via OTG)
    private val r307Driver = R307FingerprintDriver.getInstance()
    private var r307PollingHandler: Handler? = null
    private var r307PollingRunnable: Runnable? = null
    private var isR307Searching = false

    // Clock without seconds
    private var clockHandler: Handler? = null
    private var clockRunnable: Runnable? = null
    private val dateFormatter = SimpleDateFormat("EEEE, dd MMMM yyyy", Locale("en", "IN"))
    private val timeFormatter = SimpleDateFormat("hh:mm a", Locale("en", "IN"))

    // Live Connection Polling
    private var connectionHandler: Handler? = null
    private var connectionRunnable: Runnable? = null

    // Inactivity Screensaver (15s timeout)
    private var screensaverHandler: Handler? = null
    private var screensaverRunnable: Runnable? = null
    private var isScreensaverActive = false
    private val SCREENSAVER_TIMEOUT_MS = 15000L

    // Profiles & Face Scanning
    private var profiles: List<Profile> = emptyList()
    private var faceDetected = false
    private var scanPaused = false
    private var lastPunchedProfileId: String? = null
    private var lastPunchTime = 0L
    private var globalLastPunchTime = 0L
    private var isAnalyzingFace = false

    // Dismiss timer for attendance popup
    private var dismissHandler: Handler? = null
    private var dismissRunnable: Runnable? = null

    // Unregistered face alert state
    private var unregisteredProgressAnimator: android.animation.ValueAnimator? = null
    private var unregisteredCountDownTimer: android.os.CountDownTimer? = null
    private var lastUnregisteredAlertTime = 0L
    private var consecutiveUnknownFrames = 0

    // ML Kit fast face detector
    private val faceDetector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setMinFaceSize(0.2f)
            .build()
    )

    companion object {
        private const val CAMERA_PERMISSION_CODE = 101
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        prefs = Prefs(this)
        apiClient = ApiClient(this)
        cameraExecutor = Executors.newSingleThreadExecutor()
        realFaceEngine = RealFaceRecognitionEngine.getInstance(this)

        // Keep screen on for terminal kiosk
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Status bar & cutout padding: Guarantees topBar is NEVER covered by phone's status bar / notch / camera hole
        ViewCompat.setOnApplyWindowInsetsListener(binding.topBar) { v, insets ->
            val systemBars =
                insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val topPadding = maxOf(systemBars.top, (24 * resources.displayMetrics.density).toInt())
            v.setPadding(v.paddingLeft, topPadding, v.paddingRight, v.paddingBottom)
            insets
        }

        setupLiveClock()
        initAudioAndVoice()
        setupLanguageToggle()
        setupAdminLockAction()
        setupAttendanceOverrideAction()
        setupTouchAndScreensaver()
        startLiveConnectionPolling()

        // Immediately load locally cached profiles so kiosk is ready instantly
        profiles = prefs.getLocalProfiles()
        if (profiles.isNotEmpty()) {
            binding.tvLiveConnection.text = "● Cached · ${profiles.size} profiles"
        }
        loadProfiles()
        setupR307Driver()

        // Full camera preview on launch
        requestCameraAndStart()

        // Attempt kiosk lock
        lockToKiosk()
    }

    // ──────────────────────────────────────────────────
    // Clock Matching Image 2 Standby (Split Digits + Orange am/pm)
    // ──────────────────────────────────────────────────
    private val topDateFormatter = SimpleDateFormat("EEE, dd MMM", Locale("en", "IN"))
    private val saverTimeDigitsFormatter = SimpleDateFormat("hh:mm", Locale("en", "IN"))
    private val saverTimeAmPmFormatter = SimpleDateFormat("a", Locale("en", "IN"))
    private val saverFullDateFormatter = SimpleDateFormat("EEEE, dd MMMM yyyy", Locale("en", "IN"))

    private fun setupLiveClock() {
        clockHandler = Handler(Looper.getMainLooper())
        clockRunnable = object : Runnable {
            override fun run() {
                val now = Date()
                val timeStr = timeFormatter.format(now)
                val dateStr = dateFormatter.format(now)
                val topDateStr = topDateFormatter.format(now)
                val digitsStr = saverTimeDigitsFormatter.format(now)
                val amPmStr = saverTimeAmPmFormatter.format(now).lowercase(Locale.US)
                val fullDateStr = saverFullDateFormatter.format(now)

                binding.tvTime.text = timeStr
                binding.tvDate.text = topDateStr
                binding.tvSaverTime.text = timeStr
                binding.tvSaverTimeDigits.text = digitsStr
                binding.tvSaverTimeAmPm.text = amPmStr
                binding.tvSaverDate.text = fullDateStr

                clockHandler?.postDelayed(this, 1000)
            }
        }
        clockHandler?.post(clockRunnable!!)
    }

    // ──────────────────────────────────────────────────
    // Inactivity Screensaver
    // ──────────────────────────────────────────────────
    private fun setupTouchAndScreensaver() {
        screensaverHandler = Handler(Looper.getMainLooper())
        screensaverRunnable = Runnable { showScreensaver() }
        resetScreensaverTimer()

        // Touch on screensaver wakes the terminal
        binding.layoutScreensaver.setOnClickListener {
            hideScreensaver()
        }

        // Tap on camera screen triggers biometric scan if sensor available
        binding.cameraPreview.setOnClickListener {
            resetScreensaverTimer()
            triggerFingerprintScan()
        }
    }

    private fun resetScreensaverTimer() {
        if (isScreensaverActive) {
            hideScreensaver()
        }
        screensaverHandler?.removeCallbacks(screensaverRunnable ?: return)
        screensaverHandler?.postDelayed(screensaverRunnable!!, SCREENSAVER_TIMEOUT_MS)
    }

    private fun showScreensaver() {
        if (isScreensaverActive || scanPaused) return
        isScreensaverActive = true
        binding.layoutScreensaver.alpha = 0f
        binding.layoutScreensaver.visibility = View.VISIBLE
        binding.layoutScreensaver.animate().alpha(1f).setDuration(400).start()
        // Stop camera when screensaver is active to save battery and prevent false scans
        stopCamera()
    }

    private fun hideScreensaver() {
        if (!isScreensaverActive) return
        isScreensaverActive = false
        binding.layoutScreensaver.animate().alpha(0f).setDuration(300).withEndAction {
            binding.layoutScreensaver.visibility = View.GONE
        }.start()
        screensaverHandler?.removeCallbacks(screensaverRunnable ?: return)
        screensaverHandler?.postDelayed(screensaverRunnable!!, SCREENSAVER_TIMEOUT_MS)
        // Restart camera when user wakes the screen
        if (!scanPaused) startCameraPreview()
    }

    private fun stopCamera() {
        try {
            val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
            cameraProviderFuture.addListener({
                try { cameraProviderFuture.get().unbindAll() } catch (_: Exception) {}
            }, ContextCompat.getMainExecutor(this))
        } catch (_: Exception) {}
    }

    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean {
        if (isScreensaverActive && ev?.action == MotionEvent.ACTION_DOWN) {
            hideScreensaver()
            return true
        }
        resetScreensaverTimer()
        return super.dispatchTouchEvent(ev)
    }

    // ──────────────────────────────────────────────────
    // Audio Beep Chime & TextToSpeech Voice Guidance
    // ──────────────────────────────────────────────────
    private var textToSpeech: android.speech.tts.TextToSpeech? = null
    private lateinit var sensorFeedback: com.vgtc.terminal.util.TerminalFeedback
    private val rosterHandler = Handler(Looper.getMainLooper())
    private var rosterLoading = false
    private val rosterRefresh = object : Runnable { override fun run() { loadProfiles(); rosterHandler.postDelayed(this, 15000) } }
    private var toneGenerator: android.media.ToneGenerator? = null

    private fun initAudioAndVoice() {
        sensorFeedback = com.vgtc.terminal.util.TerminalFeedback(this)
        try {
            toneGenerator = android.media.ToneGenerator(android.media.AudioManager.STREAM_MUSIC, 100)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        textToSpeech = android.speech.tts.TextToSpeech(this) { status ->
            if (status == android.speech.tts.TextToSpeech.SUCCESS) {
                updateTtsLanguage()
            }
        }
    }

    private fun updateTtsLanguage() {
        val lang = prefs.language
        val locale = if (lang == "hi") Locale("hi", "IN") else Locale("en", "IN")
        textToSpeech?.setLanguage(locale)
        textToSpeech?.setSpeechRate(0.88f)
        textToSpeech?.setPitch(1.0f)
    }

    private fun playPunchChime() {
        try {
            toneGenerator?.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 180)
        } catch (_: Exception) {}
    }

    private var lastSpokenText: String = ""
    private var lastSpokenTime: Long = 0L

    private fun speakVoice(textEn: String, textHi: String, force: Boolean = false) {
        val lang = prefs.language
        val textToSpeak = if (lang == "hi") textHi else textEn
        val now = System.currentTimeMillis()

        if (!force && textToSpeak == lastSpokenText && (now - lastSpokenTime) < 6000L) return
        lastSpokenText = textToSpeak
        lastSpokenTime = now

        updateTtsLanguage()
        textToSpeech?.speak(
            textToSpeak,
            android.speech.tts.TextToSpeech.QUEUE_FLUSH,
            null,
            "vgtc_voice_${System.currentTimeMillis()}"
        )
    }

    private fun setupLanguageToggle() {
        updateLanguageUi()
        binding.btnLanguageToggle.setOnClickListener {
            prefs.language = if (prefs.language == "hi") "en" else "hi"
            updateLanguageUi()
            val msg = if (prefs.language == "hi") "भाषा हिंदी पर सेट की गई" else "Language set to English"
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }
    }

    private fun updateLanguageUi() {
        val isHi = prefs.language == "hi"
        binding.btnLanguageToggle.text = if (isHi) "🌐 HI ⌵" else "🌐 EN ⌵"
        binding.tvDetectionTitle.text = if (isHi) "चेहरा या उंगली स्कैन करें" else "Looking for face or fingerprint..."
        binding.tvDetectionTitle.setTextColor(Color.WHITE)
        binding.ivDetectionIcon.setImageResource(R.drawable.ic_face_reticle)
        binding.tvFaceDetectionHint.text = if (isHi) {
            "कैमरे के सामने चेहरा रखें या स्कैनर पर उंगली रखें"
        } else {
            "Position your face inside frame or scan finger"
        }
    }

    private fun normalizedPhotoUrl(photo: String?): String? {
        if (photo.isNullOrBlank()) return null
        if (photo.startsWith("data:") || photo.startsWith("http://") || photo.startsWith("https://")) return photo
        val base = prefs.serverUrl.trimEnd('/')
        return if (photo.startsWith('/')) "$base$photo" else "$base/$photo"
    }

    // ──────────────────────────────────────────────────
    // Live Connection Polling
    // ──────────────────────────────────────────────────
    private fun startLiveConnectionPolling() {
        binding.tvLiveConnection.text = "● Connecting"
    }

    // ──────────────────────────────────────────────────
    // Admin PIN Lock (Reusable PIN Authenticator)
    // ──────────────────────────────────────────────────
    private fun promptAdminPin(
        title: String = "Admin Security Lock",
        message: String = "Enter Admin PIN to proceed.",
        onSuccess: () -> Unit
    ) {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "Enter 4-digit Admin PIN"
            textAlignment = View.TEXT_ALIGNMENT_CENTER
            textSize = 20f
        }

        MaterialAlertDialogBuilder(this)
            .setTitle(title)
            .setMessage(message)
            .setView(input)
            .setPositiveButton("Authorize") { _, _ ->
                val entered = input.text.toString().trim()
                val currentPin = prefs.adminPin
                val isServerPassword = entered == prefs.password && entered.isNotBlank()

                // NOTE: previously also accepted the literal "1234" unconditionally, which
                // meant changing the Admin PIN never actually revoked the old default —
                // that permanent backdoor has been removed.
                if (entered == currentPin || isServerPassword) {
                    onSuccess()
                } else {
                    Toast.makeText(this, "Incorrect Admin PIN / Password", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun setupAdminLockAction() {
        binding.btnAdminLock.setOnClickListener {
            promptAdminPin(
                "Admin Security Lock",
                "Enter Admin PIN to access enrollment, terminal settings, and exit options."
            ) {
                startActivity(Intent(this, AdminSettingsActivity::class.java))
            }
        }
    }

    private fun setupAttendanceOverrideAction() {
        binding.btnAttendanceOverride.setOnClickListener {
            promptAdminPin(
                "Manual Attendance & Master Override",
                "Enter Admin PIN to manually mark shift status, times, vehicle or mark absent:"
            ) {
                showAttendanceOverrideDialog(null)
            }
        }
    }

    private fun showAttendanceOverrideDialog(initialProfile: Profile?) {
        val dialogBinding = DialogAttendanceOverrideBinding.inflate(layoutInflater)
        if (profiles.isEmpty()) {
            Toast.makeText(this, "No enrolled employees found", Toast.LENGTH_SHORT).show()
            return
        }

        val employeeNames = profiles.map {
            val veh = if (!it.vehicleNo.isNullOrBlank()) " [🚛 ${it.vehicleNo}]" else ""
            "${it.name} (${it.profileType ?: "Staff"})$veh"
        }
        val empAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, employeeNames)
        dialogBinding.spinnerEmployee.adapter = empAdapter

        var selectedProfile = initialProfile ?: profiles.first()
        val initIdx = profiles.indexOfFirst { it.id == selectedProfile.id }.coerceAtLeast(0)
        dialogBinding.spinnerEmployee.setSelection(initIdx)

        val statusLabels = listOf(
            "Present (Full Day 1.0)",
            "Half Day (0.5 Day)",
            "Absent (0.0 Day)",
            "On Leave (0.0 Day)"
        )
        val statusValues = listOf("present", "half_day", "absent", "leave")
        val statusAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, statusLabels)
        dialogBinding.spinnerStatus.adapter = statusAdapter

        val dutyStateLabels = listOf(
            "COMPLETED (Shift Done / Off Duty)",
            "IN_DUTY (Shift Active / In Progress)",
            "EMERGENCY_LEAVE (Early Departure)",
            "ABSENT (Did Not Report)"
        )
        val dutyStateValues = listOf("COMPLETED", "IN_DUTY", "EMERGENCY_LEAVE", "ABSENT")
        val dutyAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, dutyStateLabels)
        dialogBinding.spinnerDutyState.adapter = dutyAdapter

        val populateForProfile = { p: Profile ->
            val duty = prefs.getTodayDuty(p.id)
            dialogBinding.etOverrideVehicle.setText(p.vehicleNo ?: duty?.vehicleNo ?: "")
            dialogBinding.etOverrideInTime.setText(
                duty?.inTimeFormatted ?: SimpleDateFormat(
                    "hh:mm a",
                    Locale("en", "IN")
                ).format(Date())
            )
            dialogBinding.etOverrideOutTime.setText(duty?.outTimeFormatted ?: "")
            dialogBinding.etOverrideDays.setText(String.format(Locale.US, "%.1f", duty?.dutyDays ?: 1.0))
            dialogBinding.etOverrideNote.setText(duty?.overrideReason ?: "")

            val stIdx = statusValues.indexOf(duty?.status ?: "present").coerceAtLeast(0)
            dialogBinding.spinnerStatus.setSelection(stIdx)

            val dsIdx = dutyStateValues.indexOf(duty?.dutyState ?: "COMPLETED").coerceAtLeast(0)
            dialogBinding.spinnerDutyState.setSelection(dsIdx)
        }

        populateForProfile(selectedProfile)

        dialogBinding.spinnerEmployee.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                if (position in profiles.indices) {
                    selectedProfile = profiles[position]
                    populateForProfile(selectedProfile)
                }
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        dialogBinding.spinnerStatus.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                when (position) {
                    0 -> dialogBinding.etOverrideDays.setText("1.0")
                    1 -> dialogBinding.etOverrideDays.setText("0.5")
                    2 -> {
                        dialogBinding.etOverrideDays.setText("0.0")
                        dialogBinding.spinnerDutyState.setSelection(3) // ABSENT
                    }

                    3 -> dialogBinding.etOverrideDays.setText("0.0")
                }
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        val dialog = AlertDialog.Builder(this)
            .setView(dialogBinding.root)
            .setCancelable(true)
            .create()

        dialogBinding.btnOverrideCancel.setOnClickListener {
            dialog.dismiss()
        }

        dialogBinding.btnOverrideSave.setOnClickListener {
            val statusPos = dialogBinding.spinnerStatus.selectedItemPosition.coerceIn(0, statusValues.size - 1)
            val dutyPos = dialogBinding.spinnerDutyState.selectedItemPosition.coerceIn(0, dutyStateValues.size - 1)

            val chosenStatus = statusValues[statusPos]
            val chosenDutyState = dutyStateValues[dutyPos]
            val inTimeStr = dialogBinding.etOverrideInTime.text.toString().trim()
            val outTimeStr = dialogBinding.etOverrideOutTime.text.toString().trim()
            val vehStr = dialogBinding.etOverrideVehicle.text.toString().trim().uppercase().ifBlank { null }
            val days = dialogBinding.etOverrideDays.text.toString().toDoubleOrNull()
                ?: (if (chosenStatus == "present") 1.0 else if (chosenStatus == "half_day") 0.5 else 0.0)
            val noteStr = dialogBinding.etOverrideNote.text.toString().trim().ifBlank { "Admin Override" }

            val now = System.currentTimeMillis()
            val updatedDuty = DutyRecord(
                profileId = selectedProfile.id,
                profileName = selectedProfile.name,
                profileType = selectedProfile.profileType ?: "Staff",
                vehicleNo = vehStr,
                inTimeMs = now,
                inTimeFormatted = inTimeStr.ifBlank {
                    SimpleDateFormat(
                        "hh:mm a",
                        Locale("en", "IN")
                    ).format(Date(now))
                },
                outTimeMs = if (outTimeStr.isNotBlank()) now else null,
                outTimeFormatted = outTimeStr.ifBlank { null },
                durationHours = if (days >= 1.0) 8.0 else if (days > 0.0) 4.0 else 0.0,
                dutyDays = days,
                dutyState = chosenDutyState,
                status = chosenStatus,
                overrideReason = noteStr
            )

            dialogBinding.btnOverrideSave.isEnabled = false
            dialogBinding.btnOverrideCancel.isEnabled = false
            dialog.setCancelable(false)

            // A local PIN authorizes the operator; only the server confirms a save.
            apiClient.markAttendance(
                profile = selectedProfile,
                status = chosenStatus,
                method = "admin_override",
                inTime = updatedDuty.inTimeFormatted,
                outTime = updatedDuty.outTimeFormatted,
                durationHours = updatedDuty.durationHours,
                dutyDays = updatedDuty.dutyDays,
                dutyState = chosenDutyState.lowercase(),
                overrideReason = noteStr
            ) { result ->
                runOnUiThread {
                    result.onSuccess {
                        prefs.saveTodayDuty(updatedDuty)
                        dialog.dismiss()
                        Toast.makeText(
                            this@MainActivity,
                            "✓ Override saved for ${selectedProfile.name} ($chosenStatus, $days Day)",
                            Toast.LENGTH_SHORT
                        ).show()
                    }.onFailure { err ->
                        dialogBinding.btnOverrideSave.isEnabled = true
                        dialogBinding.btnOverrideCancel.isEnabled = true
                        dialog.setCancelable(true)
                        Toast.makeText(this@MainActivity, "Not saved. Check internet and retry: ${err.message}", Toast.LENGTH_LONG)
                            .show()
                    }
                }
            }

        }

        dialog.show()
    }

    override fun onBackPressed() {
        promptAdminPin("Admin Security Lock", "Enter Admin PIN to exit or manage settings:") {
            startActivity(Intent(this, AdminSettingsActivity::class.java))
        }
    }

    // ──────────────────────────────────────────────────
    // Auto Fingerprint Detection & Punch (OTG USB R307 Sensor)
    // ──────────────────────────────────────────────────
    private fun triggerFingerprintScan() {
        if (!r307Driver.isConnected) setupR307Driver()
        val message = if (r307Driver.isConnected) "Place your enrolled finger flat on the external scanner." else "Optical Scanner: Disconnected"
        binding.tvFaceDetectionHint.text = message
        if (r307Driver.isConnected) {
            sensorFeedback.speak("Place your enrolled finger flat on the external scanner.", "दर्ज की गई उंगली स्कैनर पर ठीक से रखें।")
        }
    }

    private fun setupR307Driver() {
        r307Driver.connect(this) { connected, msg ->
            runOnUiThread {
                if (connected) {
                    binding.tvR307SensorStatus.text = " • 🔌 R307 Sensor: Online"
                    binding.tvR307SensorStatus.setTextColor(getColor(R.color.green_online))
                    startR307Polling()
                } else {
                    binding.tvR307SensorStatus.text = " • 🔌 R307: Disconnected (Plug OTG)"
                    binding.tvR307SensorStatus.setTextColor(getColor(R.color.grey_status))
                }
            }
        }
    }

    private fun startR307Polling() {
        r307PollingHandler?.removeCallbacksAndMessages(null)
        r307PollingHandler = Handler(Looper.getMainLooper())
        r307PollingRunnable = object : Runnable {
            override fun run() {
                if (!scanPaused && !scanComplete && r307Driver.isConnected && !isR307Searching) {
                    isR307Searching = true
                    r307Driver.searchFingerprint(startSlot = 1, maxSlots = 300) { result ->
                        isR307Searching = false
                        if (result.matched) {
                            val matchedProfile = profiles.find { it.fingerprintEnrolled && it.fingerprintSlotId == result.slotId }
                            if (matchedProfile != null) {
                                resetScreensaverTimer()
                                markAttendance(matchedProfile, "present", "fingerprint")
                            } else {
                                sensorFeedback.rejected()
                                binding.tvFaceDetectionHint.text =
                                    "Fingerprint ID ${result.slotId} is not linked to a VGTC profile"
                            }
                        } else if (result.errorCode == R307FingerprintDriver.CONFIRM_NOT_FOUND) {
                            sensorFeedback.rejected()
                            speakVoice("Fingerprint not recognised. Lift your finger, then place it flat on the scanner again.", "फिंगरप्रिंट पहचाना नहीं गया। उंगली हटाएँ, फिर स्कैनर पर ठीक से रखें।")
                            binding.tvFaceDetectionHint.text = "Fingerprint not recognised. Lift finger and retry."
                        }
                    }
                }
                r307PollingHandler?.postDelayed(this, 350)
            }
        }
        r307PollingHandler?.post(r307PollingRunnable!!)
    }

    private fun stopR307Polling() {
        r307PollingHandler?.removeCallbacksAndMessages(null)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == com.vgtc.terminal.util.OtgFingerprintHelper.OTG_FP_CAPTURE_REQUEST) {
            sensorFeedback.rejected()
            Toast.makeText(this, "Use the connected R307 / AS608 scanner. A verified fingerprint ID is required.", Toast.LENGTH_LONG).show()
        }
    }

    // ──────────────────────────────────────────────────
    // ──────────────────────────────────────────────────
    // Attendance Marking & Confirmation Popup (Shift Lifecycle)
    // ──────────────────────────────────────────────────
    private fun markAttendance(profile: Profile, status: String, method: String = "face") {
        val now = System.currentTimeMillis()

        // 1. Global cooldown (4 seconds across ANY profile) to prevent same face multi-punching
        if ((now - globalLastPunchTime) < 4000) {
            return
        }
        globalLastPunchTime = now

        // 2. Debounce rapid repeat attempts on current face in frame (5 seconds)
        if (profile.id == lastPunchedProfileId && (now - lastPunchTime) < 5000) {
            return
        }

        pauseScanning()
        if (!profile.isAttendanceActive) {
            lastPunchedProfileId = profile.id
            lastPunchTime = now
            sensorFeedback.rejected()
            sensorFeedback.speak(
                "Attendance is stopped for ${profile.name}. Please contact the office.",
                "${profile.name} की हाज़िरी रोक दी गई है। कृपया कार्यालय से संपर्क करें।"
            )

            val bioMethod = if (method == "fingerprint") "FINGERPRINT" else "FACE"
            val slot = if (method == "fingerprint") profile.fingerprintSlotId else null
            apiClient.reportStoppedAttempt(profile.id, profile.name, bioMethod, slot)

            showAttendanceStoppedAlert(profile, method)
            return
        }
        binding.tvFaceDetectionHint.text = "Checking current duty with VGTC…"
        apiClient.getDuty(profile.id) { result -> runOnUiThread {
            result.onSuccess { duty -> processAttendance(profile, method, duty) }
                .onFailure { showSyncFailure(it.message) }
        } }
    }

    private fun showAttendanceStoppedAlert(profile: Profile, method: String) {
        runOnUiThread {
            binding.tvDetectionTitle.text = if (prefs.language == "hi") "⚠️ हाज़िरी रोक दी गई है" else "⚠️ Attendance Stopped"
            binding.tvDetectionTitle.setTextColor(Color.parseColor("#EF4444"))
            binding.tvFaceDetectionHint.text = if (prefs.language == "hi")
                "${profile.name} — पोर्टल से हाज़िरी रोकी गई है"
            else
                "${profile.name} — Attendance stopped in VGTC Portal"
            binding.ivDetectionIcon.setImageResource(R.drawable.ic_close)
            binding.floatingStatusCard.alpha = 1f
            binding.floatingStatusCard.visibility = View.VISIBLE

            // Auto-resume scanning after 4 seconds without freezing terminal modal
            dismissHandler?.removeCallbacksAndMessages(null)
            dismissHandler = Handler(Looper.getMainLooper()).apply {
                postDelayed({
                    binding.tvDetectionTitle.setTextColor(Color.WHITE)
                    binding.ivDetectionIcon.setImageResource(R.drawable.ic_face_reticle)
                    updateLanguageUi()
                    resumeScanning()
                }, 4000)
            }
        }
    }

    private fun processAttendance(profile: Profile, method: String, currentDuty: DutyRecord?) {
        val now = System.currentTimeMillis()
        val isDriver = profile.profileType.equals("Driver", ignoreCase = true)

        // Case A: Starting a new shift (First scan of the day OR starting again after leaving)
        if (currentDuty == null || currentDuty.inTimeMs <= 0 || currentDuty.dutyState in listOf(
                "COMPLETED",
                "OFF_DUTY",
                "EMERGENCY_LEAVE",
                "ABSENT"
            )
        ) {
            startShift(profile, method)
            return
        }

        // Case B: Currently on duty (dutyState == "IN_DUTY")
        val elapsedMs = now - currentDuty.inTimeMs
        val elapsedHours = elapsedMs / (1000.0 * 60 * 60)
        val minHoursRequired = 4.0  // 4 hours minimum to punch out

        if (isDriver) {
            // For Drivers: Multi-day Tour Lifecycle.
            // If they scan again, show confirmation to end tour / go home
            if (elapsedMs < 60000) {
                // Scanned within 1 minute of starting - debounce accidental double scan
                lastPunchedProfileId = profile.id
                lastPunchTime = now
                resumeScanning()
                return
            }
            lastPunchedProfileId = profile.id
            lastPunchTime = now
            showDriverTourEndConfirmation(profile, currentDuty, method, elapsedMs)
            return
        }

        if (elapsedHours < minHoursRequired) {
            // Cannot mark completed yet - minimum 4 hours required for staff
            lastPunchedProfileId = profile.id
            lastPunchTime = now
            globalLastPunchTime = now

            // Report Duty Continues event to server audit
            apiClient.reportDutyContinuesScan(profile.id, profile.name, method)

            // A face/fingerprint re-scan while on duty is an in-progress check.
            showActiveDutyInProgressCard(profile, currentDuty, elapsedMs, minHoursRequired)
        } else {
            // 4+ hours elapsed! Complete shift (Punch-Out)
            completeShift(profile, currentDuty, method, elapsedMs)
        }
    }

    private fun showDriverTourEndConfirmation(
        profile: Profile,
        currentDuty: DutyRecord,
        method: String,
        elapsedMs: Long
    ) {
        pauseScanning()
        val isHi = prefs.language == "hi"
        val daysElapsed = (elapsedMs / (1000.0 * 60 * 60 * 24)).toInt()
        val hoursElapsed = ((elapsedMs / (1000.0 * 60 * 60)) % 24).toInt()
        val minutesElapsed = ((elapsedMs / (1000.0 * 60)) % 60).toInt()
        val durationStr = if (daysElapsed > 0) "${daysElapsed}d ${hoursElapsed}h" else "${hoursElapsed}h ${minutesElapsed}m"

        val dialogView = layoutInflater.inflate(R.layout.dialog_driver_tour_end, null)
        val tvTitle = dialogView.findViewById<TextView>(R.id.tvTourDialogTitle)
        val tvSub = dialogView.findViewById<TextView>(R.id.tvTourDialogSubtitle)
        val tvDriver = dialogView.findViewById<TextView>(R.id.tvDriverName)
        val tvVehicle = dialogView.findViewById<TextView>(R.id.tvVehicleBadge)
        val tvDuration = dialogView.findViewById<TextView>(R.id.tvDurationBadge)
        val tvStartTime = dialogView.findViewById<TextView>(R.id.tvStartTime)
        val tvPrompt = dialogView.findViewById<TextView>(R.id.tvQuestionPrompt)
        val tvPromptSub = dialogView.findViewById<TextView>(R.id.tvQuestionPromptSub)
        val btnEndDuty = dialogView.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnEndDuty)
        val btnContinueDuty = dialogView.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnContinueDuty)

        tvTitle.text = if (isHi) "ड्यूटी स्थिति" else "Duty Tour Status"
        tvSub.text = if (isHi) "चालक की सक्रिय ड्यूटी सत्र" else "Active driver duty session"
        tvDriver.text = "${profile.name} (Driver)"
        tvVehicle.text = "🚛 ${profile.vehicleNo ?: (if (isHi) "गाड़ी नहीं जुड़ी" else "No Vehicle")}"
        tvDuration.text = "⏱️ $durationStr"
        tvStartTime.text = if (isHi) "ड्यूटी शुरू: ${currentDuty.inTimeFormatted}" else "Shift Started: ${currentDuty.inTimeFormatted}"
        tvPrompt.text = if (isHi) "क्या आप ड्यूटी समाप्त करके घर जा रहे हैं?" else "Would you like to complete your shift and punch out?"
        tvPromptSub.text = if (isHi) "ड्यूटी समाप्त करने या जारी रखने के लिए नीचे बटन चुनें" else "Choose to punch out or continue active duty."
        btnEndDuty.text = if (isHi) "✓ हाँ, ड्यूटी समाप्त (Punch Out)" else "✓ End Shift (Punch Out)"
        btnContinueDuty.text = if (isHi) "▶️ नहीं, ड्यूटी चालू रखें (Continue)" else "▶️ Continue Active Duty"

        val dialog = MaterialAlertDialogBuilder(this)
            .setView(dialogView)
            .setCancelable(false)
            .create()

        btnEndDuty.setOnClickListener {
            dialog.dismiss()
            completeShift(profile, currentDuty, method, elapsedMs)
        }

        btnContinueDuty.setOnClickListener {
            dialog.dismiss()
            speakVoice("Duty continues for ${profile.name}.", "${profile.name} की ड्यूटी जारी है।")
            resumeScanning()
        }

        dialog.show()
    }

    private fun startShift(profile: Profile, method: String) {
        val now = System.currentTimeMillis()
        val inTimeFormatted = SimpleDateFormat("hh:mm a", Locale("en", "IN")).format(Date(now))

        pauseScanning()
        binding.tvFaceDetectionHint.text = "Starting shift for ${profile.name}..."

        val newDuty = DutyRecord(
            profileId = profile.id,
            profileName = profile.name,
            profileType = profile.profileType ?: "Staff",
            vehicleNo = profile.vehicleNo,
            inTimeMs = now,
            inTimeFormatted = inTimeFormatted,
            outTimeMs = null,
            outTimeFormatted = null,
            durationHours = 0.0,
            dutyDays = 0.0,
            dutyState = "IN_DUTY",
            status = "present"
        )
        apiClient.markAttendance(
            profile = profile, status = "present", method = method,
            inTime = inTimeFormatted, inTimeMs = now, dutyDays = 0.0, dutyState = "in_duty"
        ) { result -> runOnUiThread {
            result.onSuccess {
                prefs.saveTodayDuty(newDuty)
                lastPunchedProfileId = profile.id
                lastPunchTime = now
                showDutyStartSuccess(profile, inTimeFormatted, method)
            }.onFailure { showSyncFailure(it.message) }
        } }
    }

    private fun showSyncFailure(message: String?) {
        sensorFeedback.rejected()
        speakVoice("Attendance was not saved. Check the internet connection and try again.", "हाज़िरी सहेजी नहीं गई। इंटरनेट जाँचें और दोबारा कोशिश करें।", true)
        MaterialAlertDialogBuilder(this).setTitle("Attendance not saved")
            .setMessage(message ?: "VGTC did not confirm the request. Please retry.")
            .setPositiveButton("Try again") { _, _ -> loadProfiles(); resumeScanning() }
            .setCancelable(false).show()
    }


    private fun completeShift(profile: Profile, currentDuty: DutyRecord, method: String, elapsedMs: Long) {
        val now = System.currentTimeMillis()
        val outTimeFormatted = SimpleDateFormat("hh:mm a", Locale("en", "IN")).format(Date(now))
        val elapsedHours = elapsedMs / (1000.0 * 60 * 60)
        val durationRounded = Math.round(elapsedHours * 10.0) / 10.0

        pauseScanning()
        binding.tvFaceDetectionHint.text = if (prefs.language == "hi") "हाजिरी पूरी की जा रही है..." else "Completing shift for ${profile.name}..."

        val completedDuty = currentDuty.copy(
            outTimeMs = now,
            outTimeFormatted = outTimeFormatted,
            durationHours = durationRounded,
            dutyDays = 1.0,
            dutyState = "COMPLETED",
            status = "present"
        )
        apiClient.markAttendance(
            profile = profile, status = "present", method = method,
            inTime = currentDuty.inTimeFormatted, inTimeMs = currentDuty.inTimeMs,
            outTime = outTimeFormatted, durationHours = durationRounded, dutyDays = null, dutyState = "completed"
        ) { result -> runOnUiThread {
            result.onSuccess {
                prefs.saveTodayDuty(completedDuty)
                lastPunchedProfileId = profile.id
                lastPunchTime = now
                speakVoice("Shift completed and saved for ${profile.name}.", "${profile.name} की ड्यूटी पूरी हो गई है और सहेज दी गई है।", true)
                showDutyCompletedSuccess(profile, completedDuty, elapsedMs, method)
            }.onFailure { showSyncFailure(it.message) }
        } }
    }

    private fun showDutyStartSuccess(profile: Profile, inTimeFormatted: String, method: String) {
        val isDriver = profile.profileType.equals("Driver", ignoreCase = true)
        val isHi = prefs.language == "hi"

        speakVoice(
            "Shift started for ${profile.name}",
            "${profile.name} की ड्यूटी शुरू हो गई है",
            force = true
        )

        binding.tvSuccessTitle.text = if (isDriver) {
            if (isHi) "गाड़ी पर हाजिर (ड्यूटी शुरू)" else "Tour / Duty Started!"
        } else {
            if (isHi) "हाजिरी दर्ज (Punch-In)" else "Shift Started!"
        }
        binding.tvSuccessTitle.setTextColor(getColor(R.color.text_primary))

        binding.ivSuccessCheck.setImageResource(R.drawable.ic_check_circle)
        binding.ivSuccessCheck.imageTintList =
            android.content.res.ColorStateList.valueOf(getColor(R.color.green_online))

        binding.tvSuccessName.text = profile.name
        binding.tvSuccessType.text = if (isDriver) "Driver • Yard" else ((profile.profileType ?: "Staff") + " • Office")
        binding.tvSuccessPunchTime.text = " • In: $inTimeFormatted"
        binding.tvSuccessMethod.text = if (method == "fingerprint") {
            if (isHi) "माध्यम: फिंगरप्रिंट सेंसर ✓" else "Method: R307 Optical Fingerprint ✓"
        } else {
            if (isHi) "माध्यम: चेहरा पहचान AI ✓" else "Method: Face AI Verification ✓"
        }

        if (!profile.vehicleNo.isNullOrBlank()) {
            binding.tvSuccessVehicle.visibility = View.VISIBLE
            binding.tvSuccessVehicle.text = "🚛 Vehicle: ${profile.vehicleNo}"
        } else {
            binding.tvSuccessVehicle.visibility = View.GONE
        }

        binding.layoutSuccessStatusChip.backgroundTintList =
            android.content.res.ColorStateList.valueOf(android.graphics.Color.parseColor("#E8F5E9"))
        binding.tvSuccessStatus.text = if (isDriver) {
            if (isHi) "✓ यार्ड में हाजिर" else "⚡ PRESENT IN YARD"
        } else {
            if (isHi) "✓ दफ्तर में हाजिर" else "⚡ PRESENT IN OFFICE"
        }
        binding.tvSuccessStatus.setTextColor(getColor(R.color.green_online))

        binding.tvSuccessDuration.visibility = View.VISIBLE
        binding.tvSuccessDuration.text = if (isDriver) {
            if (isHi) "ड्यूटी चालू • वापसी तक प्रतिदिन उपस्थिति दर्ज" else "Duty tour active • Auto-present on all tour days"
        } else {
            if (isHi) "ड्यूटी शुरू हुई • न्यूनतम 4 घंटे आवश्यक" else "Shift started • Min. 4 hours required to punch out"
        }
        binding.tvSuccessDuration.setTextColor(getColor(R.color.text_secondary))

        binding.btnEmergencyCheckout.visibility = View.GONE

        if (normalizedPhotoUrl(profile.photo) != null) {
            Glide.with(this).load(apiClient.photoModel(profile.photo)).circleCrop()
                .placeholder(R.drawable.ic_person_placeholder)
                .into(binding.ivSuccessPhoto)
        } else {
            binding.ivSuccessPhoto.setImageResource(R.drawable.ic_person_placeholder)
        }

        animateInSuccessCard(3000L)
    }

    private fun showActiveDutyInProgressCard(
        profile: Profile,
        currentDuty: DutyRecord,
        elapsedMs: Long,
        minHours: Double
    ) {
        pauseScanning()
        val isHi = prefs.language == "hi"
        speakVoice("Active shift is currently in progress", "हाजिरी चालू है")

        binding.tvSuccessTitle.text = if (isHi) "ड्यूटी चालू है" else "Shift In Progress"
        binding.tvSuccessTitle.setTextColor(getColor(R.color.text_primary))

        binding.ivSuccessCheck.setImageResource(R.drawable.ic_check_circle)
        binding.ivSuccessCheck.imageTintList = android.content.res.ColorStateList.valueOf(getColor(R.color.primary))

        binding.tvSuccessName.text = profile.name
        binding.tvSuccessType.text = profile.profileType ?: "Staff"

        val vehStr = if (!profile.vehicleNo.isNullOrBlank()) profile.vehicleNo else currentDuty.vehicleNo
        if (!vehStr.isNullOrBlank()) {
            binding.tvSuccessVehicle.visibility = View.VISIBLE
            binding.tvSuccessVehicle.text = "🚛 Vehicle: $vehStr"
        } else {
            binding.tvSuccessVehicle.visibility = View.GONE
        }

        binding.layoutSuccessStatusChip.backgroundTintList =
            android.content.res.ColorStateList.valueOf(android.graphics.Color.parseColor("#E8F0FE"))
        binding.tvSuccessStatus.text = if (isHi) "⏳ ड्यूटी चालू" else "⏳ ACTIVE DUTY"
        binding.tvSuccessStatus.setTextColor(getColor(R.color.primary))
        binding.tvSuccessPunchTime.text = " • In: ${currentDuty.inTimeFormatted}"

        binding.tvSuccessMethod.text = if (isHi) "ड्यूटी अभी चल रही है" else "Active duty shift is currently running"

        val elapsedH = (elapsedMs / (1000 * 3600)).toInt()
        val elapsedM = ((elapsedMs / (1000 * 60)) % 60).toInt()
        val remMs = Math.max(0L, (minHours * 3600 * 1000L).toLong() - elapsedMs)
        val remH = (remMs / (1000 * 3600)).toInt()
        val remM = ((remMs / (1000 * 60)) % 60).toInt()

        binding.tvSuccessDuration.visibility = View.VISIBLE
        binding.tvSuccessDuration.text =
            "Elapsed: ${elapsedH}h ${elapsedM}m  |  Remaining: ${remH}h ${remM}m\n(Min. 4 hrs required to punch out)"
        binding.tvSuccessDuration.setTextColor(getColor(R.color.primary))

        binding.btnEmergencyCheckout.visibility = View.VISIBLE
        binding.btnEmergencyCheckout.setOnClickListener {
            executeEmergencyCheckout(profile, currentDuty)
        }

        if (normalizedPhotoUrl(profile.photo) != null) {
            Glide.with(this).load(apiClient.photoModel(profile.photo)).circleCrop()
                .placeholder(R.drawable.ic_person_placeholder)
                .into(binding.ivSuccessPhoto)
        } else {
            binding.ivSuccessPhoto.setImageResource(R.drawable.ic_person_placeholder)
        }

        animateInSuccessCard(3000L)
    }

    private fun showDutyCompletedSuccess(profile: Profile, completedDuty: DutyRecord, elapsedMs: Long, method: String) {
        val isHi = prefs.language == "hi"

        binding.tvSuccessTitle.text = if (isHi) "ड्यूटी पूरी हुई (Punch-Out)" else "Shift Completed! (Punch-Out)"
        binding.tvSuccessTitle.setTextColor(getColor(R.color.text_primary))

        binding.ivSuccessCheck.setImageResource(R.drawable.ic_check_circle)
        binding.ivSuccessCheck.imageTintList =
            android.content.res.ColorStateList.valueOf(getColor(R.color.green_online))

        binding.tvSuccessName.text = profile.name
        binding.tvSuccessType.text = profile.profileType ?: "Staff"
        binding.tvSuccessPunchTime.text =
            " • In: ${completedDuty.inTimeFormatted} | Out: ${completedDuty.outTimeFormatted}"
        binding.tvSuccessMethod.text = if (method == "fingerprint") {
            if (isHi) "माध्यम: फिंगरप्रिंट सेंसर ✓" else "Method: R307 Optical Fingerprint ✓"
        } else {
            if (isHi) "माध्यम: चेहरा पहचान AI ✓" else "Method: Face AI Verification ✓"
        }

        val vehStr = if (!profile.vehicleNo.isNullOrBlank()) profile.vehicleNo else completedDuty.vehicleNo
        if (!vehStr.isNullOrBlank()) {
            binding.tvSuccessVehicle.visibility = View.VISIBLE
            binding.tvSuccessVehicle.text = "🚛 Vehicle: $vehStr"
        } else {
            binding.tvSuccessVehicle.visibility = View.GONE
        }

        binding.layoutSuccessStatusChip.backgroundTintList =
            android.content.res.ColorStateList.valueOf(android.graphics.Color.parseColor("#E8F5E9"))
        binding.tvSuccessStatus.text = if (isHi) "✓ 1.0 दिन पूरा दर्ज" else "✓ 1.0 DAY PRESENT"
        binding.tvSuccessStatus.setTextColor(getColor(R.color.green_online))

        val elapsedH = (elapsedMs / (1000 * 3600)).toInt()
        val elapsedM = ((elapsedMs / (1000 * 60)) % 60).toInt()
        binding.tvSuccessDuration.visibility = View.VISIBLE
        binding.tvSuccessDuration.text = "Total Shift: ${elapsedH}h ${elapsedM}m • Full 1.0 Day Credited"
        binding.tvSuccessDuration.setTextColor(getColor(R.color.green_online))

        binding.btnEmergencyCheckout.visibility = View.GONE

        if (normalizedPhotoUrl(profile.photo) != null) {
            Glide.with(this).load(apiClient.photoModel(profile.photo)).circleCrop()
                .placeholder(R.drawable.ic_person_placeholder)
                .into(binding.ivSuccessPhoto)
        } else {
            binding.ivSuccessPhoto.setImageResource(R.drawable.ic_person_placeholder)
        }

        animateInSuccessCard(3000L)
    }

    private fun executeEmergencyCheckout(profile: Profile, currentDuty: DutyRecord) {
        dismissHandler?.removeCallbacksAndMessages(null)
        promptAdminPin(
            "Emergency Early Checkout",
            "Enter Admin PIN to authorize early departure for ${profile.name}:"
        ) {
            val now = System.currentTimeMillis()
            val outTimeFormatted = SimpleDateFormat("hh:mm a", Locale("en", "IN")).format(Date(now))
            val elapsedMs = now - currentDuty.inTimeMs
            val elapsedHours = elapsedMs / (1000.0 * 60 * 60)
            val durationRounded = Math.round(elapsedHours * 10.0) / 10.0

            val (status, days) = if (elapsedHours >= 2.0) {
                Pair("half_day", 0.5)
            } else {
                Pair("leave", 0.0)
            }

            val updatedDuty = currentDuty.copy(
                outTimeMs = now,
                outTimeFormatted = outTimeFormatted,
                durationHours = durationRounded,
                dutyDays = days,
                dutyState = "EMERGENCY_LEAVE",
                status = status,
                overrideReason = "Admin Approved Emergency Early Departure"
            )
            binding.btnEmergencyCheckout.isEnabled = false
            apiClient.markAttendance(
                profile = profile,
                status = status,
                method = "emergency_leave",
                inTime = currentDuty.inTimeFormatted,
                outTime = outTimeFormatted,
                durationHours = durationRounded,
                dutyDays = days,
                dutyState = "emergency_leave",
                overrideReason = "Admin Approved Emergency Early Departure"
            ) { result ->
                runOnUiThread {
                    binding.btnEmergencyCheckout.isEnabled = true
                    result.onSuccess {
                        prefs.saveTodayDuty(updatedDuty)
                        dismissSuccessPopup()
                        Toast.makeText(
                            this,
                            "Early departure saved for ${profile.name} ($days Day)",
                            Toast.LENGTH_LONG
                        ).show()
                    }.onFailure { err ->
                        Toast.makeText(this, "Departure not saved. Check internet and retry: ${err.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    private fun animateInSuccessCard(dismissDelayMs: Long = 3000L) {
        playPunchChime()
        val screenHeight = resources.displayMetrics.heightPixels.toFloat()
        binding.cardAttendanceSuccess.translationY = screenHeight
        binding.cardAttendanceSuccess.alpha = 1f
        binding.cardAttendanceSuccess.visibility = View.VISIBLE
        binding.cardAttendanceSuccess.animate()
            .translationY(0f)
            .setDuration(350)
            .setInterpolator(android.view.animation.DecelerateInterpolator())
            .start()

        val isHi = prefs.language == "hi"
        binding.tvAutoDismiss.text = if (isHi) "3 सेकंड में बंद होगा..." else "Auto-closing in 3 seconds..."

        dismissHandler?.removeCallbacksAndMessages(null)
        dismissRunnable = Runnable { dismissSuccessPopup() }
        dismissHandler = Handler(Looper.getMainLooper()).apply {
            postDelayed(dismissRunnable!!, 3000L)
        }
    }

    private fun dismissSuccessPopup() {
        dismissHandler?.removeCallbacksAndMessages(null)
        binding.tvSuccessDuration.visibility = View.GONE
        binding.btnEmergencyCheckout.visibility = View.GONE

        val screenHeight = resources.displayMetrics.heightPixels.toFloat()
        binding.cardAttendanceSuccess.animate()
            .translationY(screenHeight)
            .setDuration(300)
            .setInterpolator(android.view.animation.AccelerateInterpolator())
            .withEndAction {
                binding.cardAttendanceSuccess.visibility = View.GONE
                resumeScanning()
            }
            .start()
    }

    private fun showUnregisteredFaceAlert() {
        pauseScanning()
        sensorFeedback.rejected()
        val isHi = prefs.language == "hi"
        speakVoice(
            "Face not enrolled. You are not in the staff profile.",
            "चेहरा दर्ज नहीं है। आप कर्मचारी प्रोफ़ाइल में नहीं हैं।",
            true
        )

        binding.tvUnregisteredTitle.text = if (isHi) "चेहरा दर्ज नहीं है" else "Face Not Enrolled"
        binding.tvUnregisteredSubtitle.text = if (isHi) "आप कर्मचारी प्रोफ़ाइल में दर्ज नहीं हैं" else "You are not registered in the staff profile"
        binding.tvUnregisteredDesc.text = if (isHi) "बायोमेट्रिक हाज़िरी के लिए कृपया कार्यालय व्यवस्थापक से संपर्क करें।" else "Your face biometrics are not registered on this terminal. Please contact office administration."
        binding.progressDismissUnregistered.progress = 1000
        binding.tvUnregisteredTimer.text = if (isHi) "5 सेकंड में बंद होगा..." else "Closing in 5 seconds..."

        val screenHeight = resources.displayMetrics.heightPixels.toFloat()
        binding.cardUnregisteredFace.translationY = screenHeight
        binding.cardUnregisteredFace.alpha = 1f
        binding.cardUnregisteredFace.visibility = View.VISIBLE
        binding.cardUnregisteredFace.animate()
            .translationY(0f)
            .setDuration(350)
            .setInterpolator(android.view.animation.DecelerateInterpolator())
            .start()

        // 5-second smooth progress line animation (1000 down to 0)
        unregisteredProgressAnimator?.cancel()
        unregisteredProgressAnimator = android.animation.ValueAnimator.ofInt(1000, 0).apply {
            duration = 5000L
            interpolator = android.view.animation.LinearInterpolator()
            addUpdateListener { anim ->
                binding.progressDismissUnregistered.progress = anim.animatedValue as Int
            }
            start()
        }

        // 5-second countdown timer text
        unregisteredCountDownTimer?.cancel()
        unregisteredCountDownTimer = object : android.os.CountDownTimer(5000L, 1000L) {
            override fun onTick(millisUntilFinished: Long) {
                val secs = (millisUntilFinished / 1000).coerceAtLeast(1)
                binding.tvUnregisteredTimer.text = if (isHi) "$secs सेकंड में बंद होगा..." else "Closing in $secs seconds..."
            }
            override fun onFinish() {
                dismissUnregisteredFaceAlert()
            }
        }.start()

        binding.cardUnregisteredFace.setOnClickListener {
            dismissUnregisteredFaceAlert()
        }
    }

    private fun dismissUnregisteredFaceAlert() {
        unregisteredProgressAnimator?.cancel()
        unregisteredCountDownTimer?.cancel()

        if (binding.cardUnregisteredFace.visibility != View.VISIBLE) return

        val screenHeight = resources.displayMetrics.heightPixels.toFloat()
        binding.cardUnregisteredFace.animate()
            .translationY(screenHeight)
            .setDuration(300)
            .setInterpolator(android.view.animation.AccelerateInterpolator())
            .withEndAction {
                binding.cardUnregisteredFace.visibility = View.GONE
                resumeScanning()
            }
            .start()
    }

    private fun pauseScanning() {
        scanComplete = true
        scanPaused = true
    }

    private fun resumeScanning() {
        unregisteredProgressAnimator?.cancel()
        unregisteredCountDownTimer?.cancel()
        if (binding.cardUnregisteredFace.visibility == View.VISIBLE) {
            binding.cardUnregisteredFace.visibility = View.GONE
        }
        consecutiveUnknownFrames = 0
        scanComplete = false
        scanPaused = false
        faceDetected = false
        isAnalyzingFace = false
        updateLanguageUi()
        resetScreensaverTimer()
    }

    // ──────────────────────────────────────────────────
    // Full Screen Camera & Face Recognition (MobileFaceNet)
    // ──────────────────────────────────────────────────
    private var scanComplete = false

    private fun requestCameraAndStart() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCameraPreview()
        } else {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_CODE)
        }
    }

    private fun startCameraPreview() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.cameraPreview.surfaceProvider)
            }

            val imageAnalysis = ImageAnalysis.Builder()
                .setTargetResolution(Size(640, 480))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                analyzeFrame(imageProxy)
            }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_FRONT_CAMERA,
                    preview,
                    imageAnalysis
                )
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "Camera error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }, ContextCompat.getMainExecutor(this))
    }

    @androidx.camera.core.ExperimentalGetImage
    private fun analyzeFrame(imageProxy: ImageProxy) {
        if (scanPaused || scanComplete || isScreensaverActive) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image ?: run { imageProxy.close(); return }
        val rotationDegrees = imageProxy.imageInfo.rotationDegrees
        val image = InputImage.fromMediaImage(mediaImage, rotationDegrees)

        // Capture frame bitmap before closing proxy for face recognition
        var frameBitmap: Bitmap? = null
        try {
            val raw = imageProxy.toBitmap()
            if (rotationDegrees != 0) {
                val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
                frameBitmap = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
            } else {
                frameBitmap = raw
            }
        } catch (_: Exception) {
        }

        faceDetector.process(image)
            .addOnSuccessListener { faces ->
                if (faces.size == 1) {
                    runOnUiThread { resetScreensaverTimer() }

                    if (!faceDetected) {
                        faceDetected = true
                        runOnUiThread {
                            binding.tvDetectionTitle.text = if (prefs.language == "hi") "चेहरा पहचाना गया" else "Face detected"
                            binding.tvFaceDetectionHint.text = if (prefs.language == "hi") "पहचान रहे हैं..." else "Recognizing..."
                            speakVoice("Look at camera", "कैमरे की तरफ देखें")
                        }
                    }

                    if (frameBitmap != null && !isAnalyzingFace && !scanPaused && !scanComplete) {
                        isAnalyzingFace = true
                        val face = faces[0]
                        val faceCrop = realFaceEngine.cropFace(frameBitmap, face.boundingBox)

                        if (faceCrop != null) {
                            val liveEmb = realFaceEngine.extractEmbedding(faceCrop)
                            if (liveEmb != null) {
                                val matchResult = realFaceEngine.matchFace(
                                    liveEmb,
                                    profiles,
                                    threshold = RealFaceRecognitionEngine.MATCH_THRESHOLD
                                )
                                runOnUiThread {
                                    if (matchResult.matched && matchResult.profile != null) {
                                        consecutiveUnknownFrames = 0
                                        markAttendance(matchResult.profile, "present", "face")
                                    } else {
                                        consecutiveUnknownFrames++
                                        val now = System.currentTimeMillis()
                                        if (consecutiveUnknownFrames >= 3 && (now - lastUnregisteredAlertTime) > 7000L) {
                                            consecutiveUnknownFrames = 0
                                            lastUnregisteredAlertTime = now
                                            showUnregisteredFaceAlert()
                                        } else {
                                            val pct = (matchResult.similarity * 100).toInt().coerceIn(0, 99)
                                            binding.tvDetectionTitle.text = if (prefs.language == "hi") "चेहरा पहचाना गया" else "Face detected"
                                            if (profiles.isEmpty()) {
                                                binding.tvFaceDetectionHint.text =
                                                    if (prefs.language == "hi") "परंतु कोई कर्मचारी दर्ज नहीं है" else "No enrolled staff in terminal"
                                            } else {
                                                binding.tvFaceDetectionHint.text =
                                                    if (prefs.language == "hi") "पहचान रहे हैं... ($pct% मैच)" else "Recognizing... ($pct% match)"
                                            }
                                        }
                                    }
                                    isAnalyzingFace = false
                                }
                            } else {
                                isAnalyzingFace = false
                            }
                        } else {
                            isAnalyzingFace = false
                        }
                    }
                } else if (faces.isEmpty() && faceDetected) {
                    faceDetected = false
                    isAnalyzingFace = false
                    consecutiveUnknownFrames = 0
                    runOnUiThread {
                        updateLanguageUi()
                    }
                }
            }
            .addOnCompleteListener { imageProxy.close() }
    }

    private fun loadProfiles() {
        if (rosterLoading) return
        rosterLoading = true
        apiClient.getProfiles { result -> runOnUiThread {
            rosterLoading = false
            result.onSuccess { serverList ->
                val merged = prefs.mergeServerRoster(serverList)
                profiles = enrichProfilesWithEmbeddings(merged)
                binding.tvLiveConnection.text = "● Online · ${profiles.size} profiles"
                binding.tvLiveConnection.setTextColor(getColor(R.color.green_online))
            }.onFailure {
                val cached = prefs.getLocalProfiles()
                if (cached.isNotEmpty()) {
                    profiles = enrichProfilesWithEmbeddings(cached)
                    binding.tvLiveConnection.text = "● Offline (${cached.size} cached)"
                } else {
                    binding.tvLiveConnection.text = "● Offline"
                }
                binding.tvLiveConnection.setTextColor(getColor(R.color.red_offline))
            }
        } }
    }

    private fun enrichProfilesWithEmbeddings(list: List<Profile>): List<Profile> {
        return list.map { profile ->
            if (profile.faceEmbedding == null || profile.faceEmbedding.isEmpty()) {
                val photoToUse = profile.photos?.firstOrNull() ?: profile.photo
                if (!photoToUse.isNullOrBlank()) {
                    if (photoToUse.startsWith("data:") || !photoToUse.contains("/")) {
                        val emb = realFaceEngine.extractEmbeddingFromBase64(photoToUse)
                        if (emb != null) {
                            val updated = profile.copy(faceEmbedding = emb)
                            prefs.addOrUpdateLocalProfile(updated)
                            updated
                        } else profile
                    } else {
                        // Remote image URL: download in background and extract face embedding
                        Thread {
                            try {
                                val bitmap = com.bumptech.glide.Glide.with(applicationContext)
                                    .asBitmap()
                                    .load(apiClient.photoModel(photoToUse))
                                    .submit(400, 400)
                                    .get()
                                if (bitmap != null) {
                                    val emb = realFaceEngine.extractEmbeddingFromAnyPhoto(bitmap)
                                    if (emb != null) {
                                        val updated = profile.copy(faceEmbedding = emb.toList())
                                        prefs.addOrUpdateLocalProfile(updated)
                                        runOnUiThread {
                                            profiles = prefs.getLocalProfiles()
                                        }
                                    }
                                }
                            } catch (_: Exception) {}
                        }.start()
                        profile
                    }
                } else {
                    profile
                }
            } else {
                profile
            }
        }
    }

    // ──────────────────────────────────────────────────
    // Kiosk Mode Lock
    // ──────────────────────────────────────────────────
    private fun lockToKiosk() {
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(this, TerminalAdminReceiver::class.java)

        if (dpm.isDeviceOwnerApp(packageName)) {
            dpm.setLockTaskPackages(adminComponent, arrayOf(packageName))
            try {
                startLockTask()
            } catch (_: Exception) {
            }
        } else if (!am.isInLockTaskMode) {
            try {
                startLockTask()
            } catch (_: Exception) {
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            startCameraPreview()
        } else {
            Toast.makeText(this, "Camera permission is required for face terminal", Toast.LENGTH_LONG).show()
        }
    }

    override fun onResume() {
        super.onResume()
        resumeScanning()
        if (!isScreensaverActive) startCameraPreview()
        rosterHandler.removeCallbacks(rosterRefresh)
        rosterHandler.post(rosterRefresh)
        resetScreensaverTimer()
        setupR307Driver()
    }

    override fun onPause() {
        // Never leave the camera bound while the terminal is covered by
        // another activity or the app is in the background.
        stopCamera()
        stopR307Polling()
        rosterHandler.removeCallbacks(rosterRefresh)
        super.onPause()
    }

    override fun onDestroy() {
        super.onDestroy()
        sensorFeedback.close()
        rosterHandler.removeCallbacksAndMessages(null)
        clockHandler?.removeCallbacksAndMessages(null)
        connectionHandler?.removeCallbacksAndMessages(null)
        screensaverHandler?.removeCallbacksAndMessages(null)
        dismissHandler?.removeCallbacksAndMessages(null)
        stopR307Polling()
        r307Driver.disconnect()
        try { textToSpeech?.stop(); textToSpeech?.shutdown() } catch (_: Exception) {}
        try { toneGenerator?.release() } catch (_: Exception) {}
        cameraExecutor.shutdown()
        faceDetector.close()
    }
}
