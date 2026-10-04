package com.vgtc.terminal

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.vgtc.terminal.api.ApiClient
import com.vgtc.terminal.databinding.ActivitySetupBinding
import com.vgtc.terminal.util.Prefs

class SetupActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySetupBinding
    private lateinit var prefs: Prefs
    private lateinit var apiClient: ApiClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = Prefs(this)
        apiClient = ApiClient(this)

        // Pre-fill saved values
        val defaultUrl = if (prefs.serverUrl.isBlank()) "https://vgtc.site" else prefs.serverUrl
        binding.etServerUrl.setText(defaultUrl)
        binding.etUsername.setText(prefs.username)
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

        binding.btnSave.setOnClickListener {
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
                prefs.clearLocalProfiles()
            }

            binding.etServerUrl.setText(url)
            binding.etTerminalApiKey.setText(terminalKey)
            binding.btnSave.isEnabled = false
            binding.btnSave.text = "Connecting..."

            // Save server configuration
            prefs.serverUrl = url
            if (username.isNotBlank()) prefs.username = username
            if (password.isNotBlank()) prefs.password = password
            prefs.orgId = orgId.ifBlank { "vgtc" }
            prefs.terminalApiKey = terminalKey
            prefs.authToken = ""

            fun showError(message: String) { runOnUiThread {
                binding.btnSave.isEnabled = true
                binding.btnSave.text = "Save & Connect"
                com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                    .setTitle("Connection not ready").setMessage(message).setPositiveButton("OK", null).show()
            } }

            fun testRoster() {
                apiClient.getProfiles { result -> runOnUiThread {
                    binding.btnSave.isEnabled = true
                    binding.btnSave.text = "Save & Connect"
                    result.onSuccess { profiles ->
                        prefs.mergeServerRoster(profiles)
                        Toast.makeText(this, "✓ Connected • ${profiles.size} VGTC profiles", Toast.LENGTH_LONG).show()
                        startActivity(Intent(this, MainActivity::class.java)); finish()
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

        binding.btnBack.setOnClickListener {
            if (prefs.serverUrl.isNotBlank()) {
                finish()
            } else {
                finishAffinity()
            }
        }
    }
}
