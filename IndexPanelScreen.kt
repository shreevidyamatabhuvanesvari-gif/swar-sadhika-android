package com.swarsadhika.android.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.swarsadhika.android.data.FeatureState
import com.swarsadhika.android.data.FeatureStatus
import com.swarsadhika.android.data.ProgressRepository
import com.swarsadhika.android.data.ProgressSnapshot

@Composable
fun IndexPanelScreen() {
    val context = LocalContext.current
    var snapshot by remember { mutableStateOf(ProgressRepository.load(context)) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 20.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text("स्वर-साधिका", fontSize = 29.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                Text("निर्माण प्रगति एवं परीक्षण पैनल", style = MaterialTheme.typography.titleMedium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Build ${snapshot.buildLabel}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = { snapshot = ProgressRepository.load(context) }) {
                        Text("↻ ताज़ा करें")
                    }
                }
            }
        }

        item { OverallProgressCard(snapshot) }
        item { StatusSummary(snapshot) }
        item { LastTestCard(snapshot) }

        item {
            Text(
                "मॉड्यूल की स्थिति",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        items(snapshot.features, key = { it.id }) { feature ->
            FeatureCard(feature)
        }

        item {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 28.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("परीक्षण का नियम", fontWeight = FontWeight.Bold)
                    Text(
                        "किसी सुविधा को PASS तभी दिखाया जाएगा जब उसका वास्तविक परीक्षण, परीक्षण-परिवेश, समय और प्रमाण दर्ज हों। केवल स्क्रीन दिखना सफलता नहीं है।",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        "प्रगति स्रोत: app/src/main/assets/progress.json",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun OverallProgressCard(snapshot: ProgressSnapshot) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text("प्रमाणित प्रगति", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Row(verticalAlignment = Alignment.Bottom) {
                Text("${snapshot.overallPercent}%", fontSize = 34.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.size(8.dp))
                Text("${snapshot.passedCount} / ${snapshot.features.size} मॉड्यूल PASS", style = MaterialTheme.typography.bodyMedium)
            }
            LinearProgressIndicator(
                progress = { snapshot.overallPercent / 100f },
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.7f)
            )
            Text(
                "प्रतिशत केवल प्रमाणित PASS मॉड्यूल से निकाला गया है। अधूरे काम को पूरा नहीं गिना जाता।",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun StatusSummary(snapshot: ProgressSnapshot) {
    val counts = FeatureState.entries.associateWith { state -> snapshot.features.count { it.status == state } }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        SummaryTile("PASS", counts[FeatureState.PASS] ?: 0, Color(0xFFE0F2E5), Modifier.weight(1f))
        SummaryTile("कार्य जारी", counts[FeatureState.IN_PROGRESS] ?: 0, Color(0xFFFFF0D8), Modifier.weight(1f))
        SummaryTile("बाकी", (counts[FeatureState.NOT_STARTED] ?: 0) + (counts[FeatureState.BLOCKED] ?: 0) + (counts[FeatureState.FAIL] ?: 0), MaterialTheme.colorScheme.surfaceVariant, Modifier.weight(1f))
    }
}

@Composable
private fun SummaryTile(label: String, count: Int, background: Color, modifier: Modifier = Modifier) {
    Surface(modifier = modifier, color = background, shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.padding(vertical = 12.dp, horizontal = 9.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(count.toString(), fontWeight = FontWeight.Bold, fontSize = 22.sp)
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun LastTestCard(snapshot: ProgressSnapshot) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text("अंतिम परीक्षण", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(snapshot.lastTestNote, style = MaterialTheme.typography.bodyMedium)
            Text("अंतिम अपडेट: ${snapshot.lastUpdated}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            snapshot.loadError?.let {
                Text("प्रगति डेटा त्रुटि: $it", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun FeatureCard(feature: FeatureStatus) {
    var expanded by remember(feature.id) { mutableStateOf(false) }
    Card(
        onClick = { expanded = !expanded },
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(feature.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text(feature.summary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.size(8.dp))
                StatusPill(feature.status)
            }
            LinearProgressIndicator(
                progress = { feature.progress / 100f },
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.secondary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )
            Text("मॉड्यूल तैयारी: ${feature.progress}% · विवरण के लिए खोलें", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            AnimatedVisibility(visible = expanded) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("परीक्षण परिवेश: ${feature.testEnvironment.ifBlank { "अभी दर्ज नहीं" }}", style = MaterialTheme.typography.bodySmall)
                    Text("परीक्षण समय: ${feature.lastTestAt ?: "अभी नहीं हुआ"}", style = MaterialTheme.typography.bodySmall)
                    Text("प्रमाण: ${feature.evidence ?: "अभी उपलब्ध नहीं"}", style = MaterialTheme.typography.bodySmall)
                    feature.blocker?.let { Text("रुकावट: $it", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
    }
}

@Composable
private fun StatusPill(status: FeatureState) {
    val (background, foreground) = when (status) {
        FeatureState.PASS -> Color(0xFFE0F2E5) to Color(0xFF1B5E32)
        FeatureState.IN_PROGRESS -> Color(0xFFFFF0D8) to Color(0xFF7A4B00)
        FeatureState.FAIL -> Color(0xFFFFE2DE) to Color(0xFF8D1C13)
        FeatureState.BLOCKED -> Color(0xFFFFE9D5) to Color(0xFF783F00)
        FeatureState.NOT_STARTED -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(color = background, shape = RoundedCornerShape(50)) {
        Text(
            status.labelHindi,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            color = foreground,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold
        )
    }
}
