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
        binding.etTerminalApiKey.setText(prefs.terminalApiKey.ifBlank { "VGTC-TERMINAL-TOKEN-KEY" })

        binding.btnPresetProd.setOnClickListener {
            binding.etServerUrl.setText("https://vgtc.site")
        }
        binding.btnPresetLocal.setOnClickListener {
            binding.etServerUrl.setText("http://192.168.1.112:5000")
        }
        binding.btnFillDefaultKey.setOnClickListener {
            binding.etTerminalApiKey.setText("VGTC-TERMINAL-TOKEN-KEY")
            Toast.makeText(this, "Default Terminal Key filled", Toast.LENGTH_SHORT).show()
        }

        binding.btnSaveServerConfig.setOnClickListener {
            var url = Prefs.sanitizeServerUrl(binding.etServerUrl.text.toString())
            if (url.isBlank()) {
                url = "https://vgtc.site"
            }
            val username = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString()
            val orgId = binding.etOrgId.text.toString().trim()
            val terminalKey = binding.etTerminalApiKey.text.toString().trim().ifBlank { "VGTC-TERMINAL-TOKEN-KEY" }

            val urlChanged = prefs.serverUrl != url
            if (urlChanged) {
                // Clear old environment cached roster so new environment profiles load cleanly
                prefs.clearLocalProfiles()
            }

            binding.etServerUrl.setText(url)
            binding.etTerminalApiKey.setText(terminalKey)
            binding.btnSaveServerConfig.isEnabled = false
            binding.btnSaveServerConfig.text = "Testing connection..."

            prefs.serverUrl = url
            if (username.isNotBlank()) prefs.username = username
            if (password.isNotBlank()) prefs.password = password
            prefs.orgId = orgId.ifBlank { "vgtc" }
            prefs.terminalApiKey = terminalKey
            prefs.authToken = ""

            fun showError(message: String) { runOnUiThread {
                binding.btnSaveServerConfig.isEnabled = true
                binding.btnSaveServerConfig.text = "Save & Test Connection"
                com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                    .setTitle("Connection not ready").setMessage(message).setPositiveButton("OK", null).show()
            } }

            fun testRoster() {
                apiClient.getProfiles { result -> runOnUiThread {
                    binding.btnSaveServerConfig.isEnabled = true
                    binding.btnSaveServerConfig.text = "Save & Test Connection"
                    result.onSuccess { profiles ->
                        prefs.mergeServerRoster(profiles)
                        Toast.makeText(this, "✓ Connected • ${profiles.size} VGTC profiles synchronized", Toast.LENGTH_LONG).show()
                    }.onFailure { showError(it.message ?: "Cannot load VGTC roster") }
                } }
            }

            testRoster()

            if (username.isNotBlank() && password.isNotBlank()) {
                apiClient.login(username, password) { result ->
                    result.onSuccess { prefs.authToken = it }
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
