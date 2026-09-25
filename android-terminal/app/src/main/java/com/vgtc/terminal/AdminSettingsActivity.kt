package com.vgtc.terminal

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.vgtc.terminal.api.ApiClient
import com.vgtc.terminal.databinding.ActivityAdminSettingsBinding
import com.vgtc.terminal.util.Prefs

class AdminSettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAdminSettingsBinding
    private lateinit var prefs: Prefs
    private lateinit var apiClient: ApiClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAdminSettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = Prefs(this)
        apiClient = ApiClient(this)

        binding.btnAdminBack.setOnClickListener { finish() }

        setupEnrollmentNavigation()
        setupServerConfig()
        setupPinManagement()
        setupExitKiosk()
    }

    private fun setupEnrollmentNavigation() {
        binding.btnOpenEnrollment.setOnClickListener {
            startActivity(Intent(this, EnrollActivity::class.java))
        }
    }

    private fun setupServerConfig() {
        binding.etServerUrl.setText(prefs.serverUrl)
        binding.etUsername.setText(prefs.username)
        binding.etPassword.setText(prefs.password)
        binding.etOrgId.setText(prefs.orgId)

        binding.btnSaveServerConfig.setOnClickListener {
            var url = binding.etServerUrl.text.toString().trim().trimEnd('/')
            val username = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString()
            val orgId = binding.etOrgId.text.toString().trim()

            if (url.isEmpty() || username.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "Please fill all required server fields", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = "https://$url"
                binding.etServerUrl.setText(url)
            }

            binding.btnSaveServerConfig.isEnabled = false
            binding.btnSaveServerConfig.text = "Testing connection..."

            prefs.serverUrl = url
            prefs.username = username
            prefs.orgId = orgId.ifBlank { "vgtc" }

            apiClient.login(username, password) { result ->
                runOnUiThread {
                    binding.btnSaveServerConfig.isEnabled = true
                    binding.btnSaveServerConfig.text = "Save & Test Connection"

                    result.onSuccess { token ->
                        prefs.authToken = token
                        prefs.password = password
                        Toast.makeText(this, "Connected successfully!", Toast.LENGTH_SHORT).show()
                    }.onFailure { err ->
                        Toast.makeText(this, "Login failed: ${err.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    private fun setupPinManagement() {
        binding.btnUpdatePin.setOnClickListener {
            val newPin = binding.etNewAdminPin.text.toString().trim()
            if (newPin.length < 4) {
                Toast.makeText(this, "PIN must be at least 4 digits", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            prefs.adminPin = newPin
            binding.etNewAdminPin.text?.clear()
            Toast.makeText(this, "Admin PIN updated successfully!", Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupExitKiosk() {
        binding.btnExitKiosk.setOnClickListener {
            MaterialAlertDialogBuilder(this)
                .setTitle("Exit VGTC Terminal?")
                .setMessage("This will stop kiosk lock and close the application to the Android launcher.")
                .setPositiveButton("Exit App") { _, _ ->
                    try {
                        stopLockTask()
                    } catch (_: Exception) {
                    }
                    finishAffinity()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }
}
