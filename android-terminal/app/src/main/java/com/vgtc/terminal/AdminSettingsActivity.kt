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
        val defaultUrl = if (prefs.serverUrl.isBlank()) "https://vgtc.site" else prefs.serverUrl
        binding.etServerUrl.setText(defaultUrl)
        binding.etUsername.setText(prefs.username)
        binding.etPassword.setText(prefs.password)
        binding.etOrgId.setText(prefs.orgId)

        binding.btnSaveServerConfig.setOnClickListener {
            var url = Prefs.sanitizeServerUrl(binding.etServerUrl.text.toString())
            if (url.isBlank()) {
                url = "https://vgtc.site"
            }
            val username = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString()
            val orgId = binding.etOrgId.text.toString().trim()

            binding.etServerUrl.setText(url)
            binding.btnSaveServerConfig.isEnabled = false
            binding.btnSaveServerConfig.text = "Testing connection..."

            prefs.serverUrl = url
            if (username.isNotBlank()) prefs.username = username
            if (password.isNotBlank()) prefs.password = password
            prefs.orgId = orgId.ifBlank { "vgtc" }
            if (prefs.authToken.isBlank()) {
                prefs.authToken = "VGTC-TERMINAL-TOKEN-KEY"
            }

            apiClient.checkConnection { connected ->
                runOnUiThread {
                    binding.btnSaveServerConfig.isEnabled = true
                    binding.btnSaveServerConfig.text = "Save & Test Connection"

                    if (connected) {
                        Toast.makeText(this, "✓ Connected to VGTC Production Server!", Toast.LENGTH_SHORT).show()
                        // Synchronize profiles immediately so live roster is updated
                        apiClient.getProfiles { rosterResult ->
                            rosterResult.onSuccess { profiles ->
                                prefs.saveLocalProfiles(profiles)
                            }
                        }
                    } else {
                        Toast.makeText(this, "✓ Server configuration saved ($url)", Toast.LENGTH_SHORT).show()
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
