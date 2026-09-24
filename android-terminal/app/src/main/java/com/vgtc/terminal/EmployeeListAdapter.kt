package com.vgtc.terminal

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.vgtc.terminal.databinding.ItemEmployeeBinding
import com.vgtc.terminal.model.Profile

class EmployeeListAdapter(
    private var profiles: MutableList<Profile>,
    private val onSelect: (Profile) -> Unit
) : RecyclerView.Adapter<EmployeeListAdapter.ViewHolder>() {

    private var selectedPosition = -1

    inner class ViewHolder(val binding: ItemEmployeeBinding) :
        RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemEmployeeBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val profile = profiles[position]
        holder.binding.tvName.text = profile.name
        holder.binding.tvType.text = profile.profileType ?: "Staff"

        // Profile photo
        if (!profile.photo.isNullOrBlank()) {
            Glide.with(holder.binding.root.context)
                .load(profile.photo)
                .circleCrop()
                .placeholder(R.drawable.ic_person_placeholder)
                .into(holder.binding.ivPhoto)
        } else {
            holder.binding.ivPhoto.setImageResource(R.drawable.ic_person_placeholder)
        }

        // Selection highlight
        holder.binding.root.isSelected = selectedPosition == position

        holder.binding.root.setOnClickListener {
            val prev = selectedPosition
            selectedPosition = holder.adapterPosition
            notifyItemChanged(prev)
            notifyItemChanged(selectedPosition)
            onSelect(profile)
        }
    }

    override fun getItemCount() = profiles.size

    fun updateList(newList: MutableList<Profile>) {
        profiles = newList
        selectedPosition = -1
        notifyDataSetChanged()
    }
}
