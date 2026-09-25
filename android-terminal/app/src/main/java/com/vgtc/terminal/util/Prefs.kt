package com.vgtc.terminal.util

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.vgtc.terminal.model.Profile

class Prefs(context: Context) {

    // Login password and auth token are sensitive, so the backing store is
    // encrypted at rest. Falls back to a plain (unencrypted) SharedPreferences
    // store only if the Android Keystore is unavailable, so the app still works
    // rather than crashing on boot.
    private val sp: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "vgtc_terminal_prefs_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        Log.e("Prefs", "EncryptedSharedPreferences unavailable, falling back to plain prefs", e)
        context.getSharedPreferences("vgtc_terminal_prefs", Context.MODE_PRIVATE)
    }
    private val gson = Gson()

    init {
        migrateFromLegacyPlainPrefs(context)
    }

    /**
     * One-time migration for devices upgrading from the old plaintext prefs file
     * ("vgtc_terminal_prefs") to the new encrypted store. Without this, every
     * already-deployed terminal would lose its server URL, saved credentials,
     * admin PIN and locally enrolled profiles on update, and would need to be
     * re-configured and re-enrolled by hand.
     */
    private fun migrateFromLegacyPlainPrefs(context: Context) {
        if (sp.contains("migrated_from_legacy_v1")) return

        val legacy = context.getSharedPreferences("vgtc_terminal_prefs", Context.MODE_PRIVATE)
        if (legacy.all.isNotEmpty()) {
            val editor = sp.edit()
            for ((key, value) in legacy.all) {
                when (value) {
                    is String -> editor.putString(key, value)
                    is Boolean -> editor.putBoolean(key, value)
                    is Int -> editor.putInt(key, value)
                    is Long -> editor.putLong(key, value)
                    is Float -> editor.putFloat(key, value)
                    is Set<*> -> {
                        @Suppress("UNCHECKED_CAST")
                        editor.putStringSet(key, value as Set<String>)
                    }
                }
            }
            editor.apply()
            // The legacy file held the password and token in plaintext; clear it
            // now that everything has been copied into the encrypted store.
            legacy.edit().clear().apply()
        }
        sp.edit().putBoolean("migrated_from_legacy_v1", true).apply()
    }

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

    // ──────────────────────────────────────────────────
    // Track today's marked attendance (Map<profileId, punchTime>)
    // Auto-resets daily based on yyyy-MM-dd
    // ──────────────────────────────────────────────────
    fun getTodayAttendanceMap(): Map<String, String> {
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        val savedDate = sp.getString("attendance_marked_date", "")
        if (savedDate != today) {
            sp.edit().putString("attendance_marked_date", today).putString("attendance_marked_map", "{}").apply()
            return emptyMap()
        }
        val json = sp.getString("attendance_marked_map", "{}") ?: "{}"
        return try {
            val type = object : TypeToken<Map<String, String>>() {}.type
            gson.fromJson(json, type) ?: emptyMap()
        } catch (_: Exception) {
            emptyMap()
        }
    }

    fun recordTodayAttendance(profileId: String, punchTime: String) {
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        val currentMap = getTodayAttendanceMap().toMutableMap()
        currentMap[profileId] = punchTime
        sp.edit()
            .putString("attendance_marked_date", today)
            .putString("attendance_marked_map", gson.toJson(currentMap))
            .apply()
    }

    // ──────────────────────────────────────────────────
    // Rich Shift / Duty Lifecycle Tracking (Map<profileId, DutyRecord>)
    // ──────────────────────────────────────────────────
    fun getTodayDutyMap(): Map<String, com.vgtc.terminal.model.DutyRecord> {
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        val savedDate = sp.getString("duty_marked_date", "")
        if (savedDate != today) {
            sp.edit().putString("duty_marked_date", today).putString("duty_marked_map", "{}").apply()
            return emptyMap()
        }
        val json = sp.getString("duty_marked_map", "{}") ?: "{}"
        return try {
            val type = object : TypeToken<Map<String, com.vgtc.terminal.model.DutyRecord>>() {}.type
            gson.fromJson(json, type) ?: emptyMap()
        } catch (_: Exception) {
            emptyMap()
        }
    }

    fun getTodayDuty(profileId: String): com.vgtc.terminal.model.DutyRecord? {
        return getTodayDutyMap()[profileId]
    }

    fun saveTodayDuty(record: com.vgtc.terminal.model.DutyRecord) {
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        val currentMap = getTodayDutyMap().toMutableMap()
        currentMap[record.profileId] = record
        sp.edit()
            .putString("duty_marked_date", today)
            .putString("duty_marked_map", gson.toJson(currentMap))
            .apply()

        // Also sync punch time for backwards compatibility
        recordTodayAttendance(record.profileId, record.outTimeFormatted ?: record.inTimeFormatted)
    }

    fun clear() = sp.edit().clear().apply()
}
