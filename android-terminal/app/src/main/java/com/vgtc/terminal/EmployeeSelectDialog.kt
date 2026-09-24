package com.vgtc.terminal

import android.app.Dialog
import android.content.Context
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.Window
import android.widget.Toast
import com.vgtc.terminal.databinding.DialogEmployeeSelectBinding
import com.vgtc.terminal.model.Profile

class EmployeeSelectDialog(
    context: Context,
    private val profiles: List<Profile>,
    private val mode: String,
    private val onConfirm: (Profile, String) -> Unit
) : Dialog(context) {

    private lateinit var binding: DialogEmployeeSelectBinding
    private var filteredProfiles = profiles.toMutableList()
    private var selectedProfile: Profile? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        binding = DialogEmployeeSelectBinding.inflate(LayoutInflater.from(context))
        setContentView(binding.root)

        // Full-width dialog
        window?.setLayout(
            android.view.WindowManager.LayoutParams.MATCH_PARENT,
            android.view.WindowManager.LayoutParams.WRAP_CONTENT
        )
        window?.setBackgroundDrawableResource(android.R.color.transparent)
        setCanceledOnTouchOutside(false)

        setupSearch()
        setupList()
        setupButtons()
    }

    private fun setupSearch() {
        binding.etSearch.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val query = s.toString().trim().lowercase()
                filteredProfiles = if (query.isEmpty()) {
                    profiles.toMutableList()
                } else {
                    profiles.filter {
                        it.name.lowercase().contains(query) ||
                        (it.profileType ?: "").lowercase().contains(query)
                    }.toMutableList()
                }
                updateList()
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
    }

    private fun setupList() {
        val adapter = EmployeeListAdapter(filteredProfiles) { profile ->
            selectedProfile = profile
            binding.tvSelectedName.text = profile.name
            binding.tvSelectedType.text = profile.profileType ?: "Staff"
            binding.btnMarkPresent.isEnabled = true
            binding.btnMarkAbsent.isEnabled = true
            binding.btnMarkHalfDay.isEnabled = true
        }
        binding.rvEmployees.adapter = adapter
        binding.rvEmployees.layoutManager =
            androidx.recyclerview.widget.LinearLayoutManager(context)
    }

    private fun updateList() {
        (binding.rvEmployees.adapter as? EmployeeListAdapter)?.updateList(filteredProfiles)
    }

    private fun setupButtons() {
        binding.btnMarkPresent.isEnabled = false
        binding.btnMarkAbsent.isEnabled = false
        binding.btnMarkHalfDay.isEnabled = false

        binding.btnMarkPresent.setOnClickListener {
            confirm("present")
        }
        binding.btnMarkAbsent.setOnClickListener {
            confirm("absent")
        }
        binding.btnMarkHalfDay.setOnClickListener {
            confirm("half_day")
        }
        binding.btnDialogCancel.setOnClickListener {
            dismiss()
        }
    }

    private fun confirm(status: String) {
        val profile = selectedProfile
        if (profile == null) {
            Toast.makeText(context, "Please select an employee", Toast.LENGTH_SHORT).show()
            return
        }
        dismiss()
        onConfirm(profile, status)
    }
}
