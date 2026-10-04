package com.vgtc.terminal

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.util.Base64
import android.view.LayoutInflater
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.vgtc.terminal.api.ApiClient
import com.vgtc.terminal.databinding.ActivityEnrollBinding
import com.vgtc.terminal.databinding.DialogAddEditEmployeeBinding
import com.vgtc.terminal.model.Profile
import com.vgtc.terminal.util.OtgFingerprintHelper
import com.vgtc.terminal.util.Prefs
import com.vgtc.terminal.util.R307FingerprintDriver
import com.vgtc.terminal.util.RealFaceRecognitionEngine
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.sqrt

class EnrollActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEnrollBinding
    private lateinit var apiClient: ApiClient
    private lateinit var feedback: com.vgtc.terminal.util.TerminalFeedback
    private val syncHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var syncing = false
    private var enrollmentBusy = false
    private val syncRoster = object : Runnable { override fun run() { loadProfiles(); syncHandler.postDelayed(this, 15000) } }
    private lateinit var prefs: Prefs
    private lateinit var adapter: EnrollListAdapter
    private var allProfiles: MutableList<Profile> = mutableListOf()
    private var filteredProfiles: MutableList<Profile> = mutableListOf()

    // Real Face Recognition & R307 Driver
    private lateinit var realFaceEngine: RealFaceRecognitionEngine
    private val r307Driver = R307FingerprintDriver.getInstance()
    private var currentEditingDialog: AlertDialog? = null
    private val capturedEmbeddingsList = mutableListOf<FloatArray>()
    private var onFaceCaptureSuccessWithEmbedding: ((List<String>, List<Float>?) -> Unit)? = null
    private val faceDetector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .build()
    )

    // 5-Image Capture State
    private var activeEnrollProfile: Profile? = null
    private val capturedPhotosList = mutableListOf<String>()
    private var currentCaptureStep = 1
    private val TOTAL_STEPS = 5

    private var imageCapture: ImageCapture? = null
    private lateinit var cameraExecutor: ExecutorService

    // Active OTG callback
    private var onOtgSuccessCallback: (() -> Unit)? = null

    private fun isBiometricPerson(profile: Profile): Boolean {
        val values = listOf(profile.profileType, profile.role, profile.name)
            .map { it.orEmpty().trim().lowercase(Locale.US) }
        return values.none { it in setOf("tyre", "manual", "pump", "fuel", "fuel pump", "fuel station", "firm", "expense", "labour") || it.contains("fuel pump") || it.contains("fuel station") }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEnrollBinding.inflate(layoutInflater)
        setContentView(binding.root)

        apiClient = ApiClient(this)
        prefs = Prefs(this)
        feedback = com.vgtc.terminal.util.TerminalFeedback(this)
        cameraExecutor = Executors.newSingleThreadExecutor()
        realFaceEngine = RealFaceRecognitionEngine.getInstance(this)

        binding.btnBack.setOnClickListener { finish() }

        r307Driver.connect(this) { _, _ ->
            runOnUiThread { checkOtgStatus() }
        }

        checkOtgStatus()
        setupRecyclerView()
        setupSearch()
        setupFaceCaptureOverlay()
        setupFabAdd()

        // Load cached profiles immediately so screen is never blank
        val cached = prefs.getLocalProfiles()
        if (cached.isNotEmpty()) {
            allProfiles = cached.toMutableList()
            filteredProfiles = allProfiles.toMutableList()
            updateUiState()
        }
        loadProfiles()
    }

    private fun checkOtgStatus() {
        if (r307Driver.isConnected) {
            binding.tvOtgStatus.text = "🔌 R307 Optical Sensor: Online (300 Slot Flash)"
            binding.tvOtgStatus.setTextColor(getColor(R.color.green_online))
        } else if (OtgFingerprintHelper.isOtgDeviceConnected(this)) {
            val devName = OtgFingerprintHelper.getConnectedDeviceName(this) ?: "USB Scanner"
            binding.tvOtgStatus.text = "🔌 OTG Scanner: $devName Connected"
            binding.tvOtgStatus.setTextColor(getColor(R.color.green_online))
        } else {
            binding.tvOtgStatus.text = "R307 Optical Sensor / AI Face Recognition"
            binding.tvOtgStatus.setTextColor(getColor(R.color.text_secondary))
        }
    }

    private fun setupRecyclerView() {
        adapter = EnrollListAdapter(
            profiles = filteredProfiles,
            prefs = prefs,
            onEnrollFace = { profile ->
                startFaceEnrollment(profile) { photos, emb ->
                    saveFacePhotosToProfile(profile, photos, emb)
                }
            },
            onEnrollFingerprint = { profile -> startFingerprintEnrollment(profile) },
            onClearFace = { profile -> clearFaceEnrollment(profile) },
            onClearFingerprint = { profile -> clearFingerprintEnrollment(profile) },
            onViewAttendance = { profile -> showAttendanceHistory(profile) }
        )
        binding.rvEnrollEmployees.layoutManager = LinearLayoutManager(this)
        binding.rvEnrollEmployees.adapter = adapter
    }

    private fun setupSearch() {
        binding.etSearch.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val query = s?.toString()?.trim()?.lowercase() ?: ""
                filteredProfiles = if (query.isEmpty()) {
                    allProfiles.toMutableList()
                } else {
                    allProfiles.filter {
                        it.name.lowercase().contains(query) ||
                                (it.profileType ?: "").lowercase().contains(query)
                    }.toMutableList()
                }
                updateUiState()
            }

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
    }

    private fun setupFabAdd() {
        // Profiles are created and deleted only in the VGTC Portal.
        binding.fabAddEmployee.visibility = View.GONE
    }

    private fun clearFaceEnrollment(profile: Profile) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Delete Face Data?")
            .setMessage("Are you sure you want to delete face biometrics for ${profile.name}?\n\nThe employee profile will remain in VGTC, but their face biometrics will be removed.")
            .setPositiveButton("Delete Face") { _, _ ->
                val updated = profile.copy(
                    photo = null,
                    photos = emptyList(),
                    faceEmbedding = null
                )
                prefs.addOrUpdateLocalProfile(updated)
                replaceProfile(updated)

                apiClient.deleteFaceBiometrics(profile.id) { result ->
                    runOnUiThread {
                        result.onSuccess {
                            Toast.makeText(this, "✓ Face data deleted for ${profile.name}", Toast.LENGTH_SHORT).show()
                            loadProfiles()
                        }.onFailure {
                            apiClient.updateProfile(updated) { _ -> }
                            Toast.makeText(this, "Face cleared locally on terminal", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun clearFingerprintEnrollment(profile: Profile) = portalManagedNotice()
    private fun portalManagedNotice() {
        MaterialAlertDialogBuilder(this).setTitle("Manage staff in VGTC")
            .setMessage("Create or remove staff in the VGTC portal. Use Enroll here to update biometrics.")
            .setPositiveButton("OK", null).show()
    }

    private fun replaceProfile(updated: Profile) {
        val idx = allProfiles.indexOfFirst { it.id == updated.id }
        if (idx >= 0) allProfiles[idx] = updated
        filteredProfiles = allProfiles.toMutableList(); updateUiState()
    }

    private fun showAttendanceHistory(profile: Profile) {
        apiClient.getAttendanceHistory(profile.id) { result ->
            runOnUiThread {
                val message = result.getOrElse { "Unable to load attendance history" }.let { body ->
                    try {
                        val rows = com.google.gson.Gson().fromJson(body, Array<com.google.gson.JsonObject>::class.java)
                        val distinctRows = mutableListOf<com.google.gson.JsonObject>()
                        val seen = mutableSetOf<String>()
                        for (r in rows) {
                            val date = r.get("date")?.asString ?: ""
                            val inTime = r.get("inTime")?.asString ?: r.get("punchTime")?.asString ?: ""
                            val status = r.get("status")?.asString ?: ""
                            val key = "$date|$inTime|$status"
                            if (seen.add(key)) {
                                distinctRows.add(r)
                            }
                        }
                        distinctRows.take(30).joinToString("\n") { r ->
                            val date = r.get("date")?.asString ?: "—"
                            val status = r.get("status")?.asString ?: "—"
                            val location = r.get("location")?.asString ?: if (profile.profileType.equals("Driver", true)) "Yard" else "Office"
                            val inTime = r.get("inTime")?.asString ?: r.get("punchTime")?.asString ?: "—"
                            "$date  $status  $location  $inTime"
                        }.ifBlank { "No attendance records found" }
                    } catch (_: Exception) { "Attendance records unavailable" }
                }
                MaterialAlertDialogBuilder(this).setTitle("Attendance — ${profile.name}")
                    .setMessage(message).setPositiveButton("Close", null).show()
            }
        }
    }

    private fun loadProfiles() {
        if (syncing || enrollmentBusy) return
        syncing = true
        if (allProfiles.isEmpty()) {
            binding.progressBar.visibility = View.VISIBLE
        }
        apiClient.getProfiles { result -> runOnUiThread {
            syncing = false
            binding.progressBar.visibility = View.GONE
            result.onSuccess { serverList ->
                val merged = prefs.mergeServerRoster(serverList)
                allProfiles = merged.toMutableList()
                binding.tvOtgStatus.text = "Live VGTC roster • ${allProfiles.size} profiles"
                val query = binding.etSearch.text.toString().trim()
                filteredProfiles = if (query.isEmpty()) allProfiles else allProfiles.filter { it.name.contains(query, true) }.toMutableList()
                updateUiState()
            }.onFailure { err ->
                val local = prefs.getLocalProfiles()
                if (local.isNotEmpty()) {
                    allProfiles = local.toMutableList()
                    val query = binding.etSearch.text.toString().trim()
                    filteredProfiles = if (query.isEmpty()) allProfiles else allProfiles.filter { it.name.contains(query, true) }.toMutableList()
                    updateUiState()
                    binding.tvOtgStatus.text = "Offline (${allProfiles.size} cached) — ${err.message ?: "server unreachable"}"
                } else {
                    binding.tvOtgStatus.text = err.message ?: "Offline — connect to VGTC to load staff"
                    updateUiState()
                }
            }
        } }
    }

    override fun onResume() { super.onResume(); syncHandler.removeCallbacks(syncRoster); syncHandler.post(syncRoster) }
    override fun onPause() { syncHandler.removeCallbacks(syncRoster); super.onPause() }

    private fun updateUiState() {
        adapter.updateList(filteredProfiles)
        binding.emptyStateView.visibility = if (filteredProfiles.isEmpty()) View.VISIBLE else View.GONE
    }

    // ──────────────────────────────────────────────────
    // Add / Edit Employee Dialog
    // ──────────────────────────────────────────────────
    // ──────────────────────────────────────────────────
    // Add / Edit Employee Dialog
    // ──────────────────────────────────────────────────
    private fun startFingerprintEnrollment(profile: Profile, onSuccess: ((Int?) -> Unit)? = null) {
        if (enrollmentBusy) return

        // 1. If R307 Sensor is connected over USB-UART OTG:
        if (r307Driver.isConnected) {
            val usedSlots = allProfiles.mapNotNull { it.fingerprintSlotId }.toSet()
            var targetSlot = 1
            while (usedSlots.contains(targetSlot) && targetSlot <= 300) {
                targetSlot++
            }

            if (targetSlot > 300) {
                feedback.rejected()
                Toast.makeText(this, "Sensor storage is full. Contact the administrator.", Toast.LENGTH_LONG).show()
                return
            }
            enrollmentBusy = true
            val progressDialog = MaterialAlertDialogBuilder(this)
                .setTitle("R307 Optical Fingerprint Scanner")
                .setMessage("Enrolling for ${profile.name}\nFlash Slot #$targetSlot\n\nInitializing sensor...")
                .setCancelable(false)

                .create()

            progressDialog.show()

            r307Driver.enrollFingerprint(
                targetSlotId = targetSlot,
                progressCallback = { msg ->
                    runOnUiThread {
                        progressDialog.setMessage("${profile.name} • Fingerprint ID $targetSlot\n\n$msg\n\nKeep the scanner connected until saved to VGTC.")
                        feedback.speak(msg, when {
                            msg.contains("Remove") -> "अब उंगली हटाएँ।"
                            msg.contains("2/2") -> "उसी उंगली को दोबारा स्कैनर पर रखें।"
                            else -> "पहला चरण। उंगली स्कैनर पर रखें और स्थिर रखें।"
                        })
                    }
                },
                completionCallback = { success, msg ->
                    runOnUiThread {
                        if (success) {
                            progressDialog.setMessage("Saving fingerprint ID $targetSlot to VGTC…")
                            val updated = profile.copy(fingerprintSlotId = targetSlot, fingerprintEnrolled = true)
                            prefs.addOrUpdateLocalProfile(updated)
                            replaceProfile(updated)
                            feedback.accepted()
                            feedback.speak("Fingerprint enrolled and saved.", "फिंगरप्रिंट दर्ज हो गया है।")
                            profile.fingerprintSlotId?.takeIf { it != targetSlot }?.let { r307Driver.deleteFingerprint(it) { } }
                            onSuccess?.invoke(targetSlot)

                            apiClient.updateProfile(updated) { result -> runOnUiThread {
                                enrollmentBusy = false
                                progressDialog.dismiss()
                                result.onSuccess {
                                    Toast.makeText(this, "Fingerprint saved to VGTC • ID $targetSlot", Toast.LENGTH_LONG).show()
                                }.onFailure {
                                    Toast.makeText(this, "Saved on device sensor • ID $targetSlot (Offline)", Toast.LENGTH_LONG).show()
                                }
                            } }
                        } else {
                            enrollmentBusy = false
                            progressDialog.dismiss()
                            showEnrollmentError(msg)
                        }
                    }
                }
            )
            return
        }

        // Try connecting to R307 if not yet open
        r307Driver.connect(this) { connected, _ ->
            if (connected) {
                runOnUiThread {
                    checkOtgStatus()
                    startFingerprintEnrollment(profile, onSuccess)
                }
                return@connect
            }
            runOnUiThread {
                showFallbackFingerprintDialog(profile, onSuccess)
            }
        }
    }

    private fun showFallbackFingerprintDialog(profile: Profile, onSuccess: ((Int?) -> Unit)?) {
        showEnrollmentError("Connect the supported R307 external fingerprint sensor using USB OTG, then retry. Phone fingerprint unlock cannot enroll staff.")
    }

    private fun showEnrollmentError(message: String) {
        feedback.rejected()
        MaterialAlertDialogBuilder(this).setTitle("Enrollment not saved")
            .setMessage(message).setPositiveButton("OK", null).show()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == OtgFingerprintHelper.OTG_FP_CAPTURE_REQUEST) {
            if (OtgFingerprintHelper.isCaptureSuccessful(data) && resultCode == RESULT_OK) {
                onOtgSuccessCallback?.invoke()
                Toast.makeText(this, "✓ OTG Fingerprint Captured Successfully!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "OTG capture incomplete, please place finger firmly", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // ──────────────────────────────────────────────────
    // 5-Image Face Enrollment Sequence with AI Embeddings
    // ──────────────────────────────────────────────────
    private val STEP_INSTRUCTIONS = arrayOf(
        "Step 1 of 5: Look straight at camera",
        "Step 2 of 5: Turn head slightly to the right",
        "Step 3 of 5: Turn head slightly to the left",
        "Step 4 of 5: Tilt chin slightly up",
        "Step 5 of 5: Smile or natural expression"
    )

    private fun setupFaceCaptureOverlay() {
        binding.btnCancelCapture.setOnClickListener {
            closeFaceCapture()
        }

        binding.btnDoCapture.setOnClickListener {
            captureNextFaceShot()
        }
    }

    private fun closeFaceCapture() {
        enrollmentBusy = false
        ProcessCameraProvider.getInstance(this).get().unbindAll()
        binding.layoutFaceCapture.visibility = View.GONE
        binding.fabAddEmployee.visibility = View.GONE
        capturedPhotosList.clear()
        capturedEmbeddingsList.clear()
        currentCaptureStep = 1
        currentEditingDialog?.show()
    }

    private fun startFaceEnrollment(profile: Profile, callback: (List<String>, List<Float>?) -> Unit) {
        if (enrollmentBusy) return
        enrollmentBusy = true
        activeEnrollProfile = profile
        onFaceCaptureSuccessWithEmbedding = callback
        capturedPhotosList.clear()
        capturedEmbeddingsList.clear()
        currentCaptureStep = 1

        binding.fabAddEmployee.visibility = View.GONE
        binding.layoutFaceCapture.visibility = View.VISIBLE

        binding.tvCaptureTarget.text = "Enrolling Face for ${profile.name}"
        updateStepDisplay()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startEnrollCamera()
        } else {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 202)
        }
    }

    private fun updateStepDisplay() {
        val hindiSteps = arrayOf("कैमरे की ओर सीधे देखें।", "चेहरा थोड़ा दाईं ओर मोड़ें।", "चेहरा थोड़ा बाईं ओर मोड़ें।", "ठोड़ी थोड़ी ऊपर करें।", "हल्की मुस्कान के साथ कैमरे की ओर देखें।")
        feedback.speak(STEP_INSTRUCTIONS.getOrElse(currentCaptureStep - 1) { "Saving photos" }, hindiSteps.getOrElse(currentCaptureStep - 1) { "फ़ोटो सहेजे जा रहे हैं।" })
        binding.tvStepIndicator.text = STEP_INSTRUCTIONS.getOrElse(currentCaptureStep - 1) { "Finalizing photos..." }
        binding.btnDoCapture.text = "📸 Take Shot ($currentCaptureStep/$TOTAL_STEPS)"

        binding.dot1.text = if (capturedPhotosList.size >= 1) "1: Front ✓ " else "1: Front ○ "
        binding.dot1.setTextColor(if (capturedPhotosList.size >= 1) getColor(R.color.green_online) else getColor(R.color.white))

        binding.dot2.text = if (capturedPhotosList.size >= 2) "2: Right ✓ " else "2: Right ○ "
        binding.dot2.setTextColor(if (capturedPhotosList.size >= 2) getColor(R.color.green_online) else getColor(R.color.white))

        binding.dot3.text = if (capturedPhotosList.size >= 3) "3: Left ✓ " else "3: Left ○ "
        binding.dot3.setTextColor(if (capturedPhotosList.size >= 3) getColor(R.color.green_online) else getColor(R.color.white))

        binding.dot4.text = if (capturedPhotosList.size >= 4) "4: Up ✓ " else "4: Up ○ "
        binding.dot4.setTextColor(if (capturedPhotosList.size >= 4) getColor(R.color.green_online) else getColor(R.color.white))

        binding.dot5.text = if (capturedPhotosList.size >= 5) "5: Smile ✓" else "5: Smile ○"
        binding.dot5.setTextColor(if (capturedPhotosList.size >= 5) getColor(R.color.green_online) else getColor(R.color.white))
    }

    private fun startEnrollCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.enrollCameraPreview.surfaceProvider)
            }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_FRONT_CAMERA,
                    preview
                )
            } catch (e: Exception) {
                Toast.makeText(this, "Camera error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun captureNextFaceShot() {
        val previewBmp = binding.enrollCameraPreview.bitmap
        if (previewBmp == null) {
            Toast.makeText(this, "Camera preview initializing, please wait...", Toast.LENGTH_SHORT).show()
            return
        }

        binding.btnDoCapture.isEnabled = false
        binding.btnDoCapture.text = "Saving ($currentCaptureStep/$TOTAL_STEPS)..."

        // Shutter flash effect using dedicated overlay (never touches PreviewView surface)
        binding.viewShutterFlash.visibility = View.VISIBLE
        binding.viewShutterFlash.alpha = 0.7f
        binding.viewShutterFlash.animate().alpha(0f).setDuration(120).withEndAction {
            binding.viewShutterFlash.visibility = View.GONE
        }.start()

        val snapshot = previewBmp.copy(Bitmap.Config.ARGB_8888, true)
        cameraExecutor.execute {
            processCapturedBitmap(snapshot)
        }
    }

    private fun processCapturedBitmap(bitmap: Bitmap) {
        val base64DataUri = bitmapToBase64DataUri(bitmap)
        val inputImg = InputImage.fromBitmap(bitmap, 0)

        faceDetector.process(inputImg)
            .addOnSuccessListener { faces ->
                val primaryFace = faces.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }
                if (primaryFace != null) {
                    val faceCrop = realFaceEngine.cropFace(bitmap, primaryFace.boundingBox)
                    if (faceCrop != null) {
                        val emb = realFaceEngine.extractEmbedding(faceCrop)
                        if (emb != null) {
                            capturedEmbeddingsList.add(emb)
                        }
                    }
                } else if (currentCaptureStep == 1) {
                    // Step 1 frontal fallback: center 60% crop if detector had lighting sensitivity
                    val w = bitmap.width
                    val h = bitmap.height
                    val centerBox = android.graphics.Rect((w * 0.2).toInt(), (h * 0.15).toInt(), (w * 0.8).toInt(), (h * 0.85).toInt())
                    val centerCrop = realFaceEngine.cropFace(bitmap, centerBox) ?: bitmap
                    val emb = realFaceEngine.extractEmbedding(centerCrop) ?: realFaceEngine.extractEmbedding(bitmap)
                    if (emb != null) {
                        capturedEmbeddingsList.add(emb)
                    }
                }
            }
            .addOnFailureListener {
                if (currentCaptureStep == 1 && capturedEmbeddingsList.isEmpty()) {
                    val emb = realFaceEngine.extractEmbedding(bitmap)
                    if (emb != null) {
                        capturedEmbeddingsList.add(emb)
                    }
                }
            }
            .addOnCompleteListener {
                runOnUiThread {
                    // For Step 1 (Front), make sure a primary embedding exists
                    if (currentCaptureStep == 1 && capturedEmbeddingsList.isEmpty()) {
                        binding.btnDoCapture.isEnabled = true
                        feedback.rejected()
                        Toast.makeText(this@EnrollActivity, "Look straight into camera in good lighting, then retry.", Toast.LENGTH_LONG).show()
                        return@runOnUiThread
                    }

                    // For angle shots (Steps 2-5), duplicate Step 1 embedding if face turned too far for frontal model
                    if (capturedEmbeddingsList.size < currentCaptureStep && capturedEmbeddingsList.isNotEmpty()) {
                        capturedEmbeddingsList.add(capturedEmbeddingsList.first())
                    }

                    if (!saveEnrollmentPhotoToPhone(bitmap, currentCaptureStep)) {
                        binding.btnDoCapture.isEnabled = true
                        showEnrollmentError("Cannot save photo to phone storage. Free space and retry.")
                        return@runOnUiThread
                    }

                    feedback.accepted()
                    capturedPhotosList.add(base64DataUri)
                    binding.btnDoCapture.isEnabled = true

                    if (capturedPhotosList.size >= TOTAL_STEPS) {
                        val finalEmbedding = if (capturedEmbeddingsList.isNotEmpty()) {
                            averageEmbeddings(capturedEmbeddingsList)
                        } else {
                            realFaceEngine.extractEmbeddingFromBase64(capturedPhotosList.first())
                        }

                        Toast.makeText(
                            this@EnrollActivity,
                            "✓ All 5 face angles saved!",
                            Toast.LENGTH_SHORT
                        ).show()
                        val completedPhotos = capturedPhotosList.toList()
                        closeFaceCapture()
                        onFaceCaptureSuccessWithEmbedding?.invoke(
                            completedPhotos,
                            finalEmbedding
                        )
                    } else {
                        currentCaptureStep++
                        updateStepDisplay()
                        Toast.makeText(
                            this@EnrollActivity,
                            "Shot $currentCaptureStep saved! ${STEP_INSTRUCTIONS[currentCaptureStep - 1]}",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            }
    }

    private fun averageEmbeddings(embeddings: List<FloatArray>): List<Float> {
        if (embeddings.isEmpty()) return emptyList()
        val dim = embeddings[0].size
        val avg = FloatArray(dim)
        for (emb in embeddings) {
            for (i in 0 until dim) {
                avg[i] = avg[i] + emb[i]
            }
        }
        var norm = 0f
        val count = embeddings.size.toFloat()
        for (i in 0 until dim) {
            avg[i] = avg[i] / count
            norm += avg[i] * avg[i]
        }
        norm = sqrt(norm)
        if (norm > 0f) {
            for (i in 0 until dim) {
                avg[i] = avg[i] / norm
            }
        }
        return avg.toList()
    }

    private fun saveFacePhotosToProfile(profile: Profile, photos: List<String>, embedding: List<Float>?) {
        // 1. Check for Duplicate Face against all other enrolled profiles
        if (embedding != null && embedding.isNotEmpty()) {
            val embArray = embedding.toFloatArray()
            val duplicate = allProfiles.firstOrNull { other ->
                other.id != profile.id &&
                other.faceEmbedding != null &&
                other.faceEmbedding.size == RealFaceRecognitionEngine.EMBEDDING_SIZE &&
                realFaceEngine.computeCosineSimilarity(embArray, other.faceEmbedding.toFloatArray()) >= 0.65f
            }

            if (duplicate != null) {
                enrollmentBusy = false
                binding.progressBar.visibility = View.GONE
                feedback.rejected()
                feedback.speak(
                    "This face is already enrolled for ${duplicate.name}.",
                    "यह चेहरा पहले से ${duplicate.name} के लिए दर्ज है।"
                )
                MaterialAlertDialogBuilder(this)
                    .setTitle("Duplicate Face Detected")
                    .setMessage(
                        "This face is already enrolled under '${duplicate.name}' (${duplicate.profileType ?: "Staff"}).\n\n" +
                        "The same face cannot be enrolled for multiple profiles. Please verify the profile or delete the existing face first."
                    )
                    .setPositiveButton("OK", null)
                    .show()
                return
            }
        }

        enrollmentBusy = true
        binding.progressBar.visibility = View.VISIBLE
        val localUpdated = profile.copy(photo = photos.firstOrNull(), photos = photos, faceEmbedding = embedding)
        prefs.addOrUpdateLocalProfile(localUpdated)
        replaceProfile(localUpdated)

        apiClient.uploadEnrollmentImages(profile.id, photos) { uploadResult ->
            uploadResult.onSuccess { webPhotos ->
                val updated = profile.copy(photo = webPhotos.firstOrNull(), photos = webPhotos, faceEmbedding = embedding)
                apiClient.updateProfile(updated) { result -> runOnUiThread {
                    enrollmentBusy = false
                    binding.progressBar.visibility = View.GONE
                    prefs.addOrUpdateLocalProfile(updated)
                    replaceProfile(updated)
                    feedback.accepted()
                    feedback.speak("Face enrollment saved. Front photo is the profile photo.", "चेहरा दर्ज हो गया है। सामने वाला फ़ोटो प्रोफ़ाइल फ़ोटो है।")
                    MaterialAlertDialogBuilder(this).setTitle("Face enrollment complete")
                        .setMessage("All five photos saved on this phone and uploaded to VGTC. The front photo is the profile photo.")
                        .setPositiveButton("Done", null).show()
                } }
            }.onFailure { runOnUiThread {
                enrollmentBusy = false
                binding.progressBar.visibility = View.GONE
                feedback.accepted()
                feedback.speak("Face enrolled locally.", "चेहरा डिवाइस पर दर्ज हो गया है।")
                MaterialAlertDialogBuilder(this).setTitle("Face saved locally (Offline)")
                    .setMessage("Photos and AI template saved locally on terminal. Attendance will work immediately.")
                    .setPositiveButton("Done", null).show()
            } }
        }
    }

    private fun saveEnrollmentPhotoToPhone(bitmap: Bitmap, step: Int): Boolean = try {
        val safeId = activeEnrollProfile?.id.orEmpty().replace(Regex("[^A-Za-z0-9_-]"), "_")
        val dir = File(filesDir, "enrolled_faces/$safeId").apply { mkdirs() }
        FileOutputStream(File(dir, "${System.currentTimeMillis()}-$step.jpg")).use {
            check(bitmap.compress(Bitmap.CompressFormat.JPEG, 85, it))
        }
        true
    } catch (_: Exception) { false }

    private fun imageProxyToBitmap(image: ImageProxy): Bitmap? {
        val planeProxy = image.planes[0]
        val buffer: ByteBuffer = planeProxy.buffer
        val bytes = ByteArray(buffer.remaining())
        buffer.get(bytes)
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null

        val rotationDegrees = image.imageInfo.rotationDegrees
        return if (rotationDegrees != 0) {
            val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        } else {
            bitmap
        }
    }

    private fun bitmapToBase64DataUri(bitmap: Bitmap): String {
        val maxDim = 320
        val scale = Math.min(maxDim.toFloat() / bitmap.width, maxDim.toFloat() / bitmap.height)
        val scaledWidth = (bitmap.width * Math.min(1f, scale)).toInt()
        val scaledHeight = (bitmap.height * Math.min(1f, scale)).toInt()
        val resized = Bitmap.createScaledBitmap(bitmap, scaledWidth, scaledHeight, true)

        val outputStream = ByteArrayOutputStream()
        resized.compress(Bitmap.CompressFormat.JPEG, 75, outputStream)
        val byteArray = outputStream.toByteArray()
        val encoded = Base64.encodeToString(byteArray, Base64.NO_WRAP)
        return "data:image/jpeg;base64,$encoded"
    }

    override fun onBackPressed() {
        if (binding.layoutFaceCapture.visibility == View.VISIBLE) {
            closeFaceCapture()
            return
        }
        super.onBackPressed()
    }

    override fun onDestroy() {
        super.onDestroy()
        syncHandler.removeCallbacksAndMessages(null)
        feedback.close()
        cameraExecutor.shutdown()
        faceDetector.close()
    }
}
