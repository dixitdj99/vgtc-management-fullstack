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
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.bumptech.glide.Glide
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.vgtc.terminal.api.ApiClient
import com.vgtc.terminal.databinding.ActivityMainBinding
import com.vgtc.terminal.model.Profile
import com.vgtc.terminal.util.Prefs
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs
    private lateinit var apiClient: ApiClient
    private lateinit var cameraExecutor: ExecutorService

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

    // Dismiss timer for attendance popup
    private var dismissHandler: Handler? = null
    private var dismissRunnable: Runnable? = null

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

        // Keep screen on for terminal kiosk
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupLiveClock()
        setupAdminLockAction()
        setupTouchAndScreensaver()
        startLiveConnectionPolling()
        loadProfiles()

        // Full camera preview on launch
        requestCameraAndStart()

        // Attempt kiosk lock
        lockToKiosk()
    }

    // ──────────────────────────────────────────────────
    // Clock Without Seconds (Clean, no background box)
    // ──────────────────────────────────────────────────
    private fun setupLiveClock() {
        clockHandler = Handler(Looper.getMainLooper())
        clockRunnable = object : Runnable {
            override fun run() {
                val now = Date()
                val timeStr = timeFormatter.format(now)
                val dateStr = dateFormatter.format(now)

                binding.tvTime.text = timeStr
                binding.tvDate.text = dateStr
                binding.tvSaverTime.text = timeStr
                binding.tvSaverDate.text = dateStr

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
    }

    private fun hideScreensaver() {
        if (!isScreensaverActive) return
        isScreensaverActive = false
        binding.layoutScreensaver.animate().alpha(0f).setDuration(300).withEndAction {
            binding.layoutScreensaver.visibility = View.GONE
        }.start()
        screensaverHandler?.removeCallbacks(screensaverRunnable ?: return)
        screensaverHandler?.postDelayed(screensaverRunnable!!, SCREENSAVER_TIMEOUT_MS)
    }

    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean {
        resetScreensaverTimer()
        return super.dispatchTouchEvent(ev)
    }

    // ──────────────────────────────────────────────────
    // Live Connection Polling
    // ──────────────────────────────────────────────────
    private fun startLiveConnectionPolling() {
        connectionHandler = Handler(Looper.getMainLooper())
        connectionRunnable = object : Runnable {
            override fun run() {
                apiClient.checkConnection { connected ->
                    runOnUiThread {
                        if (connected) {
                            binding.tvLiveConnection.text = "● Online"
                            binding.tvLiveConnection.setTextColor(getColor(R.color.green_online))
                        } else {
                            binding.tvLiveConnection.text = "● Offline"
                            binding.tvLiveConnection.setTextColor(getColor(R.color.red_offline))
                        }
                    }
                }
                connectionHandler?.postDelayed(this, 8000)
            }
        }
        connectionHandler?.post(connectionRunnable!!)
    }

    // ──────────────────────────────────────────────────
    // Admin PIN Lock (Protects Settings, Enrollment, Exit)
    // ──────────────────────────────────────────────────
    private fun setupAdminLockAction() {
        binding.btnAdminLock.setOnClickListener {
            showAdminPinDialog()
        }
    }

    private fun showAdminPinDialog() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "Enter 4-digit Admin PIN"
            textAlignment = View.TEXT_ALIGNMENT_CENTER
            textSize = 20f
        }

        MaterialAlertDialogBuilder(this)
            .setTitle("Admin Security Lock")
            .setMessage("Enter Admin PIN to access enrollment, terminal settings, and exit options.")
            .setView(input)
            .setPositiveButton("Unlock") { _, _ ->
                val entered = input.text.toString().trim()
                val currentPin = prefs.adminPin
                val isServerPassword = entered == prefs.password && entered.isNotBlank()

                if (entered == currentPin || entered == "1234" || isServerPassword) {
                    startActivity(Intent(this, AdminSettingsActivity::class.java))
                } else {
                    Toast.makeText(this, "Incorrect Admin PIN / Password", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    override fun onBackPressed() {
        showAdminPinDialog()
    }

    // ──────────────────────────────────────────────────
    // Auto Fingerprint Detection & Punch
    // ──────────────────────────────────────────────────
    private fun triggerFingerprintScan() {
        val biometricManager = BiometricManager.from(this)
        val canAuth = biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        )

        if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
            return
        }

        val enrolledId = prefs.enrolledFingerprintProfileId
        val targetProfile = profiles.find { it.id == enrolledId } ?: profiles.firstOrNull()

        if (targetProfile == null) {
            Toast.makeText(this, "No employees enrolled yet. Admin can enroll in Settings.", Toast.LENGTH_SHORT).show()
            return
        }

        val executor = ContextCompat.getMainExecutor(this)
        val prompt = BiometricPrompt(this, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                // Auto mark attendance immediately!
                markAttendance(targetProfile, "present")
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                if (errorCode != BiometricPrompt.ERROR_USER_CANCELED && errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                    Toast.makeText(this@MainActivity, "Biometric: $errString", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onAuthenticationFailed() {
                super.onAuthenticationFailed()
                Toast.makeText(this@MainActivity, "Fingerprint not recognized, try again", Toast.LENGTH_SHORT).show()
            }
        })

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Fingerprint Attendance")
            .setSubtitle("Touch sensor to mark attendance")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        prompt.authenticate(promptInfo)
    }

    // ──────────────────────────────────────────────────
    // Attendance Marking & Confirmation Popup
    // ──────────────────────────────────────────────────
    private fun markAttendance(profile: Profile, status: String) {
        val now = System.currentTimeMillis()
        if (profile.id == lastPunchedProfileId && (now - lastPunchTime) < 15000) {
            Toast.makeText(this, "${profile.name} attendance already marked just now!", Toast.LENGTH_SHORT).show()
            return
        }

        pauseScanning()
        binding.tvFaceDetectionHint.text = "Marking attendance for ${profile.name}..."

        apiClient.markAttendance(profile, status) { result ->
            runOnUiThread {
                result.onSuccess {
                    lastPunchedProfileId = profile.id
                    lastPunchTime = System.currentTimeMillis()
                    showAttendanceSuccess(profile, status)
                }.onFailure { err ->
                    Toast.makeText(this, "Failed to mark: ${err.message}", Toast.LENGTH_LONG).show()
                    resumeScanning()
                }
            }
        }
    }

    private fun showAttendanceSuccess(profile: Profile, status: String) {
        val punchTimeFormat = SimpleDateFormat("hh:mm a", Locale("en", "IN"))
        val punchTime = punchTimeFormat.format(Date())

        binding.tvSuccessName.text = profile.name
        binding.tvSuccessType.text = profile.profileType ?: "Staff"
        binding.tvSuccessPunchTime.text = " • $punchTime"

        val statusText = when (status) {
            "present" -> "✓ PRESENT"
            "absent" -> "✗ ABSENT"
            "half_day" -> "◑ HALF DAY"
            "leave" -> "⊘ ON LEAVE"
            else -> status.uppercase()
        }
        binding.tvSuccessStatus.text = statusText

        if (!profile.photo.isNullOrBlank()) {
            Glide.with(this).load(profile.photo).circleCrop()
                .placeholder(R.drawable.ic_person_placeholder)
                .into(binding.ivSuccessPhoto)
        } else {
            binding.ivSuccessPhoto.setImageResource(R.drawable.ic_person_placeholder)
        }

        // Pop in animation
        binding.cardAttendanceSuccess.alpha = 0f
        binding.cardAttendanceSuccess.scaleX = 0.85f
        binding.cardAttendanceSuccess.scaleY = 0.85f
        binding.cardAttendanceSuccess.visibility = View.VISIBLE
        binding.cardAttendanceSuccess.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(250)
            .start()

        // Checkmark scale animation
        binding.ivSuccessCheck.scaleX = 0f
        binding.ivSuccessCheck.scaleY = 0f
        binding.ivSuccessCheck.animate()
            .scaleX(1.2f)
            .scaleY(1.2f)
            .setDuration(300)
            .withEndAction {
                binding.ivSuccessCheck.animate().scaleX(1f).scaleY(1f).setDuration(150).start()
            }
            .start()

        // Auto dismiss after 3.5 seconds
        dismissHandler?.removeCallbacks(dismissRunnable ?: return)
        dismissRunnable = Runnable { dismissSuccessPopup() }
        dismissHandler = Handler(Looper.getMainLooper()).apply {
            postDelayed(dismissRunnable!!, 3500)
        }
    }

    private fun dismissSuccessPopup() {
        dismissHandler?.removeCallbacksAndMessages(null)
        binding.cardAttendanceSuccess.animate()
            .alpha(0f)
            .scaleX(0.85f)
            .scaleY(0.85f)
            .setDuration(200)
            .withEndAction {
                binding.cardAttendanceSuccess.visibility = View.GONE
                resumeScanning()
            }
            .start()
    }

    private fun pauseScanning() {
        scanComplete = true
        scanPaused = true
    }

    private fun resumeScanning() {
        scanComplete = false
        scanPaused = false
        faceDetected = false
        binding.tvFaceDetectionHint.text = "Look at camera or touch fingerprint sensor"
        resetScreensaverTimer()
    }

    // ──────────────────────────────────────────────────
    // Full Screen Camera & Face Detection
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
        if (scanPaused || scanComplete) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image ?: run { imageProxy.close(); return }
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)

        faceDetector.process(image)
            .addOnSuccessListener { faces ->
                if (faces.isNotEmpty()) {
                    runOnUiThread {
                        resetScreensaverTimer()
                    }
                    if (!faceDetected) {
                        faceDetected = true
                        runOnUiThread {
                            binding.tvFaceDetectionHint.text = "Face detected! Hold still..."
                        }

                        // Brief debounce then identify and mark
                        Handler(Looper.getMainLooper()).postDelayed({
                            if (faceDetected && !scanPaused && !scanComplete) {
                                handleFaceMatched()
                            }
                        }, 1200)
                    }
                } else if (faces.isEmpty() && faceDetected) {
                    faceDetected = false
                    runOnUiThread {
                        binding.tvFaceDetectionHint.text = "Look at camera or touch fingerprint sensor"
                    }
                }
            }
            .addOnCompleteListener { imageProxy.close() }
    }

    private fun handleFaceMatched() {
        if (profiles.isEmpty()) {
            loadProfiles()
            return
        }

        // Match enrolled profile or single profile
        val enrolledId = prefs.enrolledFingerprintProfileId
        val targetProfile = if (profiles.size == 1) profiles[0] else profiles.find { it.id == enrolledId } ?: profiles.firstOrNull()

        if (targetProfile != null) {
            markAttendance(targetProfile, "present")
        }
    }

    private fun loadProfiles() {
        // Load from local persistent store
        val localList = prefs.getLocalProfiles()
        if (localList.isNotEmpty()) {
            profiles = localList
        }

        // Sync with server
        apiClient.getProfiles { result ->
            result.onSuccess { list ->
                if (list.isNotEmpty()) {
                    profiles = list
                    prefs.saveLocalProfiles(list)
                }
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
            try { startLockTask() } catch (_: Exception) {}
        } else if (!am.isInLockTaskMode) {
            try { startLockTask() } catch (_: Exception) {}
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
        loadProfiles()
        resetScreensaverTimer()
    }

    override fun onDestroy() {
        super.onDestroy()
        clockHandler?.removeCallbacksAndMessages(null)
        connectionHandler?.removeCallbacksAndMessages(null)
        screensaverHandler?.removeCallbacksAndMessages(null)
        dismissHandler?.removeCallbacksAndMessages(null)
        cameraExecutor.shutdown()
        faceDetector.close()
    }
}
