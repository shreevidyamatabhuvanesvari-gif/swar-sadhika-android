package com.swarsadhika.android.data

enum class FeatureState(val labelHindi: String) {
    NOT_STARTED("शुरू नहीं हुआ"),
    IN_PROGRESS("काम जारी है"),
    PASS("परीक्षण सफल"),
    FAIL("परीक्षण असफल"),
    BLOCKED("रुका हुआ");

    companion object {
        fun from(raw: String): FeatureState =
            entries.firstOrNull { it.name == raw } ?: BLOCKED
    }
}

data class FeatureStatus(
    val id: String,
    val name: String,
    val status: FeatureState,
    val progress: Int,
    val summary: String,
    val testEnvironment: String,
    val lastTestAt: String?,
    val evidence: String?,
    val blocker: String?
)

data class ProgressSnapshot(
    val buildLabel: String,
    val lastUpdated: String,
    val lastTestNote: String,
    val features: List<FeatureStatus>,
    val loadError: String? = null
) {
    val passedCount: Int get() = features.count { it.status == FeatureState.PASS }
    val overallPercent: Int
        get() = if (features.isEmpty()) 0 else (passedCount * 100) / features.size
}
