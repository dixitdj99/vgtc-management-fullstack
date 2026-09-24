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
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.vgtc.terminal.api.ApiClient
import com.vgtc.terminal.databinding.ActivityEnrollBinding
import com.vgtc.terminal.model.Profile
import com.vgtc.terminal.util.Prefs
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class EnrollActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEnrollBinding
    private lateinit var apiClient: ApiClient
    private lateinit var prefs: Prefs
    private lateinit var adapter: EnrollListAdapter
    private var allProfiles: List<Profile> = emptyList()
    private var filteredProfiles: MutableList<Profile> = mutableListOf()

    private var activeEnrollProfile: Profile? = null
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
        loadProfiles()
    }

    private fun setupRecyclerView() {
        adapter = EnrollListAdapter(
            profiles = filteredProfiles,
            prefs = prefs,
            onEnrollFace = { profile -> startFaceEnrollment(profile) },
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
                adapter.updateList(filteredProfiles)
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
    }

    private fun loadProfiles() {
        binding.progressBar.visibility = View.VISIBLE
        apiClient.getProfiles { result ->
            runOnUiThread {
                binding.progressBar.visibility = View.GONE
                result.onSuccess { list ->
                    allProfiles = list
                    filteredProfiles = list.toMutableList()
                    adapter.updateList(filteredProfiles)
                }.onFailure { err ->
                    Toast.makeText(this, "Failed to load profiles: ${err.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    // ──────────────────────────────────────────────────
    // Fingerprint Enrollment
    // ──────────────────────────────────────────────────
    private fun startFingerprintEnrollment(profile: Profile) {
        val biometricManager = BiometricManager.from(this)
        val canAuth = biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        )

        if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
            Toast.makeText(this, "Fingerprint hardware not ready or not enrolled in device settings", Toast.LENGTH_LONG).show()
            return
        }

        val executor = ContextCompat.getMainExecutor(this)
        val prompt = BiometricPrompt(this, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                prefs.enrolledFingerprintProfileId = profile.id
                prefs.enrolledFingerprintProfileName = profile.name
                adapter.notifyDataSetChanged()
                Toast.makeText(this@EnrollActivity, "✓ Fingerprint Enrolled for ${profile.name}!", Toast.LENGTH_SHORT).show()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                if (errorCode != BiometricPrompt.ERROR_USER_CANCELED && errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                    Toast.makeText(this@EnrollActivity, "Enrollment error: $errString", Toast.LENGTH_SHORT).show()
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
    // Face Enrollment
    // ──────────────────────────────────────────────────
    private fun setupFaceCaptureOverlay() {
        binding.btnCancelCapture.setOnClickListener {
            binding.layoutFaceCapture.visibility = View.GONE
        }

        binding.btnDoCapture.setOnClickListener {
            captureAndSaveFace()
        }
    }

    private fun startFaceEnrollment(profile: Profile) {
        activeEnrollProfile = profile
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
                .setTargetRotation(binding.enrollCameraPreview.display.rotation)
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
                Toast.makeText(this, "Failed to start camera: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun captureAndSaveFace() {
        val capture = imageCapture ?: return
        val profile = activeEnrollProfile ?: return

        binding.btnDoCapture.isEnabled = false
        binding.btnDoCapture.text = "Saving..."

        capture.takePicture(cameraExecutor, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(imageProxy: ImageProxy) {
                val bitmap = imageProxyToBitmap(imageProxy)
                imageProxy.close()

                if (bitmap != null) {
                    val base64DataUri = bitmapToBase64DataUri(bitmap)
                    apiClient.updateProfilePhoto(profile.id, base64DataUri) { result ->
                        runOnUiThread {
                            binding.btnDoCapture.isEnabled = true
                            binding.btnDoCapture.text = "Capture & Save Face"
                            result.onSuccess {
                                Toast.makeText(this@EnrollActivity, "✓ Face photo enrolled for ${profile.name}!", Toast.LENGTH_SHORT).show()
                                binding.layoutFaceCapture.visibility = View.GONE
                                // Update local profile model & refresh
                                val updated = profile.copy(photo = base64DataUri)
                                allProfiles = allProfiles.map { if (it.id == profile.id) updated else it }
                                filteredProfiles = filteredProfiles.map { if (it.id == profile.id) updated else it }.toMutableList()
                                adapter.updateList(filteredProfiles)
                            }.onFailure { err ->
                                Toast.makeText(this@EnrollActivity, "Failed to save photo: ${err.message}", Toast.LENGTH_LONG).show()
                            }
                        }
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
        // Resize down to max 320x320 to keep under 50KB payload
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
