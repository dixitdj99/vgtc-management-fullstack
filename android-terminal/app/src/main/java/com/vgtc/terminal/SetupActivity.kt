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
        binding.etServerUrl.setText(prefs.serverUrl)
        binding.etUsername.setText(prefs.username)
        binding.etOrgId.setText(prefs.orgId)

        binding.btnSave.setOnClickListener {
            var url = binding.etServerUrl.text.toString().trim().trimEnd('/')
            val username = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString()
            val orgId = binding.etOrgId.text.toString().trim()

            if (url.isEmpty() || username.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "Please fill all required fields", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = "https://$url"
                binding.etServerUrl.setText(url)
            }

            binding.btnSave.isEnabled = false
            binding.btnSave.text = "Testing connection..."

            // Save and test
            prefs.serverUrl = url
            prefs.username = username
            prefs.orgId = orgId.ifBlank { "vgtc" }

            apiClient.login(username, password) { result ->
                runOnUiThread {
                    result.onSuccess { token ->
                        prefs.authToken = token
                        prefs.password = password
                        Toast.makeText(this, "Connected successfully!", Toast.LENGTH_SHORT).show()
                        startActivity(Intent(this, MainActivity::class.java))
                        finishAffinity()
                    }.onFailure { err ->
                        binding.btnSave.isEnabled = true
                        binding.btnSave.text = "Save & Connect"
                        Toast.makeText(this, "Login failed: ${err.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }

        binding.btnBack.setOnClickListener {
            if (prefs.serverUrl.isNotBlank() && prefs.authToken.isNotBlank()) {
                finish()
            } else {
                finishAffinity()
            }
        }
    }
}
