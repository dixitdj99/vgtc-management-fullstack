# Add project specific ProGuard rules here.
# Keep ML Kit classes
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.** { *; }
# Keep OkHttp
-dontwarn okhttp3.**
-keep class okhttp3.** { *; }
# Keep Gson
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class com.vgtc.terminal.model.** { *; }
