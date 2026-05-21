// RadioFM.qml - tuner FM premium style Pioneer SX-1980 / Marantz.
//
// Largeur x2, cadran luxueux, LED horizontales fines style annees 80
// avec effet plastique translucide, persistance analogique, RDS defilant,
// VU-metres LED rectangulaires, 10 presets, vis metalliques.
import QtQuick 2.15

Item {
    id: root
    implicitWidth: 340
    implicitHeight: 120

    property var presets: [
        { freq: "88.2", name: "FIP", rds: "JAZZ  SOUL  ELECTRO" },
        { freq: "89.5", name: "NOVA", rds: "RADIO NOVA  PARIS" },
        { freq: "91.7", name: "NRJ", rds: "HITS MUSIC ONLY" },
        { freq: "93.1", name: "FG", rds: "RADIO FG  DANCE" },
        { freq: "93.9", name: "FUN", rds: "HIT MUSIC ONLY" },
        { freq: "95.2", name: "OUI", rds: "OUI FM  ROCK" },
        { freq: "96.5", name: "RTL2", rds: "LE SON POP ROCK" },
        { freq: "97.4", name: "EURO", rds: "EUROPE 1  INFO" },
        { freq: "99.0", name: "SKY", rds: "SKYROCK  HIP-HOP" },
        { freq: "101.3", name: "RFM", rds: "MEILLEURE MUSIQUE" },
    ]
    property int activePreset: -1
    property string currentFreq: "88.2"
    property real signalStrength: 0.75
    property bool stereo: true
    property real vuLeft: 0.0
    property real vuRight: 0.0

    property color ledGreen: "#3aaa50"
    property color ledAmber: "#cc8820"
    property color ledRed: "#cc2020"

    // --- CHASSIS METAL ---
    Rectangle {
        anchors.fill: parent; radius: 8
        color: "#090a0c"; border.color: "#1a1c22"; border.width: 1
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#111318" }
            GradientStop { position: 0.4; color: "#090a0c" }
            GradientStop { position: 1.0; color: "#050608" }
        }
        Rectangle {
            anchors { left: parent.left; right: parent.right; top: parent.top }
            height: 1; color: "#8a8f96"; opacity: 0.12
        }
    }

    // --- VIS ---
    Repeater {
        model: [{x: 5, y: 5}, {x: parent.width - 12, y: 5}, {x: 5, y: parent.height - 12}, {x: parent.width - 12, y: parent.height - 12}]
        Rectangle {
            x: modelData.x; y: modelData.y
            width: 7; height: 7; radius: 3.5
            color: "#0c0d10"; border.color: "#3a3e45"; border.width: 0.6; opacity: 0.3
            Canvas {
                anchors.fill: parent
                onPaint: {
                    var ctx = getContext("2d"); ctx.reset();
                    ctx.strokeStyle = "#2a2e35"; ctx.lineWidth = 0.6;
                    ctx.beginPath(); ctx.moveTo(2,2); ctx.lineTo(5,5); ctx.moveTo(5,2); ctx.lineTo(2,5); ctx.stroke();
                }
            }
        }
    }

    // --- ZONE GAUCHE : CADRAN FM ---
    Item {
        anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
        anchors.leftMargin: 8; anchors.topMargin: 12; anchors.bottomMargin: 26
        width: 140

        Text {
            anchors { left: parent.left; top: parent.top; topMargin: -9 }
            text: "FM STEREO TUNER"; color: "#4a5060"
            font.family: "DejaVu Sans Mono"; font.pixelSize: 5; font.bold: true; opacity: 0.5
        }

        Rectangle {
            anchors.fill: parent; radius: 4
            color: "#050608"; border.color: "#1a1c22"; border.width: 1

            Canvas {
                anchors.fill: parent; anchors.margins: 2
                property real freqFrac: (parseFloat(root.currentFreq) - 88) / 20
                onFreqFracChanged: requestPaint()
                onPaint: {
                    var ctx = getContext("2d"); ctx.reset();
                    var w = width, h = height;
                    var cx = w / 2, cy = h * 0.75;
                    var r = Math.min(w * 0.44, h * 0.68);
                    var span = 120;

                    // Arc fond
                    ctx.lineWidth = 2; ctx.strokeStyle = "#1a1e24";
                    ctx.beginPath(); ctx.arc(cx, cy, r, -150 * Math.PI/180, -30 * Math.PI/180, false); ctx.stroke();

                    // 60 micro-ticks
                    for (var i = 0; i <= 60; i++) {
                        var angle = (-150 + i * (span / 60)) * Math.PI / 180;
                        var isMajor = i % 10 === 0;
                        var isMid = i % 5 === 0;
                        var inner = r - (isMajor ? 9 : (isMid ? 5 : 3));
                        ctx.lineWidth = isMajor ? 1.5 : (isMid ? 0.9 : 0.4);
                        ctx.strokeStyle = isMajor ? "#5a6070" : (isMid ? "#3a4050" : "#141820");
                        ctx.beginPath();
                        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
                        ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
                        ctx.stroke();
                    }

                    // Chiffres freqs
                    var freqs = ["88", "90", "92", "94", "96", "98", "100", "102", "104", "106", "108"];
                    ctx.font = "bold 7px 'DejaVu Sans Mono'";
                    ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    for (var fi = 0; fi < freqs.length; fi++) {
                        var fa = (-150 + fi * (span / 10)) * Math.PI / 180;
                        var fx = cx + Math.cos(fa) * (r - 14);
                        var fy = cy + Math.sin(fa) * (r - 14);
                        ctx.fillStyle = "#6a7080";
                        ctx.fillText(freqs[fi], fx, fy);
                    }
                    ctx.fillStyle = "#3a4050"; ctx.font = "bold 5px 'DejaVu Sans Mono'";
                    ctx.fillText("MHz", cx, cy - r * 0.08);
                }
            }

            Rectangle {
                id: freqNeedle
                width: 2; height: 22
                anchors.horizontalCenter: parent.horizontalCenter
                y: parent.height * 0.75 - height
                radius: 1; color: "#cc2020"; antialiasing: true
                transform: Rotation {
                    origin.x: freqNeedle.width / 2; origin.y: freqNeedle.height
                    angle: -150 + (parseFloat(root.currentFreq) - 88) / 20 * 120
                    Behavior on angle { NumberAnimation { duration: 200; easing.type: Easing.OutCubic } }
                }
            }
            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.bottom: parent.bottom; anchors.bottomMargin: parent.height * 0.25 - 4
                width: 5; height: 5; radius: 2.5
                color: "#0a0b0d"; border.color: "#3a3a3a"; border.width: 0.8
            }
        }
    }

    // --- ZONE DROITE : AFFICHAGE + VU + PRESETS ---
    Item {
        anchors { right: parent.right; top: parent.top; bottom: parent.bottom }
        anchors.rightMargin: 6; anchors.topMargin: 4; anchors.bottomMargin: 4
        width: 186

        // Frequence
        Rectangle {
            anchors { top: parent.top; horizontalCenter: parent.horizontalCenter }
            width: 82; height: 16; radius: 2
            color: "#020304"; border.color: "#151619"; border.width: 1
            Text {
                anchors.centerIn: parent
                text: root.currentFreq + " MHz"
                color: "#cc8820"; font.family: "DejaVu Sans Mono"
                font.pixelSize: 8; font.bold: true
            }
        }

        // Nom station
        Text {
            anchors { top: parent.top; topMargin: 18; horizontalCenter: parent.horizontalCenter }
            text: root.activePreset >= 0 ? root.presets[root.activePreset].name : "---"
            color: "#7a8088"; font.family: "DejaVu Sans Mono"
            font.pixelSize: 8; font.bold: true; opacity: 0.8
        }

        // RDS
        Rectangle {
            anchors { top: parent.top; topMargin: 30; horizontalCenter: parent.horizontalCenter }
            width: 170; height: 12; radius: 1
            color: "#020304"; border.color: "#111215"; border.width: 0.5
            clip: true
            Text {
                id: rdsText
                anchors.verticalCenter: parent.verticalCenter; x: 4
                text: root.activePreset >= 0 ? root.presets[root.activePreset].rds : "WAITING..."
                color: "#4a5060"; font.family: "DejaVu Sans Mono"
                font.pixelSize: 5; font.bold: true
                SequentialAnimation on x {
                    loops: Animation.Infinite; running: root.activePreset >= 0 && rdsText.width > 160
                    NumberAnimation { to: 160 - rdsText.width; duration: 4500; easing.type: Easing.Linear }
                    NumberAnimation { to: 4; duration: 500; easing.type: Easing.OutCubic }
                    PauseAnimation { duration: 1200 }
                }
            }
        }

        // Barre TUNING
        Rectangle {
            anchors { top: parent.top; topMargin: 46; horizontalCenter: parent.horizontalCenter }
            width: 160; height: 5; radius: 2
            color: "#030405"; border.color: "#121418"; border.width: 0.5
            Rectangle {
                anchors.left: parent.left; anchors.leftMargin: 1
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(0, (parent.width - 2) * root.signalStrength); height: 3; radius: 1.5
                gradient: Gradient {
                    GradientStop { position: 0.0; color: "#3aaa50" }
                    GradientStop { position: 0.6; color: "#cc8820" }
                    GradientStop { position: 1.0; color: "#cc2020" }
                }
            }
        }
        Text {
            anchors { top: parent.top; topMargin: 52; horizontalCenter: parent.horizontalCenter }
            text: "SIGNAL STRENGTH"; color: "#2a3038"
            font.family: "DejaVu Sans Mono"; font.pixelSize: 4; font.bold: true
        }

        // === VU METRES LED FINES (style Pioneer 1980) ===
        Row {
            anchors { top: parent.top; topMargin: 62; horizontalCenter: parent.horizontalCenter }
            spacing: 10

            // VU L - 20 LED fines horizontales
            Column {
                spacing: 0
                Text { text: "L"; color: "#3a4050"; font.pixelSize: 5; font.bold: true; anchors.horizontalCenter: parent.horizontalCenter }
                Column {
                    spacing: 1
                    Repeater {
                        model: 20
                        Rectangle {
                            width: 16; height: 1.8; radius: 0.4
                            property real threshold: (19 - index) / 20.0
                            color: {
                                if (index < 4) return root.ledRed;
                                if (index < 9) return root.ledAmber;
                                return root.ledGreen;
                            }
                            // Plastique translucide eteint
                            opacity: root.vuLeft > threshold ? 0.95 : 0.08
                            border.color: root.vuLeft > threshold ? Qt.lighter(color, 1.3) : "transparent"
                            border.width: root.vuLeft > threshold ? 0.5 : 0
                            Behavior on opacity { NumberAnimation { duration: 50 } }
                            // Glow diffus
                            Rectangle {
                                anchors.centerIn: parent
                                width: parent.width + 3; height: parent.height + 2
                                radius: 0.5
                                color: "transparent"
                                border.color: parent.color; border.width: 0.5
                                opacity: parent.parent.parent.parent.parent.vuLeft > parent.threshold ? 0.15 : 0.0
                            }
                        }
                    }
                }
            }

            // STEREO + MPX
            Column {
                spacing: 4; anchors.verticalCenter: parent.verticalCenter
                // STEREO
                Rectangle {
                    width: 12; height: 12; radius: 6
                    color: root.stereo ? root.ledGreen : "#08090b"
                    border.color: "#141618"; border.width: 0.5
                    opacity: root.stereo ? 0.9 : 0.2
                    Behavior on color { ColorAnimation { duration: 300 } }
                    Rectangle {
                        anchors.centerIn: parent
                        width: parent.width + 4; height: width; radius: width / 2
                        color: "transparent"; border.color: root.ledGreen; border.width: 1
                        opacity: parent.parent.parent.parent.stereo ? 0.2 : 0.0
                    }
                }
                Text { text: "ST"; color: "#2a4a2a"; font.pixelSize: 4; font.bold: true; anchors.horizontalCenter: parent.horizontalCenter }
                // MPX
                Rectangle {
                    width: 8; height: 8; radius: 4
                    color: root.stereo ? "#cc8820" : "#08090b"
                    border.color: "#141618"; border.width: 0.5
                    opacity: root.stereo ? 0.7 : 0.15
                }
                Text { text: "MPX"; color: "#2a3a2a"; font.pixelSize: 4; font.bold: true; anchors.horizontalCenter: parent.horizontalCenter }
            }

            // VU R
            Column {
                spacing: 0
                Text { text: "R"; color: "#3a4050"; font.pixelSize: 5; font.bold: true; anchors.horizontalCenter: parent.horizontalCenter }
                Column {
                    spacing: 1
                    Repeater {
                        model: 20
                        Rectangle {
                            width: 16; height: 1.8; radius: 0.4
                            property real threshold: (19 - index) / 20.0
                            color: {
                                if (index < 4) return root.ledRed;
                                if (index < 9) return root.ledAmber;
                                return root.ledGreen;
                            }
                            opacity: root.vuRight > threshold ? 0.95 : 0.08
                            border.color: root.vuRight > threshold ? Qt.lighter(color, 1.3) : "transparent"
                            border.width: root.vuRight > threshold ? 0.5 : 0
                            Behavior on opacity { NumberAnimation { duration: 50 } }
                            Rectangle {
                                anchors.centerIn: parent
                                width: parent.width + 3; height: parent.height + 2
                                radius: 0.5
                                color: "transparent"
                                border.color: parent.color; border.width: 0.5
                                opacity: parent.parent.parent.parent.parent.vuRight > parent.threshold ? 0.15 : 0.0
                            }
                        }
                    }
                }
            }
        }

        // --- 10 PRESETS (2 rangees de 5) ---
        Column {
            anchors { bottom: parent.bottom; bottomMargin: 2; horizontalCenter: parent.horizontalCenter }
            spacing: 2
            Row {
                spacing: 2
                Repeater {
                    model: 5
                    Rectangle {
                        width: 28; height: 11; radius: 2
                        color: root.activePreset === index
                               ? Qt.rgba(0.8, 0.53, 0.13, 0.15) : "#0a0b0d"
                        border.color: root.activePreset === index ? "#cc8820" : "#151619"
                        border.width: 0.5; opacity: 0.7
                        Text {
                            anchors.centerIn: parent
                            text: root.presets[index].name
                            color: root.activePreset === index ? "#cc8820" : "#2a3038"
                            font.family: "DejaVu Sans Mono"; font.pixelSize: 5; font.bold: true
                        }
                        MouseArea {
                            anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                            onClicked: { root.activePreset = index; root.currentFreq = root.presets[index].freq; }
                        }
                    }
                }
            }
            Row {
                spacing: 2
                Repeater {
                    model: 5
                    Rectangle {
                        width: 28; height: 11; radius: 2
                        color: root.activePreset === (index + 5)
                               ? Qt.rgba(0.8, 0.53, 0.13, 0.15) : "#0a0b0d"
                        border.color: root.activePreset === (index + 5) ? "#cc8820" : "#151619"
                        border.width: 0.5; opacity: 0.7
                        Text {
                            anchors.centerIn: parent
                            text: root.presets[index + 5].name
                            color: root.activePreset === (index + 5) ? "#cc8820" : "#2a3038"
                            font.family: "DejaVu Sans Mono"; font.pixelSize: 5; font.bold: true
                        }
                        MouseArea {
                            anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                            onClicked: { root.activePreset = index + 5; root.currentFreq = root.presets[index + 5].freq; }
                        }
                    }
                }
            }
        }
    }

    // --- SEEK buttons ---
    Column {
        anchors { left: parent.left; leftMargin: 6; verticalCenter: parent.verticalCenter }
        spacing: 4
        Rectangle {
            width: 12; height: 12; radius: 6
            color: "#0a0b0d"; border.color: "#1e2026"; border.width: 0.5
            Text { anchors.centerIn: parent; text: "◄"; color: "#3a4050"; font.pixelSize: 5 }
            MouseArea { anchors.fill: parent; onClicked: root.currentFreq = Math.max(88, (parseFloat(root.currentFreq) - 0.5)).toFixed(1) }
        }
        Rectangle {
            width: 12; height: 12; radius: 6
            color: "#0a0b0d"; border.color: "#1e2026"; border.width: 0.5
            Text { anchors.centerIn: parent; text: "►"; color: "#3a4050"; font.pixelSize: 5 }
            MouseArea { anchors.fill: parent; onClicked: root.currentFreq = Math.min(108, (parseFloat(root.currentFreq) + 0.5)).toFixed(1) }
        }
    }
}
