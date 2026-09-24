package com.vgtc.terminal

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.vgtc.terminal.api.ApiClient
import com.vgtc.terminal.api.ApiResult
import com.vgtc.terminal.databinding.ActivityMainBinding
import com.vgtc.terminal.model.AttendanceRecord
import com.vgtc.terminal.model.Profile
import com.vgtc.terminal.util.Prefs
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs
    private lateinit var apiClient: ApiClient
    private var clockHandler: Handler? = null
    private var clockRunnable: Runnable? = null
    private val dateFormatter = SimpleDateFormat("EEEE, dd MMMM yyyy", Locale("en", "IN"))
    private val timeFormatter = SimpleDateFormat("hh:mm:ss a", Locale("en", "IN"))

    // Admin PIN unlock (5-tap secret on settings icon)
    private var settingsTapCount = 0
    private var lastTapTime = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        prefs = Prefs(this)
        apiClient = ApiClient(this)

        // Full screen kiosk - keep screen on
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupLiveClock()
        setupButtons()
        lockToKiosk()
    }

    private fun setupLiveClock() {
        clockHandler = Handler(Looper.getMainLooper())
        clockRunnable = object : Runnable {
            override fun run() {
                val now = Date()
                binding.tvTime.text = timeFormatter.format(now)
                binding.tvDate.text = dateFormatter.format(now)
                clockHandler?.postDelayed(this, 1000)
            }
        }
        clockHandler?.post(clockRunnable!!)
    }

    private fun setupButtons() {
        // Face Scan
        binding.btnFaceScan.setOnClickListener {
            startActivity(Intent(this, ScanActivity::class.java))
        }

        // Fingerprint
        binding.btnFingerprint.setOnClickListener {
            showFingerprintPrompt()
        }

        // Settings icon — 5 taps to unlock
        binding.btnSettings.setOnClickListener {
            val now = System.currentTimeMillis()
            if (now - lastTapTime > 3000) settingsTapCount = 0
            lastTapTime = now
            settingsTapCount++
            if (settingsTapCount >= 5) {
                settingsTapCount = 0
                stopLockTask()
                startActivity(Intent(this, SetupActivity::class.java))
            } else {
                val remaining = 5 - settingsTapCount
                if (remaining <= 2) {
                    Toast.makeText(this, "$remaining more taps to open Settings", Toast.LENGTH_SHORT).show()
                }
            }
        }

        // Online indicator
        updateConnectionStatus()
    }

    private fun showFingerprintPrompt() {
        val biometricManager = BiometricManager.from(this)
        val canAuth = biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        )

        if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
            Toast.makeText(this, "Fingerprint not available on this device", Toast.LENGTH_SHORT).show()
            return
        }

        val executor = ContextCompat.getMainExecutor(this)
        val biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    // After fingerprint, show employee selection
                    val intent = Intent(this@MainActivity, ScanActivity::class.java)
                    intent.putExtra("mode", "fingerprint")
                    startActivity(intent)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    if (errorCode != BiometricPrompt.ERROR_USER_CANCELED &&
                        errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                        Toast.makeText(this@MainActivity, "Auth error: $errString", Toast.LENGTH_SHORT).show()
                    }
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    Toast.makeText(this@MainActivity, "Fingerprint not recognized", Toast.LENGTH_SHORT).show()
                }
            })

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("VGTC Attendance")
            .setSubtitle("Scan your fingerprint to mark attendance")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        biometricPrompt.authenticate(promptInfo)
    }

    private fun lockToKiosk() {
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(this, TerminalAdminReceiver::class.java)

        if (dpm.isDeviceOwnerApp(packageName)) {
            // Full Device Owner mode - true kiosk
            dpm.setLockTaskPackages(adminComponent, arrayOf(packageName))
            startLockTask()
        } else if (am.isInLockTaskMode) {
            // Already locked
        } else {
            try {
                startLockTask()
            } catch (e: Exception) {
                // Not pinned - show instruction to use ADB for Device Owner
            }
        }
    }

    private fun updateConnectionStatus() {
        binding.tvConnectionStatus.text = "Connecting..."
        apiClient.checkConnection { connected ->
            runOnUiThread {
                if (connected) {
                    binding.tvConnectionStatus.text = "● Online"
                    binding.tvConnectionStatus.setTextColor(getColor(R.color.green_online))
                } else {
                    binding.tvConnectionStatus.text = "● Offline"
                    binding.tvConnectionStatus.setTextColor(getColor(R.color.red_offline))
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        updateConnectionStatus()
    }

    override fun onDestroy() {
        super.onDestroy()
        clockHandler?.removeCallbacks(clockRunnable!!)
    }

    // Block back button in kiosk mode
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Do nothing - kiosk mode
    }
}
