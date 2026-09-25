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
import java.nio.ByteBuffer
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.sqrt

class EnrollActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEnrollBinding
    private lateinit var apiClient: ApiClient
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEnrollBinding.inflate(layoutInflater)
        setContentView(binding.root)

        apiClient = ApiClient(this)
        prefs = Prefs(this)
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
            onEdit = { profile -> showAddEditDialog(profile) },
            onDelete = { profile -> confirmDeleteProfile(profile) },
            onEnrollFace = { profile ->
                startFaceEnrollment(profile) { photos, emb ->
                    saveFacePhotosToProfile(profile, photos, emb)
                }
            },
            onEnrollFingerprint = { profile -> startFingerprintEnrollment(profile) }
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
        binding.fabAddEmployee.setOnClickListener {
            showAddEditDialog(null)
        }
    }

    private fun loadProfiles() {
        val localList = prefs.getLocalProfiles()
        allProfiles = localList.toMutableList()
        filteredProfiles = allProfiles.toMutableList()
        updateUiState()

        binding.progressBar.visibility = View.VISIBLE
        apiClient.getProfiles { result ->
            runOnUiThread {
                binding.progressBar.visibility = View.GONE
                result.onSuccess { serverList ->
                    if (serverList.isNotEmpty()) {
                        val merged = serverList.toMutableList()
                        for (local in localList) {
                            val serverIdx = merged.indexOfFirst { it.id == local.id }
                            if (serverIdx >= 0) {
                                val s = merged[serverIdx]
                                merged[serverIdx] = s.copy(
                                    faceEmbedding = s.faceEmbedding ?: local.faceEmbedding,
                                    photos = if (!s.photos.isNullOrEmpty()) s.photos else local.photos,
                                    photo = if (!s.photo.isNullOrBlank()) s.photo else local.photo,
                                    fingerprintEnrolled = s.fingerprintEnrolled || local.fingerprintEnrolled,
                                    fingerprintSlotId = s.fingerprintSlotId ?: local.fingerprintSlotId
                                )
                            } else {
                                merged.add(local)
                            }
                        }
                        allProfiles = merged
                        filteredProfiles = allProfiles.toMutableList()
                        prefs.saveLocalProfiles(merged)
                        updateUiState()
                    }
                }
            }
        }
    }

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
    private fun showAddEditDialog(existing: Profile?) {
        val dialogBinding = DialogAddEditEmployeeBinding.inflate(LayoutInflater.from(this))
        var capturedPhotos: List<String>? = existing?.photos
        var primaryPhoto: String? = existing?.photo
        var capturedEmbedding: List<Float>? = existing?.faceEmbedding
        var fingerprintLinked =
            existing != null && (prefs.enrolledFingerprintProfileId == existing.id || existing.fingerprintEnrolled)
        var fingerprintSlot: Int? = existing?.fingerprintSlotId

        if (existing != null) {
            dialogBinding.tvDialogTitle.text = "Edit Employee"
            dialogBinding.etEmployeeName.setText(existing.name)
            dialogBinding.etEmployeeRole.setText(existing.profileType ?: "Staff")
            dialogBinding.etEmployeeVehicle.setText(existing.vehicleNo ?: "")

            val count = existing.photos?.size ?: if (!existing.photo.isNullOrBlank()) 1 else 0
            if (count > 0) {
                dialogBinding.tvFaceStatus.text = "Face: $count Photo(s) (AI Enrolled) ✓"
                dialogBinding.tvFaceStatus.setTextColor(getColor(R.color.green_online))
            }
            if (fingerprintLinked) {
                val slotStr = if (fingerprintSlot != null) " (R307 Slot #$fingerprintSlot)" else ""
                dialogBinding.tvFingerprintStatus.text = "Fingerprint: Linked$slotStr ✓"
                dialogBinding.tvFingerprintStatus.setTextColor(getColor(R.color.green_online))
            }
        } else {
            dialogBinding.tvDialogTitle.text = "Enroll New Employee"
        }

        val dialog = AlertDialog.Builder(this)
            .setView(dialogBinding.root)
            .setCancelable(false)
            .create()

        currentEditingDialog = dialog

        dialogBinding.btnDialogScanFace.setOnClickListener {
            val tempName = dialogBinding.etEmployeeName.text.toString().ifBlank { "New Employee" }
            val tempVehicle = dialogBinding.etEmployeeVehicle.text.toString().trim().ifBlank { null }
            val tempProfile =
                (existing ?: Profile(id = "emp_${UUID.randomUUID()}", name = tempName, vehicleNo = tempVehicle))
            dialog.hide()
            startFaceEnrollment(tempProfile) { photos, emb ->
                capturedPhotos = photos
                capturedEmbedding = emb
                primaryPhoto = photos.firstOrNull()
                dialogBinding.tvFaceStatus.text = "Face: ${photos.size} Photos (AI Embedded) ✓"
                dialogBinding.tvFaceStatus.setTextColor(getColor(R.color.green_online))
                Toast.makeText(this, "${photos.size} face photos & AI embeddings ready!", Toast.LENGTH_SHORT).show()
                dialog.show()
            }
        }

        dialogBinding.btnDialogScanFingerprint.setOnClickListener {
            val tempName = dialogBinding.etEmployeeName.text.toString().ifBlank { "New Employee" }
            val tempVehicle = dialogBinding.etEmployeeVehicle.text.toString().trim().ifBlank { null }
            val tempProfile =
                (existing ?: Profile(id = "emp_${UUID.randomUUID()}", name = tempName, vehicleNo = tempVehicle))
            dialog.hide()
            startFingerprintEnrollment(tempProfile) { slotId ->
                fingerprintLinked = true
                fingerprintSlot = slotId ?: fingerprintSlot
                val slotMsg = if (fingerprintSlot != null) " (R307 Slot #$fingerprintSlot)" else ""
                dialogBinding.tvFingerprintStatus.text = "Fingerprint: Linked$slotMsg ✓"
                dialogBinding.tvFingerprintStatus.setTextColor(getColor(R.color.green_online))
                dialog.show()
            }
        }

        dialogBinding.btnDialogCancel.setOnClickListener {
            dialog.dismiss()
            currentEditingDialog = null
        }

        dialogBinding.btnDialogSave.setOnClickListener {
            val name = dialogBinding.etEmployeeName.text.toString().trim()
            val role = dialogBinding.etEmployeeRole.text.toString().trim().ifBlank { "Staff" }
            val vehicleNo = dialogBinding.etEmployeeVehicle.text.toString().trim().ifBlank { null }

            if (name.isEmpty()) {
                Toast.makeText(this, "Please enter employee name", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val profileId = existing?.id ?: "emp_${System.currentTimeMillis()}"
            val newProfile = Profile(
                id = profileId,
                name = name,
                profileType = role,
                vehicleNo = vehicleNo,
                photo = primaryPhoto,
                photos = capturedPhotos,
                fingerprintEnrolled = fingerprintLinked,
                fingerprintSlotId = fingerprintSlot,
                faceEmbedding = capturedEmbedding,
                createdAt = existing?.createdAt ?: SimpleDateFormat(
                    "yyyy-MM-dd'T'HH:mm:ss'Z'",
                    Locale.US
                ).format(Date())
            )

            prefs.addOrUpdateLocalProfile(newProfile)
            if (fingerprintLinked) {
                prefs.enrolledFingerprintProfileId = newProfile.id
                prefs.enrolledFingerprintProfileName = newProfile.name
            }

            if (existing == null) {
                apiClient.createProfile(newProfile) { _ -> }
            } else {
                apiClient.updateProfile(newProfile) { _ -> }
            }

            val idx = allProfiles.indexOfFirst { it.id == newProfile.id }
            if (idx >= 0) allProfiles[idx] = newProfile else allProfiles.add(0, newProfile)
            filteredProfiles = allProfiles.toMutableList()
            updateUiState()

            dialog.dismiss()
            currentEditingDialog = null
            Toast.makeText(this, "✓ ${newProfile.name} enrolled successfully!", Toast.LENGTH_SHORT).show()
        }

        dialog.show()
    }

    private fun confirmDeleteProfile(profile: Profile) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Delete Employee?")
            .setMessage("Are you sure you want to remove ${profile.name}? This will remove their biometric enrollment.")
            .setPositiveButton("Delete") { _, _ ->
                // Clean up R307 flash slot if one was assigned
                profile.fingerprintSlotId?.let { slotId ->
                    r307Driver.deleteFingerprint(slotId) { _ -> }
                }
                prefs.deleteLocalProfile(profile.id)
                apiClient.deleteProfile(profile.id) { _ -> }
                allProfiles.removeAll { it.id == profile.id }
                filteredProfiles.removeAll { it.id == profile.id }
                updateUiState()
                Toast.makeText(this, "${profile.name} removed", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // ──────────────────────────────────────────────────
    // Real R307 Optical Sensor 2-Step Enrollment
    // ──────────────────────────────────────────────────
    private fun startFingerprintEnrollment(profile: Profile, onSuccess: ((Int?) -> Unit)? = null) {
        onOtgSuccessCallback = { onSuccess?.invoke(null) }

        // 1. If R307 Sensor is connected over USB-UART OTG:
        if (r307Driver.isConnected) {
            val usedSlots = allProfiles.mapNotNull { it.fingerprintSlotId }.toSet()
            var targetSlot = 1
            while (usedSlots.contains(targetSlot) && targetSlot <= 300) {
                targetSlot++
            }

            val progressDialog = MaterialAlertDialogBuilder(this)
                .setTitle("R307 Optical Fingerprint Scanner")
                .setMessage("Enrolling for ${profile.name}\nFlash Slot #$targetSlot\n\nInitializing sensor...")
                .setCancelable(false)
                .setNegativeButton("Cancel") { _, _ ->
                    currentEditingDialog?.show()
                }
                .create()

            progressDialog.show()

            r307Driver.enrollFingerprint(
                targetSlotId = targetSlot,
                progressCallback = { msg ->
                    runOnUiThread {
                        progressDialog.setMessage("Enrolling for ${profile.name}\nFlash Slot #$targetSlot\n\n$msg")
                    }
                },
                completionCallback = { success, msg ->
                    runOnUiThread {
                        progressDialog.dismiss()
                        currentEditingDialog?.show()
                        if (success) {
                            val updated = profile.copy(fingerprintSlotId = targetSlot, fingerprintEnrolled = true)
                            prefs.addOrUpdateLocalProfile(updated)
                            prefs.enrolledFingerprintProfileId = updated.id
                            prefs.enrolledFingerprintProfileName = updated.name
                            apiClient.updateProfile(updated) { _ -> }
                            val idx = allProfiles.indexOfFirst { it.id == updated.id }
                            if (idx >= 0) allProfiles[idx] = updated
                            filteredProfiles = allProfiles.toMutableList()
                            updateUiState()
                            onSuccess?.invoke(targetSlot)
                            Toast.makeText(
                                this@EnrollActivity,
                                "✓ Fingerprint Enrolled in R307 Slot #$targetSlot!",
                                Toast.LENGTH_LONG
                            ).show()
                        } else {
                            Toast.makeText(this@EnrollActivity, "Enrollment failed: $msg", Toast.LENGTH_LONG).show()
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
        // Do NOT use inbuilt phone BiometricPrompt. Strictly notify about external R307 optical sensor.
        MaterialAlertDialogBuilder(this)
            .setTitle("R307 Optical Fingerprint Scanner")
            .setMessage("R307 USB optical sensor not detected.\n\nPlease plug your R307 fingerprint module via USB OTG cable into the terminal.\n\nWould you like to mark ${profile.name} as linked anyway for testing?")
            .apply {
                // Only show "Mark Linked" in debug builds — never in production
                if (BuildConfig.DEBUG) {
                    setPositiveButton("Mark Linked (Debug Only)") { _, _ ->
                        prefs.enrolledFingerprintProfileId = profile.id
                        prefs.enrolledFingerprintProfileName = profile.name
                        currentEditingDialog?.show()
                        onSuccess?.invoke(null)
                        Toast.makeText(
                            this@EnrollActivity,
                            "✓ Fingerprint Linked for ${profile.name}!",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            }
            .setNegativeButton("Cancel") { _, _ ->
                currentEditingDialog?.show()
            }
            .setOnCancelListener {
                currentEditingDialog?.show()
            }
            .show()
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
        binding.layoutFaceCapture.visibility = View.GONE
        binding.fabAddEmployee.visibility = View.VISIBLE
        capturedPhotosList.clear()
        capturedEmbeddingsList.clear()
        currentCaptureStep = 1
        currentEditingDialog?.show()
    }

    private fun startFaceEnrollment(profile: Profile, callback: (List<String>, List<Float>?) -> Unit) {
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

            imageCapture = ImageCapture.Builder()
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .build()

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_FRONT_CAMERA,
                    preview,
                    imageCapture
                )
            } catch (e: Exception) {
                Toast.makeText(this, "Camera error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun captureNextFaceShot() {
        val capture = imageCapture ?: return
        binding.btnDoCapture.isEnabled = false
        binding.btnDoCapture.text = "Capturing ($currentCaptureStep/$TOTAL_STEPS)..."

        capture.takePicture(cameraExecutor, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(imageProxy: ImageProxy) {
                val bitmap = imageProxyToBitmap(imageProxy)
                imageProxy.close()

                if (bitmap != null) {
                    val base64DataUri = bitmapToBase64DataUri(bitmap)

                    // Extract AI Embedding from captured photo
                    val inputImg = InputImage.fromBitmap(bitmap, 0)
                    faceDetector.process(inputImg)
                        .addOnSuccessListener { faces ->
                            if (faces.isNotEmpty()) {
                                val faceCrop = realFaceEngine.cropFace(bitmap, faces[0].boundingBox)
                                if (faceCrop != null) {
                                    val emb = realFaceEngine.extractEmbedding(faceCrop)
                                    if (emb != null) {
                                        capturedEmbeddingsList.add(emb)
                                    }
                                }
                            }
                        }
                        .addOnCompleteListener {
                            runOnUiThread {
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
                                        "✓ All 5 face angles & AI embeddings generated!",
                                        Toast.LENGTH_SHORT
                                    ).show()
                                    closeFaceCapture()
                                    onFaceCaptureSuccessWithEmbedding?.invoke(
                                        capturedPhotosList.toList(),
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
                } else {
                    runOnUiThread {
                        binding.btnDoCapture.isEnabled = true
                        updateStepDisplay()
                        Toast.makeText(this@EnrollActivity, "Failed to capture, try again", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            override fun onError(exception: ImageCaptureException) {
                runOnUiThread {
                    binding.btnDoCapture.isEnabled = true
                    updateStepDisplay()
                    Toast.makeText(this@EnrollActivity, "Capture failed: ${exception.message}", Toast.LENGTH_SHORT)
                        .show()
                }
            }
        })
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
        val primaryPhoto = photos.firstOrNull()
        val updated = profile.copy(
            photo = primaryPhoto,
            photos = photos,
            faceEmbedding = embedding ?: profile.faceEmbedding
        )
        prefs.addOrUpdateLocalProfile(updated)

        if (primaryPhoto != null) {
            apiClient.updateProfilePhoto(profile.id, primaryPhoto) { _ -> }
        }
        apiClient.updateProfile(updated) { _ -> }

        val idx = allProfiles.indexOfFirst { it.id == profile.id }
        if (idx >= 0) allProfiles[idx] = updated
        filteredProfiles = allProfiles.toMutableList()
        updateUiState()
        Toast.makeText(this, "✓ 5 face angles & AI embeddings enrolled for ${profile.name}!", Toast.LENGTH_SHORT).show()
    }

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
        cameraExecutor.shutdown()
        faceDetector.close()
    }
}
