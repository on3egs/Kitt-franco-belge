// SpectreAnalyzer.qml - Analyseur de spectre 16 bandes style Winamp / SAE.
//
// Barres verticales vert-jaune-rouge, chute lente analogique,
// grille de reference dB, chassis Tektronix, aucun neon.
import QtQuick 2.15

Item {
    id: root
    implicitWidth: 170
    implicitHeight: 140

    property real vuLeft: 0.0
    property real vuRight: 0.0
    property real bass: 0.0
    property real mid: 0.0
    property real treble: 0.0

    // === CHASSIS ===
    Rectangle {
        anchors.fill: parent; radius: 6
        color: "#090a0c"; border.color: "#1a1c22"; border.width: 1
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0e1014" }
            GradientStop { position: 0.5; color: "#090a0c" }
            GradientStop { position: 1.0; color: "#040508" }
        }
        Rectangle {
            anchors.fill: parent; anchors.margins: 1; radius: 5
            color: "transparent"; border.color: Qt.rgba(1,1,1,0.03); border.width: 1
        }
    }

    // === GRILLE DE REFERENCE (dB) ===
    Canvas {
        anchors.fill: parent; anchors.margins: 18
        onPaint: {
            var ctx = getContext("2d"); ctx.reset();
            var w = width, h = height;
            ctx.strokeStyle = "#1a1e24"; ctx.lineWidth = 0.5;
            // Lignes horizontales -20 -10 0 dB
            for (var i = 1; i <= 3; i++) {
                var y = h * i / 4;
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            }
        }
    }

    // === 16 BARRES ===
    Row {
        anchors.fill: parent; anchors.margins: 18
        anchors.topMargin: 14; anchors.bottomMargin: 10
        spacing: 2
        Repeater {
            model: 16
            Item {
                width: (parent.width - 15 * 2) / 16; height: parent.height
                // Valeur cible de cette bande
                property real target: {
                    var mix = (root.vuLeft + root.vuRight) * 0.5;
                    if (index < 3) return root.bass * (0.6 + index * 0.2);
                    if (index < 6) return root.mid * (0.5 + (index-3) * 0.15);
                    if (index < 9) return root.treble * (0.4 + (index-6) * 0.2);
                    if (index < 12) return mix * (0.3 + Math.sin(Date.now()/200 + index)*0.15);
                    return mix * (0.2 + Math.sin(Date.now()/150 + index*1.5)*0.1);
                }
                // Peak avec persistence (chute lente)
                property real peak: 0
                Timer {
                    interval: 40; running: true; repeat: true
                    onTriggered: {
                        var t = Math.max(0, Math.min(1, parent.target));
                        if (t > parent.peak) parent.peak = t;
                        else parent.peak = Math.max(0, parent.peak - 0.035);
                    }
                }
                // Barre active
                Rectangle {
                    anchors.bottom: parent.bottom
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: parent.width - 1
                    height: parent.height * parent.peak
                    radius: 1
                    // Couleur par hauteur (Winamp classic)
                    gradient: Gradient {
                        GradientStop { position: 0.0; color: "#54e36b" }   // vert bas
                        GradientStop { position: 0.45; color: "#cc8820" } // jaune milieu
                        GradientStop { position: 0.8; color: "#cc2020" }  // rouge haut
                        GradientStop { position: 1.0; color: "#ff5555" }  // rouge vif sommet
                    }
                    opacity: parent.peak > 0.01 ? 0.9 : 0.0
                }
                // Barre eteinte (fond)
                Rectangle {
                    anchors.bottom: parent.bottom
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: parent.width - 1
                    height: parent.height
                    radius: 1
                    color: "#0c0e12"
                    border.color: "#141820"; border.width: 0.5; opacity: 0.5
                }
            }
        }
    }

    // === LABEL ===
    Text {
        anchors.top: parent.top; anchors.topMargin: 4
        anchors.horizontalCenter: parent.horizontalCenter
        text: "SPECTRUM ANALYZER"
        color: "#3a4050"; font.family: "DejaVu Sans Mono"
        font.pixelSize: 5; font.bold: true; opacity: 0.6
    }

    // === VERRE BOMBE ===
    Rectangle {
        anchors.fill: parent; anchors.margins: 3; radius: 4
        color: "transparent"
        gradient: Gradient {
            GradientStop { position: 0.0; color: Qt.rgba(1,1,1,0.02) }
            GradientStop { position: 0.1; color: Qt.rgba(1,1,1,0.005) }
            GradientStop { position: 0.5; color: "transparent" }
            GradientStop { position: 1.0; color: "transparent" }
        }
    }
}
