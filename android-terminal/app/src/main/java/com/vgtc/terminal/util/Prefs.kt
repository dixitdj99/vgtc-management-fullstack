package com.vgtc.terminal.util

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.vgtc.terminal.model.Profile

class Prefs(context: Context) {

    private val sp: SharedPreferences =
        context.getSharedPreferences("vgtc_terminal_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()

    var serverUrl: String
        get() = sp.getString("server_url", "") ?: ""
        set(value) = sp.edit().putString("server_url", value).apply()

    var username: String
        get() = sp.getString("username", "") ?: ""
        set(value) = sp.edit().putString("username", value).apply()

    var password: String
        get() = sp.getString("password", "") ?: ""
        set(value) = sp.edit().putString("password", value).apply()

    var orgId: String
        get() = sp.getString("org_id", "vgtc") ?: "vgtc"
        set(value) = sp.edit().putString("org_id", value).apply()

    var authToken: String
        get() = sp.getString("auth_token", "") ?: ""
        set(value) = sp.edit().putString("auth_token", value).apply()

    var enrolledFingerprintProfileId: String
        get() = sp.getString("enrolled_fp_id", "") ?: ""
        set(value) = sp.edit().putString("enrolled_fp_id", value).apply()

    var enrolledFingerprintProfileName: String
        get() = sp.getString("enrolled_fp_name", "") ?: ""
        set(value) = sp.edit().putString("enrolled_fp_name", value).apply()

    // Admin security PIN (default "1234")
    var adminPin: String
        get() = sp.getString("admin_pin", "1234") ?: "1234"
        set(value) = sp.edit().putString("admin_pin", value).apply()

    // Local persistent profiles (so enrolled employees are always saved and accessible)
    private var localProfilesJson: String
        get() = sp.getString("local_profiles_json", "[]") ?: "[]"
        set(value) = sp.edit().putString("local_profiles_json", value).apply()

    fun getLocalProfiles(): List<Profile> {
        return try {
            val type = object : TypeToken<List<Profile>>() {}.type
            gson.fromJson(localProfilesJson, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun saveLocalProfiles(profiles: List<Profile>) {
        localProfilesJson = gson.toJson(profiles)
    }

    fun addOrUpdateLocalProfile(profile: Profile) {
        val current = getLocalProfiles().toMutableList()
        val index = current.indexOfFirst { it.id == profile.id }
        if (index >= 0) {
            current[index] = profile
        } else {
            current.add(0, profile)
        }
        saveLocalProfiles(current)
    }

    fun deleteLocalProfile(profileId: String) {
        val current = getLocalProfiles().filter { it.id != profileId }
        saveLocalProfiles(current)
        if (enrolledFingerprintProfileId == profileId) {
            enrolledFingerprintProfileId = ""
            enrolledFingerprintProfileName = ""
        }
    }

    fun clear() = sp.edit().clear().apply()
}
