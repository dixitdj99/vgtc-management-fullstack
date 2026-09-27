package com.vgtc.terminal

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.vgtc.terminal.databinding.ItemEmployeeEnrollBinding
import com.vgtc.terminal.model.Profile
import com.vgtc.terminal.util.Prefs

/**
 * Adapter for the enrolled-employees list on the terminal.
 *
 * The terminal is a READ-ONLY kiosk for profile management — it cannot create
 * or delete staff/driver profiles (those actions live in the VGTC Portal).
 * The only local operations allowed are:
 *   • Enroll / re-enroll a face
 *   • Enroll / re-record a fingerprint
 *   • View attendance history
 */
class EnrollListAdapter(
    private var profiles: List<Profile>,
    private val prefs: Prefs,
    private val onEnrollFace: (Profile) -> Unit,
    private val onClearFace: (Profile) -> Unit,
    private val onEnrollFingerprint: (Profile) -> Unit,
    private val onClearFingerprint: (Profile) -> Unit,
    private val onViewAttendance: (Profile) -> Unit
) : RecyclerView.Adapter<EnrollListAdapter.ViewHolder>() {

    class ViewHolder(val binding: ItemEmployeeEnrollBinding) :
        RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemEmployeeEnrollBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val profile = profiles[position]
        holder.binding.tvName.text = profile.name

        val isDriver = profile.profileType.equals("Driver", ignoreCase = true)
        val vehicleNo = profile.vehicleNo?.takeIf { it.isNotBlank() }

        // Type + location label
        holder.binding.tvType.text = buildString {
            append(if (isDriver) "Driver • Yard" else ((profile.profileType ?: "Staff") + " • Office"))
            if (vehicleNo != null) append("  🚛 $vehicleNo")
        }

        val hasFace = !profile.faceEmbedding.isNullOrEmpty() || !profile.photo.isNullOrBlank()
        holder.binding.badgeFace.visibility = if (hasFace) View.VISIBLE else View.GONE
        holder.binding.badgeFace.text = if (!profile.faceEmbedding.isNullOrEmpty()) "Face AI ✓" else "Face ✓"

        val hasFingerprint = profile.fingerprintEnrolled || profile.fingerprintSlotId != null ||
                prefs.enrolledFingerprintProfileId == profile.id
        holder.binding.badgeFingerprint.visibility = if (hasFingerprint) View.VISIBLE else View.GONE
        holder.binding.badgeFingerprint.text = if (profile.fingerprintSlotId != null)
            "R307 #${profile.fingerprintSlotId} ✓" else "Fingerprint ✓"

        // Vehicle badge
        holder.binding.badgeVehicle.visibility = if (vehicleNo != null) View.VISIBLE else View.GONE
        holder.binding.badgeVehicle.text = "🚛 $vehicleNo"

        // Avatar photo
        if (hasFace && !profile.photo.isNullOrBlank()) {
            Glide.with(holder.itemView.context)
                .load(profile.photo)
                .circleCrop()
                .placeholder(R.drawable.ic_person_placeholder)
                .into(holder.binding.ivAvatar)
        } else {
            holder.binding.ivAvatar.setImageResource(R.drawable.ic_person_placeholder)
        }

        // Face buttons: enroll if no face, clear + re-enroll if face exists
        if (hasFace) {
            holder.binding.btnEnrollFace.text = "Re-enroll Face"
            holder.binding.btnClearFace.visibility = View.VISIBLE
        } else {
            holder.binding.btnEnrollFace.text = "Enroll Face"
            holder.binding.btnClearFace.visibility = View.GONE
        }

        // Fingerprint buttons
        if (hasFingerprint) {
            holder.binding.btnEnrollFingerprint.text = "Re-record FP"
            holder.binding.btnClearFingerprint.visibility = View.VISIBLE
        } else {
            holder.binding.btnEnrollFingerprint.text = "Record FP"
            holder.binding.btnClearFingerprint.visibility = View.GONE
        }

        holder.binding.btnEnrollFace.setOnClickListener { onEnrollFace(profile) }
        holder.binding.btnClearFace.setOnClickListener { onClearFace(profile) }
        holder.binding.btnEnrollFingerprint.setOnClickListener { onEnrollFingerprint(profile) }
        holder.binding.btnClearFingerprint.setOnClickListener { onClearFingerprint(profile) }

        // Tap the card itself to view attendance history
        holder.itemView.setOnClickListener { onViewAttendance(profile) }
        holder.binding.btnViewAttendance.setOnClickListener { onViewAttendance(profile) }
    }

    override fun getItemCount() = profiles.size

    fun updateList(newList: List<Profile>) {
        profiles = newList
        notifyDataSetChanged()
    }
}
