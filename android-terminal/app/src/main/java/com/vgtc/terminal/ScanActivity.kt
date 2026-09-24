package com.vgtc.terminal

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Size
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.vgtc.terminal.databinding.ActivityScanBinding
import com.vgtc.terminal.api.ApiClient
import com.vgtc.terminal.model.Profile
import com.vgtc.terminal.util.Prefs
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class ScanActivity : AppCompatActivity() {

    private lateinit var binding: ActivityScanBinding
    private lateinit var cameraExecutor: ExecutorService
    private lateinit var apiClient: ApiClient
    private var mode: String = "face"
    private var profiles: List<Profile> = emptyList()
    private var faceDetected = false
    private var scanComplete = false

    // ML Kit face detector — fast mode for real-time scan
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
        binding = ActivityScanBinding.inflate(layoutInflater)
        setContentView(binding.root)

        mode = intent.getStringExtra("mode") ?: "face"
        apiClient = ApiClient(this)
        cameraExecutor = Executors.newSingleThreadExecutor()

        // Load employees from backend
        loadProfiles()

        binding.btnCancel.setOnClickListener { finish() }

        if (mode == "fingerprint") {
            // Skip camera scan, go directly to employee selection
            binding.cameraPreview.visibility = View.GONE
            binding.scanOverlay.visibility = View.GONE
            binding.tvScanStatus.text = "Select Employee"
            showEmployeeSelectionDialog()
        } else {
            startCameraScan()
        }
    }

    private fun loadProfiles() {
        apiClient.getProfiles { result ->
            result.onSuccess { list -> profiles = list }
        }
    }

    private fun startCameraScan() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            openCamera()
        } else {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_CODE)
        }
    }

    private fun openCamera() {
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
        if (scanComplete) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image ?: run { imageProxy.close(); return }
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)

        faceDetector.process(image)
            .addOnSuccessListener { faces ->
                if (faces.isNotEmpty() && !faceDetected) {
                    faceDetected = true
                    runOnUiThread {
                        binding.tvScanStatus.text = "Face detected! Hold still..."
                        binding.scanOverlay.setDetected(true)
                    }
                    // Brief pause then show employee selection
                    Handler(Looper.getMainLooper()).postDelayed({
                        if (!scanComplete) {
                            scanComplete = true
                            showEmployeeSelectionDialog()
                        }
                    }, 1200)
                } else if (faces.isEmpty() && faceDetected) {
                    faceDetected = false
                    runOnUiThread {
                        binding.tvScanStatus.text = "Scanning for face..."
                        binding.scanOverlay.setDetected(false)
                    }
                }
            }
            .addOnCompleteListener { imageProxy.close() }
    }

    private fun showEmployeeSelectionDialog() {
        runOnUiThread {
            val dialog = EmployeeSelectDialog(this, profiles, mode) { profile, status ->
                markAttendance(profile, status)
            }
            dialog.show()
        }
    }

    private fun markAttendance(profile: Profile, status: String) {
        apiClient.markAttendance(profile, status) { result ->
            runOnUiThread {
                result.onSuccess {
                    showSuccessScreen(profile, status)
                }.onFailure { err ->
                    Toast.makeText(this, "Error: ${err.message}", Toast.LENGTH_LONG).show()
                    finish()
                }
            }
        }
    }

    private fun showSuccessScreen(profile: Profile, status: String) {
        val intent = android.content.Intent(this, ConfirmActivity::class.java).apply {
            putExtra("name", profile.name)
            putExtra("type", profile.profileType ?: "Staff")
            putExtra("status", status)
            putExtra("photo", profile.photo)
        }
        startActivity(intent)
        finish()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            openCamera()
        } else {
            Toast.makeText(this, "Camera permission required for face scan", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        faceDetector.close()
    }
}
