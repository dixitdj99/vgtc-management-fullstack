package com.vgtc.terminal

import android.Manifest
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
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.vgtc.terminal.api.ApiClient
import com.vgtc.terminal.databinding.ActivityEnrollBinding
import com.vgtc.terminal.databinding.DialogAddEditEmployeeBinding
import com.vgtc.terminal.model.Profile
import com.vgtc.terminal.util.Prefs
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class EnrollActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEnrollBinding
    private lateinit var apiClient: ApiClient
    private lateinit var prefs: Prefs
    private lateinit var adapter: EnrollListAdapter
    private var allProfiles: MutableList<Profile> = mutableListOf()
    private var filteredProfiles: MutableList<Profile> = mutableListOf()

    private var activeEnrollProfile: Profile? = null
    private var onFaceCaptureSuccess: ((String) -> Unit)? = null
    private var imageCapture: ImageCapture? = null
    private lateinit var cameraExecutor: ExecutorService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEnrollBinding.inflate(layoutInflater)
        setContentView(binding.root)

        apiClient = ApiClient(this)
        prefs = Prefs(this)
        cameraExecutor = Executors.newSingleThreadExecutor()

        binding.btnBack.setOnClickListener { finish() }

        setupRecyclerView()
        setupSearch()
        setupFaceCaptureOverlay()
        setupFabAdd()
        loadProfiles()
    }

    private fun setupRecyclerView() {
        adapter = EnrollListAdapter(
            profiles = filteredProfiles,
            prefs = prefs,
            onEdit = { profile -> showAddEditDialog(profile) },
            onDelete = { profile -> confirmDeleteProfile(profile) },
            onEnrollFace = { profile -> startFaceEnrollment(profile) { photoBase64 ->
                saveFacePhotoToProfile(profile, photoBase64)
            }},
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
        // First load from local storage immediately so user sees their saved entries
        val localList = prefs.getLocalProfiles()
        allProfiles = localList.toMutableList()
        filteredProfiles = allProfiles.toMutableList()
        updateUiState()

        // Then sync with server in background
        binding.progressBar.visibility = View.VISIBLE
        apiClient.getProfiles { result ->
            runOnUiThread {
                binding.progressBar.visibility = View.GONE
                result.onSuccess { serverList ->
                    if (serverList.isNotEmpty()) {
                        // Merge server list with local list (avoiding duplicate IDs)
                        val merged = serverList.toMutableList()
                        for (local in localList) {
                            if (merged.none { it.id == local.id }) {
                                merged.add(local)
                            }
                        }
                        allProfiles = merged
                        filteredProfiles = allProfiles.toMutableList()
                        prefs.saveLocalProfiles(merged)
                        updateUiState()
                    }
                }.onFailure {
                    // It's okay if offline or local server is unreachable; local entries remain active
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
    private fun showAddEditDialog(existing: Profile?) {
        val dialogBinding = DialogAddEditEmployeeBinding.inflate(LayoutInflater.from(this))
        var capturedPhoto: String? = existing?.photo
        var fingerprintLinked = existing != null && prefs.enrolledFingerprintProfileId == existing.id

        if (existing != null) {
            dialogBinding.tvDialogTitle.text = "Edit Employee"
            dialogBinding.etEmployeeName.setText(existing.name)
            dialogBinding.etEmployeeRole.setText(existing.profileType ?: "Staff")
            if (!capturedPhoto.isNullOrBlank()) {
                dialogBinding.tvFaceStatus.text = "Face: Photo Available ✓"
                dialogBinding.tvFaceStatus.setTextColor(getColor(R.color.green_online))
            }
            if (fingerprintLinked) {
                dialogBinding.tvFingerprintStatus.text = "Fingerprint: Linked ✓"
                dialogBinding.tvFingerprintStatus.setTextColor(getColor(R.color.green_online))
            }
        } else {
            dialogBinding.tvDialogTitle.text = "Enroll New Employee"
        }

        val dialog = AlertDialog.Builder(this)
            .setView(dialogBinding.root)
            .setCancelable(false)
            .create()

        dialogBinding.btnDialogScanFace.setOnClickListener {
            val tempName = dialogBinding.etEmployeeName.text.toString().ifBlank { "New Employee" }
            val tempProfile = (existing ?: Profile(id = "emp_${UUID.randomUUID()}", name = tempName))
            startFaceEnrollment(tempProfile) { photoUri ->
                capturedPhoto = photoUri
                dialogBinding.tvFaceStatus.text = "Face: Captured ✓"
                dialogBinding.tvFaceStatus.setTextColor(getColor(R.color.green_online))
                Toast.makeText(this, "Face captured successfully!", Toast.LENGTH_SHORT).show()
            }
        }

        dialogBinding.btnDialogScanFingerprint.setOnClickListener {
            val tempName = dialogBinding.etEmployeeName.text.toString().ifBlank { "New Employee" }
            val tempProfile = (existing ?: Profile(id = "emp_${UUID.randomUUID()}", name = tempName))
            startFingerprintEnrollment(tempProfile) {
                fingerprintLinked = true
                dialogBinding.tvFingerprintStatus.text = "Fingerprint: Linked ✓"
                dialogBinding.tvFingerprintStatus.setTextColor(getColor(R.color.green_online))
            }
        }

        dialogBinding.btnDialogCancel.setOnClickListener {
            dialog.dismiss()
        }

        dialogBinding.btnDialogSave.setOnClickListener {
            val name = dialogBinding.etEmployeeName.text.toString().trim()
            val role = dialogBinding.etEmployeeRole.text.toString().trim().ifBlank { "Staff" }

            if (name.isEmpty()) {
                Toast.makeText(this, "Please enter employee name", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val profileId = existing?.id ?: "emp_${System.currentTimeMillis()}"
            val newProfile = Profile(
                id = profileId,
                name = name,
                profileType = role,
                photo = capturedPhoto,
                createdAt = existing?.createdAt ?: SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(Date())
            )

            // Save locally
            prefs.addOrUpdateLocalProfile(newProfile)
            if (fingerprintLinked) {
                prefs.enrolledFingerprintProfileId = newProfile.id
                prefs.enrolledFingerprintProfileName = newProfile.name
            }

            // Sync with backend
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
            Toast.makeText(this, "✓ ${newProfile.name} saved successfully!", Toast.LENGTH_SHORT).show()
        }

        dialog.show()
    }

    private fun confirmDeleteProfile(profile: Profile) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Delete Employee?")
            .setMessage("Are you sure you want to remove ${profile.name}? This will delete their biometric data from this terminal.")
            .setPositiveButton("Delete") { _, _ ->
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
    // Fingerprint Enrollment
    // ──────────────────────────────────────────────────
    private fun startFingerprintEnrollment(profile: Profile, onSuccess: (() -> Unit)? = null) {
        val biometricManager = BiometricManager.from(this)
        val canAuth = biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        )

        if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
            Toast.makeText(this, "Fingerprint hardware not ready or not enrolled in Android settings", Toast.LENGTH_LONG).show()
            return
        }

        val executor = ContextCompat.getMainExecutor(this)
        val prompt = BiometricPrompt(this, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                prefs.enrolledFingerprintProfileId = profile.id
                prefs.enrolledFingerprintProfileName = profile.name
                adapter.notifyDataSetChanged()
                onSuccess?.invoke()
                Toast.makeText(this@EnrollActivity, "✓ Fingerprint Enrolled for ${profile.name}!", Toast.LENGTH_SHORT).show()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                if (errorCode != BiometricPrompt.ERROR_USER_CANCELED && errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                    Toast.makeText(this@EnrollActivity, "Enrollment: $errString", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onAuthenticationFailed() {
                super.onAuthenticationFailed()
                Toast.makeText(this@EnrollActivity, "Fingerprint not recognized, try again", Toast.LENGTH_SHORT).show()
            }
        })

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Enroll Fingerprint")
            .setSubtitle("Touch sensor to link fingerprint to ${profile.name}")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        prompt.authenticate(promptInfo)
    }

    // ──────────────────────────────────────────────────
    // Face Enrollment Overlay
    // ──────────────────────────────────────────────────
    private fun setupFaceCaptureOverlay() {
        binding.btnCancelCapture.setOnClickListener {
            binding.layoutFaceCapture.visibility = View.GONE
        }

        binding.btnDoCapture.setOnClickListener {
            captureAndSaveFace()
        }
    }

    private fun startFaceEnrollment(profile: Profile, callback: (String) -> Unit) {
        activeEnrollProfile = profile
        onFaceCaptureSuccess = callback
        binding.tvCaptureTarget.text = "Enrolling Face for ${profile.name}"
        binding.layoutFaceCapture.visibility = View.VISIBLE

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startEnrollCamera()
        } else {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 202)
        }
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

    private fun captureAndSaveFace() {
        val capture = imageCapture ?: return
        binding.btnDoCapture.isEnabled = false
        binding.btnDoCapture.text = "Capturing..."

        capture.takePicture(cameraExecutor, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(imageProxy: ImageProxy) {
                val bitmap = imageProxyToBitmap(imageProxy)
                imageProxy.close()

                if (bitmap != null) {
                    val base64DataUri = bitmapToBase64DataUri(bitmap)
                    runOnUiThread {
                        binding.btnDoCapture.isEnabled = true
                        binding.btnDoCapture.text = "Capture & Save Face"
                        binding.layoutFaceCapture.visibility = View.GONE
                        onFaceCaptureSuccess?.invoke(base64DataUri)
                    }
                } else {
                    runOnUiThread {
                        binding.btnDoCapture.isEnabled = true
                        binding.btnDoCapture.text = "Capture & Save Face"
                        Toast.makeText(this@EnrollActivity, "Failed to capture image", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            override fun onError(exception: ImageCaptureException) {
                runOnUiThread {
                    binding.btnDoCapture.isEnabled = true
                    binding.btnDoCapture.text = "Capture & Save Face"
                    Toast.makeText(this@EnrollActivity, "Capture failed: ${exception.message}", Toast.LENGTH_SHORT).show()
                }
            }
        })
    }

    private fun saveFacePhotoToProfile(profile: Profile, photoBase64: String) {
        val updated = profile.copy(photo = photoBase64)
        prefs.addOrUpdateLocalProfile(updated)
        apiClient.updateProfilePhoto(profile.id, photoBase64) { _ -> }

        val idx = allProfiles.indexOfFirst { it.id == profile.id }
        if (idx >= 0) allProfiles[idx] = updated
        filteredProfiles = allProfiles.toMutableList()
        updateUiState()
        Toast.makeText(this, "✓ Face photo saved for ${profile.name}!", Toast.LENGTH_SHORT).show()
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

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }
}
