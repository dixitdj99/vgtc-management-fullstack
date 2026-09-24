package com.vgtc.terminal

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.vgtc.terminal.databinding.ItemEmployeeEnrollBinding
import com.vgtc.terminal.model.Profile
import com.vgtc.terminal.util.Prefs

class EnrollListAdapter(
    private var profiles: List<Profile>,
    private val prefs: Prefs,
    private val onEnrollFace: (Profile) -> Unit,
    private val onEnrollFingerprint: (Profile) -> Unit
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
        holder.binding.tvType.text = profile.profileType ?: "Staff"

        val hasFace = !profile.photo.isNullOrBlank()
        holder.binding.badgeFace.visibility = if (hasFace) View.VISIBLE else View.GONE

        val hasFingerprint = prefs.enrolledFingerprintProfileId == profile.id
        holder.binding.badgeFingerprint.visibility = if (hasFingerprint) View.VISIBLE else View.GONE

        if (hasFace) {
            Glide.with(holder.itemView.context)
                .load(profile.photo)
                .circleCrop()
                .placeholder(R.drawable.ic_person_placeholder)
                .into(holder.binding.ivAvatar)
        } else {
            holder.binding.ivAvatar.setImageResource(R.drawable.ic_person_placeholder)
        }

        holder.binding.btnEnrollFace.setOnClickListener {
            onEnrollFace(profile)
        }

        holder.binding.btnEnrollFingerprint.setOnClickListener {
            onEnrollFingerprint(profile)
        }
    }

    override fun getItemCount() = profiles.size

    fun updateList(newList: List<Profile>) {
        profiles = newList
        notifyDataSetChanged()
    }
}
