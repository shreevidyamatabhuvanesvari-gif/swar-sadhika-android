
package com.swarsadhika.android.data

import android.content.Context
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Reads the local progress.json bundled in app/src/main/assets/.
 *
 * No network calls, cloud service, paid API or API key is used.
 *
 * PASS requires:
 * - progress = 100
 * - meaningful test environment
 * - valid ISO-8601 timestamp with timezone
 * - meaningful test evidence
 *
 * These checks validate record completeness, not the truth
 * of a manually entered test. Evidence still requires review.
 */
object ProgressRepository {

    private const val PROGRESS_ASSET = "progress.json"
    private const val SUPPORTED_SCHEMA_VERSION = 1

    private val placeholderPhrases = listOf(
        "not tested",
        "not yet tested",
        "not available",
        "not provided",
        "अभी उपलब्ध नहीं",
        "अभी नहीं हुआ",
        "परीक्षण बाकी",
        "जाँच बाकी",
        "दर्ज नहीं",
        "बाकी है",
        "pending",
        "none",
        "null",
        "n/a"
    )

    private data class FallbackFeature(
        val id: String,
        val name: String,
        val status: FeatureState = FeatureState.NOT_STARTED,
        val progress: Int = 0,
        val summary: String,
        val blocker: String
    )

    /**
     * Load local progress data.
     * An invalid or missing asset produces a visible safe fallback.
     */
    fun load(context: Context): ProgressSnapshot {
        return try {
            val appContext = context.applicationContext

            val jsonText = appContext.assets
                .open(PROGRESS_ASSET)
                .bufferedReader(Charsets.UTF_8)
                .use { reader -> reader.readText() }

            parse(jsonText)

        } catch (error: Exception) {
            fallbackSnapshot(describeError(error))
        }
    }

    @Throws(JSONException::class, IllegalArgumentException::class)
    internal fun parse(jsonText: String): ProgressSnapshot {

        val root = JSONObject(jsonText)

        val schemaVersion = root.optInt("schemaVersion", -1)

        require(schemaVersion == SUPPORTED_SCHEMA_VERSION) {
            "असमर्थित progress.json schemaVersion: $schemaVersion"
        }

        val rawFeatures = root.optJSONArray("features")
            ?: throw IllegalArgumentException(
                "progress.json में features सूची नहीं मिली।"
            )

        require(rawFeatures.length() > 0) {
            "progress.json में कोई मॉड्यूल दर्ज नहीं है।"
        }

        val seenIds = mutableSetOf<String>()
        val features = ArrayList<FeatureStatus>(rawFeatures.length())

        for (index in 0 until rawFeatures.length()) {

            val item = rawFeatures.optJSONObject(index)
                ?: throw IllegalArgumentException(
                    "मॉड्यूल ${index + 1} का रिकॉर्ड वैध JSON Object नहीं है।"
                )

            val feature = parseFeature(item, index)

            require(seenIds.add(feature.id)) {
                "दोहराया गया मॉड्यूल ID: ${feature.id}"
            }

            features += feature
        }

        return ProgressSnapshot(
            buildLabel = optionalString(root, "buildLabel")
                ?: "Build label दर्ज नहीं",

            lastUpdated = optionalString(root, "lastUpdated")
                ?: "अपडेट समय दर्ज नहीं",

            lastTestNote = optionalString(root, "lastTestNote")
                ?: "अंतिम परीक्षण का विवरण दर्ज नहीं है।",

            features = features,
            loadError = null
        )
    }

    private fun parseFeature(
        item: JSONObject,
        index: Int
    ): FeatureStatus {

        val id = requiredString(item, "id", index)
        val name = requiredString(item, "name", index)

        val rawProgress = item.opt("progress") as? Number
            ?: throw IllegalArgumentException(
                "मॉड्यूल $id की progress संख्या उपलब्ध नहीं है।"
            )

        val progressValue = rawProgress.toDouble()

        require(
            progressValue.isFinite() &&
                progressValue in 0.0..100.0
        ) {
            "मॉड्यूल $id की progress 0 से 100 के बीच होनी चाहिए।"
        }

        require(progressValue % 1.0 == 0.0) {
            "मॉड्यूल $id की progress पूर्ण संख्या होनी चाहिए।"
        }

        val rawStatus = optionalString(item, "status") ?: "BLOCKED"

        val knownStatus = FeatureState.values()
            .any { it.name == rawStatus }

        var state = if (knownStatus) {
            FeatureState.from(rawStatus)
        } else {
            FeatureState.BLOCKED
        }

        val summary = optionalString(item, "summary")
            ?: "विवरण उपलब्ध नहीं है।"

        val testEnvironment = optionalString(
            item,
            "testEnvironment"
        ) ?: ""

        val lastTestAt = optionalString(item, "lastTestAt")
        val evidence = optionalString(item, "evidence")
        val existingBlocker = optionalString(item, "blocker")

        val validationProblems = mutableListOf<String>()

        if (!knownStatus) {
            validationProblems +=
                "अमान्य स्थिति '$rawStatus' के कारण मॉड्यूल BLOCKED किया गया।"
        }

        if (rawStatus == FeatureState.PASS.name) {

            if (progressValue.toInt() != 100) {
                validationProblems +=
                    "PASS के लिए progress 100 होना आवश्यक है।"
            }

            if (!isMeaningful(testEnvironment)) {
                validationProblems +=
                    "वास्तविक परीक्षण परिवेश दर्ज नहीं है।"
            }

            if (!isValidTestTimestamp(lastTestAt)) {
                validationProblems +=
                    "वास्तविक दिनांक, समय और समय-क्षेत्र वाला वैध ISO-8601 परीक्षण समय दर्ज नहीं है।"
            }

            if (!isMeaningful(evidence)) {
                validationProblems +=
                    "वास्तविक परीक्षण प्रमाण/संदर्भ दर्ज नहीं है।"
            }

            if (validationProblems.isNotEmpty()) {
                state = FeatureState.BLOCKED
            }
        }

        val blockerParts =
            listOfNotNull(existingBlocker) + validationProblems

        val blocker = blockerParts
            .filter { it.isNotBlank() }
            .distinct()
            .joinToString(" ")
            .ifBlank { null }

        return FeatureStatus(
            id = id,
            name = name,
            status = state,
            progress = progressValue.toInt(),
            summary = summary,
            testEnvironment = testEnvironment,
            lastTestAt = lastTestAt,
            evidence = evidence,
            blocker = blocker
        )
    }

    private fun requiredString(
        item: JSONObject,
        key: String,
        index: Int
    ): String {

        val value = optionalString(item, key)

        require(!value.isNullOrBlank()) {
            "मॉड्यूल ${index + 1} में '$key' खाली या अनुपस्थित है।"
        }

        return value.trim()
    }

    private fun optionalString(
        item: JSONObject,
        key: String
    ): String? {

        if (!item.has(key) || item.isNull(key)) {
            return null
        }

        val value = item.opt(key) as? String ?: return null

        return value.trim().takeIf { it.isNotEmpty() }
    }

    private fun isValidTestTimestamp(value: String?): Boolean {

        if (value.isNullOrBlank()) return false

        val supportedPatterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"
        )

        return supportedPatterns.any { pattern ->
            try {
                val formatter = SimpleDateFormat(
                    pattern,
                    Locale.ROOT
                ).apply {
                    isLenient = false
                }

                val position = ParsePosition(0)
                val parsed = formatter.parse(value, position)

                parsed != null &&
                    position.index == value.length &&
                    parsed.time <=
                    System.currentTimeMillis() + 5 * 60 * 1000L

            } catch (_: IllegalArgumentException) {
                false
            }
        }
    }

    private fun isMeaningful(value: String?): Boolean {

        if (value.isNullOrBlank()) return false

        val normalized = value.trim().lowercase(Locale.ROOT)

        if (normalized.length < 8) return false

        return placeholderPhrases.none { phrase ->
            normalized.contains(phrase)
        }
    }

    private fun describeError(error: Exception): String {

        return when (error) {

            is IOException ->
                "स्थानीय assets/progress.json पढ़ी नहीं जा सकी: " +
                    (error.message ?: "फ़ाइल उपलब्ध नहीं")

            is JSONException ->
                "progress.json का JSON प्रारूप अमान्य है: " +
                    (error.message ?: "JSON त्रुटि")

            else ->
                error.message
                    ?: "प्रगति डेटा लोड करते समय अज्ञात त्रुटि हुई।"
        }
    }

    private fun fallbackSnapshot(
        errorMessage: String
    ): ProgressSnapshot {

        val fallbackFeatures =
            fallbackFeatureDefinitions.map { seed ->

                FeatureStatus(
                    id = seed.id,
                    name = seed.name,
                    status = seed.status,
                    progress = seed.progress,
                    summary = seed.summary,
                    testEnvironment = "",
                    lastTestAt = null,
                    evidence = null,
                    blocker = seed.blocker.ifBlank {
                        "स्थानीय progress.json उपलब्ध नहीं है।"
                    }
                )
            }

        return ProgressSnapshot(
            buildLabel = "0.1.0-index-panel",
            lastUpdated = "स्थानीय सुरक्षित प्रारम्भिक डेटा",
            lastTestNote =
                "प्रगति डेटा लोड नहीं हुआ। कोई सुविधा प्रमाणित PASS नहीं है।",
            features = fallbackFeatures,
            loadError = errorMessage
        )
    }

    private val fallbackFeatureDefinitions = listOf(

        FallbackFeature(
            id = "index_panel",
            name = "Index Panel एवं Progress Dashboard",
            status = FeatureState.IN_PROGRESS,
            progress = 35,
            summary =
                "Native Panel का प्रारम्भिक स्रोत उपलब्ध है; Android Build और डिवाइस परीक्षण बाकी हैं।",
            blocker =
                "Android Native Build और वास्तविक डिवाइस परीक्षण बाकी।"
        ),

        FallbackFeature(
            "android_launch",
            "Android App Launch",
            summary = "Android ऐप का Launch परीक्षण बाकी।",
            blocker = "APK Build और डिवाइस स्थापना बाकी।"
        ),

        FallbackFeature(
            "local_model_loading",
            "Local TTS Model Loading",
            summary = "स्थानीय TTS मॉडल लोडिंग जाँचना बाकी।",
            blocker = "मॉडल स्रोत, लाइसेंस और फाइलें जाँचनी हैं।"
        ),

        FallbackFeature(
            "hindi_female_tts",
            "Hindi Female TTS",
            summary = "वास्तविक स्त्री-स्वर ऑडियो अभी जाँचा नहीं गया।",
            blocker = "स्थानीय TTS एकीकरण बाकी।"
        ),

        FallbackFeature(
            "sanskrit_pronunciation",
            "Sanskrit Pronunciation",
            summary = "संस्कृत उच्चारण का ऑडियो परीक्षण बाकी।",
            blocker = "संस्कृत टेस्ट सेट और ऑडियो परीक्षण बाकी।"
        ),

        FallbackFeature(
            "chant_prosody",
            "Chant-style Prosody",
            summary = "लय, मात्रा, विराम और स्वर-उतार की जाँच बाकी।",
            blocker = "Prosody नियंत्रण और मॉडल एकीकरण बाकी।"
        ),

        FallbackFeature(
            "audio_generation_playback",
            "Audio Generation एवं Playback",
            summary = "वास्तविक ऑडियो निर्माण और Playback जाँचना बाकी।",
            blocker = "TTS इंजन एकीकरण बाकी।"
        ),

        FallbackFeature(
            "audio_save_share",
            "Audio Save एवं Share",
            summary = "ऑडियो सेव और साझा करने का परीक्षण बाकी।",
            blocker = "ऑडियो आउटपुट मॉड्यूल बाकी।"
        ),

        FallbackFeature(
            "video_import",
            "Video Import एवं Preview",
            summary = "वीडियो आयात और Preview जाँचना बाकी।",
            blocker = "वीडियो मॉड्यूल बाकी।"
        ),

        FallbackFeature(
            "caption_sync",
            "Caption Synchronization",
            summary = "ऑडियो और टेक्स्ट का Synchronization जाँचना बाकी।",
            blocker = "ऑडियो टाइमस्टैम्प और Caption renderer बाकी।"
        ),

        FallbackFeature(
            "video_full_duration",
            "पूरा पाठ समाप्त होने तक Video Playback",
            summary = "पूरा पाठ समाप्त होने तक वीडियो चलना जाँचना बाकी।",
            blocker = "वीडियो Timeline मॉड्यूल बाकी।"
        ),

        FallbackFeature(
            "lip_sync",
            "Lip-sync",
            summary = "वास्तविक ऑडियो से होंठों का तालमेल जाँचना बाकी।",
            blocker = "Avatar और Viseme pipeline बाकी।"
        ),

        FallbackFeature(
            "body_language",
            "Body Language एवं Expressions",
            summary = "चेहरे और शरीर की गतिविधियों का परीक्षण बाकी।",
            blocker = "Animated Avatar और Gesture timeline बाकी।"
        ),

        FallbackFeature(
            "mp4_export",
            "MP4 Export",
            summary = "अंतिम MP4 फाइल बनाना और चलाना जाँचना बाकी।",
            blocker = "स्थानीय Video Composition pipeline बाकी।"
        ),

        FallbackFeature(
            "offline_operation",
            "Offline Operation",
            summary = "इंटरनेट बंद करके संचालन जाँचना बाकी।",
            blocker = "स्थानीय मॉडल एकीकरण बाकी।"
        ),

        FallbackFeature(
            "privacy_permissions",
            "Privacy एवं Permissions",
            summary = "न्यूनतम Permissions और स्थानीय डेटा व्यवहार जाँचना बाकी।",
            blocker = "Permission audit बाकी।"
        ),

        FallbackFeature(
            "android_build_install",
            "Android Build एवं Installation",
            summary = "APK Build और वास्तविक फोन पर स्थापना जाँचना बाकी।",
            blocker = "Android SDK, Gradle Build और Signing configuration बाकी।"
        )
    )
}
