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

        binding.btnSave.setOnClickListener {
            var url = Prefs.sanitizeServerUrl(binding.etServerUrl.text.toString())
            if (url.isBlank()) {
                url = "https://vgtc.site"
            }
            val username = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString()
            val orgId = binding.etOrgId.text.toString().trim()

            binding.etServerUrl.setText(url)
            binding.btnSave.isEnabled = false
            binding.btnSave.text = "Connecting..."

            // Save server configuration
            prefs.serverUrl = url
            if (username.isNotBlank()) prefs.username = username
            if (password.isNotBlank()) prefs.password = password
            prefs.orgId = orgId.ifBlank { "vgtc" }
            if (prefs.authToken.isBlank()) {
                prefs.authToken = "VGTC-TERMINAL-TOKEN-KEY"
            }

            // Verify connectivity using Terminal & Server Status endpoints
            apiClient.checkConnection { connected ->
                runOnUiThread {
                    if (connected) {
                        Toast.makeText(this, "✓ Connected to VGTC Production Server!", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this, "✓ Server URL saved: $url", Toast.LENGTH_SHORT).show()
                    }
                    startActivity(Intent(this, MainActivity::class.java))
                    finishAffinity()
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
